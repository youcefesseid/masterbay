// Masterbay front end. One file, no framework, no build step.
// Flow: pick a file -> chunked upload -> inspect -> choose target -> encode -> download.

const $ = (id) => document.getElementById(id);
const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

// ───────────────────────── language ─────────────────────────
// [arabic, english]
const T = {
  skip: ['تجاوز إلى المحتوى', 'Skip to content'],
  engine: ['المحرّك', 'Engine'],
  accel: ['التسريع', 'Acceleration'],
  engineMissing: ['لم يُعثر على FFmpeg', 'FFmpeg was not found'],

  heroLine1: ['المنصّة ستضغط فيديوك مرّة ثانية.', 'The platform will compress your video again.'],
  heroLine2: ['جهّزه ليصمد.', 'Prepare it to survive that.'],
  heroSub: [
    'كل منصّة تعيد ترميز ما ترفعه. حجم الضرر يعتمد كلّياً على ما إذا كان ملفك يطابق ما يتوقّعه مُرمّزها. هذه الأداة تقيس ملفك، تشرح ما سيُتلَف فيه، ثم تُخرجه بمواصفات صحيحة حتى 16K و120 إطار/ث — ترفع الملف هنا، وتنزّله بعد المعالجة.',
    'Every platform re-encodes what you upload. How much damage that does depends almost entirely on whether your file already matches what their encoder expects. This tool measures your file, explains what will break, then exports it correctly at up to 16K and 120 fps — you upload it here and download the result.',
  ],

  dropLead: ['أفلِت الفيديو هنا', 'Drop your video here'],
  dropOr: ['أو', 'or'],
  dropBrowse: ['اختر ملفاً من جهازك', 'choose a file from your computer'],

  path1: ['المصدر', 'Source'],
  path2: ['فحص', 'Inspect'],
  path3: ['معالجة', 'Master'],
  path4: ['تصدير حتى 16K', 'Export up to 16K'],
  feature1Title: ['تحليل ذكي', 'Smart analysis'],
  feature1Desc: ['يفحص الفيديو ويقيس جودته التقنية بدقة', 'Analyzes video and measures its technical quality'],
  feature2Title: ['معالجة احترافية', 'Professional processing'],
  feature2Desc: ['فلتر متقدم + ترميز عالي الجودة', 'Advanced filters + high-quality encoding'],
  feature3Title: ['دقة حتى 4K', 'Up to 4K resolution'],
  feature3Desc: ['يرفع الفيديو ليدعمه المنصّة بشكل أفضل', 'Upscales video for better platform support'],
  feature4Title: ['خصوصية تامة', 'Full privacy'],
  feature4Desc: ['كل شيء على جهازك، لا يُرسل شيء', 'Everything on your device, nothing sent'],

  spec1: ['وسم لوني صريح، فلا تختلف الألوان بين الهاتف والمتصفح', 'Explicit colour tags, so colour does not shift between phone and browser'],
  spec2: ['معايرة صوت مطابقة لما تفرضه المنصّات', 'Loudness matched to what the platforms enforce'],
  spec3: ['فهرس الملف في مقدّمته، فيبدأ العرض فوراً', 'Index at the front of the file, so playback starts instantly'],
  spec4: ['قص مدّة الفيديو قبل التجهيز', 'Trim video duration before mastering'],

  reportTitle: ['تقرير الفحص', 'Inspection report'],
  startOver: ['ملف آخر', 'Another file'],
  critical: ['حاجب', 'blocking'],
  warn: ['تحذير', 'warning'],
  note: ['ملاحظة', 'note'],

  targetTitle: ['الهدف وسلسلة المعالجة', 'Target and processing chain'],
  applyAuto: ['أعِد الإعداد التلقائي', 'Reset to automatic'],
  reuseTitle: ['إعادة نشر مقطع من محتواك أنت', 'Re-posting a clip of your own content'],
  whyThese: ['لماذا هذه الإعدادات تحديداً؟', 'Why these settings?'],
  start: ['ابدأ التجهيز', 'Start mastering'],

  running: ['جارٍ التجهيز', 'Mastering'],
  cancel: ['إلغاء', 'Cancel'],

  resultTitle: ['النتيجة', 'Result'],
  downloadReport: ['تقرير تقني', 'Technical report'],
  download: ['نزّل الفيديو', 'Download the video'],
  before: ['قبل', 'Before'],
  after: ['بعد', 'After'],
  metric: ['القياس', 'Measurement'],
  deltaTitle: ['ما تغيّر فعلياً', 'What actually changed'],
  showGraph: ['اعرض رسم الفلاتر وأمر FFmpeg', 'Show the filter graph and FFmpeg command'],
  play: ['تشغيل الاثنين', 'Play both'],
  pause: ['إيقاف', 'Pause'],
  unmute: ['شغّل الصوت', 'Unmute'],
  mute: ['اكتم الصوت', 'Mute'],
  compareNote: [
    'المعاينة تُعرض بحجم النافذة، لا بالدقّة الكاملة. نزّل الملف لتحكم على 4K بشكل صحيح.',
    'The preview is scaled to the window, not shown at full resolution. Download the file to judge 4K properly.',
  ],
  queueTitle: ['المهام', 'Jobs'],

  // ── runtime strings ──
  uploadingLabel: ['يرفع', 'Uploading'],
  analysing: ['يفحص الملف…', 'Inspecting the file…'],
  analysingLong: ['يقيس الصورة والصوت — قد يستغرق ثوانٍ لملف طويل', 'Measuring picture and sound — this can take a few seconds on a long file'],
  badType: ['هذا النوع من الملفات غير مدعوم.', 'That file type is not supported.'],
  tooBig: ['الملف أكبر من الحد المسموح.', 'That file is larger than the limit.'],
  uploadFailed: ['فشل الرفع.', 'Upload failed.'],
  retrying: ['تعذّر إرسال جزء من الملف، يعيد المحاولة…', 'A chunk failed to send, retrying…'],
  sourceUnplayable: [
    'المتصفح لا يستطيع عرض الملف الأصلي (ترميز غير مدعوم في المتصفح)، فتُعرض النسخة الجديدة فقط.',
    'Your browser cannot play the original file (unsupported codec), so only the new version is shown.',
  ],

  gradeExcellent: ['ممتاز', 'Excellent'],
  gradeGood: ['جيد', 'Good'],
  gradeNeedsWork: ['يحتاج عملاً', 'Needs work'],
  gradePoor: ['ضعيف', 'Poor'],

  capExcellent: ['هذا الملف جاهز للنشر كما هو.', 'This file is ready to post as it is.'],
  capGood: ['قابل للنشر، وفيه ما يستحق التصحيح.', 'Postable, but a few things are worth fixing.'],
  capNeedsWork: ['المنصّة ستُتلف أجزاءً من هذا الملف.', 'The platform will damage parts of this file.'],
  capPoor: ['هذا الملف سيخرج من المنصّة أسوأ بكثير مما تراه الآن.', 'This file will come out of the platform far worse than it looks now.'],

  stageMeasure: ['قياس الصوت', 'Measuring audio'],
  stageEncode: ['الترميز', 'Encoding'],
  stageVerify: ['التحقق', 'Verifying'],

  meterSpeed: ['السرعة', 'Speed'],
  meterFps: ['إطار/ث', 'fps'],
  meterEta: ['المتبقّي', 'Remaining'],
  meterSize: ['الحجم', 'Size'],
  meterPos: ['الموضع', 'Position'],

  queued: ['في الانتظار', 'queued'],
  stRunning: ['يعمل', 'running'],
  stDone: ['جاهز', 'done'],
  stError: ['خطأ', 'error'],
  stCancelled: ['ملغى', 'cancelled'],
  stCancelling: ['يُلغى', 'cancelling'],

  remove: ['احذف', 'Remove'],
  saveFile: ['نزّل', 'Download'],

  reuseNote: [
    'هذه الخيارات لإعادة نشر مقطع من محتواك أنت على حساب آخر أو بعد فترة، بحيث لا يُعامَل كملف مكرّر حرفياً. لا تستخدمها على محتوى ليس لك — إعادة نشر عمل غيرك تُسقِط الحساب وليست مشكلة تقنية تُحلّ بأداة.',
    'These options exist for re-posting a clip of your own content on another account or after some time, so it is not treated as a byte-identical duplicate. Do not use them on content that is not yours — re-posting someone else\'s work gets accounts removed, and that is not a technical problem a tool can solve.',
  ],
  reuseEnable: ['فعّل إعادة الاستخدام', 'Enable repurposing'],
  reuseMirror: ['اقلب الصورة أفقياً', 'Mirror horizontally'],
  reuseMirrorHint: ['يقلب الإطار. لا تستخدمه إذا ظهر نص أو شعار في الفيديو، سيصير مقلوباً.', 'Flips the frame. Do not use it if there is text or a logo on screen — it will read backwards.'],
  reuseZoom: ['تكبير طفيف', 'Slight zoom'],
  reuseZoomHint: ['يقصّ حافة الإطار قليلاً.', 'Crops slightly into the edge of the frame.'],
  reuseSpeed: ['تغيير السرعة', 'Speed change'],
  reuseSpeedHint: ['يعدّل المدّة مع الحفاظ على طبقة الصوت.', 'Adjusts duration while preserving audio pitch.'],

  // Advanced features
  advancedDenoise: ['تنظيف متقدم', 'Advanced denoise'],
  advancedDenoiseHint: ['إزالة ضوضاء متقدمة باستخدام خوارزمية Vague Denoiser.', 'Advanced noise removal using Vague Denoiser algorithm.'],
  colorBalance: ['توازن لوني', 'Color balance'],
  colorBalanceHint: ['تعديل توازن الألوان بشكل احترافي.', 'Professional color balance adjustment.'],
  vibrance: ['حيوية الألوان', 'Vibrance'],
  vibranceHint: ['يعزز الألوان بشكل ذكي دون تشبع مفرط.', 'Intelligently enhances colors without oversaturation.'],
  deshake: ['تثبيت الفيديو', 'Video stabilization'],
  deshakeHint: ['يقلل من اهتزاز الكاميرا في الفيديو.', 'Reduces camera shake in the video.'],
  watermark: ['إزالة الشعار', 'Remove watermark'],
  watermarkHint: ['يزيل العلامات المائية والشعارات من الفيديو.', 'Removes watermarks and logos from the video.'],
  autoTrim: ['قص تلقائي', 'Auto trim'],
  autoTrimHint: ['يزيل الأجزاء الصامتة تلقائياً من البداية والنهاية.', 'Automatically removes silent parts from start and end.'],
  sceneDetection: ['كشف المشاهد', 'Scene detection'],
  sceneDetectionHint: ['يقسم الفيديو تلقائياً عند تغيّر المشهد.', 'Automatically splits video at scene changes.'],

  targetLine: ['الهدف', 'Target'],
  slowNotice: ['هذه الإعدادات بطيئة: توقّع وقت ترميز أطول بكثير من مدّة الفيديو.', 'These settings are slow: expect an encode time much longer than the clip duration.'],
  jobStarted: ['بدأ التجهيز.', 'Mastering started.'],
  jobDone: ['جهّز الملف. نزّله من الأعلى.', 'The file is ready. Download it above.'],
  jobFailed: ['فشل التجهيز.', 'Mastering failed.'],
  cancelled: ['أُلغيت المهمة.', 'Job cancelled.'],
  scoreRose: ['الدرجة ارتفعت من', 'The score went from'],
  scoreTo: ['إلى', 'to'],

  // License
  licenseTitle: ['الترخيص', 'License'],
  licenseActivate: ['تفعيل الترخيص', 'Activate License'],
  licenseEmail: ['البريد الإلكتروني', 'Email'],
  licenseKey: ['مفتاح الترخيص', 'License Key'],
  licenseValid: ['الترخيص ساري المفعول', 'License is valid'],
  licenseInvalid: ['مفتاح الترخيص غير صالح', 'Invalid license key'],
  licenseExpired: ['انتهت صلاحية الترخيص', 'License expired'],
  licenseOffline: ['يعمل بدون اتصال', 'Working offline'],
  licenseFeatures: ['الميزات المفعّلة', 'Active features'],
  licenseManage: ['إدارة الترخيص', 'Manage License'],

  // Integrity
  integrityTitle: ['التحقق من السلامة', 'Integrity Check'],
  integrityPassed: ['التطبيق سليم', 'Application integrity verified'],
  integrityFailed: ['تم اكتشاف تعديل', 'Tampering detected'],
  integrityChecking: ['جاري التحقق…', 'Checking…'],

  // Preview
  previewTitle: ['معاينة الفلتر', 'Filter Preview'],
  previewGenerating: ['جاري إنشاء المعاينة…', 'Generating preview…'],
  previewReady: ['المعاينة جاهزة', 'Preview ready'],
  previewFailed: ['فشل إنشاء المعاينة', 'Preview generation failed'],

  // Export formats
  exportFormat: ['تنسيق التصدير', 'Export Format'],
  exportVideo: ['فيديو', 'Video'],
  exportGif: ['GIF متحرك', 'Animated GIF'],
  exportWebM: ['WebM (VP9/AV1)', 'WebM (VP9/AV1)'],
  exportImages: ['سلسلة صور', 'Image Sequence'],
};

