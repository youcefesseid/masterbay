# Masterbay - Gumroad Product Listing

## Product Name
Masterbay — Master Your Short-Form Video Before the Platform Crushes It

## Price
$29 USD

## Category
Software > Desktop Apps

## Tags
video editing, tiktok, reels, shorts, video mastering, ffmpeg, 4k video, content creator, desktop app, video compression, video quality

---

## English Description

Every platform — TikTok, Instagram, YouTube — re-encodes whatever you upload. You cannot prevent that. But **how much damage their compression does depends almost entirely on the state of the file they receive.**

Hand them an already-compressed, low-bitrate file and they compress the compressed — which is exactly what produces the blocking artifacts you see around motion, text, and faces. Hand them a clean, high-bitrate file that already matches what their encoder expects, and what gets published stays close to what you made.

**Masterbay is a Windows desktop app that automatically masters your videos to the exact technical specs each platform expects. No cloud, no account, no subscription — just you and your footage.**

### What It Does

1. **Analyze** — Drop in any video file. Masterbay decodes and measures it in full: resolution, bitrate, encoder profile, color tags, letterbox bars, interlacing, loudness (EBU R128), and MP4 index position. You get a score out of 100 with a plain-language explanation for every finding.

2. **Choose Your Target** — Pick from built-in presets for TikTok (1080p or 4K), Instagram Reels, YouTube Shorts 4K, YouTube Horizontal 4K, Square (1080x1080), or Archive (lossless HEVC for re-editing). Each preset has documented technical reasoning behind every number.

3. **Review & Adjust** — See the full 8-stage processing chain before it runs. Tweak any stage: bitrate ceiling, H.264 profile, color tagging, audio loudness, frame rate, trim, color LUT, vignette, and more. The defaults are already optimal.

4. **Master & Download** — Hit "Start" and watch live progress: stage, percentage, speed, and time remaining. When finished, the same checks run again on the output, so your before/after score is measured, not asserted. You get a draggable before/after wipe, a table of what changed, and the full FFmpeg command used.

### Technical Specs It Fixes

| Spec | Purpose |
|------|---------|
| High bitrate with sensible ceiling | Gives the platform's encoder something to work with |
| H.264 High profile | Most efficient codec, accepted everywhere |
| Explicit `bt709` color tag | Prevents washed-out colors across devices |
| −14 LUFS audio | Matches platform loudness standards |
| Constant Frame Rate (CFR) | Prevents motion judder from VFR |
| `faststart` | File index at the front — instant playback |
| 8-bit `yuv420p` | Prevents black screens on some devices |

### Supported Targets

- TikTok 1080p (9:16)
- TikTok 4K (2160x3840) — upload from web, not the app
- Instagram Reels (1080x1920)
- YouTube Shorts 4K (2160x3840)
- YouTube Horizontal 4K (3840x2160)
- Square 1080x1080
- Archive / Lossless (HEVC, source resolution)

### Advanced Features

- **Trim**: Set start/end points without re-encoding the whole file
- **Color LUTs**: Cinematic, Cyberpunk, Vintage, B&W
- **Vignette**: Adjustable darkness and radius
- **Frame interpolation**: 24fps → 60/120/240fps (optional, slow)
- **Repurpose mode**: Mirror, zoom, speed change for re-posting your own content
- **Batch-ready workflow**: Upload, process, download — repeat

### Privacy

Everything stays on your machine. No uploads to any server. No account required. No telemetry. Finished jobs auto-delete after 48 hours (configurable).

### System Requirements

