// In-memory registry for uploads and jobs, mirrored to disk so a restart doesn't
// lose the queue, plus a tiny event bus that the browser subscribes to over SSE.
import { EventEmitter } from 'node:events';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { JOBS_FILE, UPLOAD_DIR, OUTPUT_DIR, WORK_DIR, RETENTION_HOURS } from './config.js';
import { id, writeJsonAtomic, readJsonFile, rmQuiet, safeName } from './util.js';

export const bus = new EventEmitter();
bus.setMaxListeners(0);

/** @type {Map<string, object>} */
export const uploads = new Map();
/** @type {Map<string, object>} */
export const jobs = new Map();

let saveTimer = null;
let savePending = false;

function scheduleSave() {
  savePending = true;
  if (saveTimer) return;
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    if (!savePending) return;
    savePending = false;
    try {
      await writeJsonAtomic(JOBS_FILE, {
        version: 1,
        savedAt: new Date().toISOString(),
        uploads: [...uploads.values()].map(serialiseUpload),
        jobs: [...jobs.values()].map(serialiseJob),
      });
    } catch (err) {
      console.error('[store] could not save state:', err.message);
    }
  }, 400);
}

const serialiseUpload = (u) => ({ ...u, stream: undefined });
const serialiseJob = (j) => ({ ...j, _process: undefined });

export async function load() {
  const data = await readJsonFile(JOBS_FILE, null);
  if (!data) return;
  for (const u of data.uploads || []) uploads.set(u.id, u);
  for (const j of data.jobs || []) {
    // Anything mid-flight when the process died is not running now.
    if (j.status === 'running' || j.status === 'queued') {
      j.status = 'error';
      j.error = { message: 'Interrupted when the server restarted. Start it again.' };
    }
    jobs.set(j.id, j);
  }
  console.log(`[store] restored ${uploads.size} uploads and ${jobs.size} jobs`);
}

// ---- Uploads ---------------------------------------------------------------

export function createUpload({ name, size, mimeType }) {
  const uploadId = id();
  const clean = safeName(path.basename(name || 'video'));
  const ext = path.extname(clean).toLowerCase() || '.mp4';
  const record = {
    id: uploadId,
    name: clean,
    ext,
    size: Number(size) || 0,
    mimeType: mimeType || null,
    received: 0,
    path: path.join(UPLOAD_DIR, `${uploadId}${ext}`),
    posterPath: path.join(WORK_DIR, `${uploadId}-poster.jpg`),
    complete: false,
    analysis: null,
    createdAt: new Date().toISOString(),
  };
  uploads.set(uploadId, record);
  scheduleSave();
  return record;
}

export function touchUpload(uploadId, patch) {
  const record = uploads.get(uploadId);
  if (!record) return null;
  Object.assign(record, patch);
  scheduleSave();
  return record;
}

// ---- Jobs ------------------------------------------------------------------

export const STAGES = ['measure', 'encode', 'verify'];

export function createJob({ upload, preset, options, analysis, before, reasons }) {
  const jobId = id();
  const base = path.basename(upload.name, path.extname(upload.name));
  // ProRes has to go in a MOV. Writing it into an .mp4 either fails outright or produces
  // a file most players refuse, so the container follows the codec rather than the reverse.
  const ext = preset.container === 'mov' ? '.mov' : '.mp4';
  const outputName = `${base} — ${preset.id}${ext}`;
  const job = {
    id: jobId,
    status: 'queued',
    uploadId: upload.id,
    sourceName: upload.name,
    sourcePath: upload.path,
    sourceSizeBytes: upload.size || analysis.sizeBytes,
    outputName,
    outputPath: path.join(OUTPUT_DIR, `${jobId}${ext}`),
    posterPath: path.join(WORK_DIR, `${jobId}-poster.jpg`),
    presetId: preset.id,
    presetLabel: preset.label,
    options,
    reasons,
    analysis,
    before,
    plan: null,
    after: null,
    afterScore: null,
    progress: { stage: 'queued', percent: 0, fps: null, speed: null, etaSeconds: null, outTime: 0, frames: 0 },
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
  };
  jobs.set(jobId, job);
  scheduleSave();
  emit('job:created', job);
  return job;
}

