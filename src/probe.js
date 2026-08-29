// Deep inspection of a source file: what it is, and every way it is likely to be
// mangled on upload. Nothing here modifies the file.
import { promises as fs } from 'node:fs';
import { ffprobeJson, analyseFrames, measureLoudness } from './ff.js';
import { num, parseRate, snapFps, round, isNum } from './util.js';

const HDR_TRC = new Set(['smpte2084', 'arib-std-b67', 'smpte428', 'bt2020-10', 'bt2020-12']);

function bitDepthFromPixFmt(pixFmt) {
  if (!pixFmt) return null;
  const m = /(\d{1,2})(le|be)$/.exec(pixFmt);
  if (m) return Number(m[1]);
  return 8;
}

function chromaFromPixFmt(pixFmt) {
  if (!pixFmt) return null;
  if (/444/.test(pixFmt)) return '4:4:4';
  if (/422/.test(pixFmt)) return '4:2:2';
  if (/420/.test(pixFmt)) return '4:2:0';
  if (/^gray/.test(pixFmt)) return 'grayscale';
  return null;
}

function rotationOf(stream) {
  const side = stream.side_data_list?.find((s) => s.rotation !== undefined);
  let deg = num(side?.rotation, null);
  if (deg === null) deg = num(stream.tags?.rotate, 0);
  if (deg === null) deg = 0;
  deg = ((Math.round(deg) % 360) + 360) % 360;
  return deg;
}

/**
 * Read top-level MP4 boxes to see whether `moov` sits before `mdat`.
 * If it doesn't, players must download the tail before they can start — which is
 * why every platform's upload guide says "web optimised" or "faststart".
 */
export async function checkFastStart(file) {
  let handle;
  try {
    handle = await fs.open(file, 'r');
    const { size } = await handle.stat();
    let offset = 0;
    const head = Buffer.alloc(16);
    const order = [];

    for (let i = 0; i < 24 && offset + 8 <= size; i++) {
      const { bytesRead } = await handle.read(head, 0, 16, offset);
      if (bytesRead < 8) break;
      let boxSize = head.readUInt32BE(0);
      const type = head.toString('latin1', 4, 8);
      if (!/^[\x20-\x7e]{4}$/.test(type)) break;
      let headerSize = 8;
      if (boxSize === 1) {
        if (bytesRead < 16) break;
        boxSize = Number(head.readBigUInt64BE(8));
        headerSize = 16;
      } else if (boxSize === 0) {
        boxSize = size - offset; // box runs to end of file
      }
      if (boxSize < headerSize) break;
      order.push(type);
      if (type === 'moov' || type === 'mdat') {
        const other = type === 'moov' ? 'mdat' : 'moov';
        if (order.includes(other)) break;
      }
      offset += boxSize;
    }

    const moov = order.indexOf('moov');
    const mdat = order.indexOf('mdat');
    if (moov === -1 && mdat === -1) return { applicable: false, fastStart: null, boxes: order };
    if (moov === -1) return { applicable: true, fastStart: false, boxes: order };
    if (mdat === -1) return { applicable: true, fastStart: true, boxes: order };
    return { applicable: true, fastStart: moov < mdat, boxes: order };
  } catch {
    return { applicable: false, fastStart: null, boxes: [] };
  } finally {
    await handle?.close();
  }
}

