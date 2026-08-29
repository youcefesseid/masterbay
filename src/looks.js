// Film looks — computed, not shipped.
//
// Every "look" here is a pure RGB -> RGB function. At build time we sample it on a
// 33x33x33 grid and write a standard .cube 3D LUT, which FFmpeg's lut3d filter applies
// with tetrahedral interpolation. Doing it this way means:
//   - no binary LUT files to ship or license
//   - intensity is a real parameter, not a set of pre-baked variants
//   - the maths is readable and arguable, which is the whole point of this tool
//
// The grading here is what people are actually seeing when they say a channel's video
// looks "hyper-real". It is not resolution. A 1080p clip with a good grade beats a 4K
// clip with a flat one every time.

import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { STORAGE } from './config.js';

const LUT_DIR = path.join(STORAGE, 'luts');
const SIZE = 33; // 35,937 samples. 65 would be overkill for 8-bit sources.

// ---------------------------------------------------------------------------
// Colour maths
// ---------------------------------------------------------------------------

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a, b, t) => a + (b - a) * t;

/** Rec.709 luma. Used everywhere below so saturation moves never change brightness. */
const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Hue in degrees, plus how colourful the pixel already is (0..1). */
function hueChroma(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const c = max - min;
  if (c < 1e-6) return { hue: 0, chroma: 0 };
  let h;
  if (max === r) h = ((g - b) / c) % 6;
  else if (max === g) h = (b - r) / c + 2;
  else h = (r - g) / c + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { hue: h, chroma: c };
}

/** Saturation that keeps luma fixed. amount > 1 boosts, < 1 pulls toward grey. */
function saturate(r, g, b, amount) {
  const l = luma(r, g, b);
  return [l + (r - l) * amount, l + (g - l) * amount, l + (b - l) * amount];
}

/**
 * Vibrance rather than saturation.
 *
 * Two differences that matter: the boost is scaled by (1 - chroma) so colours that are
 * already vivid don't clip into flat blobs, and it is pulled back near skin hues
 * (roughly 15-55 degrees) because that is what makes over-graded video look sunburnt.
 */
function vibrance(r, g, b, amount) {
  const { hue, chroma } = hueChroma(r, g, b);
  const headroom = 1 - Math.min(1, chroma);
  let protect = 1;
  if (hue >= 5 && hue <= 65) {
    const d = Math.abs(hue - 35) / 30;       // 0 at the centre of skin, 1 at the edges
    protect = 0.35 + 0.65 * clamp01(d);
  }
  return saturate(r, g, b, 1 + amount * headroom * protect);
}

/** Symmetric S-curve around mid-grey. Adds contrast without crushing either end. */
function sCurve(x, strength) {
  if (strength === 0) return x;
  const t = clamp01(x);
  const curved = t < 0.5
    ? 0.5 * Math.pow(t * 2, 1 + strength)
    : 1 - 0.5 * Math.pow((1 - t) * 2, 1 + strength);
  return curved;
}

/** Lift/gamma/gain on one channel, film-style. */
function lgg(x, lift, gamma, gain) {
  let v = clamp01(x) * gain + lift * (1 - clamp01(x));
  v = clamp01(v);
  return gamma === 1 ? v : Math.pow(v, 1 / gamma);
}

/** Push shadows one way and highlights the other. The core of every cinematic grade. */
function splitTone(r, g, b, shadow, highlight, amount) {
  const l = luma(r, g, b);
  const hiW = l * l;                 // weight highlights quadratically
  const loW = (1 - l) * (1 - l);
  return [
    r + amount * (highlight[0] * hiW + shadow[0] * loW),
    g + amount * (highlight[1] * hiW + shadow[1] * loW),
    b + amount * (highlight[2] * hiW + shadow[2] * loW),
  ];
}

/** Roll the top end off instead of clipping it. Keeps highlights from going to paste. */
function shoulder(x, knee = 0.82) {
  const t = clamp01(x);
  if (t <= knee) return t;
  const over = (t - knee) / (1 - knee);
  return knee + (1 - knee) * (1 - Math.pow(1 - over, 1.7));
}

