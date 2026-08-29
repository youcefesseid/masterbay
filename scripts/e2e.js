// End-to-end test over real HTTP: build a deliberately bad source file, then drive
// the server exactly the way the browser does — create upload, PUT chunks, complete,
// create a job, watch SSE, download the result and re-probe it independently.
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const TMP = process.env.TMP_DIR || path.join(os.tmpdir(), 'mb-e2e');

let failed = 0;
const pass = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const fail = (m) => { failed++; console.log(`  \x1b[31m✗\x1b[0m ${m}`); };
const check = (cond, m) => (cond ? pass(m) : fail(m));
const step = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`);

const sh = (bin, args) => new Promise((resolve, reject) => {
  const c = spawn(bin, args);
  let err = '';
  c.stderr.on('data', (d) => { err += d; });
  c.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-600)))));
});

const probe = async (file) => {
  const c = spawn('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', file]);
  let out = '';
  c.stdout.on('data', (d) => { out += d; });
  await new Promise((r) => c.on('close', r));
  return JSON.parse(out || '{}');
};

const api = async (method, url, body) => {
  const res = await fetch(BASE + url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, data, text, headers: res.headers };
};

// ── 0. Build a source with every defect the QC engine looks for ──
step('Building a deliberately bad source file');
await fs.mkdir(TMP, { recursive: true });
const SOURCE = path.join(TMP, 'مقطع اختبار.mp4'); // Arabic filename, on purpose
await sh('ffmpeg', [
  '-nostdin', '-hide_banner', '-nostats', '-y',
  '-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=25:duration=6',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100:duration=6',
  // letterbox it: shrink the picture and pad, so 25% of the frame is black bars
  '-filter_complex', '[0:v]scale=1280:540,pad=1280:720:0:90:color=black[v];[1:a]volume=0.007,pan=mono|c0=c0[a]',
  '-map', '[v]', '-map', '[a]',
  '-c:v', 'libx264', '-profile:v', 'baseline', '-b:v', '750k', '-pix_fmt', 'yuv420p',
  '-color_primaries', 'unspecified', '-color_trc', 'unspecified', '-colorspace', 'unspecified',
  '-c:a', 'aac', '-b:a', '48k', '-ar', '44100', '-ac', '1',
  SOURCE,
]);
// Plain mp4 muxing already leaves moov at the end, which is exactly the defect we want.
const srcStat = await fs.stat(SOURCE);
pass(`${path.basename(SOURCE)} — ${(srcStat.size / 1024).toFixed(0)} KB, 1280x720, baseline, mono 44.1k, letterboxed, moov at end`);

// ── 1. Server reachable + capabilities ──
step('GET /api/meta');
const meta = await api('GET', '/api/meta');
check(meta.status === 200, `200 OK`);
check(meta.data?.engine?.available === true, `engine available: ${meta.data?.engine?.version?.slice(0, 40)}`);
check(Array.isArray(meta.data?.presets) && meta.data.presets.length >= 20, `${meta.data?.presets?.length} presets`);
check(meta.data?.limits?.chunkBytes > 0, `chunk size ${meta.data?.limits?.chunkBytes}`);
check(!!meta.data?.defaults?.presetId, `default preset ${meta.data?.defaults?.presetId}`);

const health = await fetch(`${BASE}/healthz`);
check(health.ok, 'GET /healthz');

const page = await fetch(BASE + '/');
const html = await page.text();
check(page.ok && html.includes('id="dropzone"'), 'GET / serves the app shell');
const css = await fetch(BASE + '/styles.css');
const js = await fetch(BASE + '/app.js');
check(css.ok && css.headers.get('content-type')?.includes('css'), 'GET /styles.css');
check(js.ok && js.headers.get('content-type')?.includes('javascript'), 'GET /app.js');
const escape = await fetch(BASE + '/../src/config.js');
check(escape.status === 404 || escape.status === 403, `path traversal refused (${escape.status})`);

// ── 2. Chunked upload ──
step('Chunked upload');
const created = await api('POST', '/api/uploads', {
  name: path.basename(SOURCE), size: srcStat.size, mimeType: 'video/mp4',
});
check(created.status === 201, `201 Created`);
const uploadId = created.data?.upload?.id;
check(!!uploadId, `upload id ${uploadId}`);

const bytes = await fs.readFile(SOURCE);
const chunk = 64 * 1024; // deliberately small, to exercise many round trips
let offset = 0;
let chunks = 0;
while (offset < bytes.length) {
  const end = Math.min(offset + chunk, bytes.length);
  const res = await fetch(`${BASE}/api/uploads/${uploadId}/chunk?offset=${offset}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/octet-stream' },
    body: bytes.subarray(offset, end),
  });
  if (!res.ok) { fail(`chunk at ${offset} → ${res.status} ${await res.text()}`); break; }
  offset = end;
  chunks++;
}
check(offset === bytes.length, `${chunks} chunks, ${offset}/${bytes.length} bytes`);

