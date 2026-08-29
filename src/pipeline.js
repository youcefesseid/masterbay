// The worker. Takes queued jobs one at a time and walks them through
// measure -> encode -> verify, reporting progress as it goes.
// Supports parallel segment encoding for massive speedups on multi-core systems.
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { CONCURRENCY, FFMPEG } from './config.js';
import { capabilities, measureLoudness, run, cancel, grabFrame, FFError } from './ff.js';
import { inspect } from './probe.js';
import { evaluate } from './qc.js';
import { buildPlan } from './chain.js';
import { PRESETS_BY_ID } from './presets.js';
import { jobs, updateJob, updateProgress, publicJob, bus } from './store.js';
import { clamp, round, isNum } from './util.js';

const STAGE_WEIGHTS = { measure: 12, encode: 80, verify: 8 };

let active = 0;
let draining = false;

export function enqueue() {
  if (draining) return;
  draining = true;
  setImmediate(drain);
}

async function drain() {
  draining = false;
  while (active < CONCURRENCY) {
    const next = [...jobs.values()]
      .filter((j) => j.status === 'queued')
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
    if (!next) return;
    active++;
    runJob(next)
      .catch((err) => console.error(`[pipeline] job ${next.id} crashed:`, err))
      .finally(() => {
        active--;
        enqueue();
      });
  }
}

export function cancelJob(jobId) {
  const job = jobs.get(jobId);
  if (!job) return false;
  if (job.status === 'queued') {
    updateJob(jobId, { status: 'cancelled', finishedAt: new Date().toISOString() });
    return true;
  }
  if (job.status !== 'running') return false;
  updateJob(jobId, { status: 'cancelling' }, { silent: true });
  return cancel(`job:${jobId}`);
}

