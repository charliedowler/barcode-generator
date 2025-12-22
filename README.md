# Barcode Generator

A simple Electron app that generates Code-128 barcodes and exports them to a Word document in a grid layout.

## Features

- Enter codes one per line
- Validates for accidental leading zeros at start of code (e.g., `04018-28` is invalid)
- Generates Code-128 barcodes
- Exports to .docx with barcodes in a 7-column grid
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

- Word document (.docx)
- 7 barcodes per row
- Each barcode: 2.21cm wide × 0.9cm tall
- Code text displayed below each barcode
- 0.5 inch page margins
