const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  detectGpu: () => ipcRenderer.invoke('detect-gpu'),
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectSavePath: (defaultName) => ipcRenderer.invoke('select-save-path', defaultName),
  getSpecialPaths: () => ipcRenderer.invoke('get-special-paths'),
  probeVideo: (filePath) => ipcRenderer.invoke('probe-video', filePath),
  startReversal: (options) => ipcRenderer.invoke('start-reversal', options),
  cancelReversal: () => ipcRenderer.invoke('cancel-reversal'),
  openInFolder: (filePath) => ipcRenderer.invoke('open-in-folder', filePath),
  onProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('reversal-progress', handler);
    return () => ipcRenderer.removeListener('reversal-progress', handler);
  },
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close')
});