// ---------------------------------------------------------------------------
// The looks
// ---------------------------------------------------------------------------

export const LOOKS = [
  { id: 'none', label: { ar: 'بدون', en: 'None' }, note: { ar: 'لا تعديل لوني.', en: 'No colour change.' }, fn: null },
  {
    id: 'punch',
    label: { ar: 'إبراز', en: 'Punch' },
    note: {
      ar: 'تباين ونضارة عامّة بلا هوية لونية. الأنسب إن كنت تريد صورة أقوى فقط.',
      en: 'General contrast and freshness with no colour identity. Use when you just want a stronger picture.',
    },
    fn: (r, g, b) => {
      let [R, G, B] = vibrance(r, g, b, 0.34);
      R = sCurve(R, 0.16); G = sCurve(G, 0.16); B = sCurve(B, 0.16);
      return [shoulder(R), shoulder(G), shoulder(B)];
    },
  },
  {
    id: 'teal-orange',
    label: { ar: 'برتقالي وتركوازي', en: 'Teal & orange' },
    note: {
      ar: 'تدرّج هوليوودي: ظلال تركوازية وإضاءة برتقالية دافئة. يفصل الشخص عن الخلفية.',
      en: 'The Hollywood grade: teal shadows, warm orange light. Separates a subject from its background.',
    },
    fn: (r, g, b) => {
      let [R, G, B] = splitTone(r, g, b, [-0.030, 0.004, 0.055], [0.055, 0.014, -0.045], 1);
      [R, G, B] = vibrance(R, G, B, 0.26);
      R = sCurve(R, 0.20); G = sCurve(G, 0.19); B = sCurve(B, 0.18);
      return [shoulder(R), shoulder(G), shoulder(B)];
    },
  },
  {
    id: 'neon-night',
    label: { ar: 'ليل نيون', en: 'Neon night' },
    note: {
      ar: 'للمشاهد الليلية والسيارات وأضواء المدينة: أسود عميق بميل أزرق وأضواء سماوية/بنفسجية مشبعة.',
      en: 'For night, cars and city lights: deep blue-leaning blacks with saturated cyan and magenta highlights.',
    },
    fn: (r, g, b) => {
      // Crush the blacks slightly and tint them blue — this is what makes night footage
      // read as deliberate rather than underexposed.
      let R = lgg(r, -0.015, 0.96, 1.03);
      let G = lgg(g, -0.010, 0.98, 1.01);
      let B = lgg(b, 0.030, 1.04, 1.05);
      [R, G, B] = splitTone(R, G, B, [-0.020, -0.010, 0.050], [0.030, -0.012, 0.038], 1);
      [R, G, B] = vibrance(R, G, B, 0.46);
      R = sCurve(R, 0.26); G = sCurve(G, 0.24); B = sCurve(B, 0.22);
      return [shoulder(R, 0.86), shoulder(G, 0.86), shoulder(B, 0.86)];
    },
  },
  {
    id: 'warm-film',
    label: { ar: 'فيلم دافئ', en: 'Warm film' },
    note: {
      ar: 'إحساس فيلم كوداك: أنصاف دافئة، أضواء مطويّة بلطف، ظلال بميل أخضر خفيف.',
      en: 'Kodak-ish: warm midtones, gently rolled highlights, a faint green cast in the shadows.',
    },
    fn: (r, g, b) => {
      let R = lgg(r, 0.014, 1.03, 1.02);
      let G = lgg(g, 0.010, 1.01, 1.00);
      let B = lgg(b, 0.004, 0.96, 0.97);
      [R, G, B] = splitTone(R, G, B, [-0.006, 0.014, -0.004], [0.030, 0.012, -0.020], 1);
      [R, G, B] = vibrance(R, G, B, 0.18);
      R = sCurve(R, 0.12); G = sCurve(G, 0.12); B = sCurve(B, 0.12);
      return [shoulder(R, 0.78), shoulder(G, 0.78), shoulder(B, 0.78)];
    },
  },
  {
    id: 'cold-steel',
    label: { ar: 'فولاذ بارد', en: 'Cold steel' },
    note: {
      ar: 'صارم وبارد وقليل التشبّع مع تباين عالٍ. للمونتاج الجادّ ومقاطع السيارات النهارية.',
      en: 'Hard, cool and desaturated with high contrast. Suits serious edits and daylight car footage.',
    },
    fn: (r, g, b) => {
      let [R, G, B] = saturate(r, g, b, 0.86);
      [R, G, B] = splitTone(R, G, B, [-0.014, -0.004, 0.030], [-0.010, 0.004, 0.026], 1);
      R = sCurve(R, 0.30); G = sCurve(G, 0.30); B = sCurve(B, 0.28);
      return [shoulder(R, 0.88), shoulder(G, 0.88), shoulder(B, 0.88)];
    },
  },
  {
    id: 'vivid-feed',
    label: { ar: 'تشبّع أقصى', en: 'Max vivid' },
    note: {
      ar: 'أقصى تشبّع وتباين — هذا هو المظهر «فائق الواقعية» الذي تراه في الفيد. قويّ، فاستخدمه بشدّة أقل من 100%.',
      en: 'Maximum saturation and contrast — the "hyper-real" feed look. It is strong; run it below 100%.',
    },
    fn: (r, g, b) => {
      let [R, G, B] = vibrance(r, g, b, 0.62);
      [R, G, B] = saturate(R, G, B, 1.10);
      R = sCurve(R, 0.30); G = sCurve(G, 0.29); B = sCurve(B, 0.28);
      R = lgg(R, -0.012, 1.0, 1.02); G = lgg(G, -0.010, 1.0, 1.02); B = lgg(B, -0.008, 1.0, 1.02);
      return [shoulder(R, 0.84), shoulder(G, 0.84), shoulder(B, 0.84)];
    },
  },
  {
    id: 'cinematic',
    label: { ar: 'سينمائي', en: 'Cinematic' },
    note: {
      ar: 'تباين معتدل وظلال تركوازية خفيفة وإضاءة دافئة. مظهر الفيلم.',
      en: 'Gentle teal shadows, warm highlights, moderate contrast. The movie look.',
    },
    fn: (r, g, b) => {
      let [R, G, B] = splitTone(r, g, b, [-0.018, 0.006, 0.038], [0.028, 0.010, -0.030], 0.8);
      [R, G, B] = vibrance(R, G, B, 0.20);
      R = sCurve(R, 0.14); G = sCurve(G, 0.13); B = sCurve(B, 0.12);
      return [shoulder(R, 0.80), shoulder(G, 0.80), shoulder(B, 0.80)];
    },
  },
  {
    id: 'cyberpunk',
    label: { ar: 'سايبر بانك', en: 'Cyberpunk' },
    note: {
      ar: 'أضواء نيون ماجنتية وسماوية مع أسود عميق. للمشاهد الليلية الحضرية.',
      en: 'Magenta and cyan neon highlights with deep blacks. For urban night scenes.',
    },
    fn: (r, g, b) => {
      let R = lgg(r, -0.010, 0.98, 1.02);
      let G = lgg(g, -0.008, 0.98, 1.01);
      let B = lgg(b, 0.025, 1.04, 1.06);
      [R, G, B] = splitTone(R, G, B, [-0.015, -0.008, 0.045], [0.035, -0.010, 0.040], 1);
      [R, G, B] = vibrance(R, G, B, 0.40);
      R = sCurve(R, 0.24); G = sCurve(G, 0.22); B = sCurve(B, 0.20);
      return [shoulder(R, 0.86), shoulder(G, 0.86), shoulder(B, 0.86)];
    },
  },
  {
    id: 'vintage',
    label: { ar: 'قديم', en: 'Vintage' },
    note: {
      ar: 'ألوان باهتة قليلاً وتباين منخفض مع ميل دافئ. لمظهر الفيلم القديم.',
      en: 'Slightly faded colours and low contrast with a warm cast. For an old film look.',
    },
    fn: (r, g, b) => {
      let [R, G, B] = saturate(r, g, b, 0.82);
      [R, G, B] = splitTone(R, G, B, [0.012, 0.008, -0.006], [-0.005, 0.002, -0.010], 0.6);
      R = sCurve(R, 0.08); G = sCurve(G, 0.08); B = sCurve(B, 0.08);
      return [shoulder(R, 0.75), shoulder(G, 0.75), shoulder(B, 0.75)];
    },
  },
  {
    id: 'bw',
    label: { ar: 'أبيض وأسود', en: 'Black & white' },
    note: {
      ar: 'تحويل إلى أبيض وأسود مع تباين سينمائي.',
      en: 'Convert to black and white with cinematic contrast.',
    },
    fn: (r, g, b) => {
      const l = luma(r, g, b);
      const R = sCurve(l, 0.20); const G = sCurve(l, 0.20); const B = sCurve(l, 0.20);
      return [shoulder(R, 0.82), shoulder(G, 0.82), shoulder(B, 0.82)];
    },
  },
];

