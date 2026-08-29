// Turns an inspection into a verdict: what will go wrong when you upload this,
// how much it matters, and what to do about it.
//
// Each check is scored, weighted and given a plain-language fix. The same checks
// run again on the finished file, which is what makes the before/after card honest.
import { round, isNum } from './util.js';

const STANDARD_FPS = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120, 144, 240];

/** Bits per pixel per frame. The most reliable single number for "is this file starved?". */
export const BPP_BANDS = { starved: 0.045, low: 0.08, good: 0.13 };

const ok = (id, weight, severity, label, detail, extra = {}) => ({
  id, weight, severity, pass: true, label, detail, ...extra,
});
const bad = (id, weight, severity, label, detail, fix, extra = {}) => ({
  id, weight, severity, pass: false, label, detail, fix, ...extra,
});

function nearlyEqual(a, b, tolerance = 0.01) {
  if (!isNum(a) || !isNum(b) || b === 0) return false;
  return Math.abs(a - b) / b <= tolerance;
}

/** 1080×1920 -> "9:16" */
function ratioLabel(w, h) {
  if (!w || !h) return '—';
  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const g = gcd(w, h) || 1;
  return `${w / g}:${h / g}`;
}

/**
 * @param {object} analysis result of probe.inspect()
 * @param {object} preset   target platform preset
 * @param {'source'|'output'} stage
 */
