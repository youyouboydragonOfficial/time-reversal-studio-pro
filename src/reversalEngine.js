const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');

class ReversalEngine {
  constructor(binDir) {
    this.binDir = binDir || path.join(__dirname, '..', 'bin');
    this.ffmpegPath = path.join(this.binDir, 'ffmpeg.exe');
    this.ffprobePath = path.join(this.binDir, 'ffprobe.exe');
    this.activeProcess = null;
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

        // Test which encoder actually works on current hardware
        this.findBestWorkingEncoder(encoders).then((best) => {
          resolve({
            available: encoders,
            recommended: best
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

          resolve({
            duration,
            durationFormatted: this.formatTime(duration),
            width: videoStream.width || 1920,
            height: videoStream.height || 1080,
            codec: videoStream.codec_name || 'unknown',
            fps: fps || 30,
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
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // Cancel running job
  cancel() {
    this.isCancelled = true;
    if (this.activeProcess) {
      try {
        this.activeProcess.kill('SIGKILL');
      } catch (e) {}
      this.activeProcess = null;
    }
    if (this.currentTempDir && fs.existsSync(this.currentTempDir)) {
      try {
        fs.rmSync(this.currentTempDir, { recursive: true, force: true });
      } catch (e) {}
    }
  }

  // Execute chunked reverse pipeline
  async reverseVideo(options, onProgress) {
    this.isCancelled = false;
    const {
      inputPath,
      outputPath,
      encoder = 'h264_amf',
      chunkDuration = 20, // 20s chunks for rock-solid memory stability
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
    const chunkFiles = [];

    // Quality preset params
    const videoBitrateArgs = [];
    if (quality === 'ultra') {
      videoBitrateArgs.push('-b:v', '14M', '-maxrate', '20M', '-bufsize', '25M');
    } else if (quality === 'high') {
      videoBitrateArgs.push('-b:v', '8M', '-maxrate', '12M', '-bufsize', '16M');
    } else {
      videoBitrateArgs.push('-b:v', '4M', '-maxrate', '6M', '-bufsize', '8M');
    }

    // Step 1: Process each chunk in forward order
    for (let i = 0; i < totalChunks; i++) {
      if (this.isCancelled) throw new Error('CANCELED');

      const chunkStart = i * chunkDuration;
      const actualChunkDuration = Math.min(chunkDuration, duration - chunkStart);
      const chunkOut = path.join(tempDir, `chunk_${String(i).padStart(5, '0')}.mp4`);
      chunkFiles.push(chunkOut);

      // Filters
      let vf = 'reverse';
      let af = 'areverse';

      // Speed adjustments
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

      // Audio handling
      if (!probe.hasAudio || audioMode === 'mute') {
        ffmpegArgs.push('-an');
      } else if (audioMode === 'reverse') {
        ffmpegArgs.push('-af', af, '-c:a', 'aac', '-b:a', '192k');
      } else if (audioMode === 'keep') {
        ffmpegArgs.push('-c:a', 'aac', '-b:a', '192k');
      }

      // Video encoder
      ffmpegArgs.push('-c:v', encoder);
      if (encoder === 'libx264') {
        ffmpegArgs.push('-preset', quality === 'ultra' ? 'medium' : 'veryfast');
      }
      ffmpegArgs.push(...videoBitrateArgs);
      ffmpegArgs.push(chunkOut);

      // Run ffmpeg for this chunk
      await this.runProcess(this.ffmpegPath, ffmpegArgs, (line) => {
        // Can parse line if needed
      });

      // Progress reporting
      const processedSec = Math.min(duration, (i + 1) * chunkDuration);
      const overallPercent = Math.min(95, Math.round(((i + 1) / totalChunks) * 90));
      const elapsedMs = Date.now() - startTime;
      const msPerChunk = elapsedMs / (i + 1);
      const remainingChunks = totalChunks - (i + 1);
      const estRemainingSec = Math.round((remainingChunks * msPerChunk) / 1000);
      const speedMultiplier = ((processedSec * 1000) / Math.max(1, elapsedMs)).toFixed(1);

      if (onProgress) {
        onProgress({
          stage: 'REVERSING_CHUNKS',
          stageText: `チャンク処理中 (${i + 1} / ${totalChunks})`,
          currentChunk: i + 1,
          totalChunks,
          percent: overallPercent,
          processedSec,
          totalSec: duration,
          elapsedTime: this.formatTime(Math.floor(elapsedMs / 1000)),
          remainingTime: this.formatTime(estRemainingSec),
          speedMultiplier: `${speedMultiplier}x`,
          ramUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024)
        });
      }
    }

    if (this.isCancelled) throw new Error('CANCELED');

    // Step 2: Concatenate chunks in REVERSE order (chunk_N down to chunk_0)
    if (onProgress) {
      onProgress({
        stage: 'CONCATENATING',
        stageText: '時間逆転ストリーム高速結合中 (Lossless Concat)...',
        currentChunk: totalChunks,
        totalChunks,
        percent: 96,
        processedSec: duration,
        totalSec: duration,
        elapsedTime: this.formatTime(Math.floor((Date.now() - startTime) / 1000)),
        remainingTime: '00:00:05',
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

    await this.runProcess(this.ffmpegPath, concatArgs);

    // Final cleanup
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}

    const totalElapsedSec = Math.round((Date.now() - startTime) / 1000);
    if (onProgress) {
      onProgress({
        stage: 'COMPLETED',
        stageText: '逆再生動画の生成が完了しました！',
        currentChunk: totalChunks,
        totalChunks,
        percent: 100,
        processedSec: duration,
        totalSec: duration,
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

  runProcess(bin, args, onLine) {
    return new Promise((resolve, reject) => {
      const proc = spawn(bin, args, { windowsHide: true });
      this.activeProcess = proc;

      let stderrData = '';
      proc.stderr.on('data', (d) => {
        const text = d.toString();
        stderrData += text;
        if (onLine) onLine(text);
      });

      proc.on('close', (code) => {
        this.activeProcess = null;
        if (this.isCancelled) return reject(new Error('CANCELED'));
        if (code === 0) return resolve();
        reject(new Error(`FFmpeg exited with code ${code}: ${stderrData.slice(-400)}`));
      });

      proc.on('error', (err) => {
        this.activeProcess = null;
        reject(err);
      });
    });
  }
}

module.exports = ReversalEngine;