// Resume behaviour: a stale offset must be rejected with the true position.
const stale = await fetch(`${BASE}/api/uploads/${uploadId}/chunk?offset=0`, {
  method: 'PUT', headers: { 'content-type': 'application/octet-stream' }, body: bytes.subarray(0, 16),
});
const staleBody = await stale.json().catch(() => ({}));
check(stale.status === 409 && staleBody.received === bytes.length, `stale offset → 409 with received=${staleBody.received}`);

// ── 3. Analysis + recommendation ──
step('POST /api/uploads/:id/complete');
const complete = await api('POST', `/api/uploads/${uploadId}/complete?presetId=tiktok-1080`);
check(complete.status === 200, '200 OK');
const before = complete.data?.before;
const recommended = complete.data?.recommended;
const analysis = complete.data?.upload?.analysis;
check(!!analysis, 'analysis returned');
check(analysis?.video?.width === 1280 && analysis?.video?.height === 720, `probed ${analysis?.video?.width}x${analysis?.video?.height}`);
check(analysis?.video?.profile?.toLowerCase().includes('baseline'), `profile ${analysis?.video?.profile}`);
check(analysis?.container?.fastStart === false, 'faststart correctly detected as absent');
check(!!analysis?.video?.letterbox, `letterbox detected: ${JSON.stringify(analysis?.video?.letterbox)}`);
check(analysis?.audio?.channels === 1, `mono detected`);
check(analysis?.audio?.lufs != null && analysis.audio.lufs < -30, `loudness measured ${analysis?.audio?.lufs} LUFS`);
check(typeof before?.score === 'number', `score ${before?.score} (${before?.grade})`);
check(before.score < 60, 'a bad file scores badly');
check(before.blocking > 0, `${before.blocking} blocking issues`);
check(!!recommended && recommended.denoise !== 'auto' && recommended.sharpen !== 'auto',
  `recommendation is concrete, not "auto" (denoise=${recommended?.denoise}, sharpen=${recommended?.sharpen})`);
check(Array.isArray(complete.data?.reasons) && complete.data.reasons.length > 0, `${complete.data?.reasons?.length} reasons given`);

const poster = await fetch(`${BASE}/api/uploads/${uploadId}/poster`);
check(poster.ok && Number(poster.headers.get('content-length')) > 1000, 'poster frame generated');

const ranged = await fetch(`${BASE}/api/uploads/${uploadId}/source`, { headers: { range: 'bytes=0-1023' } });
check(ranged.status === 206 && ranged.headers.get('content-range')?.startsWith('bytes 0-1023/'),
  `byte-range works (${ranged.status} ${ranged.headers.get('content-range')})`);

step('GET /api/uploads/:id/evaluate for a different target');
const reEval = await api('GET', `/api/uploads/${uploadId}/evaluate?presetId=tiktok-4k`);
check(reEval.status === 200 && reEval.data?.recommended?.presetId === 'tiktok-4k', 're-evaluated against 4K target');

// ── 4. Option validation ──
step('Option whitelisting');
const evil = await api('POST', '/api/jobs', {
  uploadId, presetId: 'tiktok-1080',
  options: { ...recommended, denoise: 'auto', fit: '; rm -rf /', quality: 'ultra', padColor: 'red', variation: { enabled: true, zoom: 99, speed: 99 } },
});
check(evil.status === 201 || evil.status === 200, `hostile options accepted after sanitising (${evil.status})`);
const evilJob = evil.data?.job;
check(evilJob?.options?.fit === 'blur', `fit "; rm -rf /" → "${evilJob?.options?.fit}"`);
check(evilJob?.options?.quality === 'high', `quality "ultra" → "${evilJob?.options?.quality}"`);
check(evilJob?.options?.denoise !== 'auto', `denoise "auto" → "${evilJob?.options?.denoise}"`);
check(evilJob?.options?.padColor === '#000000', `padColor "red" → "${evilJob?.options?.padColor}"`);
check(evilJob?.options?.variation?.zoom <= 1.1, `zoom 99 → ${evilJob?.options?.variation?.zoom}`);
check(evilJob?.options?.variation?.speed <= 1.06, `speed 99 → ${evilJob?.options?.variation?.speed}`);
if (evilJob) await api('POST', `/api/jobs/${evilJob.id}/cancel`);

