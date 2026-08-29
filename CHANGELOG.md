# Changelog

All notable changes to Masterbay will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Cloudflare Worker License System**: Real license validation via Cloudflare Workers + KV (100K req/day free)
- **Offline Key Generator**: `scripts/generate-license.js` — HMAC-SHA256 signed keys, feature flags, hardware binding
- **Build-Time Integrity Manifest**: `scripts/build.js --integrity` — SHA256 hashes of all source files, signed manifest
- **Anti-Tamper Hardening**: Runtime hash verification against server manifest, DevTools detection, debugger timing
- **Code Obfuscation**: `javascript-obfuscator` on `public/app.js` and `src/license.js` during build
- **Parallel Segment Encoding**: Scene-based splitting, concurrent FFmpeg workers, 2-4× speedup on multi-core
- **VMAF Quality Control**: Built-in VMAF/PSNR/SSIM measurement with JSON output and UI comparison
- **Wipe Comparison Slider**: Interactive before/after video comparison in preview panel
- **Live Filter Preview**: Real-time parameter adjustment with debounced FFmpeg filter graph
- **AI Upscale (Optional)**: Real-ESRGAN ncnn-vulkan sidecar for 2×/4× upscaling
- **Auto Subtitles (Optional)**: faster-whisper integration for speech-to-text (SRT/VTT)
- **GitHub Actions CI/CD**: Automated build, release, Worker deploy, Pages deploy on tag push
- **Portable Distribution**: No-admin `.exe` as primary artifact, NSIS installer as secondary
- **Auto-Update**: electron-updater via GitHub Releases (free)
- **Bilingual UI (AR/EN)**: Full RTL support, dynamic language toggle

### Changed
- **License Endpoint**: Moved from `doteta.com` (placeholder) to Cloudflare Worker on your domain
- **Main Entry**: Fixed `package.json` main → `electron/main.js` (was `electron/main-cjs.js`)
- **FFmpeg Location**: Root `bin/` folder now standard, copied from `electron/bin/` at build
- **Anti-Tamper**: Replaced localStorage hash with build-time manifest + server verification
- **Preset System**: Added honest capability notes (no HDR tone-mapping without source metadata)

### Fixed
- **Electron Dev Startup**: `npm run electron:dev` now works (main entry corrected)
- **start-masterbay.bat**: Points to correct `bin/ffmpeg.exe` path
- **Duplicate Folder**: Removed `masterbay/masterbay/` nested duplicate
- **Server Integrity Endpoint**: Added `/api/integrity` serving signed manifest

### Security
- All license validation now server-side (Worker) with HMAC verification
- Hardware fingerprinting optional but supported for high-value licenses
- 7-day offline grace period with cached license
- Debugger/DevTools detection with graceful degradation (warn, don't crash)

## [0.9.0] - 2024-12-15

### Added
- Platform presets: TikTok 1080/4K, Reels 1080/4K, Shorts 1080/4K, YouTube 1080/4K
- Two-pass loudness normalization (-14 LUFS EBU R128)
- BT.709 color space enforcement
- Fast-start MP4 (moov atom at head)
- CFR (constant frame rate) output
- Chunked resumable upload with progress
- Real-time encoding progress with ETA
- Hardware encoder detection (NVENC, QSV, AMF, VAAPI)
- Capability probe (`/api/capabilities`)

### Changed
- Refactored filter chain to `src/chain.js` with modular, testable filters
- Pipeline worker in `src/pipeline.js` with measure → encode → verify flow
- E2E tests in `scripts/e2e.js` (sanitization, bt709, faststart, CFR, LUFS, cancel cleanup)

### Fixed
- Filter chain injection sanitization (malicious `fit` param now escaped)
- Cancel button properly kills FFmpeg and cleans temp files

## [0.5.0] - 2024-10-01

### Added
- Initial Electron + Node.js server architecture
- File dropzone with chunked upload
- Media probe via ffprobe (JSON)
- Basic encoding with platform presets
- Download via signed URLs

---

## Migration Guide

### From 0.9.x to 1.0.0

1. **Deploy Cloudflare Worker** (see `DEPLOY_WORKER.md`)
2. **Update `src/license.js`** with your Worker URL
3. **Run `npm run build:integrity`** to generate manifest
4. **Generate license keys** with `scripts/generate-license.js`
5. **Test offline/online validation** in app

### Breaking Changes
- License format changed: now includes `features` array and `signature`
- `src/license.js` API: `saveLicense()` now accepts `features` parameter
- Worker endpoint: `POST /verify` with `{key, email, hw_fingerprint, app_version}`

---

## License Keys

| Tier | Features | Duration | Use Case |
|------|----------|----------|----------|
| Trial | encode, presets | 7 days | Evaluation |
| Basic | encode, presets, batch | 1 year | Single creator |
| Pro | encode, presets, batch, ai, gpu, cli | 1 year | Power user |
| Studio | encode, presets, batch, ai, gpu, cli, api | 1 year | Team/automation |

Generate with:
```bash
node scripts/generate-license.js email@example.com 365 encode presets batch ai gpu cli api pro
```