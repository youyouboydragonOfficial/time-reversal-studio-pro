const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

class ReversalEngine {
  constructor(binDir) {
    this.binDir = binDir || path.join(__dirname, '..', 'bin');
    this.ffmpegPath = path.join(this.binDir, 'ffmpeg.exe');
    this.ffprobePath = path.join(this.binDir, 'ffprobe.exe');
    this.activeProcesses = new Set();
    this.isCancelled = false;
    this.currentTempDir = null;
  }

  // Detect supported hardware acceleration
  async detectGpuAcceleration() {
    return new Promise((resolve) => {
      execFile(this.ffmpegPath, ['-encoders'], (err, stdout, stderr) => {
        const out = stdout || stderr || '';
        const encoders = [];
        if (out.includes('h264_nvenc')) encoders.push({ id: 'h264_nvenc', name: 'NVIDIA NVENC (GPU)', vendor: 'NVIDIA' });
        if (out.includes('h264_amf')) encoders.push({ id: 'h264_amf', name: 'AMD AMF (Radeon GPU)', vendor: 'AMD' });
        if (out.includes('h264_qsv')) encoders.push({ id: 'h264_qsv', name: 'Intel QuickSync (GPU)', vendor: 'Intel' });
        if (out.includes('h264_mf')) encoders.push({ id: 'h264_mf', name: 'Windows MediaFoundation (Hardware/OS)', vendor: 'Microsoft' });
        encoders.push({ id: 'libx264', name: 'CPU High-Precision (x264 Ultra)', vendor: 'CPU' });

        this.findBestWorkingEncoder(encoders).then((best) => {
          resolve({
            available: encoders,
            recommended: best,
            cpuCores: os.cpus().length
          });
        });
      });
    });
  }

  async findBestWorkingEncoder(encoders) {
    for (const enc of encoders) {
      if (enc.id === 'libx264') return enc;
      const works = await new Promise((res) => {
        const proc = spawn(this.ffmpegPath, [
          '-f', 'lavfi', '-i', 'testsrc=duration=0.5:size=320x240:rate=30',
          '-c:v', enc.id, '-f', 'null', '-'
        ]);
        proc.on('close', (code) => res(code === 0));
        proc.on('error', () => res(false));
      });
      if (works) return enc;
    }
    return { id: 'libx264', name: 'CPU High-Precision (x264)', vendor: 'CPU' };
  }