const missing = await api('POST', '/api/jobs', { uploadId: 'nope', presetId: 'tiktok-1080', options: recommended });
check(missing.status === 404, `unknown upload → 404`);
const badPreset = await api('POST', '/api/jobs', { uploadId, presetId: 'not-a-preset', options: recommended });
check(badPreset.status === 400 || badPreset.status === 404, `unknown preset → ${badPreset.status}`);

// ── 5. The real job, watched over SSE ──
step('POST /api/jobs and watch /api/events');
const sseEvents = [];
const sseController = new AbortController();
const ssePromise = (async () => {
  const res = await fetch(`${BASE}/api/events`, { signal: sseController.signal });
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop();
    for (const frame of frames) {
      const line = frame.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      try { sseEvents.push(JSON.parse(line.slice(5).trim())); } catch { /* heartbeat */ }
    }
  }
})().catch(() => {});
await new Promise((r) => setTimeout(r, 300));
check(sseEvents[0]?.type === 'hello', `SSE opened with a hello frame (${sseEvents[0]?.jobs?.length} known jobs)`);

const jobRes = await api('POST', '/api/jobs', { uploadId, presetId: 'tiktok-1080', options: recommended });
check(jobRes.status === 201 || jobRes.status === 200, `job created (${jobRes.status})`);
const jobId = jobRes.data?.job?.id;

const t0 = Date.now();
let job = null;
while (Date.now() - t0 < 240_000) {
  const poll = await api('GET', `/api/jobs/${jobId}`);
  job = poll.data?.job;
  if (job && ['done', 'error', 'cancelled'].includes(job.status)) break;
  await new Promise((r) => setTimeout(r, 500));
}
check(job?.status === 'done', `job finished: ${job?.status}${job?.error ? ` — ${job.error.message}` : ''}`);
if (job?.error?.detail) console.log(`      \x1b[2m${job.error.detail.split('\n').slice(-4).join('\n      ')}\x1b[0m`);

const progressEvents = sseEvents.filter((e) => e.type === 'job:progress' && e.jobId === jobId);
check(progressEvents.length > 2, `${progressEvents.length} live progress frames over SSE`);
const stagesSeen = [...new Set(progressEvents.map((e) => e.progress?.stage))];
check(stagesSeen.includes('encode'), `stages seen: ${stagesSeen.join(' → ')}`);
const monotonic = progressEvents.every((e, i, arr) => i === 0 || e.progress.percent >= arr[i - 1].progress.percent - 0.01);
check(monotonic, 'progress never goes backwards');
check(sseEvents.some((e) => e.type === 'job:updated' && e.job?.status === 'done'), 'terminal status pushed over SSE');
sseController.abort();
await ssePromise;

// ── 6. Verify what came out ──
step('Verify the output');
check(!!job?.plan?.filterGraph, 'filter graph recorded on the job');
check(Array.isArray(job?.plan?.argv) && job.plan.argv.includes('-filter_complex'), `argv recorded (${job?.plan?.argv?.length} args)`);
check(job?.plan?.modules?.length >= 8, `${job?.plan?.modules?.length} chain modules`);
check(!job?.sourcePath && !job?.outputPath, 'internal filesystem paths not exposed to the client');

const dl = await fetch(`${BASE}/api/jobs/${jobId}/download`);
check(dl.ok, `download ${dl.status}`);
check(/attachment/.test(dl.headers.get('content-disposition') || ''), 'served as an attachment');
check(/filename\*=UTF-8''/.test(dl.headers.get('content-disposition') || ''), 'Arabic filename encoded per RFC 5987');
const OUT = path.join(TMP, 'result.mp4');
await fs.writeFile(OUT, Buffer.from(await dl.arrayBuffer()));