let lang = 'ar';
const t = (key) => (T[key] ? T[key][lang === 'ar' ? 0 : 1] : key);
/** Server strings arrive as { ar, en }. */
const L = (obj) => (obj ? (obj[lang] ?? obj.en ?? obj.ar ?? '') : '');

function applyLanguage() {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  $('langToggle').firstElementChild.textContent = lang === 'ar' ? 'EN' : 'ع';
  for (const node of document.querySelectorAll('[data-i18n]')) {
    const key = node.dataset.i18n;
    if (T[key]) node.textContent = t(key);
  }
  renderAll();
}

// ───────────────────────── formatting ─────────────────────────
const nf = () => (lang === 'ar' ? 'ar-EG' : 'en-US');

function fmtBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

function fmtClock(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60) % 60;
  const h = Math.floor(seconds / 3600);
  const mm = String(m).padStart(h ? 2 : 1, '0');
  return h ? `${h}:${mm}:${String(s).padStart(2, '0')}` : `${mm}:${String(s).padStart(2, '0')}`;
}

const fmtNum = (n, digits = 1) => (Number.isFinite(n) ? Number(n).toFixed(digits) : '—');

// ───────────────────────── state ─────────────────────────
const state = {
  meta: null,
  upload: null,
  before: null,
  options: null,
  reasons: [],
  presetId: 'tiktok-1080',
  activeJobId: null,
  jobs: new Map(),
  openModule: null,
  busy: false,
  license: null,
  licenseFeatures: [],
  integrityStatus: null,
  previewCache: new Map(),
  exportFormat: 'video', // video, gif, webm, images
};

const presetById = (id) => (state.meta?.presets || []).find((p) => p.id === id) || null;
const activeJob = () => (state.activeJobId ? state.jobs.get(state.activeJobId) : null);

// ───────────────────────── network ─────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { /* not json */ }
  if (!res.ok) {
    const err = new Error(data?.error || text || `${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function toast(message, bad = false) {
  const node = el('div', `toast${bad ? ' toast--bad' : ''}`, message);
  $('toasts').append(node);
  setTimeout(() => {
    node.style.opacity = '0';
    setTimeout(() => node.remove(), 300);
  }, bad ? 8000 : 4500);
}

// ───────────────────────── upload ─────────────────────────
const dropzone = $('dropzone');

function setDropBusy(busy) {
  state.busy = busy;
  dropzone.classList.toggle('is-busy', busy);
}

function showUploadProgress(fraction, note) {
  $('uploadProgress').hidden = false;
  $('uploadBar').style.width = `${Math.round(fraction * 100)}%`;
  $('uploadStatus').textContent = note;
}

async function handleFile(file) {
  if (state.busy) return;
  const limits = state.meta?.limits;
  const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
  if (limits && !limits.acceptedExtensions.includes(ext)) {
    return toast(`${t('badType')} (${ext})`, true);
  }
  if (limits && file.size > limits.maxUploadBytes) {
    return toast(`${t('tooBig')} (${fmtBytes(limits.maxUploadBytes)})`, true);
  }

  setDropBusy(true);
  showUploadProgress(0, `${t('uploadingLabel')} · ${fmtBytes(file.size)}`);

  try {
    const { upload } = await api('POST', '/api/uploads', {
      name: file.name, size: file.size, mimeType: file.type,
    });

    const chunkSize = limits?.chunkBytes || 8 * 1024 * 1024;
    const startedAt = Date.now();
    let offset = 0;

    while (offset < file.size) {
      const end = Math.min(offset + chunkSize, file.size);
      let attempt = 0;
      for (;;) {
        try {
          const res = await fetch(`/api/uploads/${upload.id}/chunk?offset=${offset}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/octet-stream' },
            body: file.slice(offset, end),
          });
          if (res.status === 409) {
            // Server and client disagree about progress: resume where it actually is.
            const data = await res.json();
            offset = Number(data.received) || 0;
            break;
          }
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            throw new Error(data?.error || `HTTP ${res.status}`);
          }
          offset = end;
          break;
        } catch (err) {
          if (++attempt >= 3) throw err;
          showUploadProgress(offset / file.size, t('retrying'));
          await new Promise((r) => setTimeout(r, 700 * attempt));
        }
      }

      const elapsed = (Date.now() - startedAt) / 1000;
      const rate = elapsed > 0.4 ? offset / elapsed : 0;
      const left = rate > 0 ? (file.size - offset) / rate : null;
      showUploadProgress(
        offset / file.size,
        [
          `${t('uploadingLabel')} ${Math.round((offset / file.size) * 100)}%`,
          `${fmtBytes(offset)} / ${fmtBytes(file.size)}`,
          rate ? `${fmtBytes(rate)}/s` : null,
          left != null ? `${t('meterEta')} ${fmtClock(left)}` : null,
        ].filter(Boolean).join(' · '),
      );
    }

    showUploadProgress(1, `${t('analysing')} ${t('analysingLong')}`);
    const result = await api('POST', `/api/uploads/${upload.id}/complete?presetId=${state.presetId}`);
    adoptAnalysis(result);
  } catch (err) {
    toast(`${t('uploadFailed')} ${err.message}`, true);
    $('uploadProgress').hidden = true;
  } finally {
    setDropBusy(false);
    $('fileInput').value = '';
  }
}

