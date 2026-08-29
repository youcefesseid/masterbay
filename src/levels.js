// Codec level limits and conformance.
//
// A "level" is the promise a bitstream makes to a decoder about how much work it will
// demand. Get it wrong and the file may play on your machine and be rejected — or shown
// as a black screen — on a phone, which is the worst possible failure mode for something
// you are about to publish.
//
// This module exists mainly so the tool can say no clearly. When I encoded a 16K test
// file, ffprobe reported `level=255`, meaning "unspecified": the encoder had given up on
// signalling a level because no level covers that frame size. It is not a valid H.264 or
// HEVC stream and no device promises to decode it, however good it looks locally.

import { round } from './util.js';

/** H.264: [level, max frame size in macroblocks, max macroblocks/sec]. */
const H264_LEVELS = [
  ['4.0', 8192, 245760],
  ['4.2', 8704, 522240],
  ['5.0', 22080, 589824],
  ['5.1', 36864, 983040],
  ['5.2', 36864, 2073600],
  ['6.0', 139264, 4177920],
  ['6.1', 139264, 8355840],
  ['6.2', 139264, 16711680],
];

/** HEVC: [level, max luma samples per picture, max luma samples/sec]. */
const HEVC_LEVELS = [
  ['3.1', 983040, 33177600],
  ['4', 2228224, 66846720],
  ['4.1', 2228224, 133693440],
  ['5', 8912896, 267386880],
  ['5.1', 8912896, 534773760],
  ['5.2', 8912896, 1069547520],
  ['6', 35651584, 1069547520],
  ['6.1', 35651584, 2139095040],
  ['6.2', 35651584, 4278190080],
];

export const H264_MAX_MBS = 139264;          // Level 6.2, ~8K
export const HEVC_MAX_SAMPLES = 35651584;    // Level 6.2, ~8K

/** Lowest H.264 level that covers this resolution and framerate, or null if none does. */
export function h264Level(width, height, fps) {
  const mbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const mbps = mbs * (fps || 30);
  for (const [level, maxMbs, maxMbps] of H264_LEVELS) {
    if (mbs <= maxMbs && mbps <= maxMbps) return level;
  }
  return null;
}

/** Lowest HEVC level that covers this resolution and framerate, or null if none does. */
export function hevcLevel(width, height, fps) {
  const samples = width * height;
  const rate = samples * (fps || 30);
  for (const [level, maxSamples, maxRate] of HEVC_LEVELS) {
    if (samples <= maxSamples && rate <= maxRate) return level;
  }
  return null;
}

/**
 * Can this codec legally carry this frame size and rate?
 *
 * Returns the level when it can, and when it cannot, an explanation with the actual
 * numbers plus the largest frame that would fit. ProRes and FFV1 have no level concept at
 * all, which is exactly why they are the right answer above 8K.
 */
export function conformance({ codec, width, height, fps }) {
  if (codec === 'prores' || codec === 'ffv1') {
    return {
      ok: true,
      level: null,
      levelless: true,
      note: {
        ar: 'ProRes/FFV1 بلا حدود مستويات — أي دقة مسموحة.',
        en: 'ProRes/FFV1 have no level limits — any resolution is allowed.',
      },
    };
  }

  const isHevc = codec === 'hevc';
  const level = isHevc ? hevcLevel(width, height, fps) : h264Level(width, height, fps);
  if (level) return { ok: true, level, levelless: false };

  const samples = width * height;
  const ceiling = isHevc ? HEVC_MAX_SAMPLES : H264_MAX_MBS * 256;
  const scale = Math.sqrt(ceiling / samples);
  const fitW = Math.max(2, Math.floor((width * scale) / 2) * 2);
  const fitH = Math.max(2, Math.floor((height * scale) / 2) * 2);
  const name = isHevc ? 'HEVC' : 'H.264';

  // Distinguish "the frame is too big" from "the frame is fine but not at this framerate",
  // because the fix is completely different.
  const frameTooBig = samples > ceiling;

  return {
    ok: false,
    level: null,
    levelless: false,
    frameTooBig,
    suggestion: frameTooBig ? { width: fitW, height: fitH } : null,
    note: frameTooBig
      ? {
          ar: `${width}×${height} = ${round(samples / 1e6, 1)} مليون عيّنة، وأقصى ما يسمح به ${name} (المستوى 6.2) هو ${round(ceiling / 1e6, 1)} مليون. الملف سيخرج بمستوى غير محدّد (255) ولا يضمن أي جهاز تشغيله. البديل الصادق: ${fitW}×${fitH} بنفس الترميز، أو ProRes للأرشيف بأي دقة.`,
          en: `${width}×${height} is ${round(samples / 1e6, 1)} million samples and ${name} Level 6.2 caps out at ${round(ceiling / 1e6, 1)} million. The file would be written with an unspecified level (255) and no device promises to play it. The honest alternatives: ${fitW}×${fitH} in the same codec, or ProRes for an archive at any resolution.`,
        }
      : {
          ar: `${width}×${height} بـ${fps} إطار/ث يتجاوز معدّل العيّنات المسموح في ${name}. خفّض عدد الإطارات أو الدقة.`,
          en: `${width}×${height} at ${fps} fps exceeds the sample rate any ${name} level allows. Lower the framerate or the resolution.`,
        },
  };
}
