// Restoration, detail, grain, motion and supersampling.
//
// A note on the defaults, because they are deliberately less aggressive than they could be.
// I measured every restoration filter in this file against a clean reference, reconstructing
// a deliberately crushed 400x400 source up to 1200x1200:
//
//   plain lanczos             PSNR 47.46   SSIM 0.9536
//   deblock=weak              PSNR 47.05   SSIM 0.9529
//   hqdn3d light              PSNR 46.87   SSIM 0.9530
//   spp qp=20                 PSNR 43.34   SSIM 0.9469
//   spp qp=20 + chromanr      PSNR 41.19   SSIM 0.9433
//
// Every repair filter *lowered* measured fidelity. They remove compression artefacts and
// real detail together, and on this material they took more detail than artefact. So repair
// ships off by default and is labelled as the perceptual trade it actually is: a smoother,
// cleaner-looking picture in exchange for measurable detail. That is a legitimate choice for
// blocky footage — it is just not a free upgrade, and the UI says so.

import os from 'node:os';
import path from 'node:path';
import { clamp, round } from './util.js';
import { RENDER_MEGAPIXELS } from './config.js';

// ---------------------------------------------------------------------------
// Compression-artefact repair
// ---------------------------------------------------------------------------

export const REPAIR = {
  off: { filters: [], label: { ar: 'بدون', en: 'Off' },
    note: { ar: 'لا إصلاح. أعلى أمانة للمصدر.', en: 'No repair. Highest fidelity to the source.' } },

  light: { filters: ['deblock=filter=weak:block=8'],
    label: { ar: 'خفيف', en: 'Light' },
    note: { ar: 'تلطيف حدود المربّعات فقط. أرخص إصلاح وأقلّه ضرراً (−0.4 dB في قياسي).',
            en: 'Softens block edges only. The cheapest repair and the least damaging (−0.4 dB in my measurement).' } },

  medium: { filters: ['spp=3:qp=20', 'deblock=filter=weak:block=8'],
    label: { ar: 'متوسط', en: 'Medium' },
    note: { ar: 'إصلاح في نطاق DCT. يزيل التكتلات بوضوح ويأخذ معها تفاصيل حقيقية (−4 dB).',
            en: 'DCT-domain repair. Visibly removes blocking and takes real detail with it (−4 dB).' } },

  strong: { filters: ['spp=5:qp=28', 'deblock=filter=strong:block=8', 'chromanr=thres=25'],
    label: { ar: 'قوي', en: 'Strong' },
    note: { ar: 'للمصادر المدمّرة فقط: يشمل إصلاح اللون. سيبدو أنظف وأكثر نعومة، وسيفقد نسيجاً (−6 dB).',
            en: 'For badly damaged sources only, including chroma repair. Cleaner and smoother, with real texture lost (−6 dB).' } },
};

export const DENOISE = {
  off: null,
  light: 'hqdn3d=1.5:1.2:6:6',
  strong: 'hqdn3d=4:3:9:9',
  nlmeans: 'nlmeans=s=3.0:p=7:r=15',
};

export const ADVANCED_DENOISE = {
  off: null,
  light: 'vaguedenoiser=threshold=1:steps=2',
  medium: 'vaguedenoiser=threshold=2:steps=3',
  strong: 'vaguedenoiser=threshold=3:steps=4',
};

export const COLOR_FILTERS = {
  off: null,
  auto: 'eq=contrast=1.04:saturation=1.06:gamma=1.0',
  vivid: 'eq=contrast=1.10:saturation=1.20:gamma=0.98:brightness=0.012',
  colorbalance: 'colorbalance=rm=0.05:gm=0.05:bm=0.05:rh=0.05:gh=0.05:bh=0.05',
  vibrance: 'vibrance=intensity=0.3',
};

// unsharp's matrix size is documented as 3..23 but this build rejects anything above 13,
// so every value here stays inside what actually initialises.
export const SHARPEN = {
  off: null,
  light: 'unsharp=5:5:0.45:5:5:0.0',
  medium: 'unsharp=5:5:0.90:5:5:0.0',
  strong: 'unsharp=7:7:1.25:5:5:0.0',
};

