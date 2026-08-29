// Builds the FFmpeg filter graph and encoder arguments for one job.
//
// The order below is not arbitrary and not interchangeable:
//
//   intake -> repair -> clean -> reframe -> detail -> look -> downsample
//          -> motion -> grain -> HDR -> encode
//
//   * Repair and denoise come first, before anything magnifies what they would have
//     removed.
//   * Detail and grading happen at the *render* resolution, which may be larger than the
//     delivery resolution. Sharpening the final pixels is the usual advice and it is right
//     when there is no supersampling; when there is, doing it before the downsample is what
//     makes the downsample worth anything.
//   * Motion comes after the downsample because optical-flow interpolation is the single
//     most expensive thing here and its cost scales with frame area.
//   * Grain is added after the framerate is locked, so it is per-delivered-frame, and before
//     the HDR transfer, so its amplitude is set in a space we can reason about.
//   * HDR is last because everything upstream assumes ordinary gamma-encoded values.
//
// Every decision that had to be compromised — memory, codec levels, missing filters —
// records a note, and those notes are shown to the user rather than swallowed.

import { QUALITY_TUNING } from './presets.js';
import { clamp, round, isNum } from './util.js';
import { ENCODE_THREADS } from './config.js';
import { GraphBuilder } from './graph.js';
import { ensureLut, escapeFilterPath, LOOKS_BY_ID } from './looks.js';
import { hdrFilters, hdrOutputTags, hdrX265Params, hdrRequirements } from './hdr.js';
import { conformance } from './levels.js';
import {
  REPAIR, DENOISE, ADVANCED_DENOISE, COLOR_FILTERS, SHARPEN, GRAIN, VIGNETTE,
  DESHAKE, WATERMARK_REMOVE,
  clarityFork, halationFork, resolveRender, memoryCheck, fitToMemory,
  interpolateFilter, shutterBlurFilters,
} from './enhance.js';

const COLOR = {
  off: null,
  auto: 'eq=contrast=1.04:saturation=1.06:gamma=1.0',
  vivid: 'eq=contrast=1.10:saturation=1.20:gamma=0.98:brightness=0.012',
  colorbalance: 'colorbalance=rm=0.05:gm=0.05:bm=0.05:rh=0.05:gh=0.05:bh=0.05',
  vibrance: 'vibrance=intensity=0.3',
};

// Tone-mapping an HDR *source* down to SDR. Unrelated to HDR output: this is the path for
// footage that arrives as HLG/PQ and has to become Rec.709.
const TONEMAP =
  'zscale=transfer=linear:npl=100,format=gbrpf32le,zscale=primaries=bt709,' +
  'tonemap=tonemap=hable:desat=0,zscale=transfer=bt709:matrix=bt709:range=tv';

const SCALE_FLAGS = 'flags=lanczos+accurate_rnd+full_chroma_int';

function rotationFilters(deg) {
  if (deg === 90) return ['transpose=1'];
  if (deg === 180) return ['hflip', 'vflip'];
  if (deg === 270) return ['transpose=2'];
  return [];
}

/** Blur radius for the backdrop, scaled to the frame so it looks the same at 1080p and 8K. */
function backdropSigma(height) {
  return round(clamp(height / 42, 12, 90), 1);
}

const even = (n) => Math.max(2, Math.round(n / 2) * 2);