- Windows 10/11 (64-bit)
- **Node.js 18+ required** (free download from [nodejs.org](https://nodejs.org))
- 8GB RAM minimum, 16GB recommended for 4K
- 2GB free disk space for the app + working files

### What You Get

- `masterbay.zip` — Complete app package with FFmpeg bundled (173 MB)
- Double-click `start-masterbay.bat` to launch
- Your browser opens automatically at `http://127.0.0.1:4173`
- Lifetime updates (you get future versions free)

---

## وصف المنتج بالعربية

### ما هو ماستر باي (Masterbay)؟

كل منصّة — تيك توك، إنستقرام، يوتيوب — تعيد ضغط أي فيديو ترفعه إليها. لا يمكنك منع ذلك. لكن **حجم الضرر الذي يُحدثه ضغطها يعتمد كلّياً على حالة الملف الذي استلمته**.

إذا أعطيتها ملفاً مضغوطاً أصلاً ببِت‑ريت منخفض، فهي تضغط المضغوط، والنتيجة هي التكتلات المربّعة التي تراها حول الحركة والنص والوجوه. وإذا أعطيتها ملفاً نظيفاً ببِت‑ريت مرتفع وبالمواصفات التي يتوقّعها مُرمّزها، فما ستنشره سيبقى قريباً جداً مما صنعته.

**ماستر باي هو تطبيق سطح المكتب لـ Windows يُجَهّز فيديوهاتك تلقائياً للمواصفات التقنية التي تفرضها كل منصّة.** لا سحابة، لا حساب، لا اشتراك — فقط أنت وتسجيلاتك.

### كيف يعمل؟

1. **الفحص** — أفلِت الفيديو في المساحة المخصّصة. الأداة تفكّ الملف وتقيسه فعلياً: الدقة، كثافة البيانات، ملف الترميز، الوسوم اللونية، الأشرطة السوداء المدمجة، تشابك الإطارات، مستوى الصوت بمعيار EBU R128، وموضع فهرس الملف. كل ملاحظة مصحوبة بشرح.

2. **اختر الهدف** — سبعة أهداف جاهزة: تيك توك 1080، تيك توك 4K، إنستقرام ريلز، يوتيوب شورتس 4K، يوتيوب أفقي 4K، مربّع 1080، ونسخة للحفظ. لكل واحد شرح للأرقام التي بُني عليها.

3. **راجع سلسلة المعالجة** — ثماني مراحل معروضة بالترتيب. اضغط أي مرحلة لتعديل إعداداتها. الإعداد التلقائي مبني على قياسات ملفك نفسه.

4. **ابدأ التجهيز** — تابع التقدّم لحظة بلحظة. عند الانتهاء، تحقّق مستقل من الناتج ومقارنة قبل/بعد بمسّاحة تحرّكها بنفسك.

### المواصفات التي تُصلحها

| المواصفة | الغرض |
|---------|-------|
| بِت‑ريت مرتفع مع سقف مناسب | يبقى للمُرمّز ما يعمل عليه بعد إعادة الضغط |
| H.264 High profile | أكفأ ملف ترميز، ومقبول في كل مكان |
| وسم لوني صريح `bt709` | يمنع تغيّر الألوان وبهتانها بين جهاز وآخر |
| ‎−14 LUFS للصوت | يطابق ما تفرضه المنصّات |
| معدّل إطارات ثابت (CFR) | يمنع اهتزاز الحركة |
| `faststart` | يبدأ العرض فوراً |
| `yuv420p` بعمق 8 بت | يمنع الصورة السوداء أو الألوان المقلوبة |

### الأهداف الجاهزة

| الهدف | الدقة |
|-------|-------|
| تيك توك 1080 | 1080×1920 |
| تيك توك 4K | 2160×3840 |
| إنستقرام ريلز | 1080×1920 |
| يوتيوب شورتس 4K | 2160×3840 |
| يوتيوب أفقي 4K | 3840×2160 |
| مربّع | 1080×1080 |
| نسخة للحفظ | كما المصدر |

### ميزات إضافية

- **قص**: تحديد نقطة البداية والنهاية دون إعادة ترميز كاملة
- **LUTs لونية**: سينمائي، سايبربانك، فينتج، أبيض وأسود
- **فينييت (Vignette)**: تحكم بالظل والحواف
- **تكبير الإطارات**: 24fps → 60/120/240fps (اختياري)
- **إعادة النشر**: قلب، تكبير طفيف، تعديل سرعة لمحتواك أنت

### الخصوصية

كل شيء على جهازك. لا يُرسَل أي شيء إلى أي مكان. لا حساب مطلوب. المهام المنتهية تُحذف تلقائياً بعد 48 ساعة.

### متطلبات النظام

- Windows 10/11 (64-bit)
- **Node.js 18+ مطلوب** (تحميل مجاني من [nodejs.org](https://nodejs.org))
- 8GB RAM كحد أدنى، 16GB موصى بها لـ 4K
- 2GB مساحة حرة

### ما ستحصل عليه

- `masterbay.zip` — حزمة التطبيق كاملة مع FFmpeg مُضمّن (173 MB)
- انقر مرتين على `start-masterbay.bat` للتشغيل
- المتصفح يفتح تلقائياً على `http://127.0.0.1:4173`
- تحديثات مدى الحياة — تحصل على الإصدارات المستقبلية مجاناً

---

## FAQ

**Q: Do I need to install anything?**
A: Yes, you need **Node.js 18+** (free from nodejs.org). FFmpeg is already bundled — no separate installation needed.

**هل أحتاج تثبيت أي شيء؟**
ج: نعم، تحتاج **Node.js 18+** (مجاني من nodejs.org). أما FFmpeg فهو مُضمّن بالفعل.

**Q: Will the platform still compress my video?**
A: Yes, but they'll compress a high-quality master instead of an already-compressed file. The difference is visible — especially in text, motion, and faces.

**هل ستضغط المنصّة الفيديو؟**
ج: نعم، لكنها س تضغط ملفاً عالي الجودة بدلاً من ملف مضغوط أصلاً. الفرق واضح — خاصة في النص والحركة والوجوه.

**Q: What about my original video?**
A: Masterbay never modifies your original file. It creates a new mastered version.

**ماذا عن الفيديو الأصلي؟**
ج: ماستر باي لا يعدل ملفك الأصلي أبداً. يُنشئ نسخة mastered جديدة.

**Q: Is there a free trial?**
A: The app is free to test — just download and run it. If you find it useful, purchase to support development.

**هل هناك تجربة مجانية؟**
ج: التطبيق مجاني للتجربة — فقط حمّل وشغّل. إذا وجدته مفيد، اشترِ لدعم التطوير.

**Q: Why not an .exe installer?**
A: The ZIP format works on all Windows versions without special permissions. You just extract and run the batch file. No installation wizard needed.

**لماذا لا ملف .exe مثبّت؟**
ج: صيغة ZIP تعمل على جميع إصدارات Windows بدون صلاحيات خاصة. فقط فك الضغط وشغّل ملف BAT. لا حاجة لمعالج تثبيت.

---

## Call to Action

**Download Masterbay now and upload videos that survive platform compression.**

One-time payment. Lifetime access. No subscription.

---

## File Upload
Upload `masterbay.zip` (173 MB)

## License
Single user / personal license. You may install on your own devices. Resale or redistribution is not permitted.

## Support
Contact via Gumroad messages or email.