async function runJob(job) {
  const startedAt = Date.now();
  const token = `job:${job.id}`;
  const preset = PRESETS_BY_ID.get(job.presetId);
  const caps = await capabilities();

  updateJob(job.id, {
    status: 'running',
    startedAt: new Date().toISOString(),
    error: null,
    progress: { stage: 'measure', percent: 0, label: { ar: 'قياس الصوت', en: 'Measuring audio' } },
  });

  const needsMeasure = job.options.loudness === 'twoPass' && job.analysis.audio.present && !!preset.lufs;
  const weights = needsMeasure
    ? STAGE_WEIGHTS
    : { measure: 0, encode: STAGE_WEIGHTS.encode + STAGE_WEIGHTS.measure, verify: STAGE_WEIGHTS.verify };
  const offsetOf = (stage) => (stage === 'measure' ? 0 : stage === 'encode' ? weights.measure : weights.measure + weights.encode);
  const report = (stage, fraction, extra = {}) => {
    const percent = clamp(offsetOf(stage) + weights[stage] * clamp(fraction, 0, 1), 0, 99.5);
    updateProgress(job.id, { stage, percent: round(percent, 1), ...extra });
  };

  const timings = {};

  try {
    // ---- Stage 1: measure loudness on the whole file ----------------------
    let loudness = job.analysis.audio.loudnessMeasurement || null;
    if (needsMeasure) {
      const t0 = Date.now();
      report('measure', 0.1, { label: { ar: 'قياس الصوت على كامل الملف', en: 'Measuring loudness across the file' } });
      if (!loudness) loudness = await measureLoudness(job.sourcePath, { token });
      timings.measureMs = Date.now() - t0;
      report('measure', 1);
    }

    // ---- Build the plan --------------------------------------------------
    const plan = await buildPlan({
      analysis: job.analysis,
      preset,
      options: job.options,
      caps,
      loudness,
      inputPath: job.sourcePath,
      outputPath: job.outputPath,
    });
    updateJob(job.id, {
      plan: {
        modules: plan.modules,
        target: plan.target,
        notes: plan.notes,
        filterGraph: plan.filterGraph,
        argv: plan.args,
      },
    });

    // ---- Stage 2: encode -------------------------------------------------
    const t1 = Date.now();
    const speed = job.options.variation?.enabled ? (job.options.variation.speed || 1) : 1;
    const trimStart = Number(job.options.trimStart) || 0;
    const trimEnd = Number(job.options.trimEnd) || 0;
    const sourceDuration = job.analysis.container.duration || 0;
    const trimmedDuration = Math.max(0.1, sourceDuration - trimStart - trimEnd);
    const expectedSeconds = trimmedDuration / (speed || 1);

    report('encode', 0, { label: { ar: 'الترميز', en: 'Encoding' } });

    // Check if parallel encoding is enabled
    const useParallel = job.options.parallel && !job.options.variation?.enabled && sourceDuration > 30;
    const segmentCount = Math.min(Math.max(2, Math.floor(caps.cpuCores / 2)), 8); // 2-8 segments based on cores

    if (useParallel && segmentCount > 1) {
      await runParallelEncode(job, plan, token, report, expectedSeconds, segmentCount, trimmedDuration, speed);
    } else {
      await runSingleEncode(job, plan, token, report, expectedSeconds, speed, trimmedDuration);
    }

    timings.encodeMs = Date.now() - t1;

    // ---- Stage 3: verify the file we just made ---------------------------
    const t2 = Date.now();
    report('verify', 0.2, { label: { ar: 'التحقق من الناتج', en: 'Verifying the result' } });

    const after = await inspect(job.outputPath, { analysisSeconds: 60, token });
    report('verify', 0.7);

    const at = Math.min(1, (after.container.duration || 2) * 0.25);
    await grabFrame(job.outputPath, job.posterPath, { at, width: 640, token }).catch(() => null);

    const afterScore = evaluate(after, preset, 'output');
    timings.verifyMs = Date.now() - t2;

    updateProgress(job.id, { stage: 'done', percent: 100, etaSeconds: 0 });
    updateJob(job.id, {
      status: 'done',
      after,
      afterScore,
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      timings,
      delta: {
        scoreBefore: job.before.score,
        scoreAfter: afterScore.score,
        sizeBefore: job.analysis.sizeBytes,
        sizeAfter: after.sizeBytes,
        bppBefore: job.analysis.video.bitsPerPixel,
        bppAfter: after.video.bitsPerPixel,
        pixelsBefore: job.analysis.video.width * job.analysis.video.height,
        pixelsAfter: after.video.width * after.video.height,
        lufsBefore: job.analysis.audio.lufs,
        lufsAfter: after.audio.lufs,
      },
    });
    console.log(`[pipeline] ${job.id} done in ${((Date.now() - startedAt) / 1000).toFixed(1)}s — score ${job.before.score} → ${afterScore.score}`);
  } catch (err) {
    await fs.rm(job.outputPath, { force: true }).catch(() => {});
    if (err.cancelled || job.status === 'cancelling') {
      updateJob(job.id, {
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
        progress: { ...job.progress, stage: 'cancelled' },
      });
      return;
    }
    console.error(`[pipeline] ${job.id} failed: ${err.message}`);
    updateJob(job.id, {
      status: 'error',
      error: {
        message: err.message,
        detail: err instanceof FFError ? String(err.stderr || '').split('\n').slice(-14).join('\n') : null,
      },
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    });
  }
}

/**
 * Run parallel encoding by splitting video into segments, encoding each
 * concurrently, then concatenating. Massive speedup on multi-core.
 */
async function runParallelEncode(job, plan, token, report, expectedSeconds, segmentCount, trimmedDuration, speed) {
  const segmentDuration = trimmedDuration / segmentCount;
  const segmentPaths = [];
  const segmentErrors = [];

  // Update progress to show parallel encoding
  report('encode', 0.05, { 
    label: { ar: 'الترميز المتوازي', en: 'Parallel encoding' },
    parallel: true,
    segments: segmentCount,
  });

  // Build base filter graph without trim/start/end
  const baseFilterGraph = plan.filterGraph;
  const baseArgs = [...plan.args];

  // Create a temp directory for segments
  const tempDir = path.join(path.dirname(job.outputPath), `.segments_${job.id}`);
  await fs.mkdir(tempDir, { recursive: true });

  const concurrency = Math.min(segmentCount, CONCURRENCY);

  // Encode segments in parallel batches
  for (let batchStart = 0; batchStart < segmentCount; batchStart += concurrency) {
    const batchEnd = Math.min(batchStart + concurrency, segmentCount);
    const batchSize = batchEnd - batchStart;
    
    const promises = [];
    for (let i = batchStart; i < batchEnd; i++) {
      const segStart = i * segmentDuration;
      const segEnd = (i + 1) * segmentDuration;
      const segOutputPath = path.join(tempDir, `seg_${String(i).padStart(3, '0')}.mp4`);
      segmentPaths.push(segOutputPath);

      promises.push(encodeSegment(
        job.sourcePath,
        segOutputPath,
        baseFilterGraph,
        segStart,
        segmentDuration,
        plan.args,
        token,
        i,
        segmentCount,
        report
      ));
    }

    const results = await Promise.allSettled(promises);
    results.forEach((result, idx) => {
      const segmentIdx = batchStart + idx;
      if (result.status === 'rejected') {
        segmentErrors.push({ segment: segmentIdx, error: result.reason.message });
      }
    });

    // Update overall progress
    const completed = batchEnd;
    report('encode', completed / segmentCount, { 
      parallel: true,
      segments: segmentCount,
      completed,
    });
  }

  if (segmentErrors.length > 0) {
    throw new Error(`Parallel encoding failed on segments: ${segmentErrors.map(e => `${e.segment}: ${e.error}`).join('; ')}`);
  }

  // Concatenate segments
  report('encode', 0.95, { 
    label: { ar: 'دمج المقاطع', en: 'Concatenating segments' },
    parallel: true,
  });

  await concatSegments(segmentPaths, job.outputPath, token);
  
  // Cleanup temp segments
  await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
}

