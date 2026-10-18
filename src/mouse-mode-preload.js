const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('mouseMode', { send: input => ipcRenderer.send('mouse-mode:input', input) });
