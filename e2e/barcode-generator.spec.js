// @ts-check
const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const os = require('os');

let electronApp;
let window;

test.beforeAll(async () => {
  // Launch Electron app
  electronApp = await electron.launch({
    args: [path.join(__dirname, '..', 'main.js')],
  });

  // Get the first window
  window = await electronApp.firstWindow();

  // Wait for the app to fully load
  await window.waitForLoadState('domcontentloaded');
});

test.afterAll(async () => {
  if (electronApp) {
    await electronApp.close();
  }
});

// Helper to set mock save dialog response
async function setMockSaveDialog(response) {
  await electronApp.evaluate(async ({ ipcMain }, response) => {
    // Send to main process via a custom mechanism
    const { BrowserWindow } = require('electron');
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('e2e:set-mock', response);
    }
  }, response);

  // Use ipcRenderer from the main process
  await electronApp.evaluate(async (electron, response) => {
    const ipcMain = electron.ipcMain;
    // Trigger the handler directly
  }, response);
}

test.describe('Barcode Generator App', () => {
  test.beforeEach(async () => {
    // Clear the textarea before each test
    await window.fill('#codes', '');
    // Clear any mock dialog
    await electronApp.evaluate(async ({ ipcMain }) => {
      ipcMain.emit('e2e:clear-mock-save-dialog');
    });
    // Wait for status to clear
    await window.waitForTimeout(100);
  });

  test('should launch and display the main window', async () => {
    const title = await window.title();
    expect(title).toBe('Barcode Generator');

    // Check that main UI elements are visible
    await expect(window.locator('#codes')).toBeVisible();
    await expect(window.locator('#generateBtn')).toBeVisible();
    await expect(window.locator('#clearBtn')).toBeVisible();
    await expect(window.locator('#formatSelect')).toBeVisible();
  });

  test('should have format selector with correct options', async () => {
    const formatSelect = window.locator('#formatSelect');

    // Check default value is docx
    await expect(formatSelect).toHaveValue('docx');

    // Check all options are present
    const options = formatSelect.locator('option');
    await expect(options).toHaveCount(3);

    await expect(options.nth(0)).toHaveValue('docx');
    await expect(options.nth(0)).toHaveText('Word (.docx)');

    await expect(options.nth(1)).toHaveValue('pdf');
    await expect(options.nth(1)).toHaveText('PDF (.pdf)');

    await expect(options.nth(2)).toHaveValue('xlsx');
    await expect(options.nth(2)).toHaveText('Excel (.xlsx)');
  });

  test('should change format selection', async () => {
    const formatSelect = window.locator('#formatSelect');

    // Select PDF
    await formatSelect.selectOption('pdf');
    await expect(formatSelect).toHaveValue('pdf');

    // Select Excel
    await formatSelect.selectOption('xlsx');
    await expect(formatSelect).toHaveValue('xlsx');

    // Select Word again
    await formatSelect.selectOption('docx');
    await expect(formatSelect).toHaveValue('docx');
  });

  test('should update stats when entering codes', async () => {
    const statsDiv = window.locator('#stats');

    // Initially should show "Ready to generate"
    await expect(statsDiv).toContainText('Ready to generate');

    // Enter one code
    await window.fill('#codes', 'ABC123');
    await expect(statsDiv).toContainText('1 code entered');

    // Enter multiple codes
    await window.fill('#codes', 'ABC123\nDEF456\nGHI789');
    await expect(statsDiv).toContainText('3 codes entered');
  });

  test('should clear textarea when clicking Clear button', async () => {
    const textarea = window.locator('#codes');
    const statsDiv = window.locator('#stats');

    // Enter some codes
    await window.fill('#codes', 'ABC123\nDEF456');
    await expect(statsDiv).toContainText('2 codes entered');

    // Click clear button
    await window.click('#clearBtn');

    // Verify textarea is empty
    await expect(textarea).toHaveValue('');
    await expect(statsDiv).toContainText('Ready to generate');
  });

  test('should show warning when generating with no input', async () => {
    // Make sure textarea is empty
    await window.fill('#codes', '');

    // Click generate
    await window.click('#generateBtn');

    // Should show warning status
    const status = window.locator('#status');
    await expect(status).toHaveClass(/warning/);
    await expect(status).toContainText('No Input');
  });

  test('should show validation error for codes with leading zeros', async () => {
    // Enter codes with leading zeros (invalid)
    await window.fill('#codes', '04018-28\n0123456');

    // Click generate
    await window.click('#generateBtn');

    // Should show error status with validation failures
    const status = window.locator('#status');
    await expect(status).toHaveClass(/error/);
    await expect(status).toContainText('Validation Failed');
    await expect(status).toContainText('04018-28');
    await expect(status).toContainText('0123456');
  });

  test('should allow zeros after delimiters', async () => {
    // Set mock to cancel the dialog
    await electronApp.evaluate(async ({ ipcMain }) => {
      const handler = ipcMain._invokeHandlers?.get('e2e:set-mock-save-dialog');
      if (handler) {
        await handler({}, { canceled: true });
      }
    });

    // These should be valid - zeros after hyphens are allowed
    await window.fill('#codes', 'M4018-028\nABC-001\nXYZ-0099');

    await window.click('#generateBtn');

    // Wait a moment for validation
    await window.waitForTimeout(500);

    const status = window.locator('#status');
    // Should not show validation error
    const statusText = await status.textContent();
    expect(statusText).not.toContain('Validation Failed');
  });
});