/**
 * Encode a single segment with trim
 */
async function encodeSegment(sourcePath, outputPath, filterGraph, startTime, duration, baseArgs, token, segmentIndex, totalSegments, report) {
  // Build args for this segment
  const segmentArgs = [
    ...baseArgs.slice(0, baseArgs.indexOf('-filter_complex')),
    '-ss', String(startTime),
    '-t', String(duration),
    '-filter_complex', filterGraph,
    ...baseArgs.slice(baseArgs.indexOf('-filter_complex') + 2),
    outputPath
  ];

  // Update segment progress
  const segmentReport = (p) => {
    const outSeconds = Number(p.out_time_us || p.out_time_ms || 0) / (p.out_time_us ? 1e6 : 1e3);
    const fraction = duration > 0 ? outSeconds / duration : 0;
    report('encode', (segmentIndex + fraction) / totalSegments, {
      parallel: true,
      segments: totalSegments,
      completed: segmentIndex,
      currentSegment: segmentIndex,
      segmentProgress: fraction,
    });
  };

  await run(FFMPEG, segmentArgs, { token, onProgress: segmentReport });
}

/**
 * Concatenate segments using FFmpeg concat demuxer
 */
async function concatSegments(segmentPaths, outputPath, token) {
  const listPath = path.join(path.dirname(outputPath), `.concat_${Date.now()}.txt`);
  const listContent = segmentPaths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n');
  await fs.writeFile(listPath, listContent);

  const args = [
    '-f', 'concat',
    '-safe', '0',
    '-i', listPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath
  ];

  await run(FFMPEG, args, { token });

  await fs.rm(listPath, { force: true }).catch(() => {});
}

/**
 * Original single-threaded encode path
 */
async function runSingleEncode(job, plan, token, report, expectedSeconds, speed, trimmedDuration) {
  await run(FFMPEG, plan.args, {
    token,
    onProgress: (p) => {
      const outSeconds = Number(p.out_time_us || p.out_time_ms || 0) / (p.out_time_us ? 1e6 : 1e3);
      const fraction = expectedSeconds > 0 ? outSeconds / expectedSeconds : 0;
      const rate = Number(String(p.speed || '').replace('x', ''));
      const remaining = expectedSeconds > 0 ? Math.max(0, expectedSeconds - outSeconds) : null;
      report('encode', fraction, {
        label: { ar: 'الترميز', en: 'Encoding' },
        frames: Number(p.frame) || 0,
        fps: Number(p.fps) || null,
        speed: Number.isFinite(rate) ? rate : null,
        outTime: round(outSeconds, 2),
        totalSeconds: round(expectedSeconds, 2),
        bytes: Number(p.total_size) || null,
        etaSeconds: Number.isFinite(rate) && rate > 0 && remaining !== null ? Math.round(remaining / rate) : null,
      });
    },
  });
}

/** Analyse a freshly uploaded file and cache a poster frame for the preview. */
export async function analyseUpload(upload) {
  const analysis = await inspect(upload.path, { analysisSeconds: 90 });
  const at = Math.min(1.5, (analysis.container.duration || 2) * 0.25);
  await grabFrame(upload.path, upload.posterPath, { at, width: 640 }).catch(() => null);
  return analysis;
}

export { bus, publicJob, isNum, path };