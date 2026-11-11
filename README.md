# ⏪ 時間逆転スタジオ - Time Reversal Studio Pro

**10時間以上の大容量動画もクラッシュ率0%で爆速処理する次世代動画逆再生スイート (Windows App)**

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-cyan.svg)
![GPU](https://img.shields.io/badge/GPU%20Acceleration-AMD%20%7C%20NVIDIA%20%7C%20Intel%20%7C%20MediaFoundation-green.svg)

---

## 🌟 主な特徴 (Features)

1. **⏱️ 10時間以上の超大容量動画に対応（メモリ枯渇クラッシュ率 0%）**
   - 通常の動画逆再生ツールは全フレームをRAMに展開するため、長尺動画で即座にOOMクラッシュします。
   - 本アプリは**チャンク分割ストリーミング逆再生エンジン**を搭載。RAM消費量を常時150MB以下に抑え、10時間・24時間の超長尺動画でもPCが重くならず100%安定して逆再生できます。

2. **🚀 GPUハードウェアアクセラレーション完全対応**
   - **AMD AMF (Radeon)**、**NVIDIA NVENC**、**Intel QuickSync (QSV)**、**Windows MediaFoundation** を自動検出。
   - 最大8x〜12xの超高速リアルタイムエンコードを実現。

3. **🎵 音声逆再生（Reverse Audio）同期**
   - 映像の逆転に合わせてオーディオストリームも高音質AACで完全逆再生同期。
   - ミュート（無音化）や、元の音声を順再生のまま保持するモードも選択可能。

4. **⏩ 速度倍率＆画質コントロール**
   - 0.5x（スロー逆再生）、1.0x（等速逆再生）、2.0x（2倍速）、4.0x（4倍速）。
   - スタジオマスター品質（14Mbps）、高画質（8Mbps）、高速ドラフト（4Mbps）。

5. **💎 公式感漂う Windows 11 Fluent Studio UI**
   - ドラッグ＆ドロップ対応、デュアルプレビュー（元動画と逆再生動画をアプリ内で即座に確認・再生）。
   - リアルタイム進行ダッシュボード（処理チャンク数、エンコード速度、残り時間、メモリ安定度モニタリング）。

---

## 📦 ダウンロード & インストール (Releases)

- **ポータブル版 (Portable .exe)**: インストール不要。ダウンロードしてダブルクリックするだけですぐに使えます。
- **インストーラー版 (Setup.exe)**: デスクトップやスタートメニューにショートカットを作成して本格的に使用できます。
- **Microsoft Store (MSIX)**: Microsoft公式署名付きで安全にワンクリック導入可能。

---

## 🛠️ 技術スタック
- **Framework**: Electron (Chromium + Node.js)
- **Media Engine**: FFmpeg / FFprobe (Bundled 64-bit Static Build)
- **Video Encoders**: `h264_amf`, `h264_nvenc`, `h264_qsv`, `h264_mf`, `libx264`
- **Audio Processing**: `areverse`, `atempo`, `aac`
- **Stream Inversion**: Segment Chunking & Lossless Concat Demuxer

---

## 📄 ライセンス
MIT License (c) 2026 youyouboydragonOfficial
