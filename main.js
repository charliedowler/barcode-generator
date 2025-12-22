const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const bwipjs = require('bwip-js');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, VerticalAlign, TableLayoutType } = require('docx');

let mainWindow;

// For E2E testing: allow mocking the save dialog
let mockSaveDialogResponse = null;

function setMockSaveDialog(response) {
  mockSaveDialogResponse = response;
}

function clearMockSaveDialog() {
  mockSaveDialogResponse = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// Validate codes - check for accidental leading zeros
function validateCodes(codes) {
  const errors = [];
  codes.forEach((code, index) => {
    // Check if code starts with a zero followed by digits (accidental leading zero)
    if (/^0\d/.test(code)) {
      errors.push({ line: index + 1, code, message: `Code "${code}" has a leading zero` });
    }
  });
  return errors;
}

// Generate barcode as PNG buffer
async function generateBarcode(code) {
  // 2.21cm x 0.9cm at 300 DPI = 261 x 106 pixels
  // We'll generate at higher res for quality
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: code,
    scale: 3,
    height: 8, // mm
    includetext: false, // We'll add text in the document for better control
    textxalign: 'center',
  });
  return png;
}

// Create the Word document with barcodes in a grid
async function createDocument(codes, columnsPerRow = 7) {
  const barcodes = [];
  
  // Generate all barcodes
  for (const code of codes) {
    const pngBuffer = await generateBarcode(code);
    barcodes.push({ code, buffer: pngBuffer });
  }
  
  // Create rows for the table (3 columns per row)
  const rows = [];
  
  // Usable page width: ~10800 DXA (Letter width minus 0.5" margins)
  // With 7 columns: 10800 / 7 = 1543 DXA per cell
  const cellWidth = 1543;
  
  // Barcode image size: 2.21cm x 0.9cm (1cm = 28.35 points)
  const barcodeWidth = 63;   // 2.21cm
  const barcodeHeight = 26;  // 0.9cm
  
  const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };
  
  for (let i = 0; i < barcodes.length; i += columnsPerRow) {
    const rowCells = [];
    
    for (let j = 0; j < columnsPerRow; j++) {
      const idx = i + j;
      
      if (idx < barcodes.length) {
        const { code, buffer } = barcodes[idx];
        rowCells.push(
          new TableCell({
            borders: cellBorders,
            width: { size: cellWidth, type: WidthType.DXA },
            margins: { top: 140, bottom: 140, left: 140, right: 140 },  // ~0.25cm each side = ~0.5cm gap
            verticalAlign: VerticalAlign.CENTER,
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 0 },
                children: [
                  new ImageRun({
                    type: 'png',
                    data: buffer,
                    transformation: { width: barcodeWidth, height: barcodeHeight }
                  })
                ]
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 20, after: 0 },
                children: [
                  new TextRun({ text: code, size: 14, font: 'Arial' })
                ]
              })
            ]
          })
        );
      } else {
        // Empty cell for padding
        rowCells.push(
          new TableCell({
            borders: cellBorders,
            width: { size: cellWidth, type: WidthType.DXA },
            children: [new Paragraph({ children: [] })]
          })
        );
      }
    }
    
    rows.push(new TableRow({ children: rowCells }));
  }
  
  const doc = new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 720, bottom: 720, left: 720 } // 0.5 inch margins
        }
      },
      children: [
        new Table({
          columnWidths: Array(columnsPerRow).fill(cellWidth),
          rows: rows,
          layout: TableLayoutType.FIXED,
          alignment: AlignmentType.CENTER,
          borders: {
            top: noBorder,
            bottom: noBorder,
            left: noBorder,
            right: noBorder,
            insideHorizontal: noBorder,
            insideVertical: noBorder
          }
        })
      ]
    }]
  });
  
  return await Packer.toBuffer(doc);
}

// IPC handlers
ipcMain.handle('validate-codes', async (event, codesText) => {
  const codes = codesText
    .split('\n')
    .map(c => c.trim())
    .filter(c => c.length > 0);
  
  const errors = validateCodes(codes);
  return { codes, errors };
});

ipcMain.handle('generate-document', async (event, codesText) => {
  const codes = codesText
    .split('\n')
    .map(c => c.trim())
    .filter(c => c.length > 0);

  // Validate first
  const errors = validateCodes(codes);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  try {
    const buffer = await createDocument(codes);

    // Generate default filename with date and time
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-MM-SS
    const defaultFilename = `barcode_${dateStr}_${timeStr}.docx`;

    let filePath, canceled;

    // Use mock response if set (for E2E testing), otherwise show real dialog
    if (mockSaveDialogResponse !== null) {
      filePath = mockSaveDialogResponse.filePath;
      canceled = mockSaveDialogResponse.canceled;
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultFilename,
        filters: [{ name: 'Word Document', extensions: ['docx'] }]
      });
      filePath = result.filePath;
      canceled = result.canceled;
    }

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(filePath, buffer);
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// IPC handlers for E2E testing
ipcMain.handle('e2e:set-mock-save-dialog', (event, response) => {
  setMockSaveDialog(response);
  return true;
});

ipcMain.handle('e2e:clear-mock-save-dialog', () => {
  clearMockSaveDialog();
  return true;
});