export const LOOKS_BY_ID = new Map(LOOKS.map((l) => [l.id, l]));
export const LOOK_IDS = LOOKS.map((l) => l.id);

// ---------------------------------------------------------------------------
// .cube generation
// ---------------------------------------------------------------------------

/**
 * Sample a look onto a cube grid.
 *
 * `intensity` blends against the identity transform, so 0.5 really is half the grade
 * rather than a different grade. .cube ordering is red-fastest, then green, then blue —
 * getting that backwards produces a spectacular mess, so it is worth stating.
 */
export function buildCube(look, intensity, size = SIZE) {
  const n = size - 1;
  const out = [
    `TITLE "Masterbay ${look.id} @ ${Math.round(intensity * 100)}%"`,
    `LUT_3D_SIZE ${size}`,
    'DOMAIN_MIN 0.0 0.0 0.0',
    'DOMAIN_MAX 1.0 1.0 1.0',
    '',
  ];
  for (let bi = 0; bi < size; bi++) {
    for (let gi = 0; gi < size; gi++) {
      for (let ri = 0; ri < size; ri++) {
        const r = ri / n, g = gi / n, b = bi / n;
        const [gr, gg, gb] = look.fn(r, g, b);
        out.push(
          `${clamp01(mix(r, gr, intensity)).toFixed(6)} ` +
          `${clamp01(mix(g, gg, intensity)).toFixed(6)} ` +
          `${clamp01(mix(b, gb, intensity)).toFixed(6)}`,
        );
      }
    }
  }
  return out.join('\n') + '\n';
}

/**
 * Write the LUT for a look/intensity pair and return its path, reusing the file if it
 * already exists. Content is deterministic, so the hash in the name is a safe cache key.
 */
export async function ensureLut(lookId, intensity) {
  const look = LOOKS_BY_ID.get(lookId);
  if (!look || !look.fn) return null;

  const strength = Math.round(Math.min(1, Math.max(0, intensity)) * 100) / 100;
  if (strength <= 0) return null;

  const key = crypto.createHash('sha1').update(`${lookId}|${strength}|${SIZE}|v1`).digest('hex').slice(0, 12);
  const file = path.join(LUT_DIR, `${lookId}-${Math.round(strength * 100)}-${key}.cube`);

  const already = await fs.stat(file).then((s) => s.isFile() && s.size > 1024, () => false);
  if (already) return file;

  await fs.mkdir(LUT_DIR, { recursive: true });
  // Write to a temp name and rename, so two jobs starting at once can never read a
  // half-written LUT — which would fail the encode with a confusing parse error.
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, buildCube(look, strength), 'utf8');
  await fs.rename(tmp, file);
  return file;
}

/** lut3d needs the path escaped: colons and backslashes are separators inside a graph. */
export function escapeFilterPath(p) {
  return p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
}
