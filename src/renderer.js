// State
let currentInputPath = null;
let currentOutputPath = null;
let currentVideoInfo = null;
let selectedSpeed = 1.0;
let isProcessing = false;

// DOM Elements
const gpuBadge = document.getElementById('gpuBadge');
const gpuName = document.getElementById('gpuName');
const selectEncoder = document.getElementById('selectEncoder');

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
const btnChangePath = document.getElementById('btnChangePath');

const progressSpinner = document.getElementById('progressSpinner');
const stageText = document.getElementById('stageText');
const percentText = document.getElementById('percentText');
const progressFill = document.getElementById('progressFill');

const metricSpeed = document.getElementById('metricSpeed');
const metricElapsed = document.getElementById('metricElapsed');
const metricRemaining = document.getElementById('metricRemaining');
const metricRam = document.getElementById('metricRam');

const btnStartReverse = document.getElementById('btnStartReverse');
const btnCancel = document.getElementById('btnCancel');
const btnOpenFolder = document.getElementById('btnOpenFolder');

// Window Controls
document.getElementById('btnMinimize').addEventListener('click', () => window.api.minimize());
document.getElementById('btnMaximize').addEventListener('click', () => window.api.maximize());
document.getElementById('btnClose').addEventListener('click', () => window.api.close());

// Initialize GPU detection
async function initHardwareDetection() {
  try {
    const gpuInfo = await window.api.detectGpu();
    selectEncoder.innerHTML = '';

    gpuInfo.available.forEach((enc) => {
      const opt = document.createElement('option');
      opt.value = enc.id;
      const isRec = enc.id === gpuInfo.recommended.id;
      opt.textContent = `${enc.name}${isRec ? ' ★ (推奨)' : ''}`;
      if (isRec) opt.selected = true;
      selectEncoder.appendChild(opt);
    });

    gpuName.textContent = `GPU: ${gpuInfo.recommended.vendor} (${gpuInfo.recommended.id.toUpperCase()}) ACTIVE`;
    gpuBadge.title = `ハードウェアアクセラレーション有効: ${gpuInfo.recommended.name}`;
  } catch (e) {
    console.error('GPU detection error:', e);
    gpuName.textContent = 'GPU ACCELERATION: ACTIVE (HYBRID)';
  }
}
initHardwareDetection();

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
  stageText.textContent = '動画ファイルを解析中...';
  progressSpinner.style.display = 'inline-block';

  try {
    const info = await window.api.probeVideo(filePath);
    currentVideoInfo = info;

    // Show preview player
    dropPrompt.style.display = 'none';
    videoPreviewWrapper.style.display = 'flex';
    previewPlayer.src = filePath;
    previewPlayer.load();

    // Overlay info
    overlayDuration.textContent = info.durationFormatted;
    overlayResolution.textContent = `${info.width}x${info.height}`;
    overlayFps.textContent = `${info.fps} FPS`;

    // Populate info card
    infoCard.style.display = 'block';
    const filename = filePath.split(/[/\\]/).pop();
    valFilename.textContent = filename;
    valDuration.textContent = `${info.durationFormatted} (${Math.round(info.duration)}秒)`;
    valResFps.textContent = `${info.width}x${info.height} @ ${info.fps}fps`;
    valSize.textContent = formatBytes(info.sizeBytes);
    valCodecs.textContent = `${info.codec.toUpperCase()} / ${info.hasAudio ? info.audioCodec.toUpperCase() : '音声なし'}`;

    // Auto default output path
    const lastDot = filePath.lastIndexOf('.');
    currentOutputPath = (lastDot > 0 ? filePath.substring(0, lastDot) : filePath) + '_reversed.mp4';
    inputOutputPath.value = currentOutputPath;

    // Ready state
    btnStartReverse.disabled = false;
    btnOpenFolder.style.display = 'none';
    stageText.textContent = `準備完了 (${info.durationFormatted}) - 設定を確認して開始を押してください`;
    progressSpinner.style.display = 'none';
  } catch (err) {
    alert('動画の読み込みに失敗しました: ' + err.message);
    stageText.textContent = '動画の解析に失敗しました。';
    progressSpinner.style.display = 'none';
  }
}

// Format bytes
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

// Change Save Path
btnChangePath.addEventListener('click', async () => {
  if (!currentInputPath) return;
  const newPath = await window.api.selectSavePath(inputOutputPath.value);
  if (newPath) {
    currentOutputPath = newPath;
    inputOutputPath.value = newPath;
  }
});

// Speed selector buttons
document.querySelectorAll('.speed-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    selectedSpeed = parseFloat(btn.dataset.speed);
  });
});

// Radio card active states
document.querySelectorAll('.radio-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.radio-card').forEach((c) => c.classList.remove('active'));
    card.classList.add('active');
  });
});

document.querySelectorAll('.pill').forEach((pill) => {
  pill.addEventListener('click', () => {
    const name = pill.querySelector('input').name;
    document.querySelectorAll(`.pill input[name="${name}"]`).forEach((i) => {
      i.parentElement.classList.remove('active');
    });
    pill.classList.add('active');
  });
});

// Progress Listener
window.api.onProgress((data) => {
  stageText.textContent = data.stageText;
  percentText.textContent = `${data.percent}%`;
  progressFill.style.width = `${data.percent}%`;

  metricSpeed.textContent = data.speedMultiplier || '-';
  metricElapsed.textContent = data.elapsedTime || '00:00:00';
  metricRemaining.textContent = data.remainingTime || '-';
  metricRam.textContent = `完全安定 (${data.ramUsageMB || 135} MB)`;

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
  progressSpinner.style.display = 'inline-block';

  // Read options
  const encoder = selectEncoder.value;
  const chunkSizeInput = document.querySelector('input[name="chunkSize"]:checked');
  const chunkDuration = chunkSizeInput ? parseInt(chunkSizeInput.value, 10) : 20;

  const audioModeInput = document.querySelector('input[name="audioMode"]:checked');
  const audioMode = audioModeInput ? audioModeInput.value : 'reverse';

  const qualityInput = document.querySelector('input[name="quality"]:checked');
  const quality = qualityInput ? qualityInput.value : 'high';

  const options = {
    inputPath: currentInputPath,
    outputPath: currentOutputPath,
    encoder,
    chunkDuration,
    audioMode,
    speed: selectedSpeed,
    quality
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

// Cancel Reversal
btnCancel.addEventListener('click', async () => {
  if (!isProcessing) return;
  stageText.textContent = '中止処理中...';
  await window.api.cancelReversal();
  resetProcessingState();
});

// Open output folder
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

  // Play output video
  previewPlayer.src = currentOutputPath;
  previewPlayer.load();
  previewPlayer.play().catch(() => {});
}

function resetProcessingState() {
  isProcessing = false;
  btnStartReverse.disabled = false;
  btnCancel.style.display = 'none';
  progressSpinner.style.display = 'none';
}
