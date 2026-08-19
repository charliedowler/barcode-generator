# Barcode Generator

A simple Electron app that generates Code-128 barcodes and lays them out on pre-cut A4 label sheets for the print shop.

## Features

- Enter codes one per line
- Validates for accidental leading zeros at start of code (e.g., `04018-28` is invalid)
- Generates Code-128 barcodes
- Exports to .docx, .pdf or .xlsx
- Lays barcodes out on a 7 x 27 die-cut label sheet (189 labels per A4 page)
- Each barcode carries its code as human-readable text underneath

## Development Setup

### Prerequisites
- Node.js 18+ 
- npm

### Install Dependencies

```bash
npm install
```

### Run in Development Mode

```bash
npm start
```

## Building for Windows

### On Mac (Cross-compilation)

You'll need Wine installed for cross-compiling to Windows:

```bash
# Install Wine via Homebrew
brew install --cask wine-stable

# Build for Windows
npm run build:win
```

The installer will be created in the `dist/` folder.

### On Windows

```bash
npm run build:win
```

## Building for Mac

```bash
npm run build:mac
```

## Project Structure

```
barcode-app/
├── main.js          # Electron main process
├── label-sheet.js   # Label sheet geometry and .docx/.pdf/.xlsx export
├── preload.js       # Secure IPC bridge
├── index.html       # UI
├── test.js          # Geometry checks (npm run test:geometry)
├── package.json     # Dependencies and build config
└── dist/            # Built executables (after build)
```

## Validation Rules

- **Leading zeros at start of code** → Error, user must fix
  - `04018-28` ❌ (invalid - starts with 0)
  - `M4018-28` ✅ (valid)
  - `M4018-028` ✅ (valid - zeros after delimiters are allowed)

## macOS: Opening Unsigned App

The macOS build is not code-signed (requires Apple Developer account). Gatekeeper may block it.

**Option 1:** Remove quarantine attribute:
```bash
xattr -cr ~/Downloads/Barcode-Generator-*.dmg
```

**Option 2:** Right-click the app → "Open" → click "Open" in the security dialog.

## Output Format

Output is built to drop onto the print shop's pre-cut A4 label stock. The
geometry below is not cosmetic — the sheet is die-cut, so a label that lands in
the wrong place gets cut through. All three export formats use it.

### Sheet

| | |
|---|---|
| Page | A4 (11905 × 16837 twips) |
| Page margins | 13.5mm top, 8.47mm left/right, 0 bottom |
| Labels per sheet | 189 (7 across × 27 down) |
| Label size | 25.4mm × 9.98mm |
| Gap between columns | 2.54mm |

Rows are locked to an exact height and cannot split across pages, and each sheet
is its own section. Without both, Word fits 28 rows on the first page (28 rows
still clear the bottom margin) and every sheet after that is off by one row.

### Barcode

| | |
|---|---|
| Symbology | Code 128 |
| Height | 9mm, including the text |
| Width | module count × 0.18mm, so it grows with the code length |
| X-dimension | 0.18mm |
| Human-readable text | rendered into the barcode image, not a separate paragraph |

Width is derived from the module count rather than fixed, so codes of different
lengths keep the same bar width instead of being stretched to fit. A code long
enough to overflow its label is scaled down to fit rather than spilling over.

### Checking the geometry

```bash
npm run test:geometry
```

This asserts the exported .docx against the measurements above. The expected
values are written out as literals on purpose — the test is meant to be a
second, independent copy of the print shop's spec.