export function evaluate(analysis, preset, stage = 'source') {
  const v = analysis.video;
  const a = analysis.audio;
  const c = analysis.container;
  const checks = [];

  const targetW = preset.width || v.width;
  const targetH = preset.height || v.height;
  const targetAspect = targetH ? targetW / targetH : null;
  const shortSide = Math.min(v.width, v.height);
  const targetShortSide = Math.min(targetW, targetH);

  // ---- Picture -------------------------------------------------------------
  checks.push(
    shortSide >= targetShortSide
      ? ok('resolution', 12, 'critical', { ar: 'الدقة', en: 'Resolution' },
          { ar: `${v.width}×${v.height} — مطابقة أو أعلى من هدف المنصّة`, en: `${v.width}×${v.height} — meets or beats the platform target` },
          { value: `${v.width}×${v.height}` })
      : bad('resolution', 12, 'critical', { ar: 'الدقة', en: 'Resolution' },
          { ar: `${v.width}×${v.height} — الضلع الأقصر ${shortSide}px والهدف ${targetShortSide}px`, en: `${v.width}×${v.height} — short side is ${shortSide}px, target is ${targetShortSide}px` },
          { ar: `رفع الدقة إلى ${targetW}×${targetH}. المنصّات تمنح الفيديو عالي الدقة ترميزاً أفضل حتى لمن يشاهد بدقة أقل.`, en: `Scale up to ${targetW}×${targetH}. Platforms give higher-resolution uploads a better encode, even for viewers watching smaller.` },
          { value: `${v.width}×${v.height}` }),
  );

  const aspectMatches = nearlyEqual(v.aspectRatio, targetAspect, 0.012);
  checks.push(
    aspectMatches
      ? ok('aspect', 10, 'critical', { ar: 'نسبة الأبعاد', en: 'Aspect ratio' },
          { ar: `${v.aspect} — مطابقة للإطار المطلوب`, en: `${v.aspect} — matches the target frame` }, { value: v.aspect })
      : bad('aspect', 10, 'critical', { ar: 'نسبة الأبعاد', en: 'Aspect ratio' },
          { ar: `${v.aspect} (${v.orientation === 'landscape' ? 'أفقي' : v.orientation === 'portrait' ? 'عمودي' : 'مربّع'}) بدل ${ratioLabel(targetW, targetH)}`, en: `${v.aspect} (${v.orientation}) instead of ${ratioLabel(targetW, targetH)}` },
          { ar: 'إعادة تأطير الفيديو للإطار الصحيح. بدون ذلك ستضيف المنصّة أشرطة سوداء تُحسب من مساحة الشاشة وتُضعف التفاعل.', en: 'Reframe to the correct shape. Otherwise the platform adds its own bars, which eat screen area and hurt watch time.' },
          { value: v.aspect }),
  );

  const bpp = v.bitsPerPixel;
  if (isNum(bpp)) {
    const band = bpp >= BPP_BANDS.good ? 'good' : bpp >= BPP_BANDS.low ? 'acceptable' : bpp >= BPP_BANDS.starved ? 'low' : 'starved';
    const detailAr = `${v.bitrateKbps ? `${round(v.bitrateKbps / 1000, 1)} Mbps` : '—'} · ${bpp} bit/بكسل`;
    const detailEn = `${v.bitrateKbps ? `${round(v.bitrateKbps / 1000, 1)} Mbps` : '—'} · ${bpp} bits/pixel`;
    if (bpp >= BPP_BANDS.low) {
      checks.push(ok('bitrate', 14, 'critical', { ar: 'كثافة البيانات', en: 'Data density' },
        { ar: `${detailAr} — ${band === 'good' ? 'ممتازة' : 'كافية'}`, en: `${detailEn} — ${band}` }, { value: `${bpp} bpp`, band }));
    } else if (stage === 'output') {
      // Our own encode is quality-driven (CRF with a ceiling), not bitrate-driven.
      // On simple footage the encoder spends less because the picture needs less —
      // calling that "starved" would be a false alarm about a file we just made well.
      checks.push(ok('bitrate', 14, 'info', { ar: 'كثافة البيانات', en: 'Data density' },
        {
          ar: `${detailAr} — منخفضة رقمياً، لكن الترميز جرى بجودة ثابتة (CRF): المُرمّز أنفق ما تحتاجه الصورة فقط. الصورة البسيطة أو الثابتة لا تستهلك بِت‑ريت عالياً.`,
          en: `${detailEn} — numerically low, but this was encoded at constant quality (CRF): the encoder spent only what the picture needed. Simple or static footage does not consume a high bitrate.`,
        },
        { value: `${bpp} bpp`, band }));
    } else {
      checks.push(bad('bitrate', 14, 'critical', { ar: 'كثافة البيانات', en: 'Data density' },
        { ar: `${detailAr} — ${band === 'starved' ? 'منخفضة جداً' : 'منخفضة'}`, en: `${detailEn} — ${band}` },
        { ar: 'إعادة الترميز ببِت‑ريت مرتفع. هذا أهم عامل منفرد: المنصّة ستضغط ما ترفعه مرة أخرى، وضغط ملف مضغوط أصلاً هو ما يُنتج التكتلات المربّعة حول الحركة والنص.', en: 'Re-encode at a high bitrate. This is the single biggest factor: the platform compresses whatever you give it again, and compressing an already-compressed file is what produces blocking around motion and text.' },
        { value: `${bpp} bpp`, band }));
    }
  }

  const goodCodec = ['h264', 'hevc', 'h265'].includes(String(v.codec).toLowerCase());
  checks.push(
    goodCodec
      ? ok('codec', 6, 'warn', { ar: 'الترميز', en: 'Codec' }, { ar: `${v.codec} — مدعوم في كل مكان`, en: `${v.codec} — universally accepted` }, { value: v.codec })
      : bad('codec', 6, 'warn', { ar: 'الترميز', en: 'Codec' }, { ar: `${v.codec} — قد يُرفض أو يُعاد ترميزه بجودة أسوأ`, en: `${v.codec} — may be rejected or re-encoded badly` },
          { ar: 'التحويل إلى H.264. هو الترميز الذي تتوقعه كل المنصّات ويعطي أفضل نتيجة بعد إعادة ضغطهم.', en: 'Convert to H.264. It is what every platform expects and it survives their re-encode best.' }, { value: v.codec }),
  );

  if (String(v.codec).toLowerCase() === 'h264') {
    const isHigh = /high/i.test(v.profile || '');
    checks.push(
      isHigh
        ? ok('profile', 4, 'info', { ar: 'ملف الترميز', en: 'Encoder profile' }, { ar: `${v.profile} — الأعلى كفاءة`, en: `${v.profile} — most efficient` }, { value: v.profile })
        : bad('profile', 4, 'info', { ar: 'ملف الترميز', en: 'Encoder profile' }, { ar: `${v.profile || 'غير معروف'} — أقل كفاءة من High`, en: `${v.profile || 'unknown'} — less efficient than High` },
            { ar: 'استخدام High profile: يعطي نفس الجودة بحجم أقل، أو جودة أعلى بنفس الحجم.', en: 'Use High profile: same quality at a smaller size, or better quality at the same size.' }, { value: v.profile }),
    );
  }

  const is8bit420 = v.bitDepth === 8 && v.chroma === '4:2:0';
  checks.push(
    is8bit420
      ? ok('pixfmt', 6, 'critical', { ar: 'تنسيق البكسل', en: 'Pixel format' }, { ar: `${v.pixFmt} — متوافق`, en: `${v.pixFmt} — compatible` }, { value: v.pixFmt })
      : bad('pixfmt', 6, 'critical', { ar: 'تنسيق البكسل', en: 'Pixel format' },
          { ar: `${v.pixFmt} (${v.bitDepth}‑bit ${v.chroma || '?'}) — خارج ما تقبله مشغّلات المنصّات`, en: `${v.pixFmt} (${v.bitDepth}-bit ${v.chroma || '?'}) — outside what platform players accept` },
          { ar: 'التحويل إلى yuv420p بعمق 8 بت. الملفات بعمق 10 بت أو 4:2:2 قد تُرفع بلا صورة أو بألوان مقلوبة على بعض الأجهزة.', en: 'Convert to 8-bit yuv420p. 10-bit or 4:2:2 files can upload with no picture or inverted colour on some devices.' },
          { value: v.pixFmt }),
  );

  // The single most common "why does my video look washed out after uploading" cause.
  const taggedRec709 = /bt709/i.test(v.colorPrimaries || '') && /bt709/i.test(v.colorSpace || '');
  if (v.hdr) {
    checks.push(bad('color', 8, 'critical', { ar: 'مساحة اللون', en: 'Colour space' },
      { ar: `HDR (${v.colorTransfer}${v.colorPrimaries ? ` / ${v.colorPrimaries}` : ''}) — سيُحوَّل تلقائياً بشكل سيئ`, en: `HDR (${v.colorTransfer}${v.colorPrimaries ? ` / ${v.colorPrimaries}` : ''}) — will be auto-converted badly` },
      { ar: 'تحويل HDR إلى SDR بمنحنى tone‑map مضبوط ووسمه bt709. هذا سبب المنظر الباهت أو الرمادي الذي يظهر بعد الرفع من آيفون.', en: 'Tone-map HDR to SDR properly and tag it bt709. This is the cause of the washed-out or grey look people get after uploading from an iPhone.' },
      { value: v.colorTransfer }));
  } else {
    checks.push(
      taggedRec709
        ? ok('color', 8, 'warn', { ar: 'مساحة اللون', en: 'Colour space' }, { ar: 'bt709 موسومة بشكل صريح', en: 'Explicitly tagged bt709' }, { value: 'bt709' })
        : bad('color', 8, 'warn', { ar: 'مساحة اللون', en: 'Colour space' },
            { ar: `وسوم اللون ${v.colorPrimaries || 'غائبة'} — كل مشغّل سيخمّن بطريقته`, en: `Colour tags ${v.colorPrimaries || 'missing'} — every player will guess differently` },
            { ar: 'وسم الملف صراحةً bt709 (primaries وtransfer وmatrix). بدون الوسوم تختلف الألوان بين الهاتف والمتصفح.', en: 'Tag the file explicitly as bt709 (primaries, transfer and matrix). Without tags, colour shifts between phone and browser.' },
            { value: v.colorPrimaries || 'untagged' }),
    );
  }

  const fpsStandard = isNum(v.fps) && STANDARD_FPS.some((s) => nearlyEqual(v.fps, s, 0.005));
  const fpsPass = fpsStandard && !v.vfr;
  checks.push(
    fpsPass
      ? ok('framerate', 8, 'warn', { ar: 'معدّل الإطارات', en: 'Frame rate' }, { ar: `${v.fps} إطار/ث ثابت`, en: `${v.fps} fps, constant` }, { value: `${v.fps}` })
      : bad('framerate', 8, 'warn', { ar: 'معدّل الإطارات', en: 'Frame rate' },
          { ar: v.vfr ? `${v.fps} إطار/ث متغيّر (الحاوية تعلن ${v.containerFps})` : `${v.fps} إطار/ث — ليس معدّلاً قياسياً`, en: v.vfr ? `${v.fps} fps variable (container claims ${v.containerFps})` : `${v.fps} fps — not a standard rate` },
          { ar: 'تثبيت معدّل الإطارات. المعدّل المتغيّر (شائع في تسجيل الشاشة وفيديو الهاتف) يُنتج تقطيعاً في الحركة وانحرافاً في تزامن الصوت بعد إعادة ضغط المنصّة.', en: 'Lock to a constant rate. Variable framerate — common in screen recordings and phone video — causes judder and audio drift after the platform re-encodes.' },
          { value: `${v.fps}${v.vfr ? ' VFR' : ''}` }),
  );

  checks.push(
    !v.letterbox
      ? ok('letterbox', 8, 'warn', { ar: 'الأشرطة السوداء', en: 'Black bars' }, { ar: 'لا توجد أشرطة مدمجة في الصورة', en: 'None baked into the picture' }, { value: 'clean' })
      : bad('letterbox', 8, 'warn', { ar: 'الأشرطة السوداء', en: 'Black bars' },
          { ar: `أشرطة مدمجة تُغطي ${round(v.letterbox.fraction * 100, 1)}% من الإطار (${v.letterbox.removedH}px رأسياً، ${v.letterbox.removedW}px أفقياً)`, en: `Baked-in bars covering ${round(v.letterbox.fraction * 100, 1)}% of the frame (${v.letterbox.removedH}px vertical, ${v.letterbox.removedW}px horizontal)` },
          { ar: 'قصّ الأشرطة قبل إعادة التأطير. المنصّة تنفق بِت‑ريت على ترميز مساحة سوداء، ثم تضيف أشرطتها فوقها.', en: 'Crop the bars before reframing. The platform spends bitrate encoding black, then adds its own bars on top.' },
          { value: `${round(v.letterbox.fraction * 100, 1)}%` }),
  );

  if (v.interlaced) {
    checks.push(bad('interlace', 6, 'warn', { ar: 'المسح المتشابك', en: 'Interlacing' },
      { ar: `${v.fieldOrder} — صورة متشابكة`, en: `${v.fieldOrder} — interlaced picture` },
      { ar: 'إزالة التشابك. بدونها تظهر خطوط مشط أفقية على الحركة.', en: 'Deinterlace. Otherwise you get horizontal combing artefacts on motion.' }));
  }

  // ---- Sound ---------------------------------------------------------------
  if (!a.present) {
    checks.push(bad('audio', 8, 'critical', { ar: 'الصوت', en: 'Audio' },
      { ar: 'لا يوجد مسار صوتي', en: 'No audio track' },
      { ar: 'إضافة مسار صوتي. الفيديو الصامت يُخفَض توزيعه على المنصّات القصيرة لأن المشاهد يمرّ عنه سريعاً.', en: 'Add an audio track. Silent clips get less distribution on short-form platforms because viewers scroll past them.' }));
  } else {
    if (isNum(a.lufs)) {
      const good = a.lufs >= -17 && a.lufs <= -11;
      checks.push(
        good
          ? ok('loudness', 9, 'warn', { ar: 'مستوى الصوت', en: 'Loudness' }, { ar: `${round(a.lufs, 1)} LUFS — داخل النطاق`, en: `${round(a.lufs, 1)} LUFS — in range` }, { value: `${round(a.lufs, 1)} LUFS` })
          : bad('loudness', 9, 'warn', { ar: 'مستوى الصوت', en: 'Loudness' },
              { ar: `${round(a.lufs, 1)} LUFS — ${a.lufs < -17 ? 'منخفض جداً' : 'مرتفع جداً'} (الهدف ‎-14)`, en: `${round(a.lufs, 1)} LUFS — ${a.lufs < -17 ? 'too quiet' : 'too loud'} (target -14)` },
              { ar: a.lufs < -17
                  ? 'معايرة الصوت إلى ‎-14 LUFS. الصوت المنخفض هو أسرع سبب لتمرير المشاهد للفيديو، والمنصّة لا ترفعه لك بل تخفض الأعلى منه فقط.'
                  : 'معايرة الصوت إلى ‎-14 LUFS. الأعلى من ذلك تخفضه المنصّة تلقائياً، وغالباً بطريقة تسحق الديناميكية.',
                en: a.lufs < -17
                  ? 'Normalise to -14 LUFS. Quiet audio is the fastest way to lose a viewer, and the platform will not raise it for you — it only lowers what is too loud.'
                  : 'Normalise to -14 LUFS. Anything louder gets turned down automatically, usually in a way that squashes the dynamics.' },
              { value: `${round(a.lufs, 1)} LUFS` }),
      );
    }
    if (isNum(a.truePeakDb)) {
      checks.push(
        a.truePeakDb <= -1
          ? ok('truepeak', 4, 'info', { ar: 'الذروة الحقيقية', en: 'True peak' }, { ar: `${round(a.truePeakDb, 1)} dBTP — آمنة`, en: `${round(a.truePeakDb, 1)} dBTP — safe` }, { value: `${round(a.truePeakDb, 1)} dBTP` })
          : bad('truepeak', 4, 'info', { ar: 'الذروة الحقيقية', en: 'True peak' },
              { ar: `${round(a.truePeakDb, 1)} dBTP — قريبة من التشبّع`, en: `${round(a.truePeakDb, 1)} dBTP — close to clipping` },
              { ar: 'خفض الذروة إلى ‎-1.5 dBTP. إعادة ترميز الصوت في المنصّة ترفع الذروة قليلاً وتُنتج تكسيراً مسموعاً.', en: 'Bring the peak to -1.5 dBTP. The platform re-encode nudges peaks upward and produces audible crackle.' },
              { value: `${round(a.truePeakDb, 1)} dBTP` }),
      );
    }
    const audioFormatGood = a.channels >= 2 && a.sampleRate === 48000;
    checks.push(
      audioFormatGood
        ? ok('audioformat', 5, 'info', { ar: 'تنسيق الصوت', en: 'Audio format' }, { ar: `${a.channelLayout} · ${a.sampleRate / 1000} kHz`, en: `${a.channelLayout} · ${a.sampleRate / 1000} kHz` }, { value: `${a.channelLayout} ${a.sampleRate}` })
        : bad('audioformat', 5, 'info', { ar: 'تنسيق الصوت', en: 'Audio format' },
            { ar: `${a.channelLayout || '?'} · ${a.sampleRate ? a.sampleRate / 1000 : '?'} kHz — الهدف ستيريو بـ48 kHz`, en: `${a.channelLayout || '?'} · ${a.sampleRate ? a.sampleRate / 1000 : '?'} kHz — target is stereo at 48 kHz` },
            { ar: 'التحويل إلى ستيريو بـ48 kHz. الصوت المونو يُشغَّل من سمّاعة واحدة في بعض المشغّلات، و44.1 kHz يُعاد أخذ عيّناته بجودة أقل.', en: 'Convert to stereo at 48 kHz. Mono plays from one earbud in some players, and 44.1 kHz gets resampled at lower quality.' },
            { value: `${a.channelLayout || '?'} ${a.sampleRate || '?'}` }),
    );
  }

  // ---- Delivery ------------------------------------------------------------
  if (c.fastStartApplicable) {
    checks.push(
      c.fastStart
        ? ok('faststart', 5, 'info', { ar: 'التشغيل الفوري', en: 'Instant playback' }, { ar: 'فهرس moov في مقدمة الملف', en: 'moov index sits at the front' }, { value: 'faststart' })
        : bad('faststart', 5, 'info', { ar: 'التشغيل الفوري', en: 'Instant playback' },
            { ar: 'فهرس moov في نهاية الملف', en: 'moov index sits at the end' },
            { ar: 'نقل الفهرس إلى المقدمة (faststart). بدونه يجب تنزيل الملف كاملاً قبل بدء العرض، وهو ما يُبطئ الرفع والمعاينة.', en: 'Move the index to the front (faststart). Without it the whole file must download before playback starts, which slows uploads and previews.' },
            { value: 'moov at end' }),
    );
  }

  const trimmedDuration = (() => {
    const dur = c.duration || 0;
    const start = analysis.options?.trimStart || 0;
    const end = analysis.options?.trimEnd || 0;
    if (start > 0 || end > 0) return Math.max(0.1, dur - start - end);
    return dur;
  })();

  if (preset.maxSeconds && isNum(trimmedDuration)) {
    checks.push(
      trimmedDuration <= preset.maxSeconds
        ? ok('duration', 4, 'info', { ar: 'المدّة', en: 'Duration' }, { ar: `${round(trimmedDuration, 1)}s ضمن حدّ ${preset.platform}`, en: `${round(trimmedDuration, 1)}s within the ${preset.platform} limit` }, { value: `${round(trimmedDuration, 1)}s` })
        : bad('duration', 4, 'info', { ar: 'المدّة', en: 'Duration' },
            { ar: `${round(trimmedDuration, 1)}s تتجاوز حدّ ${preset.platform} (${preset.maxSeconds}s)`, en: `${round(trimmedDuration, 1)}s exceeds the ${preset.platform} limit (${preset.maxSeconds}s)` },
            { ar: 'تقصير الفيديو أو تقسيمه قبل النشر.', en: 'Trim or split the video before posting.' },
            { value: `${round(trimmedDuration, 1)}s` }),
    );
  }

  if (preset.maxBytes && stage === 'output') {
    checks.push(
      analysis.sizeBytes <= preset.maxBytes
        ? ok('filesize', 4, 'info', { ar: 'حجم الملف', en: 'File size' }, { ar: 'ضمن حدّ الرفع', en: 'Within the upload limit' })
        : bad('filesize', 4, 'info', { ar: 'حجم الملف', en: 'File size' },
            { ar: 'أكبر من حدّ رفع المنصّة', en: 'Larger than the platform upload limit' },
            { ar: 'خفض الجودة درجة واحدة، أو استخدم دقّة 1080p بدل 4K، أو ارفع من متصفح سطح المكتب حيث الحدّ أعلى.', en: 'Drop the quality one step, use 1080p instead of 4K, or upload from a desktop browser where the limit is higher.' }),
    );
  }

  const totalWeight = checks.reduce((sum, c2) => sum + c2.weight, 0) || 1;
  const earned = checks.reduce((sum, c2) => sum + (c2.pass ? c2.weight : 0), 0);
  const score = Math.round((earned / totalWeight) * 100);

  const failures = checks.filter((c2) => !c2.pass);
  const grade =
    score >= 90 ? 'excellent' : score >= 75 ? 'good' : score >= 55 ? 'needs-work' : 'poor';

  return {
    score,
    grade,
    stage,
    presetId: preset.id,
    checks,
    blocking: failures.filter((f) => f.severity === 'critical').length,
    warnings: failures.filter((f) => f.severity === 'warn').length,
    notes: failures.filter((f) => f.severity === 'info').length,
  };
}

