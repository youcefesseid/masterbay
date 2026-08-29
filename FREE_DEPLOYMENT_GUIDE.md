# Masterbay - Free Tier Deployment Guide

## 🎯 Zero-Cost Stack Summary

| Component | Service | Free Tier Limits |
|-----------|---------|------------------|
| License API | Cloudflare Workers | 100,000 req/day |
| License Storage | Cloudflare KV | 1 GB, 1M ops/day |
| Docs/Landing | Cloudflare Pages | Unlimited sites |
| CI/CD | GitHub Actions | 2,000 min/mo (public) |
| Distribution | GitHub Releases | Unlimited |
| Code Signing | None (portable + reputation) | N/A |
| AI Upscale | Real-ESRGAN (local) | Free, open source |
| Subtitles | faster-whisper (local) | Free, open source |

---

## 🚀 Quick Start

### 1. Cloudflare Worker Deployment

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Create KV namespace
wrangler kv:namespace create "LICENSE_KV"
wrangler kv:namespace create "LICENSE_KV" --preview

# Update wrangler.toml with the IDs, then deploy
cd src
wrangler deploy --env production
```

### 2. Generate License Keys

```bash
# Generate a pro license for 1 year
node scripts/generate-license.js user@example.com 365 encode presets batch ai gpu cli api pro

# Output: license key + HMAC signature
```

### 3. Build & Release

```bash
# Full build with integrity
npm run dist

# Creates in dist/:
# - Masterbay-Setup-v1.0.0.exe (NSIS installer with auto-update)
# - Masterbay-Portable-v1.0.0.exe (portable, no admin)
# - SHA256SUMS.txt (checksums)
```

### 4. GitHub Release

```bash
# Tag and push
git tag v1.0.0
git push origin v1.0.0

# GitHub Actions will:
# 1. Build both installers
# 2. Generate checksums
# 3. Create GitHub Release with artifacts
# 4. Deploy Worker to Cloudflare
# 5. Deploy docs to Cloudflare Pages
```

---

## 🔐 License System Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Masterbay App │────▶│ Cloudflare Worker │────▶│ Cloudflare KV   │
│  (Electron)     │  HTTPS             │  (Storage)      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                       │                        │
        │ 1. Verify key         │ 2. Check KV            │ 3. Return status
        │ 2. Check signature    │ 3. Validate expiry     │
        │ 3. Check features     │ 4. Check HW bind       │
        ▼                       ▼                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Fallback (Offline)                     │
│  - Cached license with HW fingerprint                           │
│  - Grace period: 7 days offline                                 │
│  - Anti-tamper: build-time hash manifest                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🛡️ Anti-Piracy Measures (All Free)

| Layer | Implementation | Bypass Difficulty |
|-------|----------------|-------------------|
| License validation | HMAC-SHA256 + Cloudflare Worker | High (server-side) |
| Code obfuscation | javascript-obfuscator (control flow, dead code) | Medium |
| Anti-tamper | Build-time hash manifest + runtime check | Medium |
| DevTools detection | Debugger timing + devtools:// protocol check | Low-Medium |
| Hardware binding | CPU + MB + Disk serials (optional) | Medium |
| Integrity API | Server-served manifest hash | High (requires MITM) |

---

## ⚡ Performance Features

### Parallel Segment Encoding
- Splits video at scene changes
- Encodes 2-4 segments concurrently
- 2-4× speedup on multi-core CPUs
- Automatic concat with seamless transitions

### VMAF Quality Control
- Built-in VMAF/PSNR/SSIM measurement
- Per-segment and aggregate scores
- JSON output for CI/CD gates
- Before/after comparison UI

### AI Enhancement (Optional)
- **Real-ESRGAN**: 2×/4× upscaling (Vulkan GPU)
- **faster-whisper**: Auto subtitles (CPU/GPU)
- Sidecar binaries — zero runtime cost if not used
- One-click enable in enhance panel

---

## 📦 Distribution Strategy

### Portable First
- Portable `.exe` requires **no admin**, no installation
- Runs from USB, network share, any folder
- Bypasses SmartScreen faster than signed installers
- Primary distribution method

### NSIS Installer (Optional)
- For users who want Start Menu/desktop shortcuts
- Auto-update via electron-updater (GitHub Releases)
- Still unsigned — relies on GitHub reputation

### Auto-Update
```javascript
// In electron/main.js
autoUpdater.setFeedURL({
  provider: 'github',
  owner: 'YOUR_GITHUB_USER',
  repo: 'masterbay',
});
```

---

## 📈 Free Marketing Checklist

- [ ] GitHub repo public + topics: `video-processing`, `ffmpeg`, `tiktok`, `reels`, `shorts`
- [ ] README with GIFs showing before/after, platform presets
- [ ] YouTube Shorts: "How I master TikTok videos in 30 seconds"
- [ ] Reddit: r/VideoEditing, r/TikTok, r/YouTubers, r/SideProject
- [ ] Product Hunt launch (free)
- [ ] Twitter/X thread with demo video
- [ ] Discord community for creators
- [ ] SEO: "free video mastering software", "TikTok video optimizer"

---

## 🔧 Environment Variables (Production)

```bash
# Cloudflare Worker (set in dashboard)
LICENSE_SECRET=your-64-char-hex-secret
# KV namespace IDs auto-bound via wrangler.toml

# Electron build (GitHub Actions secrets)
GH_TOKEN=github_pat_xxx
CLOUDFLARE_API_TOKEN=xxx
CLOUDFLARE_ACCOUNT_ID=xxx
```

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| Worker returns 401 | Check `LICENSE_SECRET` matches generation script |
| KV read fails | Verify KV namespace IDs in `wrangler.toml` |
| Portable exe flagged | Submit to Microsoft SmartScreen (free, 24-48h) |
| FFmpeg not found | Ensure `bin/ffmpeg.exe` copied to app root at build |
| License offline fail | Check grace period (7 days), HW fingerprint match |

---

## 📝 Next Steps

1. **Deploy Worker** → Get `license.YOUR_DOMAIN.workers.dev` URL
2. **Update `src/license.js`** with your Worker URL
3. **Generate first license key** → Test end-to-end
4. **Run `npm run dist`** → Verify builds
5. **Push tag** → Watch GitHub Actions deploy everything
6. **Share portable exe** → Get first users

---

**Total monthly cost: $0**  
**All tools: Open source or free tier**  
**Single-person maintainable: Yes**