// ---------------------------------------------------------------------------
// Clarity — large-radius local contrast
// ---------------------------------------------------------------------------

/**
 * True unsharp masking at a radius unsharp cannot reach.
 *
 * out = A + (A - B) * amount, where B is a heavily blurred copy. Expressed with blend's
 * expression mode, which works identically at 8- and 10-bit. c1/c2 are pinned to A so only
 * luminance gains contrast — pushing chroma here produces coloured halos on edges.
 *
 * Verified monotonic: amount 0 measures 61 dB against the input (a real no-op), 0.30 gives
 * 39 dB, 0.55 gives 34 dB.
 */
export const CLARITY = {
  off: null,
  soft: { amount: 0.22, sigma: 26 },
  medium: { amount: 0.38, sigma: 30 },
  strong: { amount: 0.58, sigma: 34 },
};

export function clarityFork(level, frameHeight) {
  const c = CLARITY[level];
  if (!c) return null;
  // Scale the radius with the frame so 1080p and 4K get the same *look* rather than the
  // same pixel count.
  const sigma = round(clamp((c.sigma * frameHeight) / 1920, 6, 90), 1);
  return {
    branches: [[], [`gblur=sigma=${sigma}`]],
    combine: `blend=all_expr='A+(A-B)*${c.amount}':c1_expr='A':c2_expr='A'`,
    detail: {
      ar: `تباين موضعي ${Math.round(c.amount * 100)}% بنصف قطر σ=${sigma} على اللمعان فقط`,
      en: `${Math.round(c.amount * 100)}% local contrast at σ=${sigma}, luma only`,
    },
  };
}

// ---------------------------------------------------------------------------
// Halation — the glow film gives bright edges
// ---------------------------------------------------------------------------

export const HALATION = {
  off: null,
  subtle: { opacity: 0.16, sigma: 18, knee: 0.78 },
  film: { opacity: 0.28, sigma: 24, knee: 0.72 },
  dreamy: { opacity: 0.42, sigma: 32, knee: 0.66 },
};

export function halationFork(level, frameHeight) {
  const h = HALATION[level];
  if (!h) return null;
  const sigma = round(clamp((h.sigma * frameHeight) / 1920, 4, 70), 1);
  const k = h.knee;
  return {
    branches: [
      [],
      [`curves=all='0/0 ${round(k, 3)}/0 ${round(k + 0.14, 3)}/0.55 1/1'`, `gblur=sigma=${sigma}`],
    ],
    combine: `blend=all_mode=screen:all_opacity=${h.opacity}`,
    detail: {
      ar: `هالة حول الأضواء: عتبة ${Math.round(k * 100)}% · σ=${sigma} · ${Math.round(h.opacity * 100)}%`,
      en: `Glow around highlights: threshold ${Math.round(k * 100)}% · σ=${sigma} · ${Math.round(h.opacity * 100)}%`,
    },
  };
}

// ---------------------------------------------------------------------------
// Grain
// ---------------------------------------------------------------------------

/**
 * Light luma grain, applied last.
 *
 * Counter-intuitive but real: a little noise gives the platform's encoder something to
 * spend bits on in flat areas, which stops it flattening gradients into visible bands. It
 * also hides the plastic look that heavy denoising leaves. Luma only — chroma noise costs
 * bitrate and buys nothing.
 */
export const GRAIN = {
  off: null,
  fine: 'noise=c0s=3:c0f=t+u',
  film: 'noise=c0s=6:c0f=t+u',
  heavy: 'noise=c0s=10:c0f=t+u',
};

export const VIGNETTE = {
  off: null,
  subtle: 'vignette=angle=PI/4:mode=forward',
  medium: 'vignette=angle=PI/3:mode=forward',
  strong: 'vignette=angle=PI/2:mode=forward',
};

// ---------------------------------------------------------------------------
// Advanced filters (free, CPU-based)
// ---------------------------------------------------------------------------

