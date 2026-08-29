// Every FFmpeg / FFprobe interaction goes through here. Arguments are passed as an
// array to spawn(), never a shell string, so filenames can never be interpreted as commands.
import { spawn } from 'node:child_process';
import { FFMPEG, FFPROBE } from './config.js';
import { num, parseRate } from './util.js';

const running = new Map(); // token -> ChildProcess, so jobs can be cancelled

class FFError extends Error {
  constructor(message, { code, stderr, args }) {
    super(message);
    this.name = 'FFError';
    this.code = code;
    this.stderr = stderr;
    this.args = args;
  }
}

/**
 * Run a child process and collect its output.
 * onProgress receives the parsed key/value blocks that `-progress pipe:1` emits.
 */
export function run(bin, args, opts = {}) {
  const { onStdout, onStderr, onProgress, token, cwd, stdinData = null } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    if (token) running.set(token, child);

    let stdout = '';
    let stderr = '';
    let progressBuf = '';
    const progress = {};

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      if (stdout.length > 4_000_000) stdout = stdout.slice(-2_000_000);
      onStdout?.(chunk);
      if (!onProgress) return;
      progressBuf += chunk;
      const lines = progressBuf.split('\n');
      progressBuf = lines.pop();
      for (const line of lines) {
        const eq = line.indexOf('=');
        if (eq < 0) continue;
        const key = line.slice(0, eq).trim();
        const value = line.slice(eq + 1).trim();
        progress[key] = value;
        if (key === 'progress') {
          onProgress({ ...progress });
          if (value === 'end') break;
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
      onStderr?.(chunk);
    });

    child.on('error', (err) => {
      if (token) running.delete(token);
      reject(new FFError(`Could not start ${bin}: ${err.message}`, { code: -1, stderr, args }));
    });

    child.on('close', (code, signal) => {
      if (token) running.delete(token);
      if (code === 0) return resolve({ stdout, stderr, code });
      if (signal || child.killed) {
        return reject(Object.assign(new FFError('Cancelled', { code, stderr, args }), { cancelled: true }));
      }
      const hint = lastRealError(stderr);
      reject(new FFError(hint || `${bin} exited with code ${code}`, { code, stderr, args }));
    });

    if (stdinData !== null) child.stdin.end(stdinData);
    else child.stdin.end();
  });
}

export function cancel(token) {
  const child = running.get(token);
  if (!child) return false;
  child.kill('SIGKILL');
  running.delete(token);
  return true;
}

/** Pull the most useful line out of a wall of FFmpeg stderr. */
function lastRealError(stderr) {
  const lines = String(stderr).trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const interesting = lines.filter(
    (l) =>
      /error|invalid|unable|failed|no such|not found|unsupported|does not contain|conversion failed/i.test(l) &&
      !/^\s*(built with|configuration:|lib[a-z]+\s)/i.test(l),
  );
  return (interesting.at(-1) || lines.at(-1) || '').slice(0, 400);
}

export async function ffprobeJson(file, extraArgs = []) {
  const args = [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    ...extraArgs,
    file,
  ];
  const { stdout } = await run(FFPROBE, args);
  return JSON.parse(stdout || '{}');
}

/** Count frames exactly, and report whether timestamps are constant-rate. */
export async function ffprobeFrames(file, limitSeconds = 0) {
  const args = [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-count_frames',
    '-show_entries', 'stream=nb_read_frames',
    '-print_format', 'json',
  ];
  if (limitSeconds) args.push('-read_intervals', `%+${limitSeconds}`);
  args.push(file);
  const { stdout } = await run(FFPROBE, args);
  const data = JSON.parse(stdout || '{}');
  return num(data?.streams?.[0]?.nb_read_frames, null);
}

let capsCache = null;

