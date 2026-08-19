const bwipjs = require('bwip-js');
const {
  Document, Packer, Paragraph, ImageRun, Table, TableRow, TableCell,
  AlignmentType, WidthType, BorderStyle, VerticalAlign, TableLayoutType, HeightRule,
} = require('docx');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const EMU_PER_TWIP = 635;
const EMU_PER_PIXEL = 9525;
const TWIPS_PER_POINT = 20;

const SHEET = {
  columns: 7,
  rowsPerPage: 27,
  labelWidth: 1440,
  gutterWidth: 144,
  rowHeight: 566,
  cellMargin: 15,
  labelIndent: 36,
  page: {
    width: 11905,
    height: 16837,
    top: 765,
    bottom: 0,
    left: 480,
    right: 480,
  },
};

const BARCODE = {
  moduleWidthEmu: 6480,
  heightEmu: 324000,
  scale: 3,
  barHeightMm: 13.05,
  textSize: 11,
  textYOffset: -1.5,
  paddingBottom: 2,
};

const LABELS_PER_PAGE = SHEET.columns * SHEET.rowsPerPage;

const MAX_BARCODE_WIDTH_EMU =
  (SHEET.labelWidth - 2 * SHEET.cellMargin - 2 * SHEET.labelIndent) * EMU_PER_TWIP;

function parseCodes(codesText) {
  return codesText.split('\n').map((c) => c.trim()).filter((c) => c.length > 0);
}

function validateCodes(codes) {
  const errors = [];
  codes.forEach((code, index) => {
    if (/^0\d/.test(code)) {
      errors.push({ line: index + 1, code, message: `Code "${code}" has a leading zero` });
    }
  });
  return errors;
}

function readPngWidth(buffer) {
  return buffer.readUInt32BE(16);
}

async function generateBarcode(code) {
  const data = await bwipjs.toBuffer({
    bcid: 'code128',
    text: code,
    scale: BARCODE.scale,
    height: BARCODE.barHeightMm,
    includetext: true,
    textxalign: 'center',
    textsize: BARCODE.textSize,
    textyoffset: BARCODE.textYOffset,
    paddingbottom: BARCODE.paddingBottom,
  });

  const modules = readPngWidth(data) / BARCODE.scale;
  const widthEmu = Math.min(
    Math.round(modules * BARCODE.moduleWidthEmu),
    MAX_BARCODE_WIDTH_EMU
  );

  return { code, data, widthEmu, heightEmu: BARCODE.heightEmu };
}

async function generateBarcodes(codes) {
  const barcodes = [];
  for (const code of codes) {
    barcodes.push(await generateBarcode(code));
  }
  return barcodes;
}

function chunk(items, size) {
  const pages = [];
  for (let i = 0; i < items.length; i += size) {
    pages.push(items.slice(i, i + size));
  }
  return pages.length > 0 ? pages : [[]];
}

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const NO_BORDERS = {
  top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER,
  insideHorizontal: NO_BORDER, insideVertical: NO_BORDER,
};

function labelParagraph(children) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    indent: { left: SHEET.labelIndent, right: SHEET.labelIndent },
    spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' },
    children,
  });
}

