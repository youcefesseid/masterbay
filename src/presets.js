// Platform targets. The numbers here are the whole point of the tool: every social
// platform re-encodes what you give it, and how much damage that does depends almost
// entirely on whether your file already matches what their encoder expects.
//
// `note` explains the reasoning so you can argue with it rather than trust it blindly.
// Where a target is ambitious enough to have a real catch — 8K, 120 fps, HDR — the note
// says what the catch is. A preset that quietly does something other than what its name
// promises would make this whole tool untrustworthy.

export const PRESETS = [
  // ---------------------------------------------------------------- TikTok
  {
    id: 'tiktok-1080',
    label: { ar: 'تيك توك — 1080×1920', en: 'TikTok — 1080×1920' },
    platform: 'TikTok',
    recommended: true,
    width: 1080,
    height: 1920,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 17,
    maxrateKbps: 16000,
    audioKbps: 320,
    lufs: -14,
    maxSeconds: 600,
    maxBytes: 287 * 1024 * 1024,
    note: {
      ar: 'الأكثر أماناً. تيك توك يعيد الضغط دائماً، فالهدف أن يستلم ملفاً نظيفاً ببِت‑ريت مرتفع كي يبقى أثر ضغطه بسيطاً.',
      en: 'The safe default. TikTok always re-encodes, so the goal is to hand it a clean, high-bitrate file that survives the second pass.',
    },
  },
  {
    id: 'tiktok-4k',
    label: { ar: 'تيك توك — 4K عمودي 2160×3840', en: 'TikTok — 4K vertical 2160×3840' },
    platform: 'TikTok',
    recommended: true,
    width: 2160,
    height: 3840,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 45000,
    audioKbps: 320,
    lufs: -14,
    maxSeconds: 600,
    maxBytes: 2 * 1024 * 1024 * 1024,
    supersample: 1,
    note: {
      ar: 'أعلى دقة عملية. يُرفع من الويب لا من التطبيق (التطبيق يضغط قبل الرفع). المنصّة ستصغّره، وهذا مفيد: التصغير نفسه يعمل كتنقية فتصمد تفاصيل النص والوجوه أفضل بكثير.',
      en: 'The highest practical resolution. Upload from the web, not the app — the app compresses before it uploads. The platform will downscale it, and that is the point: its own downscale acts as a supersample, so text and faces hold up far better.',
    },
  },
  {
    id: 'tiktok-4k-hdr',
    label: { ar: 'تيك توك — 4K HDR (HLG · 10 بت)', en: 'TikTok — 4K HDR (HLG · 10-bit)' },
    platform: 'TikTok',
    width: 2160,
    height: 3840,
    fps: 30,
    keepSourceFps: true,
    codec: 'hevc',
    crf: 20,
    maxrateKbps: 50000,
    audioKbps: 320,
    lufs: -14,
    maxSeconds: 600,
    maxBytes: 2 * 1024 * 1024 * 1024,
    hdr: 'hlg',
    tenBit: true,
    note: {
      ar: 'هذا هو السبب الحقيقي وراء المقاطع التي «تلمع» في الفيد، وليس الدقة. على شاشة HDR يبدو الفرق فورياً. اخترنا HLG لأنه يتدهور بلطف على الشاشات العادية، بخلاف HDR10. يحتاج HEVC و10 بت، والترميز أبطأ.',
      en: 'This — not resolution — is the real reason some clips look luminous in the feed. On an HDR phone the difference is immediate. HLG is chosen over HDR10 because it degrades gracefully on ordinary screens. Needs HEVC and 10-bit, and encodes slower.',
    },
  },
  {
    id: 'tiktok-1080-120',
    label: { ar: 'تيك توك — 1080×1920 بـ120 إطار', en: 'TikTok — 1080×1920 at 120 fps' },
    platform: 'TikTok',
    width: 1080,
    height: 1920,
    fps: 120,
    keepSourceFps: false,
    codec: 'h264',
    crf: 17,
    maxrateKbps: 40000,
    audioKbps: 320,
    lufs: -14,
    maxSeconds: 600,
    maxBytes: 2 * 1024 * 1024 * 1024,
    note: {
      ar: 'الملف سيكون 120 إطاراً فعلاً وصالحاً تماماً. كن صريحاً مع نفسك: المنصّات تعرض 60 إطاراً كحدّ أقصى، فالغالب أنها ستنزله إلى 60. تكون له قيمة إن كان مصدرك 120 أصلاً أو إن أردت حركة بطيئة سلسة — لا إن كان مصدرك 30 إطاراً.',
      en: 'The file really will be 120 fps and perfectly valid. Be honest with yourself though: the platforms cap playback at 60, so it will almost certainly be resampled down. Worth it if your source is genuinely 120 fps or you want smooth slow motion — not if your source is 30.',
    },
  },
  {
    id: 'tiktok-8k',
    label: { ar: 'تيك توك — 8K عمودي 4320×7680', en: 'TikTok — 8K vertical 4320×7680' },
    platform: 'TikTok',
    width: 4320,
    height: 7680,
    fps: 30,
    keepSourceFps: true,
    codec: 'hevc',
    crf: 20,
    maxrateKbps: 120000,
    audioKbps: 320,
    lufs: -14,
    maxSeconds: 120,
    maxBytes: 4 * 1024 * 1024 * 1024,
    heavy: true,
    note: {
      ar: 'موجود لأنك طلبته، وهذا ما سيحدث فعلاً: 8K صالح تماماً في HEVC، لكن تيك توك سيصغّره إلى 1080p تقريباً على أي حال، والمكسب فوق 4K ضئيل جداً مقابل ملف ضخم وترميز طويل جداً. الاستخدام الصادق له: تصغير فائق (supersampling) لمصدر 4K حقيقي. إن لم تكفِ ذاكرة الجهاز سنخبرك ونخفّض الدقة بدل أن يفشل الترميز في منتصفه.',
      en: 'Here because you asked, and here is what will actually happen: 8K in HEVC is entirely valid, but TikTok will downscale it to roughly 1080p regardless, and the gain over 4K is very small for a huge file and a very long encode. The honest use is supersampling a genuinely 4K source. If this machine lacks the memory we will tell you and reduce the resolution rather than let the encode die halfway.',
    },
  },

  // ---------------------------------------------------------------- Instagram
  {
    id: 'reels-1080',
    label: { ar: 'إنستقرام ريلز — 1080×1920', en: 'Instagram Reels — 1080×1920' },
    platform: 'Instagram',
    width: 1080,
    height: 1920,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 14000,
    audioKbps: 256,
    lufs: -14,
    maxSeconds: 180,
    maxBytes: 4 * 1024 * 1024 * 1024,
    note: {
      ar: 'إنستقرام أقسى من غيره في الضغط، والصوت يُعاير آلياً. تثبيت 30 إطاراً يمنع اهتزاز الحركة.',
      en: 'Instagram compresses harder than most and normalises audio on its own. Locking to 30 fps avoids the judder its encoder introduces.',
    },
  },

  // ---------------------------------------------------------------- YouTube
  {
    id: 'shorts-4k',
    label: { ar: 'يوتيوب شورتس — 4K عمودي', en: 'YouTube Shorts — 4K vertical' },
    platform: 'YouTube',
    width: 2160,
    height: 3840,
    fps: 60,
    keepSourceFps: true,
    codec: 'h264',
    crf: 17,
    maxrateKbps: 55000,
    audioKbps: 384,
    lufs: -14,
    maxSeconds: 180,
    maxBytes: 4 * 1024 * 1024 * 1024,
    note: {
      ar: 'يوتيوب يعطي الفيديوهات عالية الدقة ترميز VP9/AV1 الأفضل. الرفع بدقة 4K يرفع جودة النسخة المعروضة حتى لمن يشاهد بـ1080p.',
      en: 'YouTube gives high-resolution uploads its better VP9/AV1 encode. Uploading in 4K raises quality even for viewers watching at 1080p.',
    },
  },
  {
    id: 'youtube-4k',
    label: { ar: 'يوتيوب أفقي — 4K 3840×2160', en: 'YouTube landscape — 4K 3840×2160' },
    platform: 'YouTube',
    width: 3840,
    height: 2160,
    fps: 60,
    keepSourceFps: true,
    codec: 'h264',
    crf: 17,
    maxrateKbps: 68000,
    audioKbps: 384,
    lufs: -14,
    maxSeconds: 0,
    maxBytes: 0,
    note: {
      ar: 'المواصفة الأفقية القياسية لليوتيوب بدقة 4K.',
      en: "YouTube's standard landscape 4K target.",
    },
  },
  {
    id: 'youtube-8k-hdr',
    label: { ar: 'يوتيوب — 8K HDR أفقي', en: 'YouTube — 8K HDR landscape' },
    platform: 'YouTube',
    width: 7680,
    height: 4320,
    fps: 30,
    keepSourceFps: true,
    codec: 'hevc',
    crf: 20,
    maxrateKbps: 160000,
    audioKbps: 512,
    lufs: -14,
    maxSeconds: 0,
    maxBytes: 0,
    hdr: 'pq',
    tenBit: true,
    heavy: true,
    note: {
      ar: 'يوتيوب هو المنصّة الوحيدة التي تحفظ 8K و HDR فعلاً وتقدّمهما للمشاهدين. هنا الجهد له معنى حقيقي، بخلاف 8K على تيك توك. الترميز طويل جداً ويحتاج ذاكرة كبيرة.',
      en: 'YouTube is the one platform that genuinely keeps 8K and HDR and serves them to viewers, so unlike 8K on TikTok the effort actually reaches someone. Very long encode and memory-hungry.',
    },
  },

  // ---------------------------------------------------------------- Generic
  {
    id: 'square-1080',
    label: { ar: 'مربّع — 1080×1080', en: 'Square — 1080×1080' },
    platform: 'Feed',
    width: 1080,
    height: 1080,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 12000,
    audioKbps: 256,
    lufs: -14,
    maxSeconds: 0,
    maxBytes: 0,
    note: {
      ar: 'للمنشورات المربّعة في الفيد.',
      en: 'For square in-feed posts.',
    },
  },

  // ---------------------------------------------------------------- Archive
  {
    id: 'master-archive',
    label: { ar: 'نسخة أصلية للحفظ — HEVC شبه بلا فقد', en: 'Archive master — near-lossless HEVC' },
    platform: 'Archive',
    width: 0, // keep source resolution
    height: 0,
    fps: 0, // keep source framerate
    keepSourceFps: true,
    codec: 'hevc',
    crf: 16,
    maxrateKbps: 0,
    audioKbps: 512,
    lufs: 0, // no loudness change
    maxSeconds: 0,
    maxBytes: 0,
    tenBit: true,
    note: {
      ar: 'ليست للنشر. نسخة نظيفة عالية الجودة تحتفظ بها كأصل تعيد منها التصدير لأي منصّة لاحقاً.',
      en: 'Not for posting. A clean high-quality copy to keep as your source so you can re-export for any platform later.',
    },
  },
  {
    id: 'master-prores',
    label: { ar: 'أصل ProRes — لأي دقة بلا حدود مستويات', en: 'ProRes master — any resolution, no level limits' },
    platform: 'Archive',
    width: 0,
    height: 0,
    fps: 0,
    keepSourceFps: true,
    codec: 'prores',
    crf: 0,
    maxrateKbps: 0,
    audioKbps: 0, // PCM, not AAC
    lufs: 0,
    maxSeconds: 0,
    maxBytes: 0,
    container: 'mov',
    tenBit: true,
    note: {
      ar: 'هذا هو المسار الصادق لما يتجاوز 8K. H.264 و HEVC لهما حدود مستويات: 16K (132 مليون عيّنة) يتجاوز سقف HEVC المستوى 6.2 (35.6 مليون) فيخرج ملفاً غير مطابق للمعيار لا يضمن أي جهاز تشغيله. ProRes بلا هذا القيد وبصوت PCM غير مضغوط. الملفات ضخمة جداً — للأرشيف والمونتاج، لا للنشر.',
      en: 'This is the honest route for anything beyond 8K. H.264 and HEVC have level limits: 16K is 132 million samples per frame against HEVC Level 6.2\'s ceiling of 35.6 million, so it produces a non-conformant file no device promises to play. ProRes has no such limit and carries uncompressed PCM audio. Files are enormous — for archiving and editing, not for posting.',
    },
  },

  // ---------------------------------------------------------------- 16K / extreme
  {
    id: 'archive-16k',
    label: { ar: 'أرشيف 16K — ProRes 422 HQ', en: '16K Archive — ProRes 422 HQ' },
    platform: 'Archive',
    width: 15360,
    height: 8640,
    fps: 0,
    keepSourceFps: true,
    codec: 'prores',
    crf: 0,
    maxrateKbps: 0,
    audioKbps: 0,
    lufs: 0,
    maxSeconds: 0,
    maxBytes: 0,
    container: 'mov',
    tenBit: true,
    heavy: true,
    note: {
      ar: '16K عمودي. ProRes 422 HQ هو الترميز الوحيد الصادق لهذه الدقة. الملف سيكون ضخماً جداً. مخصص للأرشيف والمونتاج الاحترافي.',
      en: '16K vertical. ProRes 422 HQ is the only honest codec for this resolution. The file will be enormous. For professional archiving and editing only.',
    },
  },
  {
    id: 'archive-16k-landscape',
    label: { ar: 'أرشيف 16K أفقي — ProRes 422 HQ', en: '16K Archive landscape — ProRes 422 HQ' },
    platform: 'Archive',
    width: 15360,
    height: 8640,
    fps: 0,
    keepSourceFps: true,
    codec: 'prores',
    crf: 0,
    maxrateKbps: 0,
    audioKbps: 0,
    lufs: 0,
    maxSeconds: 0,
    maxBytes: 0,
    container: 'mov',
    tenBit: true,
    heavy: true,
    note: {
      ar: '16K أفقي. ProRes 422 HQ هو الترميز الوحيد الصادق لهذه الدقة. الملف سيكون ضخماً جداً. مخصص للأرشيف والمونتاج الاحترافي.',
      en: '16K landscape. ProRes 422 HQ is the only honest codec for this resolution. The file will be enormous. For professional archiving and editing only.',
    },
  },

  // ---------------------------------------------------------------- Twitch
  {
    id: 'twitch-1080',
    label: { ar: 'تويتش — 1080×1920', en: 'Twitch — 1080×1920' },
    platform: 'Twitch',
    width: 1080,
    height: 1920,
    fps: 60,
    keepSourceFps: true,
    codec: 'h264',
    crf: 17,
    maxrateKbps: 6000,
    audioKbps: 160,
    lufs: -14,
    maxSeconds: 0,
    maxBytes: 0,
    note: {
      ar: 'تويتش يفضّل 60 إطاراً وبِت‑ريت ثابت. الهدف ملف نظيف ضمن حدود المنصّة.',
      en: 'Twitch prefers 60 fps and a stable bitrate. A clean file within the platform limits is the goal.',
    },
  },
  {
    id: 'twitch-4k',
    label: { ar: 'تويتش — 4K أفقي 3840×2160', en: 'Twitch — 4K landscape 3840×2160' },
    platform: 'Twitch',
    width: 3840,
    height: 2160,
    fps: 60,
    keepSourceFps: true,
    codec: 'h264',
    crf: 17,
    maxrateKbps: 6000,
    audioKbps: 160,
    lufs: -14,
    maxSeconds: 0,
    maxBytes: 0,
    note: {
      ar: 'تويتش يسمح بـ4K للمشتركين فقط، لكن البث الأفضل هو 1080p/60fps لبِت‑ريت أعلى.',
      en: 'Twitch allows 4K for subscribers, but 1080p/60fps with a higher bitrate is usually the better broadcast.',
    },
  },

  // ---------------------------------------------------------------- Twitter / X
  {
    id: 'twitter-1080',
    label: { ar: 'إكس / تويتر — 1080×1920', en: 'X / Twitter — 1080×1920' },
    platform: 'X',
    width: 1080,
    height: 1920,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 14000,
    audioKbps: 128,
    lufs: -14,
    maxSeconds: 140,
    maxBytes: 512 * 1024 * 1024,
    note: {
      ar: 'إكس يضغط بشدة ويحدّ المدّة. ملف نظيف ببِت‑ريت مرتفع ينجو أفضل.',
      en: 'X compresses aggressively and caps duration. A clean high-bitrate file survives best.',
    },
  },
  {
    id: 'twitter-landscape',
    label: { ar: 'إكس / تويتر — أفقي 1280×720', en: 'X / Twitter — landscape 1280×720' },
    platform: 'X',
    width: 1280,
    height: 720,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 14000,
    audioKbps: 128,
    lufs: -14,
    maxSeconds: 140,
    maxBytes: 512 * 1024 * 1024,
    note: {
      ar: 'الإصدار الأفقي القياسي لإكس.',
      en: 'X\'s standard landscape format.',
    },
  },

  // ---------------------------------------------------------------- Facebook / Instagram
  {
    id: 'facebook-1080',
    label: { ar: 'فيسبوك — 1080×1920', en: 'Facebook — 1080×1920' },
    platform: 'Facebook',
    width: 1080,
    height: 1920,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 15000,
    audioKbps: 256,
    lufs: -14,
    maxSeconds: 240,
    maxBytes: 4 * 1024 * 1024 * 1024,
    note: {
      ar: 'فيسبوك يسمح بملفات أكبر من إنستقرام، لكن الضغط مماثل.',
      en: 'Facebook allows larger files than Instagram, but the compression is similar.',
    },
  },
  {
    id: 'facebook-landscape',
    label: { ar: 'فيسبوك — أفقي 1920×1080', en: 'Facebook — landscape 1920×1080' },
    platform: 'Facebook',
    width: 1920,
    height: 1080,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 15000,
    audioKbps: 256,
    lufs: -14,
    maxSeconds: 240,
    maxBytes: 4 * 1024 * 1024 * 1024,
    note: {
      ar: 'الإصدار الأفقي القياسي لفيسبوك.',
      en: 'Facebook\'s standard landscape format.',
    },
  },

  // ---------------------------------------------------------------- Snapchat
  {
    id: 'snapchat-1080',
    label: { ar: 'سناب شات — 1080×1920', en: 'Snapchat — 1080×1920' },
    platform: 'Snapchat',
    width: 1080,
    height: 1920,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 12000,
    audioKbps: 128,
    lufs: -14,
    maxSeconds: 60,
    maxBytes: 2 * 1024 * 1024 * 1024,
    note: {
      ar: 'سناب شات يضغط بشدة ويرفع بجودة منخفضة. ملف نظيف بأعلى جودة ممكنة.',
      en: 'Snapchat compresses heavily and uploads at low quality. A clean file at the highest possible quality is best.',
    },
  },

  // ---------------------------------------------------------------- Pinterest
  {
    id: 'pinterest-1080',
    label: { ar: 'بينترست — 1080×1920', en: 'Pinterest — 1080×1920' },
    platform: 'Pinterest',
    width: 1080,
    height: 1920,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 12000,
    audioKbps: 128,
    lufs: -14,
    maxSeconds: 60,
    maxBytes: 2 * 1024 * 1024 * 1024,
    note: {
      ar: 'بينترست يفضّل الفيديوهات القصيرة العمودية.',
      en: 'Pinterest prefers short vertical videos.',
    },
  },

  // ---------------------------------------------------------------- LinkedIn
  {
    id: 'linkedin-1080',
    label: { ar: 'لينكد إن — 1080×1920', en: 'LinkedIn — 1080×1920' },
    platform: 'LinkedIn',
    width: 1080,
    height: 1920,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 15000,
    audioKbps: 256,
    lufs: -14,
    maxSeconds: 600,
    maxBytes: 5 * 1024 * 1024 * 1024,
    note: {
      ar: 'لينكد إن يسمح بملفات كبيرة وفيديوهات عمودية. جودة عالية تعطي وصولاً أفضل.',
      en: 'LinkedIn allows large files and vertical video. High quality gives better reach.',
    },
  },
  {
    id: 'linkedin-landscape',
    label: { ar: 'لينكد إن — أفقي 1920×1080', en: 'LinkedIn — landscape 1920×1080' },
    platform: 'LinkedIn',
    width: 1920,
    height: 1080,
    fps: 30,
    keepSourceFps: true,
    codec: 'h264',
    crf: 18,
    maxrateKbps: 15000,
    audioKbps: 256,
    lufs: -14,
    maxSeconds: 600,
    maxBytes: 5 * 1024 * 1024 * 1024,
    note: {
      ar: 'الإصدار الأفقي القياسي للينكد إن.',
      en: 'LinkedIn\'s standard landscape format.',
    },
  },
];

