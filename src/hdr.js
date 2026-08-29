// HDR output.
//
// This is the single biggest reason some channels look luminous next to everything else
// in the feed, and it is not resolution or bitrate. An HDR clip on an HDR phone can
// address a much brighter highlight range than SDR can, so it reads as "glowing" when
// scrolled past an SDR clip.
//
// Two important things this module gets right, because most conversions do not:
//
// 1. The transfer conversion is done directly by zscale. The usual advice is to go via
//    linear light (zscale=t=linear -> tonemap -> zscale=t=smpte2084), but on this zimg
//    build that path errors with "no path between colorspaces" for 8-bit yuv input.
//    Converting straight to the target transfer is both simpler and what actually works.
//
// 2. SDR white maps to 203 nits by default, not 100 and not 1000. That figure is from
//    ITU-R BT.2408 (reference white for HDR production). Mapping everything to 1000
//    makes midtones and skin glaringly bright, which is exactly why amateur SDR->HDR
//    conversions look wrong. Measured on this build: 50% grey lands at PQ code 373 at
//    npl=100, 429 at npl=203, and 567 at npl=1000.

import { round, clamp } from './util.js';

export const HDR_MODES = ['off', 'hlg', 'pq'];

/** BT.2020 primaries and a D65 white point, in the 0.00002 units x265 expects. */
const BT2020_MASTER_DISPLAY = 'G(8500,39850)B(6550,2300)R(35400,14600)WP(15635,16450)';

export const HDR_INFO = {
  off: {
    label: { ar: 'SDR — النطاق القياسي', en: 'SDR — standard range' },
    note: {
      ar: 'الأكثر أماناً. كل جهاز يعرضه كما صنعته تماماً.',
      en: 'The safe choice. Every device shows it exactly as you made it.',
    },
  },
  hlg: {
    label: { ar: 'HDR — HLG', en: 'HDR — HLG' },
    note: {
      ar: 'الأفضل للنشر. HLG مرتبط بالعرض، فيبقى مقبولاً على الشاشات العادية إن لم تحوّله المنصّة جيداً. يحتاج HEVC و10 بت.',
      en: 'The better one to publish. HLG is display-referred, so it still degrades acceptably on ordinary screens if the platform converts it badly. Needs HEVC and 10-bit.',
    },
  },
  pq: {
    label: { ar: 'HDR10 — PQ', en: 'HDR10 — PQ' },
    note: {
      ar: 'أقوى أثراً على شاشة HDR، لكنه مطلق الإضاءة: إن حوّلته المنصّة بشكل سيئ لمشاهد على شاشة عادية فسيبدو باهتاً ورمادياً. استخدمه إن كنت تستهدف أجهزة HDR.',
      en: 'Stronger on an HDR screen, but absolute-luminance: if the platform tone-maps it badly for a viewer on an ordinary screen it looks washed out and grey. Use it when you are targeting HDR devices.',
    },
  },
};

/** Nominal peak luminance presets. This is the brightness knob, and it is measurable. */
export const HDR_BRIGHTNESS = {
  reference: { npl: 100, label: { ar: 'مرجعي (100)', en: 'Reference (100)' } },
  standard: { npl: 203, label: { ar: 'قياسي BT.2408 (203)', en: 'BT.2408 standard (203)' } },
  bright: { npl: 300, label: { ar: 'ساطع (300)', en: 'Bright (300)' } },
  extreme: { npl: 500, label: { ar: 'أقصى (500)', en: 'Extreme (500)' } },
};

/**
 * Filters that take a correctly tagged SDR (or already-converted) picture into HDR.
 *
 * `highlights` optionally expands the top end *before* the transfer conversion. Doing it
 * in the SDR domain is far easier to reason about than trying to shape it in PQ, where
 * the code values are perceptually spaced and a small nudge is a large brightness change.
 */
