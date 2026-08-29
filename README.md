# Masterbay — Master Your Video Before the Platform Crushes It

> Professional video mastering for content creators who refuse to let platforms destroy their footage.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE.txt)
[![Platform](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)
[![Price](https://img.shields.io/badge/Price-$29-green.svg)](https://gumroad.com)

## What It Does

Every platform re-encodes your videos. Masterbay gives them a clean, high-bitrate file that matches their encoder expectations.

**Drop in any video → Get detailed analysis → Choose target → Adjust settings → Download mastered file.**

### Before / After

| Metric | Before | After |
|--------|--------|-------|
| Score | 27/100 (Poor) | 93/100 (Excellent) |
| Resolution | 576×1024 | 1080×1920 |
| Bitrate | 4.3 Mbps | 35.8 Mbps |
| Blocking issues | 3 | 0 |
| Loudness | -64.87 LUFS | -13.96 LUFS |
| Color tags | Untagged | bt709 |

## Key Features

### Core Mastering
- 20+ platform presets (TikTok, Instagram, YouTube, Twitch, etc.)
- Up to 16K resolution support
- H.264, H.265/HEVC, ProRes codecs
- Real-time progress tracking
- Before/after comparison

### Advanced Filters (Free)
- **Advanced Denoise** — Vague Denoiser algorithm
- **Color Balance** — Professional color grading
- **Vibrance** — Intelligent color enhancement
- **Video Stabilization** — Reduce camera shake
- **Watermark Removal** — Remove logos/watermarks
- **Auto-Trim Silence** — Remove silent parts
- **Scene Detection** — Split at scene changes

### Professional Tools
- **Batch Processing** — Process multiple videos
- **Side-by-Side Comparison** — Drag to compare before/after
- **Project History** — Save and reuse settings
- **Theme Toggle** — Dark/Light/Midnight/Forest themes
- **Subtitle Burn-in** — Embed subtitles into video
- **Thumbnail Generator** — Extract/generate thumbnails

### Protection & Licensing
- **License System** — Tied to hardware fingerprint
- **Anti-Tamper** — Integrity checks and DevTools detection
- **Domain Verification** — doteta.com integration
- **Offline Fallback** — Works without internet

## Quick Start

### Option 1: Direct Launch (Recommended)
1. Extract `masterbay.zip`
2. Double-click `start-masterbay.bat`
3. Browser opens automatically

### Option 2: Manual
```bash
npm install
npm start
# Open http://127.0.0.1:4173
```

## System Requirements

- Windows 10/11 (64-bit)
- Node.js 18+ (free from nodejs.org)
- 8GB RAM minimum, 16GB recommended for 4K
- 2GB free disk space

## Purchase

- **Price**: $29 USD
- **Platform**: Gumroad / Payhip
- **License**: Personal (1 device, 1 year)
- **Updates**: Lifetime included

### What You Get
- `masterbay.zip` (173 MB) with FFmpeg bundled
- Lifetime updates
- Email support
- Access to community

## License Activation

1. Run `start-masterbay.bat`
2. Enter your license key (format: MB-XXXXX-XXXXX)
3. Enter your email
4. Click "Activate"

License is tied to your device via hardware fingerprint.

## Development

### Project Structure
```
masterbay/
├── server.js          # Entry point
├── src/
│   ├── api.js         # HTTP API
│   ├── chain.js       # FFmpeg filter chain
│   ├── presets.js     # Platform presets
│   ├── enhance.js     # Filter definitions
│   ├── license.js     # License system
│   ├── anti-tamper.js # Integrity checks
│   ├── batch.js       # Batch processing
│   ├── compare.js     # Side-by-side comparison
│   ├── projects.js    # Project history
│   ├── theme.js       # Theme management
│   └── ...
├── public/
│   ├── app.js         # Frontend logic
│   ├── app-extensions.js # Additional features
│   ├── index.html     # UI
│   ├── styles.css     # Styling
│   └── license.html   # License activation page
├── electron/          # Electron packaging (in development)
├── docs/              # Documentation
├── scripts/           # Build and test scripts
└── start-masterbay.bat # Windows launcher
```

### Scripts
```bash
npm start          # Start server
npm run dev        # Start with auto-reload
npm run check      # UI validation
npm run e2e        # End-to-end tests
npm run doctor     # System check
```

## Documentation

- [Development Roadmap](docs/DEVELOPMENT_ROADMAP.md)
- [Intellectual Property Protection](docs/INTELLECTUAL_PROPERTY.md)
- [Protection & Security](PROTECTION.md)
- [Gumroad Listing](GUMROAD_LISTING_FINAL.md)
- [Payhip Listing](PAYHIP_LISTING_FINAL.md)

## Roadmap

### Phase 1 (Now) ✅
- Core mastering features
- Advanced filters
- Batch processing
- License system
- UI enhancements

### Phase 2 (Month 1)
- AI upscaler (Real-ESRGAN)
- Smart crop/face detection
- Subtitle burn-in
- Thumbnail generator

### Phase 3 (Month 2)
- GPU acceleration (NVENC/AMD/Intel)
- Cloud processing
- Whisper transcription

### Phase 4 (Month 3+)
- Team workspaces
- API access
- Marketplace
- Enterprise features

## Contributing

This is a commercial product. Contributions are welcome but require a contributor license agreement.

## Support

- **Email**: support@doteta.com
- **Discord**: [Join community](https://discord.gg/masterbay)
- **Documentation**: https://doteta.com/docs

## Legal

- [License Agreement](LICENSE.txt)
- [Privacy Policy](https://doteta.com/privacy)
- [Terms of Service](https://doteta.com/terms)

## Acknowledgments

- [FFmpeg](https://ffmpeg.org/) — Video processing engine
- [Electron](https://www.electronjs.org/) — Desktop app framework
- [Readex Pro](https://fonts.google.com/specimen/Readex+Pro) — Typography
- [IBM Plex](https://fonts.google.com/specimen/IBM+Plex) — Typography

---

**Masterbay** — Because the platform will compress your video again. Prepare it to survive that.

© 2025 Masterbay. All rights reserved.
