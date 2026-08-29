// Pre-flight check. Run: npm run doctor
// Verifies the things that actually stop this tool from working, and says what to do
// about each one instead of just reporting a failure.
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  FFMPEG, FFPROBE, STORAGE, DIRS, PORT, HOST,
  MAX_UPLOAD_BYTES, CONCURRENCY, CPU_COUNT, ENCODE_THREADS, RETENTION_HOURS,
} from '../src/config.js';
import { capabilities } from '../src/ff.js';
import { humanBytes } from '../src/util.js';

const PASS = '[32m✓[0m';
const FAIL = '[31m✗[0m';
const WARN = '[33m![0m';
const DIM = (s) => `[2m${s}[0m`;

let failures = 0;
let warnings = 0;

const ok = (label, detail) => console.log(`  ${PASS} ${label}${detail ? DIM(` — ${detail}`) : ''}`);
const bad = (label, fix) => { failures++; console.log(`  ${FAIL} ${label}`); if (fix) console.log(`      ${DIM('→ ' + fix)}`); };
const meh = (label, note) => { warnings++; console.log(`  ${WARN} ${label}${note ? DIM(` — ${note}`) : ''}`); };

const INSTALL = {
  darwin: 'brew install ffmpeg',
  linux: 'sudo apt install ffmpeg   (or: sudo dnf install ffmpeg)',
  win32: 'winget install Gyan.FFmpeg',
}[process.platform] || 'https://ffmpeg.org/download.html';

console.log('\nMasterbay — pre-flight check\n');

// ── Node ─────────────────────────────────────────────────────────
console.log('Runtime');
const major = Number(process.versions.node.split('.')[0]);
if (major >= 18) ok(`Node ${process.versions.node}`, `${os.platform()} ${os.arch()}`);
else bad(`Node ${process.versions.node} is too old`, 'This project needs Node 18 or newer: https://nodejs.org');
ok(`${CPU_COUNT} CPU cores`, `encoding threads: ${ENCODE_THREADS === 0 ? 'auto' : ENCODE_THREADS} · concurrent jobs: ${CONCURRENCY}`);

// ── FFmpeg ───────────────────────────────────────────────────────
console.log('\nFFmpeg');
let caps = null;
try {
  caps = await capabilities();
} catch (err) {
  bad(`Could not run FFmpeg (${FFMPEG})`, `Install it, then re-run. ${INSTALL}`);
  console.log(`      ${DIM(err.message)}`);
}

if (caps) {
  ok(caps.version.replace(/^ffmpeg version /i, 'ffmpeg ').split('\n')[0].slice(0, 72));
  ok(`ffprobe`, FFPROBE);

  if (caps.encoders.h264) ok('libx264', 'the encoder every platform expects');
  else bad('libx264 is missing', `Your FFmpeg build has no H.264 encoder — install a full build. ${INSTALL}`);

  if (caps.encoders.aac) ok('aac audio encoder');
  else bad('aac encoder is missing', `Install a full FFmpeg build. ${INSTALL}`);

  if (caps.encoders.hevc) ok('libx265', 'archive master preset available');
  else meh('libx265 not found', 'the archive-master preset will fall back to H.264');

  if (caps.filters.loudnorm) ok('loudnorm', 'EBU R128 loudness matching');
  else bad('loudnorm filter is missing', 'Audio cannot be normalised without it. Install a full FFmpeg build.');

  const optional = [
    ['zscale', 'HDR → SDR conversion (iPhone / HLG footage)'],
    ['tonemap', 'HDR tone mapping'],
    ['deband', 'gradient banding removal'],
    ['nlmeans', 'the slow high-quality denoiser'],
    ['minterpolate', '60 fps motion interpolation'],
    ['gblur', 'the blurred backdrop for aspect changes'],
  ];
  for (const [name, why] of optional) {
    if (caps.filters[name]) ok(name, why);
    else meh(`${name} not available`, `${why} will be skipped`);
  }

  if (caps.hwEncoder) ok(`hardware encoder: ${caps.hwEncoder}`, 'optional, faster, lower quality');
  else if (caps.hwEncoderAdvertised?.length) {
    meh(`${caps.hwEncoderAdvertised.join(', ')} listed but not usable`, 'no matching hardware on this machine — CPU encoding only');
  } else console.log(`  ${DIM('· no hardware encoder detected — CPU encoding only, which is what you want anyway')}`);

  console.log(`  ${DIM(`· constant-frame-rate flag for this build: ${caps.fpsModeFlag}`)}`);
}

// ── Storage ──────────────────────────────────────────────────────
console.log('\nStorage');
try {
  for (const dir of DIRS) await fs.mkdir(dir, { recursive: true });
  const probe = path.join(STORAGE, '.write-probe');
  await fs.writeFile(probe, 'ok');
  await fs.rm(probe);
  ok('storage is writable', STORAGE);
} catch (err) {
  bad(`Cannot write to ${STORAGE}`, 'Check permissions, or point it elsewhere: STORAGE_DIR=/some/other/path npm start');
  console.log(`      ${DIM(err.message)}`);
}

try {
  const { bsize, bavail } = await fs.statfs(STORAGE);
  const free = bsize * bavail;
  const line = `${humanBytes(free)} free · upload limit ${humanBytes(MAX_UPLOAD_BYTES)} · files deleted after ${RETENTION_HOURS}h`;
  if (free < 5 * 1024 ** 3) meh('low free disk space', line);
  else ok('disk space', line);
} catch {
  console.log(`  ${DIM('· could not read free disk space on this platform')}`);
}

// ── Port ─────────────────────────────────────────────────────────
console.log('\nNetwork');
const inUse = await new Promise((resolve) => {
  import('node:net').then(({ createServer }) => {
    const probe = createServer();
    probe.once('error', (e) => resolve(e.code === 'EADDRINUSE'));
    probe.once('listening', () => probe.close(() => resolve(false)));
    probe.listen(PORT, HOST);
  });
});
if (inUse) bad(`port ${PORT} is already in use`, `Stop whatever is using it, or start with: PORT=4200 npm start`);
else ok(`http://${HOST}:${PORT} is free`);

// ── Verdict ──────────────────────────────────────────────────────
console.log('');
if (failures) {
  console.log(`[31m${failures} problem${failures > 1 ? 's' : ''} will stop the tool from working.[0m`);
  if (warnings) console.log(DIM(`${warnings} optional feature${warnings > 1 ? 's' : ''} unavailable.`));
  process.exit(1);
}
console.log(`[32mReady.[0m ${warnings ? DIM(`${warnings} optional feature${warnings > 1 ? 's' : ''} unavailable — everything essential is present.`) : ''}`);
console.log(DIM('Start it with: npm start\n'));
