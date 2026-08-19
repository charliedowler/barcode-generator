/**
 * Script to generate example barcode files in all supported formats
 * Run with: node scripts/generate-examples.js
 */

const fs = require('fs');
const path = require('path');
const { createDocument, createPdfDocument, createExcelDocument } = require('../label-sheet');

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

const FORMATS = [
  { label: 'Word document', file: 'example-barcodes.docx', build: createDocument },
  { label: 'PDF document', file: 'example-barcodes.pdf', build: createPdfDocument },
  { label: 'Excel workbook', file: 'example-barcodes.xlsx', build: createExcelDocument },
];

async function generateExamples() {
  console.log('Generating example barcode files...\n');

  if (!fs.existsSync(EXAMPLES_DIR)) {
    fs.mkdirSync(EXAMPLES_DIR, { recursive: true });
  }

  for (const format of FORMATS) {
    console.log(`Generating ${format.label}...`);
    const filePath = path.join(EXAMPLES_DIR, format.file);
    fs.writeFileSync(filePath, await format.build(SAMPLE_CODES));
    console.log(`  Created: ${filePath}`);
  }

  console.log('\nAll examples generated successfully!');
  console.log(`\nSample codes used (${SAMPLE_CODES.length} total):`);
  SAMPLE_CODES.forEach(code => console.log(`  - ${code}`));
}

generateExamples().catch((error) => {
  console.error('Error generating examples:', error);
  process.exit(1);
});
