/**
 * Script to generate example barcode files in all supported formats
 * Run with: node scripts/generate-examples.js
 */

const fs = require('fs');
const path = require('path');
const bwipjs = require('bwip-js');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, VerticalAlign, TableLayoutType } = require('docx');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const EXAMPLES_DIR = path.join(__dirname, '..', 'examples');

// Sample codes for examples
const SAMPLE_CODES = [
  'PROD-001',
  'PROD-002',
  'PROD-003',
  'ITEM-A100',
  'ITEM-B200',
  'ITEM-C300',
  'SKU-12345',
  'SKU-67890',
  'INV-2024-01',
  'INV-2024-02',
  'BOX-A1',
  'BOX-A2',
  'BOX-B1',
  'BOX-B2'
];

// Generate barcode as PNG buffer
async function generateBarcode(code) {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: code,
    scale: 3,
    height: 8,
    includetext: false,
    textxalign: 'center',
  });
  return png;
}

// Create Word document with barcodes
async function createWordDocument(codes, columnsPerRow = 7) {
  const barcodes = [];

  for (const code of codes) {
    const pngBuffer = await generateBarcode(code);
    barcodes.push({ code, buffer: pngBuffer });
  }

  const rows = [];
  const cellWidth = 1543;
  const barcodeWidth = 63;
  const barcodeHeight = 26;

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
            margins: { top: 140, bottom: 140, left: 140, right: 140 },
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
          margin: { top: 720, right: 720, bottom: 720, left: 720 }
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

// Create PDF document with barcodes
async function createPdfDocument(codes, columnsPerRow = 7) {
  return new Promise(async (resolve, reject) => {
    try {
      const barcodes = [];

      for (const code of codes) {
        const pngBuffer = await generateBarcode(code);
        barcodes.push({ code, buffer: pngBuffer });
      }

      const pageWidth = 612;
      const pageHeight = 792;
      const margin = 36;
      const usableWidth = pageWidth - (margin * 2);
      const cellWidth = usableWidth / columnsPerRow;
      const barcodeWidth = 63;
      const barcodeHeight = 26;
      const cellHeight = 50;

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: { top: margin, bottom: margin, left: margin, right: margin }
      });

      const chunks = [];
      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      let currentY = margin;

      for (let i = 0; i < barcodes.length; i += columnsPerRow) {
        if (currentY + cellHeight > pageHeight - margin) {
          doc.addPage();
          currentY = margin;
        }

        for (let j = 0; j < columnsPerRow; j++) {
          const idx = i + j;
          if (idx < barcodes.length) {
            const { code, buffer } = barcodes[idx];
            const x = margin + (j * cellWidth);
            const centerX = x + (cellWidth - barcodeWidth) / 2;

            doc.image(buffer, centerX, currentY, {
              width: barcodeWidth,
              height: barcodeHeight
            });

            doc.fontSize(7)
               .font('Helvetica')
               .text(code, x, currentY + barcodeHeight + 2, {
                 width: cellWidth,
                 align: 'center'
               });
          }
        }

        currentY += cellHeight;
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

// Create Excel document with barcodes
async function createExcelDocument(codes, columnsPerRow = 7) {
  const barcodes = [];

  for (const code of codes) {
    const pngBuffer = await generateBarcode(code);
    barcodes.push({ code, buffer: pngBuffer });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Barcode Generator';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Barcodes');

  for (let i = 1; i <= columnsPerRow; i++) {
    worksheet.getColumn(i).width = 15;
  }

  let rowIndex = 1;

  for (let i = 0; i < barcodes.length; i += columnsPerRow) {
    worksheet.getRow(rowIndex).height = 45;
    worksheet.getRow(rowIndex + 1).height = 15;

    for (let j = 0; j < columnsPerRow; j++) {
      const idx = i + j;
      if (idx < barcodes.length) {
        const { code, buffer } = barcodes[idx];
        const col = j + 1;

        const imgId = workbook.addImage({
          buffer: buffer,
          extension: 'png',
        });

        worksheet.addImage(imgId, {
          tl: { col: j + 0.1, row: rowIndex - 1 + 0.1 },
          ext: { width: 85, height: 35 }
        });

        const textCell = worksheet.getCell(rowIndex + 1, col);
        textCell.value = code;
        textCell.alignment = { horizontal: 'center', vertical: 'middle' };
        textCell.font = { name: 'Arial', size: 8 };
      }
    }

    rowIndex += 2;
  }

  return await workbook.xlsx.writeBuffer();
}

// Main function to generate all examples
async function generateExamples() {
  console.log('Generating example barcode files...\n');

  // Ensure examples directory exists
  if (!fs.existsSync(EXAMPLES_DIR)) {
    fs.mkdirSync(EXAMPLES_DIR, { recursive: true });
  }

  try {
    // Generate Word document
    console.log('Generating Word document...');
    const docxBuffer = await createWordDocument(SAMPLE_CODES);
    const docxPath = path.join(EXAMPLES_DIR, 'example-barcodes.docx');
    fs.writeFileSync(docxPath, docxBuffer);
    console.log(`  Created: ${docxPath}`);

    // Generate PDF document
    console.log('Generating PDF document...');
    const pdfBuffer = await createPdfDocument(SAMPLE_CODES);
    const pdfPath = path.join(EXAMPLES_DIR, 'example-barcodes.pdf');
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log(`  Created: ${pdfPath}`);

    // Generate Excel document
    console.log('Generating Excel document...');
    const xlsxBuffer = await createExcelDocument(SAMPLE_CODES);
    const xlsxPath = path.join(EXAMPLES_DIR, 'example-barcodes.xlsx');
    fs.writeFileSync(xlsxPath, xlsxBuffer);
    console.log(`  Created: ${xlsxPath}`);

    console.log('\nAll examples generated successfully!');
    console.log(`\nSample codes used (${SAMPLE_CODES.length} total):`);
    SAMPLE_CODES.forEach(code => console.log(`  - ${code}`));

  } catch (error) {
    console.error('Error generating examples:', error);
    process.exit(1);
  }
}

generateExamples();
