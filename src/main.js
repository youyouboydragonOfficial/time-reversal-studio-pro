const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ReversalEngine = require('./reversalEngine');

let mainWindow = null;
let engine = null;

function resolveBinDir() {
  if (app.isPackaged) {
    const resourcesBin = path.join(process.resourcesPath, 'bin');
    if (fs.existsSync(path.join(resourcesBin, 'ffmpeg.exe'))) {
      return resourcesBin;
    }
  }
  const localBin = path.join(__dirname, '..', 'bin');
  if (fs.existsSync(path.join(localBin, 'ffmpeg.exe'))) {
    return localBin;
  }
  return path.join(__dirname, '..', 'bin');
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 980,
    minHeight: 680,
    backgroundColor: '#0a0e17',
    frame: false,
    titleBarStyle: 'hidden',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow local video preview playback
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (engine) engine.cancel();
  });
}

app.whenReady().then(() => {
  const binDir = resolveBinDir();
  engine = new ReversalEngine(binDir);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle('detect-gpu', async () => {
  return await engine.detectGpuAcceleration();
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '逆再生する動画ファイルを選択',
    properties: ['openFile'],
    filters: [
      { name: '動画ファイル', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'ts'] },
      { name: 'すべてのファイル', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-save-path', async (event, defaultName) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '逆再生動画の保存先を指定',
    defaultPath: defaultName || 'reversed_video.mp4',
    filters: [
      { name: 'MP4 動画', extensions: ['mp4'] },
      { name: 'MKV 動画', extensions: ['mkv'] },
      { name: 'MOV 動画', extensions: ['mov'] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle('probe-video', async (event, filePath) => {
  return await engine.probeVideo(filePath);
});

ipcMain.handle('start-reversal', async (event, options) => {
  return await engine.reverseVideo(options, (progressData) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('reversal-progress', progressData);
    }
  });
});

ipcMain.handle('cancel-reversal', async () => {
  if (engine) engine.cancel();
  return true;
});

ipcMain.handle('open-in-folder', async (event, filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    shell.showItemInFolder(filePath);
    return true;
  }
  return false;
});

// Window controls
ipcMain.on('window-minimize', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});

ipcMain.on('window-close', () => {
  if (mainWindow) mainWindow.close();
});
