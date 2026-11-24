const { contextBridge, ipcRenderer } = require('electron');
// pagina poate cere manual cautarea de actualizari (din Setari aplicatie)
contextBridge.exposeInMainWorld('electronApp', { checkUpdates: () => ipcRenderer.invoke('check-updates') });
