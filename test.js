// Geometry test - run with: node test.js
const fs = require('fs');
const JSZip = require('jszip');
const { validateCodes, generateBarcode, createDocument } = require('./label-sheet');

const failures = [];

function check(description, actual, expected) {
  const pass = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${description}${pass ? '' : ` — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`}`);
  if (!pass) failures.push(description);
}

function attribute(xml, element, name) {
  const tag = xml.match(new RegExp(`<${element}[^>]*>`));
  return tag ? (tag[0].match(new RegExp(`${name}="([^"]*)"`)) || [])[1] : undefined;
}

async function testValidation() {
  console.log('Validation');
  check('flags a leading zero', validateCodes(['04018-28']).length, 1);
  check('accepts a normal code', validateCodes(['M4018-29']).length, 0);
  check('accepts a code that is only zeros-free', validateCodes(['0']).length, 0);
}

async function testBarcodeSizing() {
  console.log('Barcode sizing');
  const short = await generateBarcode('ABC123');
  const long = await generateBarcode('M4182-02');
  const overlong = await generateBarcode('LONGCODE-1234567890');

  check('every barcode is 9mm tall', [short.heightEmu, long.heightEmu], [324000, 324000]);
  check('width is module count x 0.18mm', long.widthEmu, 797040);
  check('a shorter code gets a narrower barcode', short.widthEmu, 654480);
  check('an overlong code is capped to fit the label', overlong.widthEmu <= 849630, true);
}

async function testSheetGeometry() {
  console.log('Sheet geometry');
  const codes = Array.from({ length: 190 }, (_, i) => `M${4000 + i}-01`);
  const zip = await JSZip.loadAsync(await createDocument(codes));
  const xml = await zip.file('word/document.xml').async('string');

  check('A4 page', [attribute(xml, 'w:pgSz', 'w:w'), attribute(xml, 'w:pgSz', 'w:h')], ['11905', '16837']);
  check('page margins', ['w:top', 'w:right', 'w:bottom', 'w:left'].map((a) => attribute(xml, 'w:pgMar', a)), ['765', '480', '0', '480']);
  check('label and gutter columns alternate', (xml.match(/<w:gridCol w:w="(\d+)"\s*\/>/g) || []).slice(0, 13).map((m) => m.match(/\d+/)[0]),
    ['1440', '144', '1440', '144', '1440', '144', '1440', '144', '1440', '144', '1440', '144', '1440']);
  check('every row is locked to an exact height', [...new Set(xml.match(/<w:trHeight[^>]*>/g))].length, 1);
  check('row height', attribute(xml, 'w:trHeight', 'w:val'), '566');
  check('rows cannot split across pages', xml.match(/<w:cantSplit\s*\/>/g).length, 54);
  check('fixed table layout', attribute(xml, 'w:tblLayout', 'w:type'), 'fixed');
  check('one full sheet per page', (xml.match(/<w:tbl>/g) || []).length, 2);
  check('190 codes spill onto a second sheet', (xml.match(/<w:sectPr/g) || []).length, 2);
  check('no barcode is stretched or squashed vertically', [...new Set((xml.match(/<wp:extent cx="\d+" cy="(\d+)"/g) || []).map((m) => m.match(/cy="(\d+)"/)[1]))], ['324000']);
}

async function main() {
  await testValidation();
  await testBarcodeSizing();
  await testSheetGeometry();

  console.log('\nWriting sample sheet to test-output.docx');
  fs.writeFileSync('test-output.docx', await createDocument(['M4018-28', 'M4018-29', 'M4018-030', 'ABC-001', 'TEST-123']));

  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll checks passed.');
}

main().catch((err) => { console.error(err); process.exit(1); });