test.describe('Document Generation', () => {
  test('should generate document successfully with valid codes', async () => {
    // Create a temp file path for the output
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `test-barcode-${Date.now()}.docx`);

    // Set mock save dialog to return our temp path
    await electronApp.evaluate(async ({ ipcMain }, outputPath) => {
      // Access the mock setter via IPC
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:set-mock-save-dialog')) {
        await handlers.get('e2e:set-mock-save-dialog')({}, { filePath: outputPath, canceled: false });
      }
    }, outputPath);

    // Enter valid codes
    await window.fill('#codes', 'ABC123\nDEF456\nGHI789');

    // Click generate
    await window.click('#generateBtn');

    // Wait for generation to complete
    await window.waitForTimeout(2000);

    // Check for success message
    const status = window.locator('#status');
    await expect(status).toHaveClass(/success/);
    await expect(status).toContainText('Export Complete');

    // Verify the file was created
    const fileExists = fs.existsSync(outputPath);
    expect(fileExists).toBe(true);

    // Verify it's a valid docx file (should start with PK - zip signature)
    const fileContent = fs.readFileSync(outputPath);
    expect(fileContent[0]).toBe(0x50); // 'P'
    expect(fileContent[1]).toBe(0x4B); // 'K'

    // Clean up
    fs.unlinkSync(outputPath);

    // Clear the mock
    await electronApp.evaluate(async ({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:clear-mock-save-dialog')) {
        await handlers.get('e2e:clear-mock-save-dialog')({});
      }
    });
  });

  test('should handle canceled save dialog', async () => {
    // Set mock save dialog to return canceled
    await electronApp.evaluate(async ({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:set-mock-save-dialog')) {
        await handlers.get('e2e:set-mock-save-dialog')({}, { canceled: true });
      }
    });

    // Enter valid codes
    await window.fill('#codes', 'ABC123');

    // Click generate
    await window.click('#generateBtn');

    // Wait for processing
    await window.waitForTimeout(500);

    // Status should not show success or error (dialog was canceled)
    const status = window.locator('#status');
    const hasSuccess = await status.evaluate((el) => el.classList.contains('success'));
    const hasError = await status.evaluate((el) => el.classList.contains('error'));

    expect(hasSuccess).toBe(false);
    expect(hasError).toBe(false);

    // Clear the mock
    await electronApp.evaluate(async ({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:clear-mock-save-dialog')) {
        await handlers.get('e2e:clear-mock-save-dialog')({});
      }
    });
  });

  test('should generate document with many codes', async () => {
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `test-barcode-many-${Date.now()}.docx`);

    // Set mock save dialog
    await electronApp.evaluate(async ({ ipcMain }, outputPath) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:set-mock-save-dialog')) {
        await handlers.get('e2e:set-mock-save-dialog')({}, { filePath: outputPath, canceled: false });
      }
    }, outputPath);

    // Enter 21 codes (should create 3 rows of 7)
    const codes = Array.from({ length: 21 }, (_, i) => `CODE-${String(i + 1).padStart(3, '0')}`).join('\n');
    await window.fill('#codes', codes);

    // Verify stats show correct count
    await expect(window.locator('#stats')).toContainText('21 codes entered');

    // Click generate
    await window.click('#generateBtn');

    // Wait for generation (may take longer with many codes)
    await window.waitForTimeout(3000);

    // Check for success
    const status = window.locator('#status');
    await expect(status).toHaveClass(/success/);

    // Verify file exists and has content
    const fileExists = fs.existsSync(outputPath);
    expect(fileExists).toBe(true);

    const fileSize = fs.statSync(outputPath).size;
    expect(fileSize).toBeGreaterThan(1000); // Should be reasonably sized

    // Clean up
    fs.unlinkSync(outputPath);

    await electronApp.evaluate(async ({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:clear-mock-save-dialog')) {
        await handlers.get('e2e:clear-mock-save-dialog')({});
      }
    });
  });

  test('should generate PDF document successfully', async () => {
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `test-barcode-${Date.now()}.pdf`);

    // Set mock save dialog
    await electronApp.evaluate(async ({ ipcMain }, outputPath) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:set-mock-save-dialog')) {
        await handlers.get('e2e:set-mock-save-dialog')({}, { filePath: outputPath, canceled: false });
      }
    }, outputPath);

    // Select PDF format
    await window.locator('#formatSelect').selectOption('pdf');

    // Enter valid codes
    await window.fill('#codes', 'PDF-001\nPDF-002\nPDF-003');

    // Click generate
    await window.click('#generateBtn');

    // Wait for generation to complete
    await window.waitForTimeout(2000);

    // Check for success message
    const status = window.locator('#status');
    await expect(status).toHaveClass(/success/);
    await expect(status).toContainText('Export Complete');

    // Verify the file was created
    const fileExists = fs.existsSync(outputPath);
    expect(fileExists).toBe(true);

    // Verify it's a valid PDF file (should start with %PDF)
    const fileContent = fs.readFileSync(outputPath);
    expect(fileContent[0]).toBe(0x25); // '%'
    expect(fileContent[1]).toBe(0x50); // 'P'
    expect(fileContent[2]).toBe(0x44); // 'D'
    expect(fileContent[3]).toBe(0x46); // 'F'

    // Clean up
    fs.unlinkSync(outputPath);

    // Clear the mock and reset format
    await electronApp.evaluate(async ({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:clear-mock-save-dialog')) {
        await handlers.get('e2e:clear-mock-save-dialog')({});
      }
    });
    await window.locator('#formatSelect').selectOption('docx');
  });

  test('should generate Excel document successfully', async () => {
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `test-barcode-${Date.now()}.xlsx`);

    // Set mock save dialog
    await electronApp.evaluate(async ({ ipcMain }, outputPath) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:set-mock-save-dialog')) {
        await handlers.get('e2e:set-mock-save-dialog')({}, { filePath: outputPath, canceled: false });
      }
    }, outputPath);

    // Select Excel format
    await window.locator('#formatSelect').selectOption('xlsx');

    // Enter valid codes
    await window.fill('#codes', 'XLS-001\nXLS-002\nXLS-003');

    // Click generate
    await window.click('#generateBtn');

    // Wait for generation to complete
    await window.waitForTimeout(2000);

    // Check for success message
    const status = window.locator('#status');
    await expect(status).toHaveClass(/success/);
    await expect(status).toContainText('Export Complete');

    // Verify the file was created
    const fileExists = fs.existsSync(outputPath);
    expect(fileExists).toBe(true);

    // Verify it's a valid xlsx file (should start with PK - zip signature, same as docx)
    const fileContent = fs.readFileSync(outputPath);
    expect(fileContent[0]).toBe(0x50); // 'P'
    expect(fileContent[1]).toBe(0x4B); // 'K'

    // Verify file size is reasonable
    const fileSize = fs.statSync(outputPath).size;
    expect(fileSize).toBeGreaterThan(1000);

    // Clean up
    fs.unlinkSync(outputPath);

    // Clear the mock and reset format
    await electronApp.evaluate(async ({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:clear-mock-save-dialog')) {
        await handlers.get('e2e:clear-mock-save-dialog')({});
      }
    });
    await window.locator('#formatSelect').selectOption('docx');
  });

  test('should generate PDF with many codes', async () => {
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `test-barcode-many-${Date.now()}.pdf`);

    // Set mock save dialog
    await electronApp.evaluate(async ({ ipcMain }, outputPath) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:set-mock-save-dialog')) {
        await handlers.get('e2e:set-mock-save-dialog')({}, { filePath: outputPath, canceled: false });
      }
    }, outputPath);

    // Select PDF format
    await window.locator('#formatSelect').selectOption('pdf');

    // Enter 21 codes (should create multiple rows)
    const codes = Array.from({ length: 21 }, (_, i) => `PDF-${String(i + 1).padStart(3, '0')}`).join('\n');
    await window.fill('#codes', codes);

    // Click generate
    await window.click('#generateBtn');

    // Wait for generation (may take longer with many codes)
    await window.waitForTimeout(3000);

    // Check for success
    const status = window.locator('#status');
    await expect(status).toHaveClass(/success/);

    // Verify file exists and has content
    const fileExists = fs.existsSync(outputPath);
    expect(fileExists).toBe(true);

    const fileSize = fs.statSync(outputPath).size;
    expect(fileSize).toBeGreaterThan(1000);

    // Clean up
    fs.unlinkSync(outputPath);

    await electronApp.evaluate(async ({ ipcMain }) => {
      const handlers = ipcMain._invokeHandlers;
      if (handlers && handlers.get('e2e:clear-mock-save-dialog')) {
        await handlers.get('e2e:clear-mock-save-dialog')({});
      }
    });
    await window.locator('#formatSelect').selectOption('docx');
  });
});

test.describe('Window properties', () => {
  test('should have correct window dimensions', async () => {
    const size = await electronApp.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0];
      return win.getSize();
    });

    expect(size[0]).toBe(800);
    expect(size[1]).toBe(600);
  });
});