export function hdrFilters({ mode, brightness = 'standard', highlights = 0, sourceIsHdr = false, tenBit = true }) {
  if (mode === 'off') return { filters: [], active: false };

  const npl = (HDR_BRIGHTNESS[brightness] || HDR_BRIGHTNESS.standard).npl;
  const transfer = mode === 'pq' ? 'smpte2084' : 'arib-std-b67';
  const filters = [];

  // Expand highlights while still in a gamma-encoded space we can describe simply.
  const lift = clamp(highlights, 0, 1);
  if (lift > 0.01) {
    // Hold black and mid, raise everything above ~60% so speculars and skies gain range.
    const mid = round(0.60, 3);
    const top = round(0.78 + 0.14 * lift, 4);
    filters.push(`curves=all='0/0 0.35/0.35 ${mid}/${round(mid + 0.06 * lift, 4)} 0.85/${top} 1/1'`);
  }

  // Declare what we have before asking zimg to convert it. Without this, an untagged
  // frame makes zscale guess, and a wrong guess is a visible colour shift.
  if (!sourceIsHdr) {
    filters.push('setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv');
  }
  filters.push(`zscale=t=${transfer}:m=bt2020nc:p=bt2020:r=tv:npl=${npl}`);
  filters.push(tenBit ? 'format=yuv420p10le' : 'format=yuv420p');

  return {
    filters,
    active: true,
    npl,
    transfer,
    detail: {
      ar: `${mode === 'pq' ? 'HDR10 (PQ)' : 'HLG'} · BT.2020 · ${npl} nit للأبيض${lift > 0.01 ? ` · توسيع أضواء ${Math.round(lift * 100)}%` : ''}`,
      en: `${mode === 'pq' ? 'HDR10 (PQ)' : 'HLG'} · BT.2020 · white at ${npl} nits${lift > 0.01 ? ` · highlights +${Math.round(lift * 100)}%` : ''}`,
    },
  };
}

/** Colour tagging flags for the muxer, so players don't have to guess. */
export function hdrOutputTags(mode) {
  if (mode === 'off') {
    return ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];
  }
  return [
    '-color_primaries', 'bt2020',
    '-color_trc', mode === 'pq' ? 'smpte2084' : 'arib-std-b67',
    '-colorspace', 'bt2020nc',
    '-color_range', 'tv',
  ];
}

/**
 * x265 parameters carrying the HDR signalling inside the bitstream.
 *
 * `repeat-headers` matters: without it the metadata appears once at the start, and a
 * player that joins mid-stream (or a platform that re-segments the file) loses it and
 * renders the video as if it were SDR.
 */
export function hdrX265Params(mode, { maxNits = 1000, maxFall = 400 } = {}) {
  if (mode === 'off') return [];
  const params = [
    'colorprim=bt2020',
    `transfer=${mode === 'pq' ? 'smpte2084' : 'arib-std-b67'}`,
    'colormatrix=bt2020nc',
    'repeat-headers=1',
  ];
  if (mode === 'pq') {
    // Mastering display and content light level are only meaningful for PQ, which is
    // absolute. HLG is relative, so these would be noise.
    params.push('hdr-opt=1');
    params.push(`master-display=${BT2020_MASTER_DISPLAY}L(${Math.round(maxNits * 10000)},1)`);
    params.push(`max-cll=${Math.round(maxNits)},${Math.round(maxFall)}`);
  }
  return params;
}

/** HDR needs HEVC and 10-bit to be worth doing. Says why, so the UI can explain itself. */
export function hdrRequirements(mode, { codec, caps }) {
  if (mode === 'off') return { ok: true, forced: null };
  if (!caps.encoders.hevc) {
    return {
      ok: false,
      reason: {
        ar: 'HDR يحتاج ترميز HEVC، وهذه النسخة من FFmpeg لا تملك libx265.',
        en: 'HDR needs HEVC and this FFmpeg build has no libx265.',
      },
    };
  }
  if (!caps.filters.zscale) {
    return {
      ok: false,
      reason: {
        ar: 'HDR يحتاج مُرشّح zscale (zimg) وهو غير موجود في هذه النسخة.',
        en: 'HDR needs the zscale (zimg) filter, which this build does not have.',
      },
    };
  }
  // H.264 HDR technically exists but essentially nothing plays it correctly.
  return { ok: true, forced: codec === 'hevc' ? null : 'hevc' };
}