export async function inspect(file, { analysisSeconds = 90, measureAudio = true, token } = {}) {
  const [probe, fileStat] = await Promise.all([ffprobeJson(file), fs.stat(file)]);

  const streams = probe.streams || [];
  const v = streams.find((s) => s.codec_type === 'video');
  const a = streams.find((s) => s.codec_type === 'audio');
  const subtitleCount = streams.filter((s) => s.codec_type === 'subtitle').length;

  if (!v) {
    const err = new Error('No video stream found in this file.');
    err.status = 415;
    throw err;
  }

  const format = probe.format || {};
  const duration = num(format.duration) ?? num(v.duration) ?? null;

  const coded = { w: num(v.width, 0), h: num(v.height, 0) };
  const rotation = rotationOf(v);
  const swapped = rotation === 90 || rotation === 270;
  const display = swapped ? { w: coded.h, h: coded.w } : { ...coded };

  const avgFps = snapFps(parseRate(v.avg_frame_rate));
  const rFps = snapFps(parseRate(v.r_frame_rate));
  // A container rate far above the real average rate is the classic sign of
  // variable framerate footage (screen recordings, phone slow-mo, some editors).
  const vfr = isNum(avgFps) && isNum(rFps) && rFps > avgFps * 1.15;

  const videoBitrate = num(v.bit_rate) ?? (duration && format.size ? (num(format.size) * 8) / duration : null);
  const pixelsPerSecond = display.w * display.h * (avgFps || 30);
  const bpp = videoBitrate && pixelsPerSecond ? videoBitrate / pixelsPerSecond : null;

  const trc = (v.color_transfer || '').toLowerCase();
  const primaries = (v.color_primaries || '').toLowerCase();
  const hdr = HDR_TRC.has(trc) || primaries === 'bt2020';

  const [frames, loudness, fastStart] = await Promise.all([
    analyseFrames(file, { seconds: analysisSeconds, token }),
    a && measureAudio ? measureLoudness(file, { token }).catch(() => null) : Promise.resolve(null),
    checkFastStart(file),
  ]);

  // Only call it letterboxing if cropdetect wants to remove a meaningful amount.
  let letterbox = null;
  if (frames.crop && coded.w && coded.h) {
    const removedW = coded.w - frames.crop.w;
    const removedH = coded.h - frames.crop.h;
    const fraction = 1 - (frames.crop.w * frames.crop.h) / (coded.w * coded.h);
    if (fraction > 0.02 && (removedW > 4 || removedH > 4)) {
      letterbox = { ...frames.crop, removedW, removedH, fraction: round(fraction, 4) };
    }
  }

  const gcd = (x, y) => (y ? gcd(y, x % y) : x);
  const g = display.w && display.h ? gcd(display.w, display.h) : 1;

  return {
    file,
    sizeBytes: fileStat.size,
    container: {
      formatName: format.format_name || null,
      formatLong: format.format_long_name || null,
      duration,
      bitrateKbps: num(format.bit_rate) ? round(num(format.bit_rate) / 1000) : null,
      fastStart: fastStart.fastStart,
      fastStartApplicable: fastStart.applicable,
      boxes: fastStart.boxes,
      streamCount: streams.length,
      subtitleCount,
      tags: format.tags || {},
    },
    video: {
      codec: v.codec_name || null,
      codecLong: v.codec_long_name || null,
      profile: v.profile || null,
      level: num(v.level, null),
      codedWidth: coded.w,
      codedHeight: coded.h,
      width: display.w,
      height: display.h,
      rotation,
      aspect: display.w && display.h ? `${display.w / g}:${display.h / g}` : null,
      aspectRatio: display.h ? round(display.w / display.h, 4) : null,
      orientation: display.w > display.h ? 'landscape' : display.w < display.h ? 'portrait' : 'square',
      fps: avgFps,
      containerFps: rFps,
      vfr,
      pixFmt: v.pix_fmt || null,
      bitDepth: bitDepthFromPixFmt(v.pix_fmt),
      chroma: chromaFromPixFmt(v.pix_fmt),
      colorPrimaries: v.color_primaries || null,
      colorTransfer: v.color_transfer || null,
      colorSpace: v.color_space || null,
      colorRange: v.color_range || null,
      hdr,
      fieldOrder: v.field_order || null,
      interlaced: !!v.field_order && v.field_order !== 'progressive' && v.field_order !== 'unknown',
      bitrateKbps: videoBitrate ? round(videoBitrate / 1000) : null,
      bitsPerPixel: bpp ? round(bpp, 4) : null,
      frameCount: num(v.nb_frames, null),
      letterbox,
      stats: frames.stats,
    },
    audio: a
      ? {
          present: true,
          codec: a.codec_name || null,
          profile: a.profile || null,
          channels: num(a.channels, null),
          channelLayout: a.channel_layout || null,
          sampleRate: num(a.sample_rate, null),
          bitrateKbps: num(a.bit_rate) ? round(num(a.bit_rate) / 1000) : null,
          lufs: loudness?.inputI ?? null,
          truePeakDb: loudness?.inputTp ?? null,
          lra: loudness?.inputLra ?? null,
          loudnessMeasurement: loudness,
        }
      : { present: false },
  };
}
