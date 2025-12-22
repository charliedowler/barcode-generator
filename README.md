# Barcode Generator

A simple Electron app that generates Code-128 barcodes and exports them to a Word document in a grid layout.

## Features

- Enter codes one per line
- Validates for accidental leading zeros (e.g., `04018-28` is invalid)
- Automatically removes leading zeros after delimiters (e.g., `M4018-028` → `M4018-28`)
- Generates Code-128 barcodes
- Exports to .docx with barcodes in a 3-column grid
- Each barcode shows the code text underneath
- Barcode size: 2.21cm × 0.9cm

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
├── preload.js       # Secure IPC bridge
├── index.html       # UI
├── package.json     # Dependencies and build config
└── dist/            # Built executables (after build)
```

## Validation Rules

1. **Leading zeros at start of code** → Error, user must fix
   - `04018-28` ❌ (invalid - starts with 0)
   - `M4018-28` ✅ (valid)

2. **Leading zeros after delimiters** → Auto-corrected
   - `M4018-028` → `M4018-28` (automatically sanitised)

## Output Format

- Word document (.docx)
- 3 barcodes per row
- Each barcode: 2.21cm wide × 0.9cm tall
- Code text displayed below each barcode
- 0.5 inch page margins
