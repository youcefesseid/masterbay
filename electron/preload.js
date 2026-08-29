const { contextBridge, shell } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  onUpdateAvailable: (callback) => {
    require('electron').ipcRenderer.on('update-available', (_event, info) => callback(info));
  },
  openExternal: (url) => shell.openExternal(url),
});
