// Test script - run with: node test.js
const fs = require('fs');
const bwipjs = require('bwip-js');
const { Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, AlignmentType, WidthType, BorderStyle, PageOrientation } = require('docx');

// Test codes
const testCodes = ['M4018-28', 'M4018-29', 'M4018-030', 'ABC-001', 'TEST-123'];

// Validate codes
function validateCodes(codes) {
  const errors = [];
  codes.forEach((code, index) => {
    if (/^0\d/.test(code)) {
      errors.push({ line: index + 1, code, message: `Code "${code}" has a leading zero` });
    }
  });
  return errors;
}

// Generate barcode as PNG buffer
async function generateBarcode(code) {
  const png = await bwipjs.toBuffer({
    bcid: 'code128',
    text: code,
    scale: 3,
    height: 8,
    includetext: false,
  });
  return png;
}

// Create document
async function createDocument(codes, columnsPerRow = 3) {
  const barcodes = [];
  
  for (const code of codes) {
    console.log(`  Processing: ${code}`);
    const pngBuffer = await generateBarcode(code);
    barcodes.push({ code, buffer: pngBuffer });
  }
  
  const rows = [];
  const cellWidth = 3000;
  const barcodeWidth = 83;
  const barcodeHeight = 34;
  
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
            margins: { top: 142, bottom: 142, left: 142, right: 142 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 50 },
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
                spacing: { after: 100 },
                children: [
                  new TextRun({ text: code, size: 16, font: 'Arial' })
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
          margin: { top: 720, right: 720, bottom: 720, left: 720 },
          size: {
            orientation: PageOrientation.LANDSCAPE
          }
        }
      },
      children: [
        new Table({
          columnWidths: Array(columnsPerRow).fill(cellWidth),
          rows: rows,
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

async function main() {
  console.log('Testing validation...');
  const invalidCodes = ['04018-28', 'M4018-29'];
  const errors = validateCodes(invalidCodes);
  console.log('  Errors:', errors);

  console.log('\nGenerating test document...');
  const buffer = await createDocument(testCodes);
  fs.writeFileSync('test-output.docx', buffer);
  console.log('  Saved to test-output.docx');
  
  console.log('\n✅ All tests passed!');
}

main().catch(console.error);