export async function buildPlan({ analysis, preset, options, caps, loudness = null, inputPath, outputPath }) {
  const v = analysis.video;
  const a = analysis.audio;
  const variation = options.variation?.enabled ? options.variation : null;

  const modules = [];
  const addModule = (id, label, active, detail) => modules.push({ id, label, active, detail });
  /** Anything we had to change about the user's request, and why. Surfaced in the UI. */
  const notes = [];
  const note = (severity, ar, en) => notes.push({ severity, ar, en });

  // ---- Codec -------------------------------------------------------------
  let codec = options.codec === 'preset' ? preset.codec : options.codec;

  if (codec === 'prores' && !caps.encoders.prores) {
    codec = caps.encoders.hevc ? 'hevc' : 'h264';
    note('warn',
      'لا يوجد مرمّز ProRes في هذه النسخة من FFmpeg — تم التحويل إلى ترميز مضغوط.',
      'This FFmpeg build has no ProRes encoder — fell back to a compressed codec.');
  }
  if (codec === 'hevc' && !caps.encoders.hevc) {
    codec = 'h264';
    note('warn',
      'لا يوجد libx265 في هذه النسخة — تم استخدام H.264 بدلاً منه.',
      'No libx265 in this build — used H.264 instead.');
  }

  // ---- HDR ---------------------------------------------------------------
  let hdrMode = options.hdr === 'preset' ? (preset.hdr || 'off') : (options.hdr || 'off');
  if (hdrMode !== 'off') {
    const req = hdrRequirements(hdrMode, { codec, caps });
    if (!req.ok) {
      note('warn', req.reason.ar, req.reason.en);
      hdrMode = 'off';
    } else if (req.forced && req.forced !== codec) {
      note('info',
        `HDR يحتاج HEVC، فتم تغيير الترميز من ${codec === 'h264' ? 'H.264' : codec} إلى HEVC.`,
        `HDR needs HEVC, so the codec was changed from ${codec === 'h264' ? 'H.264' : codec} to HEVC.`);
      codec = req.forced;
    }
  }

  // 10-bit is worth it even without HDR: the extra precision is what stops smooth
  // gradients turning into visible steps after a grade.
  let tenBit = options.tenBit === 'preset' ? !!preset.tenBit : options.tenBit === 'on';
  if (hdrMode !== 'off' || codec === 'prores') tenBit = true;
  if (tenBit && codec === 'h264' && hdrMode === 'off') {
    // x264 can do 10-bit, but High 10 is poorly supported on phones and every platform
    // re-encodes anyway, so it buys nothing and risks a rejected upload.
    tenBit = false;
    note('info',
      '10 بت متاح في H.264 لكن دعمه على الهواتف ضعيف؛ أُبقي الناتج 8 بت. اختر HEVC إن أردت 10 بت.',
      '10-bit exists in H.264 but phone support is poor, so the output stayed 8-bit. Choose HEVC for 10-bit.');
  }

  // ---- Framerate ---------------------------------------------------------
  const sourceFps = v.fps || 30;
  let targetFps;
  if (options.fpsMode === 'interpolate120') targetFps = 120;
  else if (options.fpsMode === 'interpolate60') targetFps = 60;
  else if (options.fpsMode === 'preset') targetFps = preset.fps || Math.min(60, sourceFps);
  else targetFps = preset.fps && !preset.keepSourceFps ? preset.fps : sourceFps;
  targetFps = round(clamp(targetFps, 1, 240), 3);

  const wantsInterpolation = options.fpsMode === 'interpolate60' || options.fpsMode === 'interpolate120';
  const canInterpolate = !!caps.filters.minterpolate;
  let interpolating = wantsInterpolation && canInterpolate && targetFps > sourceFps * 1.2;

  if (wantsInterpolation && !canInterpolate) {
    note('warn',
      'مرشّح minterpolate غير موجود، فلا يمكن توليد إطارات وسيطة حقيقية.',
      'The minterpolate filter is missing, so real frame synthesis is not possible.');
  }

  const shutterAngle = clamp(Number(options.shutter) || 0, 0, 360);
  let shutterActive = shutterAngle >= 90 && canInterpolate;
  if (shutterAngle >= 90 && !canInterpolate) {
    note('warn',
      'ضبابية الحركة تحتاج minterpolate وهو غير موجود.',
      'Synthetic motion blur needs minterpolate, which is missing.');
  }

  // ---- Target resolution -------------------------------------------------
  let targetW = preset.width || v.width;
  let targetH = preset.height || v.height;

  if (!options.upscale) {
    const scale = Math.min(1, v.width / targetW, v.height / targetH);
    if (scale < 1) {
      targetW = even(targetW * scale);
      targetH = even(targetH * scale);
    }
  }
  targetW = even(targetW);
  targetH = even(targetH);
  const requestedTarget = { width: targetW, height: targetH };

  // Will this machine survive it? Better to say so now than to be killed 40 minutes in.
  const mem = memoryCheck(targetW, targetH);
  if (!mem.ok) {
    const fit = fitToMemory(targetW, targetH);
    note('warn',
      `${targetW}×${targetH} يحتاج نحو ${mem.estimateGb} جيجابايت من الذاكرة، والمتاح هنا ${mem.budgetGb} فقط. خُفّضت الدقة إلى ${fit.width}×${fit.height} كي يكتمل الترميز بدل أن يُقتل في منتصفه.`,
      `${targetW}×${targetH} needs about ${mem.estimateGb} GB of memory and only ${mem.budgetGb} GB is available here. Reduced to ${fit.width}×${fit.height} so the encode finishes instead of being killed part-way.`);
    targetW = fit.width;
    targetH = fit.height;
  }

  // Mininterpolate and shutter blur are extremely memory-hungry at high resolutions.
  // At 8K each frame is ~33 Mpx; minterpolate needs multiple reference frames in
  // memory simultaneously and will OOM almost every machine. Disable it gracefully.
  const MEGAPIXELS_FOR_INTERPOLATION = 8.3; // roughly 4K
  const megapixels = (targetW * targetH) / 1e6;
  if (interpolating && megapixels > MEGAPIXELS_FOR_INTERPOLATION) {
    interpolating = false;
    note('warn',
      `تم تعطيل الاستيفاء عند ${Math.round(targetW)}×${Math.round(targetH)}: minterpolate يحتاج ذاكرة كبيرة جداً فوق 4K. الإطارات ستُكرَّر بدلاً من توليدها.`,
      `Interpolation disabled at ${Math.round(targetW)}×${Math.round(targetH)}: minterpolate needs too much memory above 4K. Frames will be duplicated, not synthesised.`);
  }
  if (shutterActive && megapixels > MEGAPIXELS_FOR_INTERPOLATION) {
    shutterActive = false;
    note('warn',
      `تم تعطيل ضبابية الحركة عند ${Math.round(targetW)}×${Math.round(targetH)}: تحتاج minterpolate وهو غير عملي فوق 4K.`,
      `Shutter blur disabled at ${Math.round(targetW)}×${Math.round(targetH)}: it needs minterpolate, which is impractical above 4K.`);
  }

  // Is it a legal bitstream? This is where 16K gets its honest answer.
  let conform = conformance({ codec, width: targetW, height: targetH, fps: targetFps });
  if (!conform.ok && conform.frameTooBig) {
    if (caps.encoders.prores && preset.container === 'mov') {
      note('info', conform.note.ar, conform.note.en);
      codec = 'prores';
    } else {
      note('warn', conform.note.ar, conform.note.en);
      targetW = conform.suggestion.width;
      targetH = conform.suggestion.height;
    }
    conform = conformance({ codec, width: targetW, height: targetH, fps: targetFps });
  } else if (!conform.ok) {
    note('warn', conform.note.ar, conform.note.en);
    // Framerate, not frame size, is the problem — drop to something legal.
    while (!conform.ok && targetFps > 24) {
      targetFps = targetFps > 60 ? 60 : targetFps > 30 ? 30 : 24;
      conform = conformance({ codec, width: targetW, height: targetH, fps: targetFps });
    }
  }

  const tuning = QUALITY_TUNING[options.quality] || QUALITY_TUNING.high;
  const crf = clamp((preset.crf ?? 18) + tuning.crfDelta, 10, 30);

  // ---- What is the chain actually doing? ---------------------------------
  // Supersampling only pays for itself if there is processing whose aliasing the
  // downsample can average away. On a bare upscale it is a measurable loss, so it is
  // refused rather than sold.
  const look = LOOKS_BY_ID.get(options.look) || null;
  const lookActive = !!(look && look.fn && (options.lookIntensity ?? 0) > 0.01 && caps.filters.lut3d);
  const sharpenFilter = SHARPEN[options.sharpen] || null;
  const clarity = caps.filters.blend && caps.filters.gblur ? clarityFork(options.clarity, targetH) : null;
  const halation = caps.filters.blend && caps.filters.curves && caps.filters.gblur
    ? halationFork(options.halation, targetH)
    : null;
  const colorFilter = COLOR_FILTERS[options.colorBoost] || null;

  const doesRealWork = !!(lookActive || sharpenFilter || clarity || halation || colorFilter);

  let render = resolveRender(targetW, targetH, options.supersample);
  if (render.active && !doesRealWork) {
    note('info',
      'التصغير الفائق أُلغي: بلا معالجة لونية أو تفاصيل لا يضيف شيئاً، بل يُنقص الأمانة قياسياً.',
      'Supersampling was switched off: with no grading or detail work it adds nothing and measurably lowers fidelity.');
    render = resolveRender(targetW, targetH, 1);
  }
  if (render.capped && render.requested > 1) {
    note('info',
      `طُلب تصغير فائق ×${render.requested} لكن الذاكرة تسمح بـ×${render.factor} فقط (سقف ${render.budgetMegapixels} ميجابكسل).`,
      `×${render.requested} supersampling was requested but memory allows only ×${render.factor} (ceiling ${render.budgetMegapixels} Mpx).`);
  }
  const renderW = render.width;
  const renderH = render.height;

  // ---- Graph: intake -----------------------------------------------------
  const g = new GraphBuilder('0:v');

  if (v.rotation) g.linear(rotationFilters(v.rotation));

  const deinterlacing = options.deinterlace !== 'off' && v.interlaced;
  if (deinterlacing) g.linear('yadif=mode=0:parity=-1:deint=0');

  const cropping = options.autoCrop && v.letterbox;
  if (cropping) {
    const { w, h, x, y } = v.letterbox;
    g.linear(`crop=${w}:${h}:${x}:${y}`);
  }

  const trimStart = Number(options.trimStart) || 0;
  const trimEnd = Number(options.trimEnd) || 0;
  const trimmed = trimStart > 0 || trimEnd > 0;
  const sourceDuration = analysis.container.duration || 0;
  const trimEndAbsolute = trimmed ? Math.max(trimStart + 0.1, sourceDuration - trimEnd) : 0;
  const trimDuration = trimmed ? trimEndAbsolute - trimStart : 0;
  if (trimmed && sourceDuration) {
    g.linear(`trim=start=${trimStart}:end=${trimEndAbsolute}:duration=${trimDuration}`);
  }

  // Auto-trim silence at start/end
  const autoTrim = options.autoTrim;
  let trimFilter = null;
  if (autoTrim && analysis.video?.silenceStart !== undefined) {
    const silenceStart = analysis.video.silenceStart || 0;
    const silenceEnd = analysis.video.silenceEnd || 0;
    if (silenceStart > 0 || silenceEnd > 0) {
      trimFilter = `trim=start=${silenceStart}:end=${sourceDuration - silenceEnd}`;
    }
  }
  if (trimFilter) g.linear(trimFilter);

  addModule('intake', { ar: 'الاستقبال', en: 'Intake' }, true, {
    ar: [
      `فكّ ترميز ${v.codec}`,
      v.rotation ? `تصحيح دوران ${v.rotation}°` : null,
      deinterlacing ? 'إزالة تشابك' : null,
      cropping ? `قصّ الأشرطة ← ${v.letterbox.w}×${v.letterbox.h}` : null,
      trimmed ? `قصّ من ${round(trimStart, 1)}s إلى ${round(trimEndAbsolute, 1)}s` : null,
    ].filter(Boolean).join(' · '),
    en: [
      `Decode ${v.codec}`,
      v.rotation ? `fix ${v.rotation}° rotation` : null,
      deinterlacing ? 'deinterlace' : null,
      cropping ? `crop bars to ${v.letterbox.w}×${v.letterbox.h}` : null,
      trimmed ? `trim ${round(trimStart, 1)}s → ${round(trimEndAbsolute, 1)}s` : null,
    ].filter(Boolean).join(' · '),
  });

  // ---- Graph: repair -----------------------------------------------------
  const repairChoice = REPAIR[options.repair] || REPAIR.off;
  const repairFilters = repairChoice.filters.filter((f) => {
    const name = f.split('=')[0];
    return caps.filters[name] !== false;
  });
  if (repairFilters.length) g.linear(repairFilters);

  addModule('repair', { ar: 'إصلاح آثار الضغط', en: 'Artefact repair' }, repairFilters.length > 0, {
    ar: repairFilters.length
      ? `${repairChoice.label.ar} — ${repairChoice.note.ar}`
      : 'متجاوَز — وهذا هو الافتراضي المقصود: كل مرشّحات الإصلاح خفّضت الأمانة المقيسة في اختباراتي.',
    en: repairFilters.length
      ? `${repairChoice.label.en} — ${repairChoice.note.en}`
      : 'Bypassed — and that is the intended default: every repair filter lowered measured fidelity in my tests.',
  });

  // ---- Graph: clean ------------------------------------------------------
  const denoiseFilter = DENOISE[options.denoise] || null;
  const advancedDenoiseFilter = ADVANCED_DENOISE[options.advancedDenoise] || null;
  if (denoiseFilter) g.linear(denoiseFilter);
  if (advancedDenoiseFilter) g.linear(advancedDenoiseFilter);
  const debanding = options.deband && caps.filters.deband;
  if (debanding) g.linear('deband=range=16:1thr=0.02:2thr=0.02:3thr=0.02:4thr=0.02:blur=1');

  addModule('clean', { ar: 'التنظيف', en: 'Cleanup' }, !!(denoiseFilter || advancedDenoiseFilter || debanding), {
    ar: denoiseFilter || advancedDenoiseFilter || debanding
      ? [
          denoiseFilter ? ({ light: 'خفض ضجيج خفيف', strong: 'خفض ضجيج قوي', nlmeans: 'خفض ضجيج بالمتوسطات غير المحلية' }[options.denoise]) : null,
          advancedDenoiseFilter ? ({ light: 'تنظيف متقدم خفيف', medium: 'تنظيف متقدم متوسط', strong: 'تنظيف متقدم قوي' }[options.advancedDenoise]) : null,
          debanding ? 'إزالة تحزّز التدرّجات' : null,
        ].filter(Boolean).join(' · ')
      : 'متجاوَز — المصدر نظيف',
    en: denoiseFilter || advancedDenoiseFilter || debanding
      ? [
          denoiseFilter ? ({ light: 'light denoise', strong: 'strong denoise', nlmeans: 'non-local means denoise' }[options.denoise]) : null,
          advancedDenoiseFilter ? ({ light: 'advanced light denoise', medium: 'advanced medium denoise', strong: 'advanced strong denoise' }[options.advancedDenoise]) : null,
          debanding ? 'debanding' : null,
        ].filter(Boolean).join(' · ')
      : 'bypassed — source is clean',
  });

  const tonemapping = options.tonemapHdr && v.hdr && hdrMode === 'off' && caps.filters.zscale && caps.filters.tonemap;
  if (tonemapping) g.linear(TONEMAP);

  if (variation?.mirror) g.linear('hflip');
  if (variation && variation.zoom > 1.001) {
    const z = clamp(variation.zoom, 1, 1.15);
    g.linear(`crop=iw/${round(z, 4)}:ih/${round(z, 4)}`);
  }

  // ---- Graph: geometry, at render resolution -----------------------------
  const fit = options.fit || 'blur';
  const sourceAspect = v.aspectRatio;
  const targetAspect = renderW / renderH;
  const shapesMatch = isNum(sourceAspect) && Math.abs(sourceAspect - targetAspect) / targetAspect < 0.012;

  let geometryDetail;
  if (shapesMatch || fit === 'stretch') {
    g.linear(`scale=${renderW}:${renderH}:${SCALE_FLAGS}`);
    geometryDetail = { ar: `تحجيم Lanczos إلى ${renderW}×${renderH}`, en: `Lanczos scale to ${renderW}×${renderH}` };
  } else if (fit === 'crop') {
    g.linear([
      `scale=${renderW}:${renderH}:force_original_aspect_ratio=increase:force_divisible_by=2:${SCALE_FLAGS}`,
      `crop=${renderW}:${renderH}`,
    ]);
    geometryDetail = { ar: `قصّ مركزي إلى ${renderW}×${renderH}`, en: `Centre crop to ${renderW}×${renderH}` };
  } else if (fit === 'pad') {
    const color = /^#[0-9a-f]{6}$/i.test(options.padColor || '') ? options.padColor.replace('#', '0x') : 'black';
    g.linear([
      `scale=${renderW}:${renderH}:force_original_aspect_ratio=decrease:force_divisible_by=2:${SCALE_FLAGS}`,
      `pad=${renderW}:${renderH}:(ow-iw)/2:(oh-ih)/2:color=${color}`,
    ]);
    geometryDetail = { ar: `حواشي ثابتة إلى ${renderW}×${renderH}`, en: `Solid padding to ${renderW}×${renderH}` };
  } else {
    const sigma = backdropSigma(renderH);
    g.fork(
      [
        [
          `scale=${renderW}:${renderH}:force_original_aspect_ratio=increase:force_divisible_by=2:${SCALE_FLAGS}`,
          `crop=${renderW}:${renderH}`,
          `gblur=sigma=${sigma}`,
          'eq=brightness=-0.06:saturation=1.05',
        ],
        [
          `scale=${renderW}:${renderH}:force_original_aspect_ratio=decrease:force_divisible_by=2:${SCALE_FLAGS}`,
        ],
      ],
      'overlay=(W-w)/2:(H-h)/2:shortest=0',
      'bd',
    );
    geometryDetail = {
      ar: `خلفية ضبابية (σ=${sigma}) مع الصورة في المنتصف ← ${renderW}×${renderH}`,
      en: `Blurred backdrop (σ=${sigma}) with the frame centred → ${renderW}×${renderH}`,
    };
  }

  const upscaleFactor = round(Math.min(targetW, targetH) / Math.max(1, Math.min(v.width, v.height)), 2);
  addModule('geometry', { ar: 'التأطير', en: 'Framing' }, true, {
    ar: `${geometryDetail.ar}${upscaleFactor > 1 ? ` · تكبير ×${upscaleFactor}` : ''}`,
    en: `${geometryDetail.en}${upscaleFactor > 1 ? ` · ×${upscaleFactor} upscale` : ''}`,
  });

  // ---- Graph: detail -----------------------------------------------------
  if (sharpenFilter) g.linear(sharpenFilter);
  if (clarity) g.fork(clarity.branches, clarity.combine, 'cl');

  addModule('detail', { ar: 'التفاصيل', en: 'Detail' }, !!(sharpenFilter || clarity), {
    ar: [
      sharpenFilter ? `قناع توضيح ${{ light: 'خفيف', medium: 'متوسط', strong: 'قوي' }[options.sharpen]} على اللمعان فقط` : null,
      clarity ? clarity.detail.ar : null,
    ].filter(Boolean).join(' · ') || 'متجاوَز',
    en: [
      sharpenFilter ? `${options.sharpen} unsharp mask, luma only` : null,
      clarity ? clarity.detail.en : null,
    ].filter(Boolean).join(' · ') || 'bypassed',
  });

  // ---- Graph: look -------------------------------------------------------
  let lutPath = null;
  if (lookActive) {
    lutPath = await ensureLut(options.look, options.lookIntensity);
    if (lutPath) g.linear(`lut3d=file='${escapeFilterPath(lutPath)}':interp=tetrahedral`);
  }
  if (options.look && options.look !== 'none' && !caps.filters.lut3d) {
    note('warn',
      'مرشّح lut3d غير موجود في هذه النسخة، فلا يمكن تطبيق التدرّجات اللونية.',
      'The lut3d filter is missing from this build, so colour looks cannot be applied.');
  }
  if (colorFilter) g.linear(colorFilter);
  if (halation) g.fork(halation.branches, halation.combine, 'ha');

  const watermarkFilter = options.watermark && options.watermark !== 'off' 
    ? WATERMARK_REMOVE[options.watermark] || null 
    : null;
  if (watermarkFilter) g.linear(watermarkFilter);

  addModule('look', { ar: 'التدرّج اللوني', en: 'Colour grade' }, !!(lutPath || colorFilter || halation || tonemapping || watermarkFilter), {
    ar: [
      tonemapping ? 'تحويل مصدر HDR ← SDR بمنحنى Hable' : null,
      lutPath ? `${look.label.ar} بشدّة ${Math.round((options.lookIntensity ?? 0) * 100)}% (جدول 3D بـ33³ نقطة، استقراء رباعي)` : null,
      colorFilter ? (options.colorBoost === 'vivid' ? 'رفع تشبّع وتباين' : options.colorBoost === 'colorbalance' ? 'توازن لوني' : options.colorBoost === 'vibrance' ? 'حيوية الألوان' : 'تباين خفيف') : null,
      halation ? halation.detail.ar : null,
      watermarkFilter ? 'إزالة شعار/علامة مائية' : null,
    ].filter(Boolean).join(' · ') || 'بدون تعديل لوني',
    en: [
      tonemapping ? 'HDR source → SDR, Hable curve' : null,
      lutPath ? `${look.label.en} at ${Math.round((options.lookIntensity ?? 0) * 100)}% (33³ 3D LUT, tetrahedral interpolation)` : null,
      colorFilter ? (options.colorBoost === 'vivid' ? 'saturation and contrast lift' : options.colorBoost === 'colorbalance' ? 'color balance' : options.colorBoost === 'vibrance' ? 'vibrance' : 'gentle contrast') : null,
      halation ? halation.detail.en : null,
      watermarkFilter ? 'watermark/logo removal' : null,
    ].filter(Boolean).join(' · ') || 'no colour change',
  });

  // ---- Graph: downsample -------------------------------------------------
  if (render.active) {
    g.linear(`scale=${targetW}:${targetH}:${SCALE_FLAGS}`);
  }
  addModule('supersample', { ar: 'التصغير الفائق', en: 'Supersampling' }, render.active, {
    ar: render.active
      ? `المعالجة تجري على ${renderW}×${renderH} (${render.megapixels} ميجابكسل) ثم تُصغَّر إلى ${targetW}×${targetH} — التصغير يمتصّ التسنّن والحلقات التي تنتجها الحدّة والتدرّج`
      : `المعالجة على دقّة الإخراج مباشرة (${targetW}×${targetH})`,
    en: render.active
      ? `Processing runs at ${renderW}×${renderH} (${render.megapixels} Mpx) then downsamples to ${targetW}×${targetH} — the downsample averages away the aliasing and ringing that sharpening and grading create`
      : `Processing runs directly at the delivery size (${targetW}×${targetH})`,
  });

  // ---- Graph: motion -----------------------------------------------------
  const speed = variation && Math.abs(variation.speed - 1) > 0.001 ? clamp(variation.speed, 0.9, 1.1) : null;
  if (speed) g.linear(`setpts=PTS/${round(speed, 4)}`);

  const deshakeFilter = DESHAKE[options.deshake] || null;
  if (deshakeFilter) g.linear(deshakeFilter);

  let shutter = null;
  if (shutterActive) {
    shutter = shutterBlurFilters(targetFps, shutterAngle);
    g.linear(shutter.filters);
  } else if (interpolating) {
    g.linear(interpolateFilter(targetFps));
  } else {
    g.linear(`fps=${targetFps}`);
  }

  const duplicating = !interpolating && !shutterActive && targetFps > sourceFps * 1.2;
  if (duplicating) {
    note('info',
      `الإخراج ${targetFps} إطار/ث لكن المصدر ${round(sourceFps, 2)} — الإطارات ستُكرَّر لا تُولَّد. شغّل توليد الإطارات إن أردت سلاسة حقيقية.`,
      `Output is ${targetFps} fps but the source is ${round(sourceFps, 2)} — frames will be duplicated, not synthesised. Enable interpolation for real smoothness.`);
  }

  addModule('motion', { ar: 'الحركة', en: 'Motion' }, true, {
    ar: [
      shutter ? `توليد إطارات ثم ${shutter.detail.ar}` : null,
      !shutter && interpolating ? `توليد إطارات وسيطة بالتدفّق البصري ${round(sourceFps, 2)} ← ${targetFps} إطار/ث` : null,
      !shutter && !interpolating ? `تثبيت ${targetFps} إطار/ث${duplicating ? ' (تكرار إطارات)' : ''}${v.vfr ? ' — المصدر متغيّر' : ''}` : null,
      speed ? `سرعة ×${round(speed, 3)}` : null,
      deshakeFilter ? `تثبيت الفيديو المهتز` : null,
    ].filter(Boolean).join(' · '),
    en: [
      shutter ? `Frame synthesis then ${shutter.detail.en}` : null,
      !shutter && interpolating ? `Optical-flow interpolation ${round(sourceFps, 2)} → ${targetFps} fps` : null,
      !shutter && !interpolating ? `Lock to constant ${targetFps} fps${duplicating ? ' (duplicated frames)' : ''}${v.vfr ? ' — source was variable' : ''}` : null,
      speed ? `speed ×${round(speed, 3)}` : null,
      deshakeFilter ? `video stabilization` : null,
    ].filter(Boolean).join(' · '),
  });

  // ---- Graph: grain ------------------------------------------------------
  const grainFilter = caps.filters.noise ? (GRAIN[options.grain] || null) : null;
  if (grainFilter) g.linear(grainFilter);

  const vignetteFilter = VIGNETTE[options.vignette] || null;
  if (vignetteFilter) g.linear(vignetteFilter);

  // ---- Graph: HDR --------------------------------------------------------
  const hdr = hdrFilters({
    mode: hdrMode,
    brightness: options.hdrBrightness,
    highlights: options.hdrHighlights,
    sourceIsHdr: !!v.hdr,
    tenBit,
  });
  if (hdr.active) g.linear(hdr.filters);

  const pixFmt = codec === 'prores' ? 'yuv422p10le' : tenBit ? 'yuv420p10le' : 'yuv420p';
  if (!hdr.active) g.linear(`format=${pixFmt}`);

  addModule('range', { ar: 'النطاق اللوني والعمق', en: 'Range and depth' }, hdr.active || tenBit || !!grainFilter || !!vignetteFilter, {
    ar: [
      hdr.active ? hdr.detail.ar : 'SDR · Rec.709',
      tenBit ? '10 بت لكل قناة' : '8 بت لكل قناة',
      grainFilter ? `حبيبات ${{ fine: 'ناعمة', film: 'فيلمية', heavy: 'كثيفة' }[options.grain]} على اللمعان — تمنح مرمّز المنصّة ما يشغله في المناطق المسطّحة فيقلّ التحزّز` : null,
      vignetteFilter ? `تظليل حواف ${{ subtle: 'خفيف', medium: 'متوسط', strong: 'قوي' }[options.vignette]}` : null,
    ].filter(Boolean).join(' · '),
    en: [
      hdr.active ? hdr.detail.en : 'SDR · Rec.709',
      tenBit ? '10-bit per channel' : '8-bit per channel',
      grainFilter ? `${options.grain} luma grain — gives the platform's encoder something to spend bits on in flat areas, which reduces banding` : null,
      vignetteFilter ? `${options.vignette} vignette` : null,
    ].filter(Boolean).join(' · '),
  });

  g.finish('vout');

  // ---- Audio -------------------------------------------------------------
  const hasAudio = a.present;
  const usePcm = codec === 'prores';
  const addSilence = !hasAudio && preset.id !== 'master-archive' && !usePcm;
  const audioFilters = [];
  let loudnessDetail = null;

  if (hasAudio) {
    if (speed) {
      let remaining = speed;
      while (remaining > 2.0) { audioFilters.push('atempo=2.0'); remaining /= 2; }
      while (remaining < 0.5) { audioFilters.push('atempo=0.5'); remaining /= 0.5; }
      audioFilters.push(`atempo=${round(remaining, 5)}`);
    }
    if (options.loudness !== 'off' && preset.lufs) {
      const target = preset.lufs;
      if (options.loudness === 'twoPass' && loudness && isNum(loudness.inputI)) {
        audioFilters.push(
          `loudnorm=I=${target}:TP=-1.5:LRA=11:linear=true` +
          `:measured_I=${loudness.inputI}:measured_TP=${loudness.inputTp}` +
          `:measured_LRA=${loudness.inputLra}:measured_thresh=${loudness.inputThresh}` +
          `:offset=${loudness.targetOffset ?? 0}`,
        );
        loudnessDetail = {
          ar: `معايرة خطّية بمرحلتين: ${round(loudness.inputI, 1)} ← ${target} LUFS`,
          en: `Linear two-pass normalisation: ${round(loudness.inputI, 1)} → ${target} LUFS`,
        };
      } else {
        audioFilters.push(`loudnorm=I=${target}:TP=-1.5:LRA=11`);
        loudnessDetail = { ar: `معايرة بمرحلة واحدة إلى ${target} LUFS`, en: `Single-pass normalisation to ${target} LUFS` };
      }
    }
    audioFilters.push(`aresample=48000:resampler=soxr:precision=28`);
    if (options.forceStereo) audioFilters.push('aformat=channel_layouts=stereo:sample_fmts=fltp');
  }

  const chains = [g.toString()];
  if (hasAudio) chains.push(`[0:a]${audioFilters.join(',')}[aout]`);

  addModule('sound', { ar: 'الصوت', en: 'Sound' }, hasAudio || addSilence, {
    ar: hasAudio
      ? [loudnessDetail?.ar, options.forceStereo ? 'ستيريو 48 kHz' : '48 kHz', usePcm ? 'PCM 24 بت غير مضغوط' : `AAC ${preset.audioKbps} kbps`].filter(Boolean).join(' · ')
      : addSilence ? 'إضافة مسار صامت — المصدر بلا صوت' : 'لا يوجد صوت',
    en: hasAudio
      ? [loudnessDetail?.en, options.forceStereo ? 'stereo 48 kHz' : '48 kHz', usePcm ? 'uncompressed 24-bit PCM' : `AAC ${preset.audioKbps} kbps`].filter(Boolean).join(' · ')
      : addSilence ? 'Silent track added — source has no audio' : 'No audio',
  });

  // ---- Encoder -----------------------------------------------------------
  const gop = Math.max(2, Math.round(targetFps * 2));
  const keyMin = Math.max(1, Math.round(targetFps));
  const useHw = options.hwAccel && caps.hwEncoder && codec === 'h264' && !tenBit && hdrMode === 'off';

  const videoArgs = [];
  let encoderName;

  if (useHw) {
    encoderName = caps.hwEncoder;
    videoArgs.push('-c:v', caps.hwEncoder, '-rc', 'vbr', '-cq', String(crf), '-preset', 'p6', '-profile:v', 'high');
  } else if (codec === 'prores') {
    encoderName = caps.encoders.proresEncoder || 'prores_ks';
    // Profile 3 is ProRes 422 HQ: visually lossless in practice, and unlike 4444 it has
    // broad support in editors.
    videoArgs.push('-c:v', encoderName, '-profile:v', '3', '-vendor', 'apl0');
  } else if (codec === 'hevc') {
    encoderName = 'libx265';
    const x265 = [
      `keyint=${gop}`,
      `min-keyint=${keyMin}`,
      'scenecut=0',
      'aq-mode=3',
      'rd=4',
      ...hdrX265Params(hdrMode, { maxNits: 1000, maxFall: 400 }),
    ];
    videoArgs.push(
      '-c:v', 'libx265',
      '-preset', tuning.x265Preset,
      '-crf', String(crf),
      '-profile:v', tenBit ? 'main10' : 'main',
      '-tag:v', 'hvc1', // without this, Apple players show a black screen
      '-x265-params', x265.join(':'),
    );
    if (conform.level) videoArgs.push('-level:v', conform.level);
  } else {
    encoderName = 'libx264';
    videoArgs.push(
      '-c:v', 'libx264',
      '-preset', tuning.x264Preset,
      '-crf', String(crf),
      '-profile:v', tenBit ? 'high10' : 'high',
      '-x264-params',
      [
        `keyint=${gop}`,
        `min-keyint=${keyMin}`,
        'scenecut=0',       // fixed GOP: platform encoders segment more cleanly
        'ref=4',
        'bframes=3',
        'b-adapt=2',
        'me=umh',
        'subme=8',
        'trellis=2',
        'aq-mode=3',        // variance AQ: protects flat areas like skin and sky
        'aq-strength=0.9',
        'psy-rd=1.0,0.15',
        'deblock=-1,-1',    // slightly less smoothing, keeps texture
      ].join(':'),
    );
    if (conform.level) videoArgs.push('-level', conform.level);
  }

  if (preset.maxrateKbps && codec !== 'prores' && !useHw) {
    videoArgs.push('-maxrate', `${preset.maxrateKbps}k`, '-bufsize', `${preset.maxrateKbps * 2}k`);
  }

  videoArgs.push('-pix_fmt', pixFmt, ...hdrOutputTags(hdrMode));

  const audioArgs = usePcm
    ? (hasAudio ? ['-c:a', 'pcm_s24le', '-ar', '48000'] : ['-an'])
    : hasAudio || addSilence
      ? ['-c:a', 'aac', '-b:a', `${preset.audioKbps || 256}k`, '-ar', '48000', '-ac', '2']
      : ['-an'];

  addModule('encode', { ar: 'الترميز', en: 'Encode' }, true, {
    ar: [
      codec === 'prores' ? `${encoderName} ProRes 422 HQ` : `${encoderName} · CRF ${crf} · ${tuning[codec === 'hevc' ? 'x265Preset' : 'x264Preset']}`,
      conform.level ? `المستوى ${conform.level}` : conform.levelless ? 'بلا حدود مستويات' : null,
      preset.maxrateKbps && codec !== 'prores' ? `سقف ${round(preset.maxrateKbps / 1000, 1)} Mbps` : null,
      `GOP ${gop}`,
      codec === 'prores' ? 'MOV' : 'faststart',
    ].filter(Boolean).join(' · '),
    en: [
      codec === 'prores' ? `${encoderName} ProRes 422 HQ` : `${encoderName} · CRF ${crf} · ${tuning[codec === 'hevc' ? 'x265Preset' : 'x264Preset']}`,
      conform.level ? `Level ${conform.level}` : conform.levelless ? 'no level limits' : null,
      preset.maxrateKbps && codec !== 'prores' ? `${round(preset.maxrateKbps / 1000, 1)} Mbps cap` : null,
      `GOP ${gop}`,
      codec === 'prores' ? 'MOV' : 'faststart',
    ].filter(Boolean).join(' · '),
  });

  // ---- Full command ------------------------------------------------------
  const args = [
    '-nostdin', '-hide_banner', '-nostats', '-y',
    '-noautorotate',                  // rotation is handled explicitly in the graph
    '-progress', 'pipe:1',
    '-i', inputPath,
  ];
  if (addSilence) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');

  args.push('-filter_complex', chains.join(';'));
  args.push('-map', '[vout]');
  if (hasAudio) args.push('-map', '[aout]');
  else if (addSilence) args.push('-map', '1:a', '-shortest');

  args.push(...videoArgs, ...audioArgs);

  if (options.stripMetadata) args.push('-map_metadata', '-1', '-map_chapters', '-1');
  args.push('-metadata', 'encoder=Masterbay');

  args.push(caps.fpsModeFlag, 'cfr');
  if (ENCODE_THREADS > 0) args.push('-threads', String(ENCODE_THREADS));
  if (codec !== 'prores') args.push('-movflags', '+faststart');
  args.push(outputPath);

  return {
    args,
    filterGraph: g.toString(true) + (hasAudio ? `;\n[0:a]${audioFilters.join(',')}[aout]` : ''),
    modules,
    notes,
    target: {
      width: targetW,
      height: targetH,
      requestedWidth: requestedTarget.width,
      requestedHeight: requestedTarget.height,
      renderWidth: renderW,
      renderHeight: renderH,
      supersample: render.factor,
      fps: targetFps,
      sourceFps: round(sourceFps, 3),
      codec: encoderName,
      codecFamily: codec,
      level: conform.level,
      crf: codec === 'prores' ? null : crf,
      tenBit,
      hdr: hdrMode,
      hdrNits: hdr.active ? hdr.npl : null,
      look: lutPath ? options.look : 'none',
      lookIntensity: lutPath ? options.lookIntensity : 0,
      maxrateKbps: preset.maxrateKbps || null,
      audioKbps: usePcm ? null : preset.audioKbps,
      lufs: preset.lufs || null,
      upscaleFactor,
      fit: shapesMatch ? 'none' : fit,
      interpolating,
      shutter: shutterActive ? shutterAngle : 0,
      megapixels: round((targetW * targetH) / 1e6, 1),
      slow: interpolating || shutterActive || options.denoise === 'nlmeans' || options.quality === 'max' || !!preset.heavy,
    },
    needsLoudnessPass: hasAudio && options.loudness === 'twoPass' && preset.lufs !== 0,
  };
}