export const PRESETS_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/** Sensible starting point for the mastering chain. The UI can override every field. */
export const DEFAULT_OPTIONS = {
  presetId: 'tiktok-1080',

  // Framing
  fit: 'blur',            // 'blur' | 'crop' | 'pad' | 'stretch'
  padColor: '#000000',
  autoCrop: true,         // remove detected letterbox bars before reframing

  // Restoration
  repair: 'off',          // 'off' | 'light' | 'medium' | 'strong'
  denoise: 'light',       // 'off' | 'light' | 'strong' | 'nlmeans'
  advancedDenoise: 'off', // 'off' | 'light' | 'medium' | 'strong'
  deband: false,
  deinterlace: 'auto',    // 'off' | 'auto'
  deshake: 'off',         // 'off' | 'light' | 'medium' | 'strong'
  watermark: 'off',       // 'off' | 'light' | 'medium' | 'strong'
  autoTrim: false,        // auto-remove silence at start/end
  sceneDetection: false,  // split at scene changes

  // Detail
  upscale: true,          // allow scaling above source resolution
  sharpen: 'light',       // 'off' | 'light' | 'medium' | 'strong'
  clarity: 'off',         // 'off' | 'soft' | 'medium' | 'strong'
  supersample: 1,         // 1 | 2 | 4 — internal render multiplier, downsampled at the end

  // Colour
  look: 'none',           // see LOOK_IDS in looks.js
  lookIntensity: 0.75,    // 0–1, blended against no grade at all
  colorBoost: 'auto',     // 'off' | 'auto' | 'vivid'
  halation: 'off',        // 'off' | 'subtle' | 'film' | 'dreamy'
  grain: 'off',           // 'off' | 'fine' | 'film' | 'heavy'
  vignette: 'off',        // 'off' | 'subtle' | 'medium' | 'strong'
  tonemapHdr: true,       // convert an HDR *source* to correctly-tagged SDR

  // HDR output
  hdr: 'preset',          // 'preset' | 'off' | 'hlg' | 'pq'
  hdrBrightness: 'standard', // reference | standard | bright | extreme
  hdrHighlights: 0.35,    // 0–1, expands the top end before the transfer conversion
  tenBit: 'preset',       // 'preset' | 'off' | 'on'

  // Motion
  fpsMode: 'source',      // 'source' | 'preset' | 'interpolate60' | 'interpolate120'
  shutter: 0,             // 0 = off, otherwise 90–360 degrees of synthetic motion blur

  // Audio
  loudness: 'twoPass',    // 'off' | 'onePass' | 'twoPass'
  forceStereo: true,

  // Encoding
  codec: 'preset',        // 'preset' | 'h264' | 'hevc' | 'prores'
  quality: 'high',        // 'balanced' | 'high' | 'max'
  hwAccel: false,
  stripMetadata: true,

  // Verification
  measure: true,          // compute real SSIM/PSNR against the source after encoding

  // Repurposing your own content
  variation: {
    enabled: false,
    mirror: false,
    zoom: 1.0,            // 1.0 – 1.10
    speed: 1.0,           // 0.94 – 1.06, pitch preserved
  },

  // Trim / cut
  trimStart: 0,           // seconds from start, 0 = no trim
  trimEnd: 0,             // seconds from end, 0 = no trim
};

export const QUALITY_TUNING = {
  balanced: { crfDelta: 2, x264Preset: 'medium', x265Preset: 'medium' },
  high: { crfDelta: 0, x264Preset: 'slow', x265Preset: 'slow' },
  max: { crfDelta: -2, x264Preset: 'veryslow', x265Preset: 'slower' },
};
