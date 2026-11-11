const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const ReversalEngine = require('./reversalEngine');

let mainWindow = null;
let engine = null;

function resolveBinDir() {
  const candidates = [
    path.join(process.resourcesPath, 'app.asar.unpacked', 'bin'),
    path.join(__dirname, '..', 'app.asar.unpacked', 'bin'),
    path.join(app.getAppPath(), '..', 'app.asar.unpacked', 'bin'),
    path.join(process.resourcesPath, 'bin'),
    path.join(__dirname, '..', 'bin'),
    path.join(app.getAppPath(), 'bin'),
    path.join(process.cwd(), 'bin')
  ];

  for (const dir of candidates) {
    const ffmpeg = path.join(dir, 'ffmpeg.exe');
    const ffprobe = path.join(dir, 'ffprobe.exe');
    if (fs.existsSync(ffmpeg) && fs.existsSync(ffprobe)) {
      console.log('Found valid bin directory at:', dir);
      return dir;
    }
  }

  // Fallback to local source dir
  const fallback = path.join(__dirname, '..', 'bin');
  console.log('Falling back to bin dir:', fallback);
  return fallback;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 1040,
    minHeight: 700,
    backgroundColor: '#07090e',
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
      { name: '動画ファイル (*.mp4, *.mov, *.avi, *.mkv, *.webm, *.m4v, *.ts)', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm', 'flv', 'wmv', 'm4v', 'ts'] },
      { name: 'すべてのファイル (*.*)', extensions: ['*'] }
    ]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('select-save-path', async (event, defaultName) => {
  let defaultPath = defaultName;
  if (!defaultPath || !path.isAbsolute(defaultPath)) {
    const filename = defaultName ? path.basename(defaultName) : 'reversed_video.mp4';
    defaultPath = path.join(app.getPath('downloads'), filename);
  }
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '逆再生動画の保存先を指定',
    defaultPath,
    filters: [
      { name: 'MP4 動画 (*.mp4)', extensions: ['mp4'] },
      { name: 'MKV 動画 (*.mkv)', extensions: ['mkv'] },
      { name: 'MOV 動画 (*.mov)', extensions: ['mov'] },
      { name: 'すべてのファイル (*.*)', extensions: ['*'] }
    ]
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
});

ipcMain.handle('get-special-paths', async () => {
  return {
    downloads: app.getPath('downloads'),
    desktop: app.getPath('desktop'),
    videos: app.getPath('videos')
  };
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