  // Probe video file metadata
  async probeVideo(filePath) {
    return new Promise((resolve, reject) => {
      execFile(this.ffprobePath, [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ], (err, stdout, stderr) => {
        if (err) return reject(new Error('動画の解析に失敗しました: ' + (stderr || err.message)));
        try {
          const info = JSON.parse(stdout);
          const videoStream = info.streams?.find((s) => s.codec_type === 'video') || {};
          const audioStream = info.streams?.find((s) => s.codec_type === 'audio') || null;
          const duration = parseFloat(info.format?.duration || videoStream.duration || 0);

          let fps = 30;
          if (videoStream.r_frame_rate) {
            const parts = videoStream.r_frame_rate.split('/');
            fps = parts.length === 2 ? Math.round(parseFloat(parts[0]) / parseFloat(parts[1])) : Math.round(parseFloat(parts[0]));
          }

          const totalFrames = parseInt(videoStream.nb_frames || Math.round(duration * fps) || 0, 10);

          resolve({
            duration,
            durationFormatted: this.formatTime(duration),
            width: videoStream.width || 1920,
            height: videoStream.height || 1080,
            codec: videoStream.codec_name || 'unknown',
            fps: fps || 30,
            totalFrames,
            bitrate: parseInt(info.format?.bit_rate || 0, 10),
            sizeBytes: parseInt(info.format?.size || 0, 10),
            hasAudio: !!audioStream,
            audioCodec: audioStream?.codec_name || null
          });
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '00:00:00';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Cancel running job
  cancel() {
    this.isCancelled = true;
    for (const proc of this.activeProcesses) {
      try {
        proc.kill('SIGKILL');
      } catch (e) {}
    }
    this.activeProcesses.clear();

    if (this.currentTempDir && fs.existsSync(this.currentTempDir)) {
      try {
        fs.rmSync(this.currentTempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }

  // Execute chunked reverse pipeline with real-time feedback & multi-core concurrency
  async reverseVideo(options, onProgress) {
    this.isCancelled = false;
    this.activeProcesses.clear();

    const {
      inputPath,
      outputPath,
      encoder = 'h264_amf',
      chunkDuration = 20,
      concurrency = 1, // 1 for ultra-safe, 2/4/8 for Gaming PC turbo mode
      audioMode = 'reverse', // 'reverse' | 'mute' | 'keep'
      speed = 1.0, // 0.5, 1.0, 2.0, 4.0
      quality = 'high' // 'high', 'ultra', 'draft'
    } = options;

    const probe = await this.probeVideo(inputPath);
    const duration = probe.duration;
    if (!duration || duration <= 0) {
      throw new Error('動画の長さが取得できませんでした。');
    }

    const totalChunks = Math.ceil(duration / chunkDuration);
    const tempDir = path.join(os.tmpdir(), 'chronoreverse_' + Date.now());
    this.currentTempDir = tempDir;
    fs.mkdirSync(tempDir, { recursive: true });

    const startTime = Date.now();
    const chunkFiles = new Array(totalChunks);

    // Bitrate params
    const videoBitrateArgs = [];
    if (quality === 'ultra') {
      videoBitrateArgs.push('-b:v', '14M', '-maxrate', '20M', '-bufsize', '25M');
    } else if (quality === 'high') {
      videoBitrateArgs.push('-b:v', '8M', '-maxrate', '12M', '-bufsize', '16M');
    } else {
      videoBitrateArgs.push('-b:v', '4M', '-maxrate', '6M', '-bufsize', '8M');
    }

    let completedChunks = 0;
    const chunkProgressMap = new Map(); // chunkIndex -> percent within chunk
    let latestFps = 0;
    let latestSpeed = '1.0x';

    // Helper to emit aggregated real-time progress
    const emitAggregatedProgress = () => {
      if (!onProgress || this.isCancelled) return;

      let subPercentSum = 0;
      for (let p of chunkProgressMap.values()) {
        subPercentSum += p;
      }
      const overallFraction = (completedChunks + subPercentSum / 100) / totalChunks;
      const overallPercent = Math.min(95, Math.max(0, Math.round(overallFraction * 90)));

      const elapsedMs = Date.now() - startTime;
      const elapsedSec = Math.floor(elapsedMs / 1000);
      const estTotalMs = overallFraction > 0 ? elapsedMs / overallFraction : 0;
      const estRemainingSec = Math.max(0, Math.round((estTotalMs - elapsedMs) / 1000));

      const processedSec = Math.min(duration, overallFraction * duration);
      const speedMultiplier = elapsedSec > 0 ? (processedSec / elapsedSec).toFixed(1) : latestSpeed;

      const totalEstimatedFrames = probe.totalFrames || Math.round(duration * probe.fps);
      const processedFrames = Math.min(totalEstimatedFrames, Math.round(overallFraction * totalEstimatedFrames));

      onProgress({
        stage: 'REVERSING_CHUNKS',
        stageText: concurrency > 1
          ? `🚀 ゲーミング高負荷並列処理中 [${concurrency}スレッド] (${completedChunks} / ${totalChunks} チャンク)`
          : `チャンク逆再生中 (${completedChunks + 1} / ${totalChunks})`,
        currentChunk: completedChunks + 1,
        totalChunks,
        concurrency,
        percent: overallPercent,
        processedSec,
        totalSec: duration,
        processedFrames,
        totalFrames: totalEstimatedFrames,
        fps: latestFps,
        elapsedTime: this.formatTime(elapsedSec),
        remainingTime: this.formatTime(estRemainingSec),
        speedMultiplier: `${speedMultiplier}x`,
        ramUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
      });
    };

    // Worker function for a single chunk
    const processChunk = async (i) => {
      if (this.isCancelled) throw new Error('CANCELED');

      const chunkStart = i * chunkDuration;
      const actualChunkDuration = Math.min(chunkDuration, duration - chunkStart);
      const chunkOut = path.join(tempDir, `chunk_${String(i).padStart(5, '0')}.mp4`);
      chunkFiles[i] = chunkOut;

      let vf = 'reverse';
      let af = 'areverse';
      if (speed !== 1.0) {
        const ptsMult = 1.0 / speed;
        vf = `reverse,setpts=${ptsMult}*PTS`;
        if (speed === 0.5) af = 'areverse,atempo=0.5';
        else if (speed === 2.0) af = 'areverse,atempo=2.0';
        else if (speed === 4.0) af = 'areverse,atempo=2.0,atempo=2.0';
      }

      const ffmpegArgs = [
        '-y',
        '-ss', chunkStart.toString(),
        '-t', actualChunkDuration.toString(),
        '-i', inputPath,
        '-vf', vf
      ];

      if (!probe.hasAudio || audioMode === 'mute') {
        ffmpegArgs.push('-an');
      } else if (audioMode === 'reverse') {
        ffmpegArgs.push('-af', af, '-c:a', 'aac', '-b:a', '192k');
      } else if (audioMode === 'keep') {
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
      }

      ffmpegArgs.push('-c:v', encoder);
      if (encoder === 'libx264') {
        ffmpegArgs.push('-preset', quality === 'ultra' ? 'medium' : 'veryfast');
      }
      ffmpegArgs.push(...videoBitrateArgs);
      ffmpegArgs.push(chunkOut);

      chunkProgressMap.set(i, 0);

      await this.runProcessWithProgress(this.ffmpegPath, ffmpegArgs, (line) => {
        // Parse real-time progress from ffmpeg stderr
        // e.g. "time=00:00:14.25 fps=142.5 speed=7.1x"
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (timeMatch) {
          const curChunkSec = parseFloat(timeMatch[1]) * 3600 + parseFloat(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
          const chunkPct = Math.min(100, (curChunkSec / Math.max(0.1, actualChunkDuration)) * 100);
          chunkProgressMap.set(i, chunkPct);
        }

        const fpsMatch = line.match(/fps=\s*([\d\.]+)/);
        if (fpsMatch) latestFps = Math.round(parseFloat(fpsMatch[1]));

        const speedMatch = line.match(/speed=\s*([\d\.]+)x/);
        if (speedMatch) latestSpeed = speedMatch[1];

        emitAggregatedProgress();
      });

      chunkProgressMap.delete(i);
      completedChunks++;
      emitAggregatedProgress();
    };

    // Parallel Worker Pool
    const chunkIndices = Array.from({ length: totalChunks }, (_, idx) => idx);
    let nextIdx = 0;

    const worker = async () => {
      while (nextIdx < chunkIndices.length) {
        if (this.isCancelled) throw new Error('CANCELED');
        const current = chunkIndices[nextIdx++];
        await processChunk(current);
      }
    };

    const workerCount = Math.min(concurrency, totalChunks);
    const workers = [];
    for (let w = 0; w < workerCount; w++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    if (this.isCancelled) throw new Error('CANCELED');

    // Step 2: Concatenate chunks in REVERSE order
    if (onProgress) {
      onProgress({
        stage: 'CONCATENATING',
        stageText: '時間逆転ストリーム高速結合中 (Lossless Concat)...',
        currentChunk: totalChunks,
        totalChunks,
        concurrency,
        percent: 96,
        processedSec: duration,
        totalSec: duration,
        processedFrames: probe.totalFrames,
        totalFrames: probe.totalFrames,
        fps: latestFps,
        elapsedTime: this.formatTime(Math.floor((Date.now() - startTime) / 1000)),
        remainingTime: '00:00:03',
        speedMultiplier: 'MAX',
        ramUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
      });
    }

    const reversedChunkFiles = [...chunkFiles].reverse();
    const concatListPath = path.join(tempDir, 'concat_list.txt');
    const concatContent = reversedChunkFiles.map((f) => `file '${f.replace(/\\/g, '/')}'`).join('\n');
    fs.writeFileSync(concatListPath, concatContent, 'utf8');

    const concatArgs = [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      outputPath
    ];

    await this.runProcessWithProgress(this.ffmpegPath, concatArgs);

    // Final cleanup
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    const totalElapsedSec = Math.round((Date.now() - startTime) / 1000);
    if (onProgress) {
      onProgress({
        stage: 'COMPLETED',
        stageText: '時間逆転完了！動画が正常に出力されました。',
        currentChunk: totalChunks,
        totalChunks,
        concurrency,
        percent: 100,
        processedSec: duration,
        totalSec: duration,
        processedFrames: probe.totalFrames,
        totalFrames: probe.totalFrames,
        fps: latestFps,
        elapsedTime: this.formatTime(totalElapsedSec),
        remainingTime: '00:00:00',
        speedMultiplier: `${(duration / Math.max(1, totalElapsedSec)).toFixed(1)}x`,
        ramUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
      });
    }

    return {
      outputPath,
      duration,
      totalElapsedSec
    };
  }

  runProcessWithProgress(bin, args, onLine) {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, { windowsHide: true });
      this.activeProcesses.add(proc);

      let stderrData = '';
      proc.stderr.on('data', (d) => {
        const text = d.toString();
        stderrData += text;
        if (onLine) onLine(text);
      });

      proc.on('close', (code) => {
        this.activeProcesses.delete(proc);
        if (this.isCancelled) return reject(new Error('CANCELED'));
        if (code === 0) return resolve();
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-400)}`));
      });

      proc.on('error', (err) => {
        this.activeProcesses.delete(proc);
        reject(err);
      });
    });
  }
}

module.exports = ReversalEngine;