export function updateJob(jobId, patch, { silent = false } = {}) {
  const job = jobs.get(jobId);
  if (!job) return null;
  Object.assign(job, patch);
  job.updatedAt = new Date().toISOString();
  scheduleSave();
  if (!silent) emit('job:updated', job);
  return job;
}

/** Progress fires many times a second, so it gets its own light-weight event. */
export function updateProgress(jobId, progress) {
  const job = jobs.get(jobId);
  if (!job) return null;
  job.progress = { ...job.progress, ...progress };
  bus.emit('event', { type: 'job:progress', jobId, progress: job.progress });
  return job;
}

function emit(type, job) {
  bus.emit('event', { type, jobId: job.id, job: publicJob(job) });
}

/** Trim internals and absolute paths before anything reaches the browser. */
export function publicJob(job) {
  if (!job) return null;
  const { sourcePath, outputPath, posterPath, _process, ...rest } = job;
  return {
    ...rest,
    hasOutput: job.status === 'done',
    analysis: job.analysis ? publicAnalysis(job.analysis) : null,
    after: job.after ? publicAnalysis(job.after) : null,
  };
}

export function publicAnalysis(analysis) {
  if (!analysis) return null;
  const { file, ...rest } = analysis;
  return rest;
}

export function publicUpload(upload) {
  if (!upload) return null;
  const { path: _p, posterPath: _pp, ...rest } = upload;
  return { ...rest, analysis: publicAnalysis(upload.analysis) };
}

export async function deleteJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return false;
  await Promise.all([rmQuiet(job.outputPath), rmQuiet(job.posterPath)]);
  jobs.delete(jobId);
  scheduleSave();
  bus.emit('event', { type: 'job:deleted', jobId });
  return true;
}

export async function deleteUpload(uploadId) {
  const upload = uploads.get(uploadId);
  if (!upload) return false;
  // Only jobs that could still read the file matter. Cancelled counts as finished.
  const stillUsed = [...jobs.values()].some(
    (j) => j.uploadId === uploadId && (j.status === 'queued' || j.status === 'running' || j.status === 'cancelling'),
  );
  if (stillUsed) return false;
  await Promise.all([rmQuiet(upload.path), rmQuiet(upload.posterPath)]);
  uploads.delete(uploadId);
  scheduleSave();
  return true;
}

/** Housekeeping: drop old finished work so the disk doesn't fill up. */
export async function sweep() {
  if (!RETENTION_HOURS) return { jobs: 0, uploads: 0, orphans: 0 };
  const cutoff = Date.now() - RETENTION_HOURS * 3600 * 1000;
  let removedJobs = 0;
  let removedUploads = 0;

  for (const job of [...jobs.values()]) {
    const when = Date.parse(job.finishedAt || job.createdAt || 0);
    if ((job.status === 'done' || job.status === 'error' || job.status === 'cancelled') && when && when < cutoff) {
      await deleteJob(job.id);
      removedJobs++;
    }
  }
  for (const upload of [...uploads.values()]) {
    const when = Date.parse(upload.createdAt || 0);
    if (when && when < cutoff && await deleteUpload(upload.id)) removedUploads++;
  }

  // Files on disk with no record pointing at them.
  let orphans = 0;
  const known = new Set([
    ...[...uploads.values()].map((u) => u.path),
    ...[...jobs.values()].flatMap((j) => [j.outputPath, j.posterPath]),
    ...[...uploads.values()].map((u) => u.posterPath),
  ]);
  for (const dir of [UPLOAD_DIR, OUTPUT_DIR, WORK_DIR]) {
    let entries = [];
    try {
      entries = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry);
      if (known.has(full)) continue;
      try {
        const stat = await fs.stat(full);
        if (stat.mtimeMs < cutoff) {
          await rmQuiet(full);
          orphans++;
        }
      } catch { /* raced with something else */ }
    }
  }

  if (removedJobs || removedUploads || orphans) {
    console.log(`[store] swept ${removedJobs} jobs, ${removedUploads} uploads, ${orphans} orphaned files`);
  }
  return { jobs: removedJobs, uploads: removedUploads, orphans };
}