function adoptAnalysis({ upload, before, recommended, reasons }) {
  state.upload = upload;
  state.before = before;
  state.options = recommended;
  state.reasons = reasons || [];
  state.presetId = recommended.presetId;
  state.openModule = null;

  $('uploadProgress').hidden = true;
  $('intakeSection').hidden = true;
  $('reportSection').hidden = false;
  $('chainSection').hidden = false;
  $('resultSection').hidden = true;
  $('runSection').hidden = true;
  renderAll();
  $('reportSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetToIntake() {
  state.upload = null;
  state.before = null;
  state.options = null;
  state.activeJobId = null;
  stopPreview();
  $('intakeSection').hidden = false;
  $('reportSection').hidden = true;
  $('chainSection').hidden = true;
  $('runSection').hidden = true;
  $('resultSection').hidden = true;
  $('uploadProgress').hidden = true;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ───────────────────────── the gauge ─────────────────────────
// A 220° dial: instrument-like, and it reads at a glance from across the room.
const DIAL = { cx: 100, cy: 112, r: 82, from: 200, to: -20 };

const polar = (angleDeg, radius) => {
  const a = (angleDeg * Math.PI) / 180;
  return [DIAL.cx + radius * Math.cos(a), DIAL.cy - radius * Math.sin(a)];
};

function arcPath(fromDeg, toDeg, radius = DIAL.r) {
  const [x1, y1] = polar(fromDeg, radius);
  const [x2, y2] = polar(toDeg, radius);
  const large = Math.abs(fromDeg - toDeg) > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

let dialLength = 0;

function buildGauge() {
  const track = $('gaugeTrack');
  track.setAttribute('d', arcPath(DIAL.from, DIAL.to));
  const value = $('gaugeValue');
  value.setAttribute('d', arcPath(DIAL.from, DIAL.to));
  dialLength = value.getTotalLength();
  value.style.strokeDasharray = `${dialLength}`;
  value.style.strokeDashoffset = `${dialLength}`;

  const ticks = $('gaugeTicks');
  ticks.textContent = '';
  for (let i = 0; i <= 10; i++) {
    const angle = DIAL.from + ((DIAL.to - DIAL.from) * i) / 10;
    const major = i % 5 === 0;
    const [x1, y1] = polar(angle, DIAL.r + 8);
    const [x2, y2] = polar(angle, DIAL.r + (major ? 16 : 12));
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', x1.toFixed(2));
    line.setAttribute('y1', y1.toFixed(2));
    line.setAttribute('x2', x2.toFixed(2));
    line.setAttribute('y2', y2.toFixed(2));
    line.setAttribute('class', `gauge__tick${major ? ' gauge__tick--major' : ''}`);
    ticks.append(line);
  }
}

const GRADE_TEXT = {
  excellent: ['gradeExcellent', 'capExcellent'],
  good: ['gradeGood', 'capGood'],
  'needs-work': ['gradeNeedsWork', 'capNeedsWork'],
  poor: ['gradePoor', 'capPoor'],
};

function renderReport() {
  const report = state.before;
  if (!report) return;

  const upload = state.upload;
  $('sourceIdentity').textContent = upload
    ? `${upload.name} · ${fmtBytes(upload.analysis?.sizeBytes || upload.size)}`
    : '';

  const value = $('gaugeValue');
  value.classList.toggle('is-poor', report.score < 55);
  value.classList.toggle('is-great', report.score >= 90);
  // Let the browser paint the reset first so the sweep is visible on re-scores.
  value.style.strokeDashoffset = `${dialLength}`;
  requestAnimationFrame(() => {
    value.style.strokeDashoffset = `${dialLength * (1 - report.score / 100)}`;
  });

  $('scoreNum').textContent = report.score;
  const [gradeKey, capKey] = GRADE_TEXT[report.grade] || GRADE_TEXT.poor;
  $('scoreGrade').textContent = t(gradeKey);
  $('scoreCaption').textContent = t(capKey);

  $('tallyCrit').textContent = report.blocking;
  $('tallyWarn').textContent = report.warnings;
  $('tallyInfo').textContent = report.notes;

  const list = $('checksList');
  list.textContent = '';
  // Failures first, and inside that the heaviest first: the top of the list is
  // always the thing most worth reading.
  const order = { critical: 0, warn: 1, info: 2 };
  const sorted = [...report.checks].sort((a, b) => {
    if (a.pass !== b.pass) return a.pass ? 1 : -1;
    const bySeverity = (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    return bySeverity || b.weight - a.weight;
  });

  sorted.forEach((check, index) => {
    const cls = check.pass ? 'pass' : check.severity === 'critical' ? 'crit' : check.severity === 'warn' ? 'warn' : 'info';
    const li = el('li', `check check--${cls}`);
    li.style.animationDelay = `${Math.min(index * 32, 480)}ms`;

    li.append(el('span', 'check__flag'));

    const body = el('div');
    body.append(el('div', 'check__label', L(check.label)));
    body.append(el('p', 'check__detail', L(check.detail)));
    if (!check.pass && check.fix) body.append(el('p', 'check__fix', L(check.fix)));
    li.append(body);

    li.append(el('span', 'check__value', check.value || ''));
    list.append(li);
  });
}

// ───────────────────────── targets ─────────────────────────
function renderPresets() {
  const wrap = $('presetList');
  wrap.textContent = '';
  for (const preset of state.meta?.presets || []) {
    const selected = preset.id === state.presetId;
    const button = el('button', 'target');
    button.type = 'button';
    button.setAttribute('role', 'radio');
    button.setAttribute('aria-checked', String(selected));
    button.append(el('span', 'target__name', L(preset.label)));
    button.append(el('span', 'target__dim mono', preset.width
      ? `${preset.width}×${preset.height} · ${preset.fps || '—'} fps · crf ${preset.crf}`
      : lang === 'ar' ? 'يحفظ دقّة المصدر' : 'keeps source resolution'));
    if (preset.recommended) {
      button.append(el('span', 'target__badge', lang === 'ar' ? 'الأكثر أماناً' : 'safest'));
    }
    button.addEventListener('click', () => selectPreset(preset.id));
    wrap.append(button);
  }
  $('presetNote').textContent = L(presetById(state.presetId)?.note);
}

async function selectPreset(id) {
  if (id === state.presetId || !state.upload) return;
  state.presetId = id;
  renderPresets();
  try {
    const data = await api('GET', `/api/uploads/${state.upload.id}/evaluate?presetId=${id}`);
    state.before = data.before;
    state.options = data.recommended;
    state.reasons = data.reasons || [];
    renderAll();
  } catch (err) {
    toast(err.message, true);
  }
}

// ───────────────────────── option plumbing ─────────────────────────
const getOpt = (path) => path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), state.options);

function setOpt(path, value) {
  const keys = path.split('.');
  let target = state.options;
  for (const key of keys.slice(0, -1)) target = target[key];
  target[keys.at(-1)] = value;
  renderChain();
  renderReuse();
  renderTargetSummary();
}

// ───────────────────────── chain preview ─────────────────────────
// Before a job exists there is no server-side plan yet, so the chain is described
// from the same inputs the server will use. Once the job starts, the authoritative
// module list from buildPlan() replaces this.
function resolveTarget() {
  const preset = presetById(state.presetId);
  const v = state.upload?.analysis?.video;
  if (!preset || !v) return null;

  let w = preset.width || v.width;
  let h = preset.height || v.height;
  if (!state.options.upscale) {
    const scale = Math.min(1, v.width / w, v.height / h);
    if (scale < 1) { w = Math.round((w * scale) / 2) * 2; h = Math.round((h * scale) / 2) * 2; }
  }
  w = Math.max(2, Math.round(w / 2) * 2);
  h = Math.max(2, Math.round(h / 2) * 2);

  const sourceFps = v.fps || 30;
  let fps = state.options.fpsMode === 'interpolate60'
    ? 60
    : state.options.fpsMode === 'interpolate120'
      ? 120
    : state.options.fpsMode === 'interpolate240'
      ? 240
    : state.options.fpsMode === 'preset'
      ? (preset.fps || Math.min(240, sourceFps))
      : (preset.fps && !preset.keepSourceFps ? preset.fps : sourceFps);
  fps = Math.min(240, fps);

  const crfDelta = { balanced: 2, high: 0, max: -2 }[state.options.quality] ?? 0;
  const shapesMatch = Math.abs(v.aspectRatio - w / h) < 0.012;

  return {
    width: w,
    height: h,
    fps: Math.round(fps * 1000) / 1000,
    codec: state.options.codec === 'preset' ? preset.codec : state.options.codec,
    crf: Math.min(30, Math.max(10, (preset.crf ?? 18) + crfDelta)),
    maxrateKbps: preset.maxrateKbps || null,
    audioKbps: preset.audioKbps,
    lufs: preset.lufs || null,
    upscaleFactor: Math.round((Math.min(w, h) / Math.min(v.width, v.height)) * 100) / 100,
    fit: shapesMatch ? 'none' : state.options.fit,
    slow: state.options.fpsMode === 'interpolate60' || state.options.fpsMode === 'interpolate120' || state.options.fpsMode === 'interpolate240' || state.options.denoise === 'nlmeans' || state.options.quality === 'max' || !!preset.heavy,
    trimStart: state.options.trimStart || 0,
    trimEnd: state.options.trimEnd || 0,
  };
}

const WORD = {
  off: ['بلا', 'off'],
  light: ['خفيف', 'light'],
  medium: ['متوسط', 'medium'],
  strong: ['قوي', 'strong'],
  nlmeans: ['nlmeans (بطيء)', 'nlmeans (slow)'],
  auto: ['تلقائي', 'auto'],
  vivid: ['مشبع', 'vivid'],
  blur: ['خلفية ضبابية', 'blurred backdrop'],
  crop: ['قصّ مركزي', 'centre crop'],
  pad: ['أشرطة لونية', 'solid bars'],
  stretch: ['تمديد', 'stretch'],
  none: ['بلا تغيير شكل', 'no reshaping'],
  balanced: ['متوازن', 'balanced'],
  high: ['عالٍ', 'high'],
  max: ['أقصى', 'max'],
  onePass: ['مرحلة واحدة', 'single pass'],
  twoPass: ['مرحلتان', 'two passes'],
  source: ['كما المصدر', 'as source'],
  preset: ['كما الهدف', 'as target'],
  interpolate60: ['استيفاء إلى 60', 'interpolate to 60'],
  interpolate120: ['استيفاء إلى 120', 'interpolate to 120'],
  interpolate240: ['استيفاء إلى 240', 'interpolate to 240'],

  colorbalance: ['توازن لوني', 'color balance'],
  vibrance: ['حيوية', 'vibrance'],

  deshake: ['تثبيت', 'stabilization'],
  watermark: ['إزالة شعار', 'watermark removal'],
  autoTrim: ['قص تلقائي', 'auto-trim'],
  sceneDetection: ['كشف مشاهد', 'scene detection'],
};
const w = (key) => (WORD[key] ? WORD[key][lang === 'ar' ? 0 : 1] : key);

function describeChain() {
  const v = state.upload?.analysis?.video;
  const a = state.upload?.analysis?.audio;
  const o = state.options;
  const target = resolveTarget();
  if (!v || !target) return [];

  const join = (parts) => parts.filter(Boolean).join(' · ');
  const both = (arParts, enParts) => ({ ar: join(arParts), en: join(enParts) });

  const cropping = o.autoCrop && v.letterbox;
  const deinterlacing = o.deinterlace !== 'off' && v.interlaced;
  const toning = o.tonemapHdr && v.hdr;
  const cleaning = o.denoise !== 'off' || o.advancedDenoise !== 'off' || o.deband;
  const colouring = o.colorBoost !== 'off' || toning;
  const resampling = Math.abs(target.fps - (v.fps || 0)) > 0.01 || v.vfr || o.fpsMode === 'interpolate60' || o.fpsMode === 'interpolate120' || o.fpsMode === 'interpolate240';
  const trimStart = target.trimStart || 0;
  const trimEnd = target.trimEnd || 0;
  const trimmed = trimStart > 0 || trimEnd > 0;
  const sourceDuration = v.duration || 0;
  const trimmedDuration = Math.max(0.1, sourceDuration - trimStart - trimEnd);

  return [
    {
      id: 'intake', label: { ar: 'الاستقبال', en: 'Intake' }, active: true,
      detail: both(
        [`فكّ ترميز ${v.codec}`, v.rotation ? `تصحيح دوران ${v.rotation}°` : null,
          deinterlacing ? 'إزالة تشابك' : null, cropping ? `قصّ ← ${v.letterbox.w}×${v.letterbox.h}` : null,
          trimmed ? `قصّ من ${fmtClock(trimStart)} إلى ${fmtClock(sourceDuration - trimEnd)}` : null],
        [`decode ${v.codec}`, v.rotation ? `fix ${v.rotation}° rotation` : null,
          deinterlacing ? 'deinterlace' : null, cropping ? `crop → ${v.letterbox.w}×${v.letterbox.h}` : null,
          trimmed ? `trim ${fmtClock(trimStart)} → ${fmtClock(sourceDuration - trimEnd)}` : null],
      ),
    },
    {
      id: 'clean', label: { ar: 'التنظيف', en: 'Cleanup' }, active: cleaning,
      detail: both(
        [o.denoise === 'off' && o.advancedDenoise === 'off' ? 'بلا تنظيف' : [o.denoise !== 'off' ? `تنظيف ${w(o.denoise)}` : null, o.advancedDenoise !== 'off' ? `تنظيف متقدم ${w(o.advancedDenoise)}` : null, o.deband ? 'إزالة تحزّم' : null].filter(Boolean).join(' · ')],
        [o.denoise === 'off' && o.advancedDenoise === 'off' ? 'no denoise' : [o.denoise !== 'off' ? `${w(o.denoise)} denoise` : null, o.advancedDenoise !== 'off' ? `advanced ${w(o.advancedDenoise)} denoise` : null, o.deband ? 'deband' : null].filter(Boolean).join(' · ')],
      ),
    },
    {
      id: 'geometry', label: { ar: 'الإطار', en: 'Framing' }, active: true,
      detail: both(
        [`${target.width}×${target.height}`, w(target.fit), target.upscaleFactor > 1 ? `تكبير ×${target.upscaleFactor}` : null],
        [`${target.width}×${target.height}`, w(target.fit), target.upscaleFactor > 1 ? `×${target.upscaleFactor} upscale` : null],
      ),
    },
    {
      id: 'detail', label: { ar: 'التفاصيل', en: 'Detail' }, active: o.sharpen !== 'off',
      detail: both(
        [o.sharpen === 'off' ? 'بلا توضيح' : `توضيح ${w(o.sharpen)} على الإضاءة فقط`],
        [o.sharpen === 'off' ? 'no sharpening' : `${w(o.sharpen)} sharpen, luma only`],
      ),
    },
    {
      id: 'color', label: { ar: 'اللون', en: 'Colour' }, active: colouring,
      detail: both(
        [toning ? 'HDR ← SDR بمنحنى hable' : null, o.colorBoost === 'off' ? null : `تحسين ${w(o.colorBoost)}`, 'وسم bt709'],
        [toning ? 'HDR → SDR, hable curve' : null, o.colorBoost === 'off' ? null : `${w(o.colorBoost)} grade`, 'tag bt709'],
      ),
    },
    {
      id: 'motion', label: { ar: 'الحركة', en: 'Motion' }, active: resampling || o.deshake !== 'off',
      detail: both(
        [`${target.fps} إطار/ث ثابت`, o.fpsMode === 'interpolate60' ? 'استيفاء حركة' : null, o.deshake !== 'off' ? `تثبيت ${w(o.deshake)}` : null],
        [`${target.fps} fps constant`, o.fpsMode === 'interpolate60' ? 'motion interpolation' : null, o.deshake !== 'off' ? `${w(o.deshake)} stabilization` : null],
      ),
    },
    {
      id: 'sound', label: { ar: 'الصوت', en: 'Sound' }, active: !!a?.present,
      detail: !a?.present
        ? { ar: 'لا يوجد مسار صوتي', en: 'no audio track' }
        : both(
          [target.lufs && o.loudness !== 'off' ? `${target.lufs} LUFS (${w(o.loudness)})` : 'بلا معايرة',
            o.forceStereo ? 'ستيريو' : null, `48 kHz · aac ${target.audioKbps}k`],
          [target.lufs && o.loudness !== 'off' ? `${target.lufs} LUFS (${w(o.loudness)})` : 'no normalisation',
            o.forceStereo ? 'stereo' : null, `48 kHz · aac ${target.audioKbps}k`],
        ),
    },
    {
      id: 'advanced', label: { ar: 'متقدم', en: 'Advanced' }, active: o.autoTrim || o.sceneDetection || o.watermark !== 'off',
      detail: both(
        [o.autoTrim ? 'قص تلقائي للصمت' : null, o.sceneDetection ? 'كشف المشاهد' : null, o.watermark !== 'off' ? `إزالة شعار ${w(o.watermark)}` : null].filter(Boolean).join(' · ') || 'بدون',
        [o.autoTrim ? 'auto-trim silence' : null, o.sceneDetection ? 'scene detection' : null, o.watermark !== 'off' ? `${w(o.watermark)} watermark removal` : null].filter(Boolean).join(' · ') || 'none',
      ),
    },
    {
      id: 'encode', label: { ar: 'الترميز', en: 'Encode' }, active: true,
      detail: both(
        [target.codec === 'hevc' ? 'HEVC' : 'H.264 High', `crf ${target.crf}`,
          target.maxrateKbps ? `حد ${Math.round(target.maxrateKbps / 1000)} Mbps` : null, `جودة ${w(state.options.quality)}`, 'faststart'],
        [target.codec === 'hevc' ? 'HEVC' : 'H.264 High', `crf ${target.crf}`,
          target.maxrateKbps ? `cap ${Math.round(target.maxrateKbps / 1000)} Mbps` : null, `${w(state.options.quality)} quality`, 'faststart'],
      ),
    },
  ];
}

function renderChain() {
  const job = activeJob();
  // While a job is running or finished, show what FFmpeg was actually told to do.
  const modules = job?.plan?.modules?.length ? job.plan.modules : describeChain();
  const wrap = $('chainModules');
  wrap.textContent = '';

  for (const mod of modules) {
    const button = el('button', `mod ${mod.active ? 'is-on' : 'is-off'}`);
    button.type = 'button';
    button.setAttribute('aria-expanded', String(state.openModule === mod.id));
    const top = el('div', 'mod__top');
    top.append(el('span', 'mod__lamp'));
    top.append(el('span', 'mod__name', L(mod.label)));
    button.append(top);
    button.append(el('div', 'mod__detail', L(mod.detail) || '—'));
    button.addEventListener('click', () => {
      state.openModule = state.openModule === mod.id ? null : mod.id;
      renderChain();
      renderInspector();
    });
    wrap.append(button);
  }
}

// ───────────────────────── inspector ─────────────────────────
const seg = (key, choices) => ({ type: 'seg', key, choices });

const CONTROLS = {
  intake: {
    title: ['الاستقبال', 'Intake'],
    fields: [
      { type: 'toggle', key: 'autoCrop', label: ['اقصص الأشرطة السوداء المدمجة', 'Crop baked-in black bars'],
        hint: ['المنصّة تُنفق بِت‑ريت على ترميز مساحة سوداء ثم تضيف أشرطتها فوقها.', 'The platform spends bitrate encoding black, then adds its own bars on top.'] },
      { type: 'range', key: 'trimStart', min: 0, max: 86400, step: 0.1, label: ['بداية القص (ثوانٍ)', 'Trim start (seconds)'],
        hint: ['اقطع بداية الفيديو بالثانية.', 'Cut the start of the video by seconds.'], format: (v) => `${fmtClock(v)}` },
      { type: 'range', key: 'trimEnd', min: 0, max: 86400, step: 0.1, label: ['نهاية القص (ثوانٍ)', 'Trim end (seconds)'],
        hint: ['اقطع نهاية الفيديو بالثانية.', 'Cut the end of the video by seconds.'], format: (v) => `−${fmtClock(v)}` },
      { ...seg('fpsMode', ['source', 'preset', 'interpolate60', 'interpolate120', 'interpolate240']), label: ['معدّل الإطارات', 'Frame rate'],
        hint: ['الناتج ثابت المعدّل دائماً. الاستيفاء يولّد إطارات وسطى، وهو بطيء.', 'The output is always constant-rate. Interpolation invents intermediate frames: it is slow.'] },
      { ...seg('deinterlace', ['auto', 'off']), label: ['إزالة التشابك', 'Deinterlace'],
        hint: ['لازمة لملفات الكاميرات والتلفزيون القديمة فقط.', 'Only needed for older camera and broadcast files.'] },
    ],
  },
  clean: {
    title: ['التنظيف', 'Cleanup'],
    fields: [
      { ...seg('denoise', ['off', 'light', 'strong', 'nlmeans']), label: ['تنظيف الضجيج وتكتلات الضغط', 'Noise and blocking cleanup'],
        hint: ['التنظيف يمنح المُرمّز صورة أسهل، فينفق بِت‑ريت على التفاصيل لا على الضجيج. المبالغة فيه تُذيب التفاصيل.', 'Cleanup gives the encoder an easier picture, so bitrate goes to detail instead of noise. Too much of it melts detail away.'] },
      { ...seg('advancedDenoise', ['off', 'light', 'medium', 'strong']), label: ['تنظيف متقدم', 'Advanced denoise'],
        hint: ['إزالة ضوضاء متقدمة باستخدام خوارزمية Vague Denoiser. أبطأ لكن أفضل للمصادر الضعيفة.', 'Advanced noise removal using Vague Denoiser algorithm. Slower but better for weak sources.'] },
      { type: 'toggle', key: 'deband', label: ['إزالة التحزّم', 'Remove banding'],
        hint: ['للتدرّجات المتكسّرة في السماء والخلفيات الداكنة.', 'For stepped gradients in skies and dark backgrounds.'] },
    ],
  },
  geometry: {
    title: ['الإطار', 'Framing'],
    fields: [
      { ...seg('fit', ['blur', 'crop', 'pad', 'stretch']), label: ['طريقة ملء الإطار', 'How to fill the frame'],
        hint: ['الخلفية الضبابية تحفظ الصورة كاملة وتملأ الشاشة. القصّ يفقد أطراف الإطار. التمديد يشوّه النِسَب ولا يُنصح به.', 'A blurred backdrop keeps the whole picture and still fills the screen. Cropping loses the edges. Stretching distorts and is not recommended.'] },
      { type: 'color', key: 'padColor', label: ['لون الأشرطة', 'Bar colour'], showIf: () => getOpt('fit') === 'pad' },
      { type: 'toggle', key: 'upscale', label: ['اسمح بالتكبير فوق دقّة المصدر', 'Allow upscaling above the source'],
        hint: ['التكبير لا يخلق تفاصيل، لكن الرفع بدقّة أعلى يمنح ملفك ترميزاً أفضل من المنصّة.', 'Upscaling invents no detail, but uploading at a higher resolution earns your file a better encode from the platform.'] },
    ],
  },
  detail: {
    title: ['التفاصيل', 'Detail'],
    fields: [
      { ...seg('sharpen', ['off', 'light', 'medium', 'strong']), label: ['التوضيح', 'Sharpening'],
        hint: ['يقاوم التلْيين الذي يُحدثه التكبير وإعادة ضغط المنصّة. الإفراط فيه يُنتج هالات حول الحواف.', 'Offsets the softening from upscaling and the platform re-encode. Too much produces halos around edges.'] },
    ],
  },
  color: {
    title: ['اللون', 'Colour'],
    fields: [
      { ...seg('colorBoost', ['off', 'auto', 'vivid', 'colorbalance', 'vibrance']), label: ['التباين والتشبّع', 'Contrast and saturation'],
        hint: ['رفع خفيف يساعد الصورة أن تصمد بعد ضغط المنصّة. لا ترفعه إذا كان الفيديو مصحّحاً لونياً أصلاً.', 'A gentle lift helps the picture survive the platform pass. Skip it if the video is already colour-graded.'] },
      { type: 'toggle', key: 'tonemapHdr', label: ['حوّل HDR إلى SDR موسومة', 'Tone-map HDR to tagged SDR'],
        hint: ['هذا سبب المنظر الباهت الذي يظهر بعد رفع فيديو آيفون. التحويل هنا أفضل بكثير من تحويل المنصّة التلقائي.', 'This is the cause of the washed-out look after uploading iPhone video. Converting here beats the platform doing it automatically.'] },
      { ...seg('vignette', ['off', 'subtle', 'medium', 'strong']), label: ['تظليل الحواف', 'Vignette'],
        hint: ['يعتم الحواف ليركز النظر على الوسط.', 'Darkens edges to draw focus to the centre.'] },
    ],
  },
  motion: {
    title: ['الحركة', 'Motion'],
    fields: [
      { type: 'range', key: 'shutter', min: 0, max: 360, step: 90, label: ['ضبابية الحركة', 'Motion blur'],
        hint: ['زاوية غالق صناعية لتلطيف الحركة. يتطلب استيفاء الإطارات.', 'Synthetic shutter angle to smooth motion. Requires frame interpolation.'], format: (v) => v === 0 ? 'Off' : `${v}°` },
      { ...seg('deshake', ['off', 'light', 'medium', 'strong']), label: ['تثبيت الفيديو', 'Video stabilization'],
        hint: ['يقلل من اهتزاز الكاميرا في الفيديو.', 'Reduces camera shake in the video.'] },
    ],
  },
  sound: {
    title: ['الصوت', 'Sound'],
    fields: [
      { ...seg('loudness', ['off', 'onePass', 'twoPass']), label: ['معايرة المستوى', 'Loudness normalisation'],
        hint: ['المرحلتان تقيسان الملف كاملاً ثم تطبّقان ربحاً ثابتاً، فلا يتنفّس المستوى داخل المقطع. المرحلة الواحدة أسرع وأقل دقّة.', 'Two passes measure the whole file, then apply a fixed gain, so the level does not breathe within the clip. One pass is faster and less accurate.'] },
      { type: 'toggle', key: 'forceStereo', label: ['أخرِج ستيريو 48 kHz', 'Output stereo at 48 kHz'],
        hint: ['الصوت المونو يُشغَّل من سمّاعة واحدة في بعض المشغّلات.', 'Mono plays from one earbud in some players.'] },
    ],
  },
  advanced: {
    title: ['متقدم', 'Advanced'],
    fields: [
      { type: 'toggle', key: 'autoTrim', label: ['قص تلقائي للصمت', 'Auto-trim silence'],
        hint: ['يزيل الأجزاء الصامتة تلقائياً من البداية والنهاية.', 'Automatically removes silent parts from start and end.'] },
      { type: 'toggle', key: 'sceneDetection', label: ['كشف المشاهد', 'Scene detection'],
        hint: ['يقسم الفيديو تلقائياً عند تغيّر المشهد.', 'Automatically splits video at scene changes.'] },
      { ...seg('watermark', ['off', 'light', 'medium', 'strong']), label: ['إزالة الشعار', 'Remove watermark'],
        hint: ['يزيل العلامات المائية والشعارات من الفيديو.', 'Removes watermarks and logos from the video.'] },
    ],
  },
  encode: {
    title: ['الترميز', 'Encode'],
    fields: [
      { ...seg('codec', ['preset', 'h264', 'hevc', 'prores']), label: ['الترميز', 'Codec'],
        hint: ['H.264 هو ما تتوقّعه كل المنصّات. HEVC أصغر حجماً لكن دعم رفعه غير مضمون. ProRes للأرشيف فقط.', 'H.264 is what every platform expects. HEVC is smaller but upload support is not guaranteed. ProRes for archive only.'] },
      { ...seg('quality', ['balanced', 'high', 'max']), label: ['الجودة مقابل الوقت', 'Quality versus time'],
        hint: ['«أقصى» يُنتج ملفاً أفضل قليلاً ويستغرق وقتاً أطول بكثير.', '"Max" produces a slightly better file and takes considerably longer.'] },
      { type: 'toggle', key: 'hwAccel', label: ['استخدم مُرمّز العتاد', 'Use the hardware encoder'],
        hint: ['أسرع بكثير وجودته أقل عند نفس الحجم. مناسب للمسوّدات لا للنسخة النهائية.', 'Much faster and lower quality at the same size. Good for drafts, not for the final file.'],
        showIf: () => !!state.meta?.engine?.hwEncoder },
      { type: 'toggle', key: 'stripMetadata', label: ['امسح بيانات الملف الوصفية', 'Strip file metadata'],
        hint: ['يزيل الموقع الجغرافي ونوع الجهاز وبيانات التطبيق من الملف.', 'Removes GPS location, device model and app data from the file.'] },
    ],
  },
};

function buildField(field) {
  if (field.showIf && !field.showIf()) return null;
  const wrap = el('div', 'field');
  wrap.append(el('span', 'field__label', field.label[lang === 'ar' ? 0 : 1]));

  if (field.type === 'seg') {
    const group = el('div', 'seg');
    for (const choice of field.choices) {
      const button = el('button', null, w(choice));
      button.type = 'button';
      button.setAttribute('aria-pressed', String(getOpt(field.key) === choice));
      button.addEventListener('click', () => { setOpt(field.key, choice); renderInspector(); });
      group.append(button);
    }
    wrap.append(group);
  } else if (field.type === 'toggle') {
    const label = el('label', 'switch');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = !!getOpt(field.key);
    input.addEventListener('change', () => { setOpt(field.key, input.checked); renderInspector(); });
    label.append(input, el('span', null, lang === 'ar' ? (input.checked ? 'مفعّل' : 'معطّل') : (input.checked ? 'on' : 'off')));
    wrap.append(label);
  } else if (field.type === 'color') {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = getOpt(field.key) || '#000000';
    input.addEventListener('input', () => setOpt(field.key, input.value));
    wrap.append(input);
  } else if (field.type === 'range') {
    const row = el('div', 'slider');
    const input = document.createElement('input');
    input.type = 'range';
    input.dataset.key = field.key;
    input.min = field.min;
    input.max = field.max;
    input.step = field.step;
    input.value = getOpt(field.key);
    const out = el('output', 'mono', field.format(Number(input.value)));
    input.addEventListener('input', () => {
      out.textContent = field.format(Number(input.value));
      setOpt(field.key, Number(input.value));
    });
    row.append(input, out);
    wrap.append(row);
  }

  if (field.hint) wrap.append(el('p', 'field__hint', field.hint[lang === 'ar' ? 0 : 1]));
  return wrap;
}

function renderInspector() {
  const panel = $('inspector');
  const spec = state.openModule ? CONTROLS[state.openModule] : null;
  if (!spec || !state.options) { panel.hidden = true; return; }

  panel.hidden = false;
  $('inspectorTitle').textContent = spec.title[lang === 'ar' ? 0 : 1];
  const body = $('inspectorBody');
  body.textContent = '';
  for (const field of spec.fields) {
    const node = buildField(field);
    if (node) body.append(node);
  }

  const duration = state.upload?.analysis?.container?.duration || 0;
  for (const input of body.querySelectorAll('input[type=range]')) {
    const key = input.dataset.key;
    if (key === 'trimStart' || key === 'trimEnd') {
      input.max = String(Math.ceil(duration));
      const out = input.nextElementSibling;
      if (out && out.tagName === 'OUTPUT') {
        out.textContent = fieldFormat(key, Number(input.value));
      }
    }
  }
}

function fieldFormat(key, value) {
  if (key === 'trimStart' || key === 'trimEnd') return fmtClock(value);
  return String(value);
}

// ───────────────────────── repurposing ─────────────────────────
function renderReuse() {
  const body = $('reuseBody');
  body.textContent = '';
  if (!state.options) return;

  body.append(el('p', 'notice', t('reuseNote')));

  const enable = el('label', 'switch');
  const toggle = document.createElement('input');
  toggle.type = 'checkbox';
  toggle.checked = !!getOpt('variation.enabled');
  toggle.addEventListener('change', () => { setOpt('variation.enabled', toggle.checked); renderReuse(); });
  enable.append(toggle, el('span', null, t('reuseEnable')));
  body.append(enable);

  const grid = el('div', 'reuse__grid');
  const fields = [
    { type: 'toggle', key: 'variation.mirror', label: [t('reuseMirror'), t('reuseMirror')], hint: [t('reuseMirrorHint'), t('reuseMirrorHint')] },
    { type: 'range', key: 'variation.zoom', min: 1, max: 1.1, step: 0.01, label: [t('reuseZoom'), t('reuseZoom')], hint: [t('reuseZoomHint'), t('reuseZoomHint')], format: (v) => `×${v.toFixed(2)}` },
    { type: 'range', key: 'variation.speed', min: 0.94, max: 1.06, step: 0.01, label: [t('reuseSpeed'), t('reuseSpeed')], hint: [t('reuseSpeedHint'), t('reuseSpeedHint')], format: (v) => `×${v.toFixed(2)}` },
  ];
  for (const field of fields) {
    const node = buildField(field);
    if (node) grid.append(node);
  }
  body.append(grid);
  body.classList.toggle('is-locked', !toggle.checked);
}

// ───────────────────────── reasons + launch ─────────────────────────
function renderReasons() {
  const list = $('reasonsList');
  list.textContent = '';
  for (const reason of state.reasons) list.append(el('li', null, L(reason)));
  $('reasonsBox').hidden = state.reasons.length === 0;
}

function renderTargetSummary() {
  const target = activeJob()?.plan?.target || resolveTarget();
  if (!target) return;
  const parts = [
    `${t('targetLine')}: ${target.width}×${target.height}`,
    `${target.fps} fps`,
    target.codec === 'hevc' ? 'HEVC' : target.codec === 'prores' ? 'ProRes' : 'H.264',
    `crf ${target.crf}`,
    target.lufs ? `${target.lufs} LUFS` : null,
    (target.trimStart || target.trimEnd) ? `trim ${fmtClock(target.trimStart)} → ${fmtClock((state.upload?.analysis?.container?.duration || 0) - target.trimEnd)}` : null,
  ];
  $('targetSummary').textContent = parts.filter(Boolean).join(' · ');
  $('slowWarning').textContent = target.slow ? t('slowNotice') : '';
}

async function startJob() {
  if (!state.upload || !state.options) return;
  const button = $('startBtn');
  button.disabled = true;
  try {
    const { job } = await api('POST', '/api/jobs', {
      uploadId: state.upload.id,
      presetId: state.presetId,
      options: state.options,
    });
    state.jobs.set(job.id, job);
    state.activeJobId = job.id;
    $('runSection').hidden = false;
    $('resultSection').hidden = true;
    renderAll();
    $('runSection').scrollIntoView({ behavior: 'smooth', block: 'center' });
    toast(t('jobStarted'));
  } catch (err) {
    toast(err.message, true);
  } finally {
    button.disabled = false;
  }
}

// ───────────────────────── progress ─────────────────────────
const STAGES = [
  ['measure', 'stageMeasure'],
  ['encode', 'stageEncode'],
  ['verify', 'stageVerify'],
];

function renderRun() {
  const job = activeJob();
  if (!job) return;
  const progress = job.progress || {};
  const running = job.status === 'running' || job.status === 'queued' || job.status === 'cancelling';

  $('runSection').hidden = !running;
  $('chain').classList.toggle('is-running', job.status === 'running');
  $('chainSweep').style.width = `${progress.percent || 0}%`;

  const stages = $('runStages');
  stages.textContent = '';
  const currentIndex = STAGES.findIndex(([id]) => id === progress.stage);
  STAGES.forEach(([id, key], index) => {
    const node = el('div', 'stage');
    if (index === currentIndex) node.classList.add('is-active');
    if (currentIndex > index || progress.stage === 'done') node.classList.add('is-done');
    node.append(el('span', 'stage__dot'));
    node.append(el('span', null, t(key)));
    stages.append(node);
  });

  $('runBar').style.width = `${progress.percent || 0}%`;

  const meters = [
    [t('meterPos'), progress.totalSeconds ? `${fmtClock(progress.outTime)} / ${fmtClock(progress.totalSeconds)}` : fmtClock(progress.outTime)],
    [t('meterSpeed'), progress.speed ? `×${fmtNum(progress.speed, 2)}` : '—'],
    [t('meterFps'), progress.fps ? Math.round(progress.fps) : '—'],
    [t('meterEta'), progress.etaSeconds != null ? fmtClock(progress.etaSeconds) : '—'],
    [t('meterSize'), progress.bytes ? fmtBytes(progress.bytes) : '—'],
  ];
  const box = $('runMeters');
  box.textContent = '';
  for (const [label, value] of meters) {
    const span = el('span');
    span.append(document.createTextNode(`${label} `));
    span.append(el('b', null, String(value)));
    box.append(span);
  }
}

// ───────────────────────── result ─────────────────────────
const DELTA_ROWS = [
  { name: ['الدقة', 'Resolution'], get: (a) => `${a.video.width}×${a.video.height}` },
  { name: ['نسبة الأبعاد', 'Aspect ratio'], get: (a) => a.video.aspect || '—' },
  { name: ['كثافة البيانات', 'Data density'], get: (a) => (a.video.bitsPerPixel != null ? `${a.video.bitsPerPixel} bpp` : '—') },
  { name: ['البِت‑ريت', 'Bitrate'], get: (a) => (a.video.bitrateKbps ? `${fmtNum(a.video.bitrateKbps / 1000, 1)} Mbps` : '—') },
  { name: ['الترميز', 'Codec'], get: (a) => [a.video.codec, a.video.profile, a.video.level ? `L${a.video.level}` : null].filter(Boolean).join(' ') },
  { name: ['تنسيق البكسل', 'Pixel format'], get: (a) => a.video.pixFmt || '—' },
  { name: ['وسوم اللون', 'Colour tags'], get: (a) => (a.video.hdr ? `HDR ${a.video.colorTransfer || ''}`.trim() : (a.video.colorPrimaries || '—')) },
  { name: ['معدّل الإطارات', 'Frame rate'], get: (a) => `${a.video.fps} ${a.video.vfr ? 'VFR' : 'CFR'}` },
  { name: ['الصوت', 'Audio'], get: (a) => (a.audio.present
    ? `${a.audio.channelLayout || `${a.audio.channels}ch`} · ${a.audio.sampleRate ? `${a.audio.sampleRate / 1000} kHz` : '—'}`
    : '—') },
  { name: ['مستوى الصوت', 'Loudness'], get: (a) => (a.audio.lufs != null ? `${fmtNum(a.audio.lufs, 1)} LUFS` : '—') },
  { name: ['التشغيل الفوري', 'Instant playback'], get: (a) => (a.container.fastStartApplicable ? (a.container.fastStart ? 'faststart' : 'moov at end') : '—') },
  { name: ['المدّة', 'Duration'], get: (a) => fmtClock(a.container.duration) },
  { name: ['حجم الملف', 'File size'], get: (a) => fmtBytes(a.sizeBytes) },
];

function renderResult() {
  const job = activeJob();
  const done = job && job.status === 'done' && job.after;
  $('resultSection').hidden = !done;
  if (!done) return;

  $('beforeScore').textContent = job.before.score;
  $('afterScore').textContent = job.afterScore.score;

  const d = job.delta || {};
  const pieces = [];
  pieces.push(`${t('scoreRose')} ${job.before.score} ${t('scoreTo')} ${job.afterScore.score}`);
  if (d.pixelsAfter && d.pixelsBefore && d.pixelsAfter !== d.pixelsBefore) {
    pieces.push(lang === 'ar'
      ? `عدد البكسلات ×${fmtNum(d.pixelsAfter / d.pixelsBefore, 2)}`
      : `${fmtNum(d.pixelsAfter / d.pixelsBefore, 2)}× the pixels`);
  }
  if (d.bppAfter && d.bppBefore) {
    pieces.push(lang === 'ar'
      ? `كثافة البيانات ×${fmtNum(d.bppAfter / d.bppBefore, 2)}`
      : `${fmtNum(d.bppAfter / d.bppBefore, 2)}× the data density`);
  }
  if (d.lufsAfter != null) {
    pieces.push(lang === 'ar' ? `الصوت عند ${fmtNum(d.lufsAfter, 1)} LUFS` : `audio at ${fmtNum(d.lufsAfter, 1)} LUFS`);
  }
  pieces.push(lang === 'ar'
    ? `الحجم ${fmtBytes(d.sizeAfter)} بدل ${fmtBytes(d.sizeBefore)}`
    : `${fmtBytes(d.sizeAfter)} instead of ${fmtBytes(d.sizeBefore)}`);
  $('verdictText').textContent = `${pieces.join(lang === 'ar' ? '، ' : ', ')}.`;

  const body = $('deltaBody');
  body.textContent = '';
  for (const row of DELTA_ROWS) {
    let beforeValue = '—';
    let afterValue = '—';
    try { beforeValue = row.get(job.analysis); } catch { /* missing field */ }
    try { afterValue = row.get(job.after); } catch { /* missing field */ }
    const tr = document.createElement('tr');
    if (beforeValue === afterValue) tr.className = 'is-same';
    tr.append(el('td', null, row.name[lang === 'ar' ? 0 : 1]));
    tr.append(el('td', null, beforeValue));
    tr.append(el('td', null, afterValue));
    body.append(tr);
  }

  $('graphText').textContent = job.plan?.filterGraph || '';
  $('argvText').textContent = (job.plan?.argv || [])
    .map((arg) => (/[\s;'"\\[\]]/.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg))
    .join(' ');

  $('downloadLink').href = `/api/jobs/${job.id}/download`;
  $('reportLink').href = `/api/jobs/${job.id}/report`;

  setupPreview(job);
}

// ───────── before/after wipe ─────────
const preview = { jobId: null, master: null, slave: null, split: 50, dragging: false };

function stopPreview() {
  for (const video of [$('videoBefore'), $('videoAfter')]) {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
  preview.jobId = null;
}

function setSplit(percent) {
  preview.split = Math.min(100, Math.max(0, percent));
  $('compareStage').style.setProperty('--split', `${preview.split}%`);
  $('compareHandle').setAttribute('aria-valuenow', String(Math.round(preview.split)));
}

function setupPreview(job) {
  if (preview.jobId === job.id) return;
  preview.jobId = job.id;

  const before = $('videoBefore');
  const after = $('videoAfter');
  const compare = $('compare');
  compare.classList.remove('is-single');

  after.src = `/api/jobs/${job.id}/output`;
  after.poster = `/api/jobs/${job.id}/poster`;
  before.src = `/api/uploads/${job.uploadId}/source`;
  before.poster = `/api/uploads/${job.uploadId}/poster`;
  after.muted = true;
  before.muted = true;

  preview.master = after;
  preview.slave = before;
  setSplit(50);

  // Some source containers and codecs simply will not decode in a browser.
  before.addEventListener('error', () => {
    compare.classList.add('is-single');
    $('compareNoteExtra')?.remove();
    const note = el('p', 'compare__note dim', t('sourceUnplayable'));
    note.id = 'compareNoteExtra';
    compare.append(note);
  }, { once: true });

  $('playBtn').textContent = t('play');
  $('muteBtn').textContent = t('unmute');
}

function bindPreviewControls() {
  const stage = $('compareStage');
  const handle = $('compareHandle');

  const positionFrom = (clientX) => {
    const rect = stage.getBoundingClientRect();
    setSplit(((clientX - rect.left) / rect.width) * 100);
  };

  stage.addEventListener('pointerdown', (event) => {
    if ($('compare').classList.contains('is-single')) return;
    preview.dragging = true;
    stage.setPointerCapture(event.pointerId);
    positionFrom(event.clientX);
  });
  stage.addEventListener('pointermove', (event) => {
    if (preview.dragging) positionFrom(event.clientX);
  });
  stage.addEventListener('pointerup', () => { preview.dragging = false; });
  stage.addEventListener('pointercancel', () => { preview.dragging = false; });

  handle.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 10 : 2;
    if (event.key === 'ArrowLeft') { setSplit(preview.split - step); event.preventDefault(); }
    if (event.key === 'ArrowRight') { setSplit(preview.split + step); event.preventDefault(); }
  });

  $('playBtn').addEventListener('click', async () => {
    const master = preview.master;
    const slave = preview.slave;
    if (!master) return;
    if (master.paused) {
      try { await master.play(); } catch { /* autoplay refusal */ }
      slave?.play().catch(() => {});
      $('playBtn').textContent = t('pause');
    } else {
      master.pause();
      slave?.pause();
      $('playBtn').textContent = t('play');
    }
  });

  $('muteBtn').addEventListener('click', () => {
    const master = preview.master;
    if (!master) return;
    master.muted = !master.muted;
    $('muteBtn').textContent = master.muted ? t('unmute') : t('mute');
  });

  $('videoAfter').addEventListener('timeupdate', () => {
    const master = $('videoAfter');
    const slave = $('videoBefore');
    if (master.duration) {
      $('scrub').value = String(Math.round((master.currentTime / master.duration) * 1000));
      $('scrubTime').textContent = `${fmtClock(master.currentTime)} / ${fmtClock(master.duration)}`;
    }
    // Keep the two layers aligned without fighting the decoder every frame.
    if (slave.readyState > 1 && Math.abs(slave.currentTime - master.currentTime) > 0.25) {
      slave.currentTime = master.currentTime;
    }
  });

  $('videoAfter').addEventListener('ended', () => { $('playBtn').textContent = t('play'); });

  $('scrub').addEventListener('input', () => {
    const master = $('videoAfter');
    if (!master.duration) return;
    const time = (Number($('scrub').value) / 1000) * master.duration;
    master.currentTime = time;
    const slave = $('videoBefore');
    if (slave.readyState > 1) slave.currentTime = time;
  });
}

// ───────────────────────── queue ─────────────────────────
const STATUS_KEY = {
  queued: 'queued', running: 'stRunning', done: 'stDone',
  error: 'stError', cancelled: 'stCancelled', cancelling: 'stCancelling',
};

function renderQueue() {
  const list = $('queueList');
  const jobs = [...state.jobs.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  $('queueSection').hidden = jobs.length === 0;
  list.textContent = '';

  for (const job of jobs.slice(0, 10)) {
    const row = el('li', 'qrow');
    row.append(el('span', 'qrow__name', job.sourceName));
    row.append(el('span', 'qrow__meta', [
      L(job.presetLabel),
      job.status === 'running' ? `${Math.round(job.progress?.percent || 0)}%` : null,
      job.status === 'done' && job.afterScore ? `${job.before.score} → ${job.afterScore.score}` : null,
      job.durationMs ? fmtClock(job.durationMs / 1000) : null,
    ].filter(Boolean).join(' · ')));

    const badge = el('span', 'qrow__state', t(STATUS_KEY[job.status] || job.status));
    badge.dataset.state = job.status;
    row.append(badge);

    const actions = el('div', 'qrow__actions');
    if (job.status === 'done') {
      const open = el('button', 'ghost', t('saveFile'));
      open.type = 'button';
      open.addEventListener('click', () => {
        state.activeJobId = job.id;
        renderAll();
        $('resultSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      actions.append(open);
    }
    if (job.status === 'running' || job.status === 'queued') {
      const stop = el('button', 'ghost', t('cancel'));
      stop.type = 'button';
      stop.addEventListener('click', () => api('POST', `/api/jobs/${job.id}/cancel`).catch((e) => toast(e.message, true)));
      actions.append(stop);
    } else {
      const remove = el('button', 'ghost', t('remove'));
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        try {
          await api('DELETE', `/api/jobs/${job.id}`);
          state.jobs.delete(job.id);
          if (state.activeJobId === job.id) { state.activeJobId = null; stopPreview(); }
          renderAll();
        } catch (e) { toast(e.message, true); }
      });
      actions.append(remove);
    }
    row.append(actions);

    if (job.error?.message) {
      row.append(el('div', 'qrow__error', [job.error.message, job.error.detail].filter(Boolean).join('\n')));
    }
    list.append(row);
  }
}

// ───────────────────────── render ─────────────────────────
function renderAll() {
  if (state.options) {
    renderReport();
    renderPresets();
    renderChain();
    renderInspector();
    renderReuse();
    renderReasons();
    renderTargetSummary();
  }
  renderRun();
  renderResult();
  renderQueue();
}

// ───────────────────────── live events ─────────────────────────
function connectEvents() {
  const source = new EventSource('/api/events');
  source.addEventListener('message', (event) => {
    let payload;
    try { payload = JSON.parse(event.data); } catch { return; }

    if (payload.type === 'hello') {
      for (const job of payload.jobs || []) state.jobs.set(job.id, job);
      const running = (payload.jobs || []).find((j) => j.status === 'running' || j.status === 'queued');
      if (running && !state.activeJobId) state.activeJobId = running.id;
      renderAll();
      return;
    }

    if (payload.type === 'job:progress') {
      const job = state.jobs.get(payload.jobId);
      if (!job) return;
      job.progress = payload.progress;
      if (payload.jobId === state.activeJobId) renderRun();
      renderQueue();
      return;
    }

    if (payload.type === 'job:deleted') {
      state.jobs.delete(payload.jobId);
      if (state.activeJobId === payload.jobId) { state.activeJobId = null; stopPreview(); }
      renderAll();
      return;
    }

    if (payload.job) {
      const previous = state.jobs.get(payload.jobId);
      state.jobs.set(payload.jobId, payload.job);
      if (payload.jobId === state.activeJobId && previous?.status !== payload.job.status) {
        if (payload.job.status === 'done') toast(t('jobDone'));
        if (payload.job.status === 'error') toast(`${t('jobFailed')} ${payload.job.error?.message || ''}`, true);
        if (payload.job.status === 'cancelled') toast(t('cancelled'));
      }
      renderAll();
    }
  });
  source.addEventListener('error', () => { /* EventSource retries on its own */ });
}

// ───────────────────────── boot ─────────────────────────
function bindIntake() {
  const input = $('fileInput');
  dropzone.addEventListener('click', (event) => {
    if (event.target.closest('button') === $('browseBtn') || event.target === dropzone || dropzone.contains(event.target)) {
      if (!state.busy) input.click();
    }
  });
  dropzone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); input.click(); }
  });
  input.addEventListener('change', () => { if (input.files[0]) handleFile(input.files[0]); });

  for (const type of ['dragenter', 'dragover']) {
    dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.add('is-hot'); });
  }
  for (const type of ['dragleave', 'drop']) {
    dropzone.addEventListener(type, (event) => { event.preventDefault(); dropzone.classList.remove('is-hot'); });
  }
  dropzone.addEventListener('drop', (event) => {
    const file = event.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
  // Dropping anywhere else should not navigate away from the page.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());
}

// ───────────────────────── license UI ─────────────────────────
async function checkLicenseOnBoot() {
  try {
    const { checkLicense, hasFeature } = await import('../src/license.js');
    const result = await checkLicense();
    state.license = result;
    if (result.valid) {
      state.licenseFeatures = result.features || ['encode', 'presets', 'batch'];
    }
    updateLicenseUI();
  } catch (err) {
    console.warn('License check failed:', err);
    state.license = { valid: false, reason: 'error' };
  }
}

function updateLicenseUI() {
  const badge = $('licenseBadge');
  if (!badge) return;
  
  if (!state.license) {
    badge.textContent = t('licenseOffline');
    badge.className = 'badge badge--offline';
    return;
  }
  
  if (state.license.valid) {
    badge.textContent = `${t('licenseValid')} ${state.license.method === 'cached' ? `(${t('licenseOffline')})` : ''}`;
    badge.className = 'badge badge--valid';
    if (state.license.features) {
      badge.title = `${t('licenseFeatures')}: ${state.license.features.join(', ')}`;
    }
  } else {
    badge.textContent = t('licenseInvalid');
    badge.className = 'badge badge--invalid';
  }
}

async function openLicenseModal() {
  const modal = $('licenseModal');
  if (!modal) return createLicenseModal();
  
  $('licenseEmail').value = state.license?.email || '';
  $('licenseKey').value = '';
  modal.hidden = false;
  modal.showModal();
}

function closeLicenseModal() {
  const modal = $('licenseModal');
  if (modal) modal.close();
}

async function activateLicenseFromModal() {
  const email = $('licenseEmail').value.trim();
  const key = $('licenseKey').value.trim();
  
  if (!email || !key) {
    toast('Email and license key required', true);
    return;
  }
  
  try {
    const { activateLicense } = await import('../src/license.js');
    const result = await activateLicense(key, email);
    
    if (result.success) {
      state.license = result.license;
      state.licenseFeatures = result.license.features || ['encode', 'presets', 'batch'];
      updateLicenseUI();
      closeLicenseModal();
      toast(t('licenseValid'));
    } else {
      toast(`${t('licenseInvalid')}: ${result.error}`, true);
    }
  } catch (err) {
    toast(`Error: ${err.message}`, true);
  }
}

function createLicenseModal() {
  const modal = el('dialog', 'modal', '');
  modal.id = 'licenseModal';
  modal.innerHTML = `
    <form method="dialog">
      <h3 data-i18n="licenseActivate">${t('licenseActivate')}</h3>
      <p class="dim">${t('licenseManage')}</p>
      <div class="field">
        <label data-i18n="licenseEmail">${t('licenseEmail')}</label>
        <input type="email" id="licenseEmail" required placeholder="you@example.com">
      </div>
      <div class="field">
        <label data-i18n="licenseKey">${t('licenseKey')}</label>
        <input type="text" id="licenseKey" required placeholder="MB-XXXX-XXXX-XXXX-XXXX">
      </div>
      <div class="modal__actions">
        <button type="button" class="ghost" onclick="closeLicenseModal()">${t('cancel')}</button>
        <button type="button" id="licenseSubmit" class="primary">${t('licenseActivate')}</button>
      </div>
    </form>
  `;
  document.body.append(modal);
  
  $('licenseSubmit').addEventListener('click', activateLicenseFromModal);
  modal.addEventListener('close', () => modal.hidden = true);
  
  openLicenseModal();
}

// ───────────────────────── integrity UI ─────────────────────────
async function runIntegrityCheck() {
  const badge = $('integrityBadge');
  if (badge) {
    badge.textContent = t('integrityChecking');
    badge.className = 'badge badge--checking';
  }
  
  try {
    const { verifyIntegrity } = await import('../src/anti-tamper.js');
    const result = await verifyIntegrity();
    state.integrityStatus = result;
    
    if (badge) {
      if (result.valid) {
        badge.textContent = t('integrityPassed');
        badge.className = 'badge badge--valid';
      } else {
        badge.textContent = t('integrityFailed');
        badge.className = 'badge badge--invalid';
        if (result.violations) {
          console.error('Integrity violations:', result.violations);
          toast(`${t('integrityFailed')}: ${result.violations.length} file(s)`, true);
        }
      }
    }
  } catch (err) {
    console.error('Integrity check error:', err);
    if (badge) {
      badge.textContent = 'Error';
      badge.className = 'badge badge--invalid';
    }
  }
}

// ───────────────────────── filter preview ─────────────────────────
async function generateFilterPreview(moduleId) {
  if (!state.upload || !state.options) return;
  
  const previewBtn = $(`preview-${moduleId}`);
  if (previewBtn) {
    previewBtn.textContent = t('previewGenerating');
    previewBtn.disabled = true;
  }
  
  try {
    const cacheKey = `${state.upload.id}:${moduleId}:${JSON.stringify(state.options)}`;
    if (state.previewCache.has(cacheKey)) {
      showPreview(state.previewCache.get(cacheKey));
      return;
    }
    
    const response = await fetch(`/api/preview/${moduleId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadId: state.upload.id,
        options: state.options,
        presetId: state.presetId,
      }),
    });
    
    if (!response.ok) throw new Error('Preview failed');
    
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    state.previewCache.set(cacheKey, url);
    showPreview(url);
    
    if (previewBtn) {
      previewBtn.textContent = t('previewReady');
      setTimeout(() => { previewBtn.textContent = '👁 Preview'; previewBtn.disabled = false; }, 2000);
    }
  } catch (err) {
    toast(`${t('previewFailed')}: ${err.message}`, true);
    if (previewBtn) {
      previewBtn.textContent = '👁 Preview';
      previewBtn.disabled = false;
    }
  }
}

function showPreview(url) {
  // Create or show preview modal with video element
  let modal = $('previewModal');
  if (!modal) {
    modal = el('dialog', 'modal preview-modal');
    modal.id = 'previewModal';
    modal.innerHTML = `
      <video id="previewVideo" controls muted playsinline style="max-width:100%;max-height:70vh"></video>
      <div class="modal__actions">
        <button type="button" onclick="closePreviewModal()">${t('cancel')}</button>
      </div>
    `;
    document.body.append(modal);
  }
  
  $('previewVideo').src = url;
  modal.hidden = false;
  modal.showModal();
}

function closePreviewModal() {
  const modal = $('previewModal');
  if (modal) {
    modal.close();
    modal.hidden = true;
    const video = $('previewVideo');
    if (video) { video.pause(); video.src = ''; }
  }
}

// ───────────────────────── export format ─────────────────────────
function setExportFormat(format) {
  state.exportFormat = format;
  renderExportFormatSelector();
}

function renderExportFormatSelector() {
  const container = $('exportFormatSelector');
  if (!container) return;
  
  container.innerHTML = '';
  const formats = [
    { id: 'video', label: t('exportVideo'), ext: 'mp4' },
    { id: 'gif', label: t('exportGif'), ext: 'gif' },
    { id: 'webm', label: t('exportWebM'), ext: 'webm' },
    { id: 'images', label: t('exportImages'), ext: 'png' },
  ];
  
  for (const fmt of formats) {
    const btn = el('button', `fmt-btn${state.exportFormat === fmt.id ? ' active' : ''}`, fmt.label);
    btn.type = 'button';
    btn.addEventListener('click', () => setExportFormat(fmt.id));
    container.append(btn);
  }
}

async function downloadWithFormat(jobId) {
  const job = state.jobs.get(jobId);
  if (!job) return;
  
  let url = `/api/jobs/${jobId}/download`;
  let filename = job.sourceName.replace(/\.[^.]+$/, '');
  
  switch (state.exportFormat) {
    case 'gif':
      url += '?format=gif';
      filename += '.gif';
      break;
    case 'webm':
      url += '?format=webm';
      filename += '.webm';
      break;
    case 'images':
      url += '?format=images';
      filename += '_frames.zip';
      break;
    default:
      filename += '.mp4';
  }
  
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
}

async function boot() {
  buildGauge();
  bindIntake();
  bindPreviewControls();

  $('langToggle').addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    applyLanguage();
  });
  $('resetBtn').addEventListener('click', resetToIntake);
  $('inspectorClose').addEventListener('click', () => {
    state.openModule = null;
    renderChain();
    renderInspector();
  });
  $('autoBtn').addEventListener('click', async () => {
    if (!state.upload) return;
    const data = await api('GET', `/api/uploads/${state.upload.id}/evaluate?presetId=${state.presetId}`).catch((e) => { toast(e.message, true); return null; });
    if (!data) return;
    state.before = data.before;
    state.options = data.recommended;
    state.reasons = data.reasons || [];
    renderAll();
  });
  $('startBtn').addEventListener('click', startJob);
  $('cancelBtn').addEventListener('click', () => {
    if (state.activeJobId) api('POST', `/api/jobs/${state.activeJobId}/cancel`).catch((e) => toast(e.message, true));
  });

  // License button
  const licenseBtn = $('licenseBtn');
  if (licenseBtn) licenseBtn.addEventListener('click', openLicenseModal);

  // Integrity check button
  const integrityBtn = $('integrityBtn');
  if (integrityBtn) integrityBtn.addEventListener('click', runIntegrityCheck);

  try {
    state.meta = await api('GET', '/api/meta');
  } catch (err) {
    toast(`Could not reach the server: ${err.message}`, true);
    return;
  }

  const engine = state.meta.engine;
  $('engineVersion').textContent = engine.available
    ? (engine.version || '').replace(/^ffmpeg version /i, '').split(/[\s-]/)[0]
    : '—';
  $('engineAccel').textContent = engine.available ? (engine.hwEncoder || 'libx264') : '—';

  if (!engine.available) {
    $('engineWarning').hidden = false;
    $('engineWarningText').textContent = engine.reason || '';
    dropzone.classList.add('is-busy');
  }

  $('dropzoneMeta').textContent = [...state.meta.limits.acceptedExtensions]
    .map((e) => e.replace('.', '').toUpperCase()).join(' · ');

  $('footNote').textContent = lang === 'ar'
    ? `الملفات تُحفظ محلياً على جهازك وتُحذف تلقائياً بعد ${state.meta.limits.retentionHours} ساعة · الحد الأقصى ${fmtBytes(state.meta.limits.maxUploadBytes)}`
    : `Files stay on your own machine and are deleted automatically after ${state.meta.limits.retentionHours}h · limit ${fmtBytes(state.meta.limits.maxUploadBytes)}`;

  state.presetId = state.meta.defaults.presetId;
  
  // Initialize license and integrity
  await checkLicenseOnBoot();
  await runIntegrityCheck();
  
  connectEvents();
  applyLanguage();
}

boot();