/** What can this machine actually do? Checked once, then cached. */
export async function capabilities() {
  if (capsCache) return capsCache;

  const version = await run(FFMPEG, ['-hide_banner', '-version']).then(
    (r) => r.stdout.split('\n')[0] || 'unknown',
    () => null,
  );
  if (!version) {
    capsCache = { available: false, reason: `FFmpeg not found. Looked for "${FFMPEG}" on PATH.` };
    return capsCache;
  }

  const versionNumber = (() => {
    const m = /ffmpeg version n?(\d+)\.(\d+)/i.exec(version);
    return m ? { major: Number(m[1]), minor: Number(m[2]) } : { major: 0, minor: 0 };
  })();

  const list = async (flag) => {
    try {
      const { stdout } = await run(FFMPEG, ['-hide_banner', flag]);
      return stdout;
    } catch {
      return '';
    }
  };

  const [encodersRaw, filtersRaw, hwRaw] = await Promise.all([
    list('-encoders'),
    list('-filters'),
    list('-hwaccels'),
  ]);

  const has = (raw, name) => new RegExp(`(^|\\s)${name.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}(\\s|$)`, 'm').test(raw);

  const encoders = {
    h264: has(encodersRaw, 'libx264'),
    hevc: has(encodersRaw, 'libx265'),
    vp9: has(encodersRaw, 'libvpx-vp9'),
    av1: has(encodersRaw, 'libsvtav1') || has(encodersRaw, 'libaom-av1'),
    av1Encoder: has(encodersRaw, 'libsvtav1') ? 'libsvtav1' : has(encodersRaw, 'libaom-av1') ? 'libaom-av1' : null,
    aac: has(encodersRaw, 'aac'),
    // Level-free codecs, the only honest route above 8K.
    prores: has(encodersRaw, 'prores_ks') || has(encodersRaw, 'prores'),
    proresEncoder: has(encodersRaw, 'prores_ks') ? 'prores_ks' : has(encodersRaw, 'prores') ? 'prores' : null,
    ffv1: has(encodersRaw, 'ffv1'),
    pcm: has(encodersRaw, 'pcm_s16le'),
    nvencH264: has(encodersRaw, 'h264_nvenc'),
    nvencHevc: has(encodersRaw, 'hevc_nvenc'),
    qsvH264: has(encodersRaw, 'h264_qsv'),
    videotoolboxH264: has(encodersRaw, 'h264_videotoolbox'),
  };

  const filters = {};
  for (const f of [
    'unsharp', 'nlmeans', 'hqdn3d', 'atadenoise', 'deband', 'minterpolate',
    'loudnorm', 'zscale', 'tonemap', 'cropdetect', 'signalstats', 'gblur',
    'eq', 'scale', 'pad', 'crop', 'overlay', 'yadif', 'atempo', 'thumbnail', 'scdet',
    // Grading, detail and motion additions.
    'lut3d', 'blend', 'split', 'curves', 'setparams', 'tmix', 'noise',
    // Artefact repair. Present in most builds but not all, and the chain must degrade
    // rather than fail if one is missing.
    'spp', 'deblock', 'chromanr',
    // Measured verification. libvmaf is absent from most distro builds, so ssim/psnr are
    // what the quality proof actually rests on.
    'ssim', 'psnr', 'libvmaf',
  ]) filters[f] = has(filtersRaw, f);

  // Being listed in -encoders proves nothing: nearly every distro build advertises
  // h264_nvenc whether or not an NVIDIA card exists. So actually encode two frames
  // and see if the encoder opens. Costs ~200ms, once per process.
  const candidates = [
    encoders.nvencH264 ? 'h264_nvenc' : null,
    encoders.qsvH264 ? 'h264_qsv' : null,
    encoders.videotoolboxH264 ? 'h264_videotoolbox' : null,
  ].filter(Boolean);

  let hwEncoder = null;
  for (const name of candidates) {
    const works = await run(FFMPEG, [
      '-nostdin', '-hide_banner', '-nostats',
      '-f', 'lavfi', '-i', 'color=c=black:s=256x256:r=25',
      '-frames:v', '2',
      '-c:v', name,
      '-f', 'null', '-',
    ]).then(() => true, () => false);
    if (works) { hwEncoder = name; break; }
  }

  capsCache = {
    available: true,
    version,
    versionNumber,
    // -fps_mode replaced -vsync in FFmpeg 5.x; keep working on both.
    fpsModeFlag: versionNumber.major >= 5 ? '-fps_mode' : '-vsync',
    encoders,
    filters,
    hwaccels: hwRaw.split('\n').map((l) => l.trim()).filter((l) => l && !/hardware acceleration/i.test(l)),
    hwEncoder,
    hwEncoderAdvertised: candidates,
  };
  return capsCache;
}