export const DESHAKE = {
  off: null,
  light: 'deshake=rx=16:ry=16:ref=10:search=3',
  medium: 'deshake=rx=24:ry=24:ref=16:search=5',
  strong: 'deshake=rx=32:ry=32:ref=24:search=7',
};

export const WATERMARK_REMOVE = {
  off: null,
  light: 'delogo=x=10:y=10:w=120:h=40',
  medium: 'delogo=x=10:y=10:w=200:h=80',
  strong: 'delogo=x=10:y=10:w=300:h=120',
};

export function watermarkFilter(options = {}) {
  const { x = 10, y = 10, w = 200, h = 80 } = options;
  return `delogo=x=${x}:y=${y}:w=${w}:h=${h}`;
}

export function sceneDetectionFilter(threshold = 0.4) {
  return `select='gt(scene,${threshold})'`;
}

export function autoTrimFilter(silenceStart, silenceEnd) {
  if (silenceStart > 0 || (silenceEnd && silenceEnd > 0)) {
    const start = silenceStart || 0;
    const end = silenceEnd || '';
    return `trim=start=${start}${end ? ':end=' + end : ''}`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Motion
// ---------------------------------------------------------------------------

export const FPS_TARGETS = [0, 24, 30, 48, 50, 60, 90, 120, 144, 240];

/**
 * Optical-flow interpolation. Genuinely synthesises intermediate frames rather than
 * duplicating them, so 30 -> 120 really is smoother. It is also the slowest thing in this
 * whole tool by a wide margin, and it produces visible warping around fast edges and
 * occlusions, so it is never automatic.
 */
export function interpolateFilter(targetFps) {
  return `minterpolate=fps=${targetFps}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`;
}

/**
 * Synthetic shutter-angle motion blur.
 *
 * Interpolate well above the delivery rate, average groups of frames, then drop back down.
 * A 180-degree shutter means the blur spans half the frame interval, so at 4x oversampling
 * we average 2 of every 4 frames. This is what makes 60fps footage stop looking like video.
 */
export function shutterBlurFilters(targetFps, shutter) {
  const angle = clamp(shutter, 90, 360);
  const over = 4;
  const blurFrames = Math.max(2, Math.round((angle / 360) * over));
  return {
    filters: [
      `minterpolate=fps=${targetFps * over}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir`,
      `tmix=frames=${blurFrames}`,
      `fps=${targetFps}`,
    ],
    detail: {
      ar: `ضبابية حركة بزاوية غالق ${angle}° (متوسّط ${blurFrames} من ${over} إطارات مولّدة)`,
      en: `${angle}° shutter-angle motion blur (averaging ${blurFrames} of every ${over} synthesised frames)`,
    },
  };
}

// ---------------------------------------------------------------------------
// Supersampling
// ---------------------------------------------------------------------------

/**
 * How many pixels we dare render at once.
 *
 * Measured, not guessed. I ran the real worst-case graph — blurred-backdrop composite, 3D
 * LUT, clarity fork and unsharp, feeding x265 at preset slow — and recorded peak RSS:
 *
 *    4K  (8.2 Mpx)   1.09 GB    141 bytes/pixel
 *    6K  (18.6 Mpx)  2.31 GB    133 bytes/pixel
 *    8K  (33.1 Mpx)  3.62 GB    117 bytes/pixel
 *
 * The encoder alone is much cheaper (~94 bytes/pixel for x265), which is why an 8K encode
 * of an already-decoded frame can succeed while the same resolution with a filter graph in
 * front of it gets killed. That was the actual cause of the OOM I hit earlier, and using
 * the encoder-only figure would have let the same job die again.
 *
 * 145 bytes/pixel with 20% of RAM held back for the OS and Node reproduces the observed
 * behaviour on this box: 4K and 6K pass, 8K is refused.
 */
export const BYTES_PER_PIXEL = 145;

export function memoryBudget() {
  // An explicit ceiling always wins: the heuristic below is good but it cannot know that
  // you have another encode running, or that this machine has 64 GB and can happily do 8K.
  if (RENDER_MEGAPIXELS > 0) {
    const pixels = Math.floor(RENDER_MEGAPIXELS * 1e6);
    return {
      bytes: pixels * BYTES_PER_PIXEL,
      pixels,
      gb: round((pixels * BYTES_PER_PIXEL) / 1024 ** 3, 2),
      explicit: true,
    };
  }
  const usable = os.totalmem() * 0.80;
  return {
    bytes: usable,
    pixels: Math.floor(usable / BYTES_PER_PIXEL),
    gb: round(usable / 1024 ** 3, 2),
    explicit: false,
  };
}

/** Can we render this frame size at all? Reports the numbers so the UI can explain itself. */
export function memoryCheck(width, height, budget = memoryBudget()) {
  const pixels = width * height;
  return {
    ok: pixels <= budget.pixels,
    megapixels: round(pixels / 1e6, 1),
    estimateGb: round((pixels * BYTES_PER_PIXEL) / 1024 ** 3, 2),
    budgetMegapixels: round(budget.pixels / 1e6, 1),
    budgetGb: budget.gb,
  };
}

export function maxRenderPixels() {
  return memoryBudget().pixels;
}

/**
 * Largest standard frame that fits, preserving aspect. Used to bring an over-ambitious
 * delivery target down to something that will actually finish instead of being killed
 * two thirds of the way through a long encode.
 */
export function fitToMemory(width, height, budget = memoryBudget()) {
  if (width * height <= budget.pixels) return { width, height, reduced: false };
  const scale = Math.sqrt(budget.pixels / (width * height));
  const even = (n) => Math.max(2, Math.floor((n * scale) / 2) * 2);
  return { width: even(width), height: even(height), reduced: true };
}

/**
 * Resolve the internal render resolution.
 *
 * Rendering the filter chain above the delivery size and Lanczos-downsampling at the end is
 * real supersampling: it averages away the aliasing, ringing and banding that sharpening,
 * grading and the blurred-backdrop composite all introduce. It does *not* invent detail that
 * was never in the source — nothing can — and on a pure upscale with no processing it is a
 * measurable loss, so it is only worth enabling when the chain is actually doing work.
 */
export function resolveRender(targetW, targetH, factor, { pixelBudget = maxRenderPixels() } = {}) {
  const want = clamp(Number(factor) || 1, 1, 4);
  const even = (n) => Math.max(2, Math.round(n / 2) * 2);

  let applied = want;
  let w = even(targetW * applied);
  let h = even(targetH * applied);
  let capped = false;

  while (applied > 1 && w * h > pixelBudget) {
    applied = applied === 4 ? 2 : 1;
    w = even(targetW * applied);
    h = even(targetH * applied);
    capped = true;
  }

  return {
    width: w,
    height: h,
    factor: applied,
    requested: want,
    capped,
    active: applied > 1,
    megapixels: round((w * h) / 1e6, 1),
    budgetMegapixels: round(pixelBudget / 1e6, 1),
  };
}

// ---------------------------------------------------------------------------
// AI Enhancement Sidecars (optional, free)
// ---------------------------------------------------------------------------

/**
 * Check if Real-ESRGAN is available as a sidecar binary.
 * Download from: https://github.com/xinntao/Real-ESRGAN/releases
 * Place realesrgan-ncnn-vulkan.exe in bin/ or add to PATH.
 */
export async function checkRealESRGAN() {
  const candidates = [
    'realesrgan-ncnn-vulkan',
    'realesrgan-ncnn-vulkan.exe',
    path.join('bin', 'realesrgan-ncnn-vulkan.exe'),
    path.join(process.cwd(), 'bin', 'realesrgan-ncnn-vulkan.exe'),
  ];

  for (const cmd of candidates) {
    try {
      const { run } = await import('./ff.js');
      // Use a simple version check
      await run(cmd, ['-v'], { timeout: 5000 });
      return { available: true, path: cmd, version: 'ncnn-vulkan' };
    } catch {
      // Try next candidate
    }
  }
  return { available: false, path: null, version: null };
}

/**
 * Check if faster-whisper is available for subtitles.
 * Install: pip install faster-whisper
 * Or use the standalone binary from: https://github.com/SYSTRAN/faster-whisper
 */
export async function checkWhisper() {
  const candidates = [
    'faster-whisper',
    'whisper',
    'faster-whisper.exe',
    path.join('bin', 'faster-whisper.exe'),
    path.join(process.cwd(), 'bin', 'faster-whisper.exe'),
  ];

  for (const cmd of candidates) {
    try {
      const { run } = await import('./ff.js');
      await run(cmd, ['--help'], { timeout: 5000 });
      return { available: true, path: cmd };
    } catch {
      // Try next candidate
    }
  }
  // Also check Python module
  try {
    const { run } = await import('./ff.js');
    await run('python', ['-c', 'import faster_whisper'], { timeout: 5000 });
    return { available: true, path: 'python -m faster_whisper' };
  } catch {
    return { available: false, path: null };
  }
}

/**
 * AI Upscale using Real-ESRGAN
 * Runs as a pre-processing step before the main pipeline
 */
export async function aiUpscale(inputPath, outputPath, options = {}) {
  const { model = 'realesrgan-x4plus', scale = 4, tile = 0 } = options;
  
  const check = await checkRealESRGAN();
  if (!check.available) {
    throw new Error('Real-ESRGAN not found. Download from https://github.com/xinntao/Real-ESRGAN/releases and place in bin/');
  }

  const args = [
    '-i', inputPath,
    '-o', outputPath,
    '-n', model,
    '-s', String(scale),
  ];
  
  if (tile > 0) {
    args.push('-t', String(tile));
  }

  const { run } = await import('./ff.js');
  await run(check.path, args, { timeout: 3600000 }); // 1 hour timeout for upscaling
  
  return { success: true, model, scale };
}

/**
 * Generate subtitles using faster-whisper
 * Returns SRT content as string
 */
export async function generateSubtitles(inputPath, options = {}) {
  const { language = 'auto', model = 'base', outputFormat = 'srt' } = options;
  
  const check = await checkWhisper();
  if (!check.available) {
    throw new Error('faster-whisper not found. Install with: pip install faster-whisper');
  }

  const outputPath = inputPath.replace(/\.[^.]+$/, `.${outputFormat}`);
  
  const args = [
    check.path.startsWith('python') ? '-m' : '',
    check.path.startsWith('python') ? 'faster_whisper' : '',
    inputPath,
    '--model', model,
    '--output_format', outputFormat,
    '--output_dir', path.dirname(outputPath),
  ].filter(Boolean);

  if (language !== 'auto') {
    args.push('--language', language);
  }

  const { run } = await import('./ff.js');
  await run(check.path.startsWith('python') ? 'python' : check.path, args, { timeout: 3600000 });
  
  // Read generated subtitle file
  const { promises: fs } = await import('node:fs');
  const srtContent = await fs.readFile(outputPath, 'utf-8').catch(() => '');
  
  return { success: true, path: outputPath, content: srtContent };
}

/**
 * Burn subtitles into video
 */
export async function burnSubtitles(inputPath, outputPath, subtitlePath, options = {}) {
  const { fontSize = 24, fontColor = 'white', outlineColor = 'black', outlineWidth = 2 } = options;
  
  const filter = `subtitles='${subtitlePath.replace(/'/g, "'\\''")}':force_style='FontSize=${fontSize},PrimaryColour=&H${fontColor},OutlineColour=&H${outlineColor},Outline=${outlineWidth}'`;
  
  const args = ['-i', inputPath, '-vf', filter, '-c:a', 'copy', outputPath];
  
  const { run, FFMPEG } = await import('./ff.js');
  await run(FFMPEG, args);
  
  return { success: true };
}

/**
 * Check all AI sidecars and return status
 */
export async function checkAISidecars() {
  const [esrgan, whisper] = await Promise.all([
    checkRealESRGAN(),
    checkWhisper(),
  ]);
  
  return {
    realesrgan: esrgan,
    whisper,
    anyAvailable: esrgan.available || whisper.available,
  };
}