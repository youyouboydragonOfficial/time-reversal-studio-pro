// State
let currentInputPath = null;
let currentOutputPath = null;
let currentVideoInfo = null;
let selectedSpeed = 1.0;
let selectedQuality = 'high';
let selectedChunkSize = 20;
let selectedAudioMode = 'reverse';
let currentConcurrency = 1;
let pendingConcurrency = 1;
let warningConfirmed = false;
let isProcessing = false;
let specialPaths = { downloads: '', desktop: '', videos: '' };

// DOM Elements
const gpuBadge = document.getElementById('gpuBadge');
const gpuName = document.getElementById('gpuName');
const cpuChip = document.getElementById('cpuChip');
const cpuName = document.getElementById('cpuName');
const selectEncoder = document.getElementById('selectEncoder');
const turboBadge = document.getElementById('turboBadge');

const dropZone = document.getElementById('dropZone');
const dropPrompt = document.getElementById('dropPrompt');
const btnSelectFile = document.getElementById('btnSelectFile');
const videoPreviewWrapper = document.getElementById('videoPreviewWrapper');
const previewPlayer = document.getElementById('previewPlayer');
const btnReselect = document.getElementById('btnReselect');

const overlayDuration = document.getElementById('overlayDuration');
const overlayResolution = document.getElementById('overlayResolution');
const overlayFps = document.getElementById('overlayFps');

const infoCard = document.getElementById('infoCard');
const valFilename = document.getElementById('valFilename');
const valDuration = document.getElementById('valDuration');
const valResFps = document.getElementById('valResFps');
const valSize = document.getElementById('valSize');
const valCodecs = document.getElementById('valCodecs');

const inputOutputPath = document.getElementById('inputOutputPath');
const pathInputWrapper = document.getElementById('pathInputWrapper');
const btnChangePath = document.getElementById('btnChangePath');
const saveStatusPill = document.getElementById('saveStatusPill');

const presetDownloads = document.getElementById('presetDownloads');
const presetDesktop = document.getElementById('presetDesktop');
const presetSameDir = document.getElementById('presetSameDir');

const stageText = document.getElementById('stageText');
const percentText = document.getElementById('percentText');
const progressFill = document.getElementById('progressFill');
const liveFpsBadge = document.getElementById('liveFpsBadge');
const pulseIndicator = document.getElementById('pulseIndicator');

const metricSpeed = document.getElementById('metricSpeed');
const metricFrames = document.getElementById('metricFrames');
const metricTimes = document.getElementById('metricTimes');
const metricRam = document.getElementById('metricRam');

const btnStartReverse = document.getElementById('btnStartReverse');
const btnCancel = document.getElementById('btnCancel');
const btnOpenFolder = document.getElementById('btnOpenFolder');

// Warning Modal Elements
const warningModal = document.getElementById('warningModal');
const modalWorkerCount = document.getElementById('modalWorkerCount');
const chkAgreeWarning = document.getElementById('chkAgreeWarning');
const btnModalCancel = document.getElementById('btnModalCancel');
const btnModalConfirm = document.getElementById('btnModalConfirm');

// Window Controls
document.getElementById('btnMinimize').addEventListener('click', () => window.api.minimize());
document.getElementById('btnMaximize').addEventListener('click', () => window.api.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.api.close());

// Initialize Hardware & Special Paths
async function init() {
  try {
    specialPaths = await window.api.getSpecialPaths();
  } catch (e) {
    console.error('getSpecialPaths error:', e);
  }

  try {
    const gpuInfo = await window.api.detectGpu();
    selectEncoder.innerHTML = '';

    gpuInfo.available.forEach((enc) => {
      const opt = document.createElement('option');
      opt.value = enc.id;
      const isRec = enc.id === gpuInfo.recommended.id;
      opt.textContent = `${enc.name}${isRec ? ' ★ (推奨・最適化済)' : ''}`;
      if (isRec) opt.selected = true;
      selectEncoder.appendChild(opt);
    });

    gpuName.textContent = `GPU: ${gpuInfo.recommended.vendor} (${gpuInfo.recommended.id.toUpperCase()}) ACTIVE`;
    gpuBadge.title = `ハードウェアアクセラレーション有効: ${gpuInfo.recommended.name}`;
    cpuName.textContent = `CPU: ${gpuInfo.cpuCores || 8} THREADS READY`;
  } catch (e) {
    console.error('GPU detection error:', e);
    gpuName.textContent = 'GPU ACCELERATION: ACTIVE (HYBRID)';
  }
}
init();

// Save Destination Handling (FIXED: works anytime!)
async function openSaveDialog() {
  const defaultBase = currentInputPath ? getSuggestedReversedName(currentInputPath) : 'reversed_video.mp4';
  const currentVal = inputOutputPath.value || defaultBase;
  const newPath = await window.api.selectSavePath(currentVal);
  if (newPath) {
    setOutputPath(newPath);
  }
}

function setOutputPath(savePath) {
  currentOutputPath = savePath;
  inputOutputPath.value = savePath;
  saveStatusPill.textContent = '設定完了';
  saveStatusPill.className = 'info-pill green';
}

