const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const {
  parseCodes,
  validateCodes,
  createDocument,
  createPdfDocument,
  createExcelDocument,
} = require('./label-sheet');

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

// IPC handlers
ipcMain.handle('validate-codes', async (event, codesText) => {
  const codes = parseCodes(codesText);
  const errors = validateCodes(codes);
  return { codes, errors };
});

ipcMain.handle('generate-document', async (event, codesText, format = 'docx') => {
  const codes = parseCodes(codesText);

  // Validate first
  const errors = validateCodes(codes);
  if (errors.length > 0) {
    return { success: false, errors };
  }

  try {
    // Generate document based on format
    let buffer;
    let filterName;
    let extension;

    switch (format) {
      case 'pdf':
        buffer = await createPdfDocument(codes);
        filterName = 'PDF Document';
        extension = 'pdf';
        break;
      case 'xlsx':
        buffer = await createExcelDocument(codes);
        filterName = 'Excel Workbook';
        extension = 'xlsx';
        break;
      case 'docx':
      default:
        buffer = await createDocument(codes);
        filterName = 'Word Document';
        extension = 'docx';
        break;
    }

    // Generate default filename with date and time
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '-'); // HH-MM-SS
    const defaultFilename = `barcode_${dateStr}_${timeStr}.${extension}`;

    let filePath, canceled;

    // Use mock response if set (for E2E testing), otherwise show real dialog
    if (mockSaveDialogResponse !== null) {
      filePath = mockSaveDialogResponse.filePath;
      canceled = mockSaveDialogResponse.canceled;
    } else {
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: defaultFilename,
        filters: [{ name: filterName, extensions: [extension] }]
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