/**
 * Two-pass loudness: measure the whole file, then hand the numbers back so the
 * encode pass can apply an exact correction instead of guessing.
 */
export async function measureLoudness(file, { token } = {}) {
  const args = [
    '-nostdin', '-hide_banner', '-nostats',
    '-i', file,
    '-map', '0:a:0',
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
    '-f', 'null', '-',
  ];
  const { stderr } = await run(FFMPEG, args, { token });
  const start = stderr.lastIndexOf('{');
  const end = stderr.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  try {
    const parsed = JSON.parse(stderr.slice(start, end + 1));
    return {
      inputI: num(parsed.input_i),
      inputTp: num(parsed.input_tp),
      inputLra: num(parsed.input_lra),
      inputThresh: num(parsed.input_thresh),
      targetOffset: num(parsed.target_offset),
      normalizationType: parsed.normalization_type || null,
    };
  } catch {
    return null;
  }
}

/**
 * One cheap decode pass that answers three questions at once: are there black
 * bars, how bright/saturated is the footage, and does anything move.
 * Sampled at 3 fps so a 3-minute clip costs a couple of seconds.
 */
export async function analyseFrames(file, { seconds = 90, token } = {}) {
  const args = [
    '-nostdin', '-hide_banner', '-nostats',
    '-t', String(seconds),
    '-i', file,
    '-map', '0:v:0',
    '-vf', 'fps=3,cropdetect=limit=24:round=2:reset=0,signalstats,metadata=print:file=-',
    '-f', 'null', '-',
  ];
  let stdout = '';
  let stderr = '';
  try {
    const res = await run(FFMPEG, args, { token });
    stdout = res.stdout;
    stderr = res.stderr;
  } catch (err) {
    if (err.cancelled) throw err;
    return { crop: null, stats: null };
  }

  // cropdetect writes its verdict to stderr; take the last one (most frames seen).
  let crop = null;
  const cropMatches = [...stderr.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)];
  const last = cropMatches.at(-1);
  if (last) crop = { w: +last[1], h: +last[2], x: +last[3], y: +last[4] };

  // signalstats arrives as lots of metadata key/value lines; average them.
  const acc = {};
  for (const m of stdout.matchAll(/lavfi\.signalstats\.([A-Z]+)=(-?[\d.]+)/g)) {
    const key = m[1];
    const value = Number(m[2]);
    if (!Number.isFinite(value)) continue;
    (acc[key] ||= []).push(value);
  }
  const mean = (arr) => (arr?.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const stats = Object.keys(acc).length
    ? {
        yAvg: mean(acc.YAVG),
        yLow: mean(acc.YLOW),
        yHigh: mean(acc.YHIGH),
        satAvg: mean(acc.SATAVG),
        satMax: acc.SATMAX ? Math.max(...acc.SATMAX) : null,
        samples: acc.YAVG?.length || 0,
      }
    : null;

  return { crop, stats };
}

/** Grab a poster frame. `-ss` before `-i` keeps this fast even on long files. */
export async function grabFrame(file, outPath, { at = 0, width = 720, token } = {}) {
  const args = [
    '-nostdin', '-hide_banner', '-nostats', '-y',
    '-ss', String(at),
    '-i', file,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-vf', `scale=${width}:-2:flags=lanczos`,
    '-q:v', '3',
    outPath,
  ];
  await run(FFMPEG, args, { token });
  return outPath;
}

export { parseRate, FFError };