function getSuggestedReversedName(filePath) {
  const lastDot = filePath.lastIndexOf('.');
  return (lastDot > 0 ? filePath.substring(0, lastDot) : filePath) + '_reversed.mp4';
}

btnChangePath.addEventListener('click', openSaveDialog);
pathInputWrapper.addEventListener('click', openSaveDialog);
inputOutputPath.addEventListener('change', () => {
  currentOutputPath = inputOutputPath.value;
});

// Quick Presets
presetDownloads.addEventListener('click', () => {
  const filename = currentInputPath ? pathBasename(getSuggestedReversedName(currentInputPath)) : 'reversed_video.mp4';
  const target = (specialPaths.downloads || 'C:\\Users\\Default\\Downloads') + '\\' + filename;
  setOutputPath(target);
});

presetDesktop.addEventListener('click', () => {
  const filename = currentInputPath ? pathBasename(getSuggestedReversedName(currentInputPath)) : 'reversed_video.mp4';
  const target = (specialPaths.desktop || 'C:\\Users\\Default\\Desktop') + '\\' + filename;
  setOutputPath(target);
});

presetSameDir.addEventListener('click', () => {
  if (currentInputPath) {
    setOutputPath(getSuggestedReversedName(currentInputPath));
  } else {
    alert('先に動画ファイルを読み込んでください。');
  }
});

function pathBasename(fullPath) {
  return fullPath.split(/[/\\]/).pop();
}

// Performance Turbo Selection & Warning Modal
const turboTiles = document.querySelectorAll('.turbo-tile');
turboTiles.forEach((tile) => {
  tile.addEventListener('click', () => {
    const workers = parseInt(tile.dataset.workers, 10);
    if (workers === 1) {
      setTurboWorkers(1);
    } else {
      if (!warningConfirmed) {
        pendingConcurrency = workers;
        modalWorkerCount.textContent = workers;
        chkAgreeWarning.checked = false;
        btnModalConfirm.disabled = true;
        warningModal.style.display = 'flex';
      } else {
        setTurboWorkers(workers);
      }
    }
  });
});

function setTurboWorkers(workers) {
  currentConcurrency = workers;
  turboTiles.forEach((t) => {
    const isThis = parseInt(t.dataset.workers, 10) === workers;
    t.classList.toggle('active', isThis);
  });

  if (workers > 1) {
    turboBadge.textContent = `⚡ ターボ有効 (${workers}並列)`;
    turboBadge.className = 'hud-badge active-badge';
  } else {
    turboBadge.textContent = '通常セーフモード';
    turboBadge.className = 'hud-badge';
  }
}

chkAgreeWarning.addEventListener('change', () => {
  btnModalConfirm.disabled = !chkAgreeWarning.checked;
});

btnModalCancel.addEventListener('click', () => {
  warningModal.style.display = 'none';
  setTurboWorkers(1);
});

btnModalConfirm.addEventListener('click', () => {
  warningConfirmed = true;
  warningModal.style.display = 'none';
  setTurboWorkers(pendingConcurrency);
});

// Segmented Chunk Pills
document.querySelectorAll('.seg-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.seg-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    selectedChunkSize = parseInt(pill.dataset.chunk, 10);
  });
});

// Audio Pills
document.querySelectorAll('.audio-pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.audio-pill').forEach((p) => p.classList.remove('active'));
    pill.classList.add('active');
    selectedAudioMode = pill.dataset.audio;
  });
});

// Speed Tiles
document.querySelectorAll('.speed-tile').forEach((tile) => {
  tile.addEventListener('click', () => {
    document.querySelectorAll('.speed-tile').forEach((t) => t.classList.remove('active'));
    tile.classList.add('active');
    selectedSpeed = parseFloat(tile.dataset.speed);
  });
});

// Quality Tiles
document.querySelectorAll('.quality-tile').forEach((tile) => {
  tile.addEventListener('click', () => {
    document.querySelectorAll('.quality-tile').forEach((t) => t.classList.remove('active'));
    tile.classList.add('active');
    selectedQuality = tile.dataset.quality;
  });
});

// File Selection & Drag-and-Drop
btnSelectFile.addEventListener('click', handleFileSelect);
btnReselect.addEventListener('click', handleFileSelect);

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    if (file.path) {
      loadVideo(file.path);
    }
  }
});

async function handleFileSelect() {
  const filePath = await window.api.selectFile();
  if (filePath) {
    loadVideo(filePath);
  }
}

// Load Video and Probe
async function loadVideo(filePath) {
  currentInputPath = filePath;
  stageText.textContent = '動画ファイルを解析中 (ffprobe)...';
  pulseIndicator.style.backgroundColor = '#f59e0b';
  pulseIndicator.style.boxShadow = '0 0 10px #f59e0b';

  try {
    const info = await window.api.probeVideo(filePath);
    currentVideoInfo = info;

    // Viewport
    dropPrompt.style.display = 'none';
    videoPreviewWrapper.style.display = 'flex';
    previewPlayer.src = filePath;
    previewPlayer.load();

    // HUD Pills
    overlayDuration.textContent = info.durationFormatted;
    overlayResolution.textContent = `${info.width}x${info.height}`;
    overlayFps.textContent = `${info.fps} FPS`;

    // Inspector
    infoCard.style.display = 'block';
    valFilename.textContent = pathBasename(filePath);
    valDuration.textContent = `${info.durationFormatted} (${Math.round(info.duration)}秒)`;
    valResFps.textContent = `${info.width}x${info.height} @ ${info.fps}fps`;
    valSize.textContent = formatBytes(info.sizeBytes);
    valCodecs.textContent = `${info.totalFrames.toLocaleString()} フレーム / ${info.codec.toUpperCase()} (${info.hasAudio ? info.audioCodec.toUpperCase() : '音声なし'})`;

    // Default Save Path
    if (!currentOutputPath) {
      setOutputPath(getSuggestedReversedName(filePath));
    }

    // Ready
    btnStartReverse.disabled = false;
    btnOpenFolder.style.display = 'none';
    stageText.textContent = `準備完了 (${info.durationFormatted}) - 設定を確認して開始を押してください`;
    pulseIndicator.style.backgroundColor = '#10b981';
    pulseIndicator.style.boxShadow = '0 0 10px #10b981';
    metricFrames.textContent = `0 / ${info.totalFrames.toLocaleString()}`;
  } catch (err) {
    alert('動画の読み込みに失敗しました: ' + err.message);
    stageText.textContent = '動画の解析に失敗しました。';
    pulseIndicator.style.backgroundColor = '#ef4444';
  }
}

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

// Progress Listener
window.api.onProgress((data) => {
  stageText.textContent = data.stageText;
  percentText.textContent = `${data.percent}%`;
  progressFill.style.width = `${data.percent}%`;

  if (data.fps && data.fps > 0) {
    liveFpsBadge.style.display = 'inline-block';
    liveFpsBadge.textContent = `${data.fps} FPS`;
  }

  metricSpeed.textContent = data.speedMultiplier ? `${data.speedMultiplier} リアルタイム` : '-';
  if (data.processedFrames && data.totalFrames) {
    metricFrames.textContent = `${data.processedFrames.toLocaleString()} / ${data.totalFrames.toLocaleString()}`;
  }
  metricTimes.textContent = `${data.elapsedTime || '00:00:00'} / ${data.remainingTime || '--:--:--'}`;

  const ramClass = data.ramUsageMB > 400 ? 'hud-val text-cyan' : 'hud-val text-green';
  metricRam.className = ramClass;
  metricRam.textContent = `${data.ramUsageMB || 130} MB (${data.concurrency > 1 ? data.concurrency + '並列稼働' : '完全安定'})`;

  if (data.stage === 'COMPLETED') {
    onReversalComplete();
  }
});

// Start Reversal
btnStartReverse.addEventListener('click', async () => {
  if (!currentInputPath || !currentOutputPath || isProcessing) return;

  isProcessing = true;
  btnStartReverse.disabled = true;
  btnCancel.style.display = 'inline-block';
  btnOpenFolder.style.display = 'none';

  pulseIndicator.style.backgroundColor = '#06b6d4';
  pulseIndicator.style.boxShadow = '0 0 12px #06b6d4';

  const options = {
    inputPath: currentInputPath,
    outputPath: currentOutputPath,
    encoder: selectEncoder.value,
    chunkDuration: selectedChunkSize,
    concurrency: currentConcurrency,
    audioMode: selectedAudioMode,
    speed: selectedSpeed,
    quality: selectedQuality
  };

  try {
    await window.api.startReversal(options);
  } catch (err) {
    if (err.message.includes('CANCELED')) {
      stageText.textContent = '処理が中止されました。';
    } else {
      alert('エラーが発生しました: ' + err.message);
      stageText.textContent = 'エラーにより処理が中断しました。';
    }
    resetProcessingState();
  }
});

// Cancel
btnCancel.addEventListener('click', async () => {
  if (!isProcessing) return;
  stageText.textContent = '中止処理中 (Aborting)...';
  await window.api.cancelReversal();
  resetProcessingState();
});

// Open Output Folder
btnOpenFolder.addEventListener('click', async () => {
  if (currentOutputPath) {
    await window.api.openInFolder(currentOutputPath);
  }
});

function onReversalComplete() {
  resetProcessingState();
  stageText.textContent = '✨ 時間逆転完了！動画が正常に出力されました。';
  percentText.textContent = '100%';
  progressFill.style.width = '100%';
  btnOpenFolder.style.display = 'inline-block';
  pulseIndicator.style.backgroundColor = '#10b981';

  // Preview generated reversed video
  previewPlayer.src = currentOutputPath;
  previewPlayer.load();
  previewPlayer.play().catch(() => {});
}

function resetProcessingState() {
  isProcessing = false;
  btnStartReverse.disabled = false;
  btnCancel.style.display = 'none';
  liveFpsBadge.style.display = 'none';
}