const outProbe = await probe(OUT);
const v = outProbe.streams.find((s) => s.codec_type === 'video');
const a = outProbe.streams.find((s) => s.codec_type === 'audio');
check(v?.width === 1080 && v?.height === 1920, `output is ${v?.width}x${v?.height} vertical`);
check(v?.codec_name === 'h264' && /high/i.test(v?.profile || ''), `${v?.codec_name} ${v?.profile}`);
check(v?.pix_fmt === 'yuv420p', `pix_fmt ${v?.pix_fmt}`);
check(v?.color_primaries === 'bt709' && v?.color_transfer === 'bt709' && v?.color_space === 'bt709', `colour tagged bt709 on all three axes`);
check(v?.r_frame_rate === v?.avg_frame_rate, `constant frame rate (${v?.r_frame_rate})`);
check(a?.channels === 2 && a?.sample_rate === '48000', `audio ${a?.channels}ch @ ${a?.sample_rate}`);
check(a?.codec_name === 'aac', `audio codec ${a?.codec_name}`);

const head = await fs.open(OUT, 'r').then(async (fh) => { const b = Buffer.alloc(64); await fh.read(b, 0, 64, 0); await fh.close(); return b; });
const moovAt = head.indexOf('moov');
const mdatAt = head.indexOf('mdat');
check(moovAt > 0 && (mdatAt < 0 || moovAt < mdatAt), 'moov is at the front of the file (faststart)');

check(job?.afterScore?.score > before.score, `score ${before.score} → ${job?.afterScore?.score} (${job?.afterScore?.grade})`);
check(job?.afterScore?.blocking === 0, `blocking issues ${before.blocking} → ${job?.afterScore?.blocking}`);
check(Math.abs((job?.after?.audio?.lufs ?? -99) + 14) < 1.5, `loudness landed at ${job?.after?.audio?.lufs} LUFS (target −14)`);
check(!job?.after?.video?.letterbox, 'letterbox bars removed');
check(job?.after?.video?.bitsPerPixel > job?.analysis?.video?.bitsPerPixel,
  `data density ${job?.analysis?.video?.bitsPerPixel} → ${job?.after?.video?.bitsPerPixel} bpp`);

const report = await api('GET', `/api/jobs/${jobId}/report`);
check(report.status === 200, 'technical report downloads');

const outRange = await fetch(`${BASE}/api/jobs/${jobId}/output`, { headers: { range: 'bytes=100-199' } });
check(outRange.status === 206, `output seekable in a <video> element (${outRange.status})`);

// ── 7. Cancellation ──
step('Cancellation');
const slowJob = await api('POST', '/api/jobs', {
  uploadId, presetId: 'shorts-4k',
  options: { ...recommended, quality: 'max', denoise: 'nlmeans' },
});
const slowId = slowJob.data?.job?.id;
await new Promise((r) => setTimeout(r, 2500));
const cancelRes = await api('POST', `/api/jobs/${slowId}/cancel`);
check(cancelRes.status === 200, `cancel accepted (${cancelRes.status})`);
let cancelled = null;
for (let i = 0; i < 40; i++) {
  const poll = await api('GET', `/api/jobs/${slowId}`);
  cancelled = poll.data?.job;
  if (cancelled?.status === 'cancelled') break;
  await new Promise((r) => setTimeout(r, 400));
}
check(cancelled?.status === 'cancelled', `job status ${cancelled?.status}`);
const orphan = await fetch(`${BASE}/api/jobs/${slowId}/download`);
check(!orphan.ok, `no partial file left to download (${orphan.status})`);

// ── 8. Cleanup ──
step('Deletion');
const del = await api('DELETE', `/api/jobs/${jobId}`);
check(del.status === 200, `job deleted (${del.status})`);
const gone = await api('GET', `/api/jobs/${jobId}`);
check(gone.status === 404, `job now 404`);
const delUpload = await api('DELETE', `/api/uploads/${uploadId}`);
check(delUpload.status === 200, `upload deleted (${delUpload.status})`);

console.log('');
if (failed) { console.log(`\x1b[31m${failed} check${failed > 1 ? 's' : ''} failed.\x1b[0m\n`); process.exit(1); }
console.log('\x1b[32mAll checks passed.\x1b[0m\n');