/**
 * Read the inspection and choose settings for it, rather than making the user
 * guess. Returns a partial options object plus the reason for each decision so
 * the interface can show its work.
 */
export function recommend(analysis, preset) {
  const v = analysis.video;
  const a = analysis.audio;
  const options = {};
  const reasons = [];

  const targetW = preset.width || v.width;
  const targetH = preset.height || v.height;
  const targetAspect = targetH ? targetW / targetH : null;

  if (v.letterbox) {
    options.autoCrop = true;
    reasons.push({
      key: 'autoCrop',
      ar: `قصّ ${v.letterbox.removedH || v.letterbox.removedW}px من الأشرطة السوداء المدمجة`,
      en: `Crop ${v.letterbox.removedH || v.letterbox.removedW}px of baked-in black bars`,
    });
  }

  if (targetAspect && !nearlyEqual(v.aspectRatio, targetAspect, 0.012)) {
    const sourceIsWider = v.aspectRatio > targetAspect;
    // Cropping a wide shot into 9:16 throws away most of the frame, so default to
    // a blurred backdrop unless the shapes are close enough that cropping is cheap.
    const lossIfCropped = sourceIsWider
      ? 1 - targetAspect / v.aspectRatio
      : 1 - v.aspectRatio / targetAspect;
    options.fit = lossIfCropped > 0.28 ? 'blur' : 'crop';
    reasons.push({
      key: 'fit',
      ar: options.fit === 'crop'
        ? `قصّ مركزي — الفرق في الشكل صغير (${round(lossIfCropped * 100, 0)}% فقط من الصورة)`
        : `خلفية ضبابية — القصّ سيفقد ${round(lossIfCropped * 100, 0)}% من الصورة`,
      en: options.fit === 'crop'
        ? `Centre crop — the shapes are close, only ${round(lossIfCropped * 100, 0)}% of the picture is lost`
        : `Blurred backdrop — cropping would throw away ${round(lossIfCropped * 100, 0)}% of the picture`,
    });
  }

  const bpp = v.bitsPerPixel;
  if (isNum(bpp) && bpp < BPP_BANDS.starved) {
    options.denoise = 'strong';
    options.deband = true;
    reasons.push({
      key: 'denoise',
      ar: `تنظيف قوي — المصدر مضغوط بشدة (${bpp} bit/بكسل) وفيه تكتلات ضغط`,
      en: `Strong cleanup — the source is heavily compressed (${bpp} bits/pixel) and carries blocking artefacts`,
    });
  } else if (isNum(bpp) && bpp < BPP_BANDS.low) {
    options.denoise = 'light';
    reasons.push({ key: 'denoise', ar: `تنظيف خفيف — كثافة بيانات المصدر منخفضة (${bpp})`, en: `Light cleanup — source data density is low (${bpp})` });
  } else {
    options.denoise = 'off';
    reasons.push({ key: 'denoise', ar: 'بلا تنظيف — المصدر نظيف، والتنظيف هنا سيفقد تفاصيل', en: 'No cleanup — the source is clean and denoising would only cost detail' });
  }

  const upscaleFactor = Math.min(v.width, v.height) ? Math.min(targetW, targetH) / Math.min(v.width, v.height) : 1;
  if (upscaleFactor > 1.25) {
    options.sharpen = upscaleFactor > 2 ? 'strong' : 'medium';
    reasons.push({
      key: 'sharpen',
      ar: `توضيح ${options.sharpen === 'strong' ? 'قوي' : 'متوسط'} — التكبير ×${round(upscaleFactor, 2)} يُلَيِّن الحواف`,
      en: `${options.sharpen === 'strong' ? 'Strong' : 'Medium'} sharpening — a ×${round(upscaleFactor, 2)} upscale softens edges`,
    });
  } else {
    options.sharpen = 'light';
    reasons.push({ key: 'sharpen', ar: 'توضيح خفيف يقاوم تلْيين ضغط المنصّة', en: 'Light sharpening to offset the softening from the platform re-encode' });
  }

  if (v.hdr) {
    options.tonemapHdr = true;
    reasons.push({ key: 'tonemapHdr', ar: 'تحويل HDR إلى SDR بمنحنى Hable ووسم bt709', en: 'Tone-map HDR to SDR with a Hable curve and tag it bt709' });
  }

  if (v.interlaced) {
    options.deinterlace = 'auto';
    reasons.push({ key: 'deinterlace', ar: `إزالة التشابك (${v.fieldOrder})`, en: `Deinterlace (${v.fieldOrder})` });
  }

  // Flat, low-contrast footage benefits from a nudge; already-graded footage does not.
  const stats = v.stats;
  if (stats && isNum(stats.satAvg) && stats.satAvg < 60) {
    options.colorBoost = 'vivid';
    reasons.push({ key: 'colorBoost', ar: `رفع التشبّع — الصورة باهتة (تشبّع متوسط ${round(stats.satAvg, 0)})`, en: `Lift saturation — the picture is flat (mean saturation ${round(stats.satAvg, 0)})` });
  } else {
    options.colorBoost = 'auto';
    reasons.push({ key: 'colorBoost', ar: 'تحسين تباين خفيف فقط', en: 'Gentle contrast lift only' });
  }

  if (v.vfr) {
    options.fpsMode = 'preset';
    reasons.push({ key: 'fpsMode', ar: `تثبيت معدّل الإطارات على ${preset.fps || 30} — المصدر بمعدّل متغيّر`, en: `Lock to ${preset.fps || 30} fps — the source is variable-rate` });
  } else {
    options.fpsMode = 'source';
    reasons.push({ key: 'fpsMode', ar: `الحفاظ على ${v.fps} إطار/ث كما هي`, en: `Keep the source ${v.fps} fps` });
  }

  if (a.present) {
    if (preset.lufs) {
      options.loudness = 'twoPass';
      reasons.push({
        key: 'loudness',
        ar: isNum(a.lufs) ? `معايرة الصوت من ${round(a.lufs, 1)} إلى ${preset.lufs} LUFS بمرحلتين` : `معايرة الصوت إلى ${preset.lufs} LUFS`,
        en: isNum(a.lufs) ? `Normalise audio from ${round(a.lufs, 1)} to ${preset.lufs} LUFS in two passes` : `Normalise audio to ${preset.lufs} LUFS`,
      });
    }
    if (a.channels === 1) {
      options.forceStereo = true;
      reasons.push({ key: 'forceStereo', ar: 'تحويل المونو إلى ستيريو', en: 'Convert mono to stereo' });
    }
  }

  return { options, reasons };
}
