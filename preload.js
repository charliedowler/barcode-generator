const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  validateCodes: (codesText) => ipcRenderer.invoke('validate-codes', codesText),
  generateDocument: (codesText, format) => ipcRenderer.invoke('generate-document', codesText, format)
});