function labelCell(barcode) {
  const children = barcode
    ? [new ImageRun({
        type: 'png',
        data: barcode.data,
        transformation: {
          width: barcode.widthEmu / EMU_PER_PIXEL,
          height: barcode.heightEmu / EMU_PER_PIXEL,
        },
      })]
    : [];

  return new TableCell({
    width: { size: SHEET.labelWidth, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [labelParagraph(children)],
  });
}

function gutterCell() {
  return new TableCell({
    width: { size: SHEET.gutterWidth, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    children: [labelParagraph([])],
  });
}

function sheetRow(rowBarcodes) {
  const cells = [];
  for (let column = 0; column < SHEET.columns; column++) {
    if (column > 0) cells.push(gutterCell());
    cells.push(labelCell(rowBarcodes[column]));
  }

  return new TableRow({
    cantSplit: true,
    height: { value: SHEET.rowHeight, rule: HeightRule.EXACT },
    children: cells,
  });
}

function sheetColumnWidths() {
  const widths = [];
  for (let column = 0; column < SHEET.columns; column++) {
    if (column > 0) widths.push(SHEET.gutterWidth);
    widths.push(SHEET.labelWidth);
  }
  return widths;
}

function sheetTable(pageBarcodes) {
  const rows = [];
  for (let row = 0; row < SHEET.rowsPerPage; row++) {
    rows.push(sheetRow(pageBarcodes.slice(row * SHEET.columns, (row + 1) * SHEET.columns)));
  }

  return new Table({
    columnWidths: sheetColumnWidths(),
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    indent: { size: -SHEET.cellMargin, type: WidthType.DXA },
    margins: { left: SHEET.cellMargin, right: SHEET.cellMargin },
    rows,
  });
}

async function createDocument(codes) {
  const barcodes = await generateBarcodes(codes);

  const sections = chunk(barcodes, LABELS_PER_PAGE).map((pageBarcodes) => ({
    properties: {
      page: {
        size: { width: SHEET.page.width, height: SHEET.page.height },
        margin: {
          top: SHEET.page.top,
          right: SHEET.page.right,
          bottom: SHEET.page.bottom,
          left: SHEET.page.left,
        },
      },
    },
    children: [sheetTable(pageBarcodes), labelParagraph([])],
  }));

  const doc = new Document({
    styles: {
      default: {
        document: {
          paragraph: { spacing: { before: 0, after: 0, line: 240, lineRule: 'auto' } },
        },
      },
    },
    sections,
  });

  return await Packer.toBuffer(doc);
}

async function createPdfDocument(codes) {
  const barcodes = await generateBarcodes(codes);
  const pt = (twips) => twips / TWIPS_PER_POINT;

  const doc = new PDFDocument({
    size: [pt(SHEET.page.width), pt(SHEET.page.height)],
    margin: 0,
    autoFirstPage: false,
  });

  const chunks = [];
  const finished = new Promise((resolve, reject) => {
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pitchX = pt(SHEET.labelWidth + SHEET.gutterWidth);
  const pitchY = pt(SHEET.rowHeight);
  const labelWidth = pt(SHEET.labelWidth);

  for (const pageBarcodes of chunk(barcodes, LABELS_PER_PAGE)) {
    doc.addPage();

    pageBarcodes.forEach((barcode, index) => {
      const column = index % SHEET.columns;
      const row = Math.floor(index / SHEET.columns);

      const width = barcode.widthEmu / EMU_PER_TWIP / TWIPS_PER_POINT;
      const height = barcode.heightEmu / EMU_PER_TWIP / TWIPS_PER_POINT;
      const x = pt(SHEET.page.left) + column * pitchX + (labelWidth - width) / 2;
      const y = pt(SHEET.page.top) + row * pitchY + (pitchY - height) / 2;

      doc.image(barcode.data, x, y, { width, height });
    });
  }

  doc.end();
  return finished;
}

async function createExcelDocument(codes) {
  const barcodes = await generateBarcodes(codes);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Barcode Generator';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Barcodes');
  for (let column = 1; column <= SHEET.columns; column++) {
    worksheet.getColumn(column).width = 15;
  }

  const rowHeightPoints = SHEET.rowHeight / TWIPS_PER_POINT;

  barcodes.forEach((barcode, index) => {
    const column = index % SHEET.columns;
    const row = Math.floor(index / SHEET.columns);
    worksheet.getRow(row + 1).height = rowHeightPoints;

    const imageId = workbook.addImage({ buffer: barcode.data, extension: 'png' });
    worksheet.addImage(imageId, {
      tl: { col: column, row },
      ext: {
        width: (barcode.widthEmu / EMU_PER_TWIP / TWIPS_PER_POINT) * (96 / 72),
        height: (barcode.heightEmu / EMU_PER_TWIP / TWIPS_PER_POINT) * (96 / 72),
      },
    });
  });

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  SHEET,
  BARCODE,
  LABELS_PER_PAGE,
  parseCodes,
  validateCodes,
  generateBarcode,
  createDocument,
  createPdfDocument,
  createExcelDocument,
};
