// HTTP API. Everything the browser can ask for lives here.
import path from 'node:path';
import { createWriteStream, promises as fs } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import {
  MAX_UPLOAD_BYTES, UPLOAD_CHUNK_BYTES, ACCEPTED_EXTENSIONS, CONCURRENCY, RETENTION_HOURS,
} from './config.js';
import { json, fail, readJson, serveFile, clamp, round, mimeFor } from './util.js';
import { capabilities } from './ff.js';
import { PRESETS, PRESETS_BY_ID, DEFAULT_OPTIONS } from './presets.js';
import { LOOKS, LOOK_IDS } from './looks.js';
import { HDR_MODES, HDR_INFO, HDR_BRIGHTNESS } from './hdr.js';
import { REPAIR, CLARITY, HALATION, GRAIN, memoryBudget } from './enhance.js';
import { evaluate, recommend, BPP_BANDS } from './qc.js';
import * as store from './store.js';
import { enqueue, cancelJob, analyseUpload } from './pipeline.js';

const ENUMS = {
  fit: ['blur', 'crop', 'pad', 'stretch'],
  repair: ['off', 'light', 'medium', 'strong'],
  denoise: ['off', 'light', 'strong', 'nlmeans'],
  advancedDenoise: ['off', 'light', 'medium', 'strong'],
  deinterlace: ['off', 'auto'],
  sharpen: ['off', 'light', 'medium', 'strong'],
  clarity: ['off', 'soft', 'medium', 'strong'],
  look: LOOK_IDS,
  colorBoost: ['off', 'auto', 'vivid', 'colorbalance', 'vibrance'],
  halation: ['off', 'subtle', 'film', 'dreamy'],
  grain: ['off', 'fine', 'film', 'heavy'],
  vignette: ['off', 'subtle', 'medium', 'strong'],
  deshake: ['off', 'light', 'medium', 'strong'],
  watermark: ['off', 'light', 'medium', 'strong'],
  hdr: ['preset', ...HDR_MODES],
  hdrBrightness: Object.keys(HDR_BRIGHTNESS),
  tenBit: ['preset', 'off', 'on'],
  fpsMode: ['source', 'preset', 'interpolate60', 'interpolate120', 'interpolate240'],
  loudness: ['off', 'onePass', 'twoPass'],
  codec: ['preset', 'h264', 'hevc', 'prores'],
  quality: ['balanced', 'high', 'max'],
};

/** Numeric options: range-checked rather than whitelisted. */
const NUMERIC = {
  lookIntensity: { min: 0, max: 1 },
  hdrHighlights: { min: 0, max: 1 },
  supersample: { min: 1, max: 4, snap: [1, 2, 4] },
  shutter: { min: 0, max: 360, zeroAllowed: true },
  trimStart: { min: 0, max: 86400 },
  trimEnd: { min: 0, max: 86400 },
  autoTrim: { min: 0, max: 1, boolean: true },
  sceneDetection: { min: 0, max: 1, boolean: true },
};

/** Never trust the client. Every field is checked against a whitelist. */
export function sanitiseOptions(raw = {}) {
  const out = { ...DEFAULT_OPTIONS };
  const pick = (key) => {
    const allowed = ENUMS[key];
    if (raw[key] !== undefined && allowed.includes(raw[key])) { out[key] = raw[key]; return; }
    // A default that isn't itself in the whitelist would sail straight through and
    // then silently do nothing downstream, so never let one out of here.
    if (!allowed.includes(out[key])) out[key] = allowed[0];
  };
  for (const key of Object.keys(ENUMS)) pick(key);

  for (const [key, spec] of Object.entries(NUMERIC)) {
    const n = Number(raw[key]);
    if (!Number.isFinite(n)) continue;
    let value = clamp(n, spec.min, spec.max);
    // Shutter angle is either off or a real angle; 1-89 degrees is not a thing.
    if (spec.zeroAllowed && value > 0 && value < 90) value = 0;
    if (spec.snap) value = spec.snap.reduce((best, s) => (Math.abs(s - value) < Math.abs(best - value) ? s : best), spec.snap[0]);
    out[key] = value;
  }

  for (const key of ['autoCrop', 'deband', 'upscale', 'tonemapHdr', 'forceStereo', 'hwAccel', 'stripMetadata', 'measure', 'autoTrim', 'sceneDetection']) {
    if (typeof raw[key] === 'boolean') out[key] = raw[key];
  }
  if (typeof raw.padColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.padColor)) out.padColor = raw.padColor;

  const v = raw.variation || {};
  out.variation = {
    enabled: v.enabled === true,
    mirror: v.mirror === true,
    zoom: clamp(Number(v.zoom) || 1, 1, 1.1),
    speed: clamp(Number(v.speed) || 1, 0.94, 1.06),
  };
  return out;
}

const segments = (url) => url.pathname.split('/').filter(Boolean);

/**
 * Resolve a requested target. Absent means "use the default"; present but unknown is
 * a client bug, and silently substituting a different target would mean handing back
 * a file mastered for the wrong platform.
 */
function resolvePreset(requested) {
  if (requested === null || requested === undefined || requested === '') {
    return { preset: PRESETS_BY_ID.get(DEFAULT_OPTIONS.presetId) };
  }
  const preset = PRESETS_BY_ID.get(String(requested));
  if (preset) return { preset };
  return { error: `Unknown target "${requested}". Valid targets: ${[...PRESETS_BY_ID.keys()].join(', ')}.` };
}

export async function handleApi(req, res, url) {
  const parts = segments(url); // ['api', ...]
  const route = parts.slice(1);
  const method = req.method;

  // ---- Metadata ----------------------------------------------------------
  if (route[0] === 'meta' && method === 'GET') {
    const caps = await capabilities();
    const budget = memoryBudget();
    const describe = (table) => Object.entries(table)
      .filter(([, val]) => val !== null && val !== undefined)
      .map(([id, val]) => ({
        id,
        label: val.label || null,
        note: val.note || null,
      }));

    return json(res, 200, {
      presets: PRESETS,
      defaults: DEFAULT_OPTIONS,
      bppBands: BPP_BANDS,
      // Everything the UI needs to render the new controls with their own explanations,
      // rather than duplicating the copy in the front end where it would drift.
      looks: LOOKS.map(({ id, label, note }) => ({ id, label, note })),
      repair: describe(REPAIR),
      clarity: Object.keys(CLARITY),
      halation: Object.keys(HALATION),
      grain: Object.keys(GRAIN),
      hdr: { modes: HDR_MODES, info: HDR_INFO, brightness: HDR_BRIGHTNESS },
      limits: {
        maxUploadBytes: MAX_UPLOAD_BYTES,
        chunkBytes: UPLOAD_CHUNK_BYTES,
        acceptedExtensions: [...ACCEPTED_EXTENSIONS],
        concurrency: CONCURRENCY,
        retentionHours: RETENTION_HOURS,
        // The real ceiling on resolution on this machine, measured from available RAM.
        // The UI shows it so an 8K target that will be reduced says so before you queue it.
        renderMegapixels: round(budget.pixels / 1e6, 1),
        renderMemoryGb: budget.gb,
      },
      engine: caps.available
        ? {
            available: true,
            version: caps.version,
            hwEncoder: caps.hwEncoder,
            hevc: caps.encoders.hevc,
            prores: caps.encoders.prores,
            canInterpolate: caps.filters.minterpolate,
            canTonemap: caps.filters.zscale && caps.filters.tonemap,
            canDeband: caps.filters.deband,
            canNlmeans: caps.filters.nlmeans,
            canGrade: caps.filters.lut3d,
            canClarity: caps.filters.blend && caps.filters.gblur,
            canHalation: caps.filters.blend && caps.filters.curves && caps.filters.gblur,
            canGrain: caps.filters.noise,
            canHdr: caps.encoders.hevc && caps.filters.zscale,
            canRepair: caps.filters.spp || caps.filters.deblock,
            canMeasure: caps.filters.ssim && caps.filters.psnr,
            hasVmaf: caps.filters.libvmaf,
          }
        : { available: false, reason: caps.reason },
    });
  }

  // ---- Live event stream --------------------------------------------------
  if (route[0] === 'events' && method === 'GET') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    res.write(`retry: 2000\n\n`);
    const send = (payload) => {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    };
    send({ type: 'hello', jobs: [...store.jobs.values()].map(store.publicJob) });
    const onEvent = (payload) => send(payload);
    store.bus.on('event', onEvent);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000);
    req.on('close', () => {
      clearInterval(heartbeat);
      store.bus.off('event', onEvent);
    });
    return;
  }

  // ---- Uploads -----------------------------------------------------------
  if (route[0] === 'uploads') {
    // POST /api/uploads  — open an upload session
    if (route.length === 1 && method === 'POST') {
      const body = await readJson(req);
      const name = String(body.name || '');
      const ext = path.extname(name).toLowerCase();
      if (!ACCEPTED_EXTENSIONS.has(ext)) {
        return fail(res, 415, `That file type is not supported (${ext || 'no extension'}).`, {
          accepted: [...ACCEPTED_EXTENSIONS],
        });
      }
      const size = Number(body.size) || 0;
      if (size > MAX_UPLOAD_BYTES) {
        return fail(res, 413, `That file is larger than the ${round(MAX_UPLOAD_BYTES / 1024 ** 3, 1)} GB limit.`);
      }
      const upload = store.createUpload({ name, size, mimeType: body.mimeType });
      await fs.writeFile(upload.path, ''); // reserve the file so chunks can seek into it
      return json(res, 201, { upload: store.publicUpload(upload) });
    }

    const uploadId = route[1];
    const upload = uploadId ? store.uploads.get(uploadId) : null;
    if (!upload) return fail(res, 404, 'Upload session not found. Choose the file again.');

    // PUT /api/uploads/:id/chunk?offset=N — raw bytes, appended at the given offset
    if (route[2] === 'chunk' && method === 'PUT') {
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!Number.isInteger(offset) || offset < 0) return fail(res, 400, 'Bad chunk offset.');
      if (offset !== upload.received) {
        // The client and server disagree about progress; tell it where to resume.
        return json(res, 409, { error: 'Chunk out of order.', received: upload.received });
      }
      if (upload.received > MAX_UPLOAD_BYTES) return fail(res, 413, 'Upload exceeds the size limit.');

      let written = 0;
      const counter = async function* (source) {
        for await (const chunk of source) {
          written += chunk.length;
          if (offset + written > MAX_UPLOAD_BYTES) throw Object.assign(new Error('Too large'), { status: 413 });
          yield chunk;
        }
      };
      await pipeline(req, counter, createWriteStream(upload.path, { flags: 'r+', start: offset }));
      store.touchUpload(uploadId, { received: offset + written });
      return json(res, 200, { received: upload.received });
    }

    // POST /api/uploads/:id/complete — probe the file and report on it
    if (route[2] === 'complete' && method === 'POST') {
      const stat = await fs.stat(upload.path).catch(() => null);
      if (!stat || stat.size === 0) return fail(res, 400, 'Nothing was uploaded.');
      if (upload.size && Math.abs(stat.size - upload.size) > 1024) {
        return fail(res, 400, `Upload is incomplete: got ${stat.size} of ${upload.size} bytes. Try again.`);
      }
      try {
        const analysis = await analyseUpload(upload);
        store.touchUpload(uploadId, { complete: true, analysis, size: stat.size });
        const { preset, error } = resolvePreset(url.searchParams.get('presetId'));
        if (error) return fail(res, 400, error);
        const before = evaluate(analysis, preset, 'source');
        const { options, reasons } = recommend(analysis, preset);
        return json(res, 200, {
          upload: store.publicUpload(store.uploads.get(uploadId)),
          before,
          recommended: { ...DEFAULT_OPTIONS, ...options, presetId: preset.id },
          reasons,
        });
      } catch (err) {
        return fail(res, err.status || 422, err.message || 'That file could not be read as video.');
      }
    }

    // GET /api/uploads/:id/evaluate?presetId=… — re-score against a different target
    if (route[2] === 'evaluate' && method === 'GET') {
      if (!upload.analysis) return fail(res, 409, 'This upload has not been analysed yet.');
      const { preset, error } = resolvePreset(url.searchParams.get('presetId'));
      if (error) return fail(res, 400, error);
      const before = evaluate(upload.analysis, preset, 'source');
      const { options, reasons } = recommend(upload.analysis, preset);
      return json(res, 200, { before, recommended: { ...DEFAULT_OPTIONS, ...options, presetId: preset.id }, reasons });
    }

    if (route[2] === 'source' && (method === 'GET' || method === 'HEAD')) {
      return serveFile(req, res, upload.path, { contentType: 'video/mp4' });
    }
    if (route[2] === 'poster' && method === 'GET') {
      return serveFile(req, res, upload.posterPath, { contentType: 'image/jpeg', cacheControl: 'private, max-age=3600' });
    }
    if (route.length === 1 + 1 && method === 'DELETE') {
      const removed = await store.deleteUpload(uploadId);
      if (removed) return json(res, 200, { removed: true });
      return fail(res, 409, 'A job is still using this file. Cancel it first.');
    }
    return fail(res, 404, 'Unknown upload route.');
  }

  // ---- Jobs ---------------------------------------------------------------
  if (route[0] === 'jobs') {
    if (route.length === 1 && method === 'GET') {
      return json(res, 200, {
        jobs: [...store.jobs.values()]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .map(store.publicJob),
      });
    }

    if (route.length === 1 && method === 'POST') {
      const body = await readJson(req);
      const upload = store.uploads.get(String(body.uploadId || ''));
      if (!upload) return fail(res, 404, 'Upload not found. Choose the file again.');
      if (!upload.analysis) return fail(res, 409, 'This upload has not been analysed yet.');

      const { preset, error } = resolvePreset(body.presetId);
      if (error) return fail(res, 400, error);
      const options = sanitiseOptions(body.options);
      options.presetId = preset.id;

      const caps = await capabilities();
      if (!caps.available) return fail(res, 503, caps.reason);

      // Degrade anything this build cannot do, rather than queueing a job that will fail.
      // buildPlan repeats these checks and records a note for the user; doing it here too
      // keeps the stored options honest about what will actually run.
      if (options.denoise === 'nlmeans' && !caps.filters.nlmeans) options.denoise = 'strong';
      if ((options.fpsMode === 'interpolate60' || options.fpsMode === 'interpolate120') && !caps.filters.minterpolate) {
        options.fpsMode = 'preset';
      }
      if (options.shutter > 0 && !caps.filters.minterpolate) options.shutter = 0;
      if (options.codec === 'hevc' && !caps.encoders.hevc) options.codec = 'h264';
      if (options.codec === 'prores' && !caps.encoders.prores) options.codec = 'preset';
      if (options.look !== 'none' && !caps.filters.lut3d) options.look = 'none';
      if (options.clarity !== 'off' && !(caps.filters.blend && caps.filters.gblur)) options.clarity = 'off';
      if (options.halation !== 'off' && !(caps.filters.blend && caps.filters.curves)) options.halation = 'off';
      if (options.grain !== 'off' && !caps.filters.noise) options.grain = 'off';
      if (options.repair !== 'off' && !(caps.filters.spp || caps.filters.deblock)) options.repair = 'off';

      const before = evaluate(upload.analysis, preset, 'source');
      const { reasons } = recommend(upload.analysis, preset);
      const job = store.createJob({ upload, preset, options, analysis: upload.analysis, before, reasons });
      enqueue();
      return json(res, 201, { job: store.publicJob(job) });
    }

    const jobId = route[1];
    const job = jobId ? store.jobs.get(jobId) : null;
    if (!job) return fail(res, 404, 'Job not found.');

    if (route.length === 2 && method === 'GET') return json(res, 200, { job: store.publicJob(job) });

    if (route[2] === 'cancel' && method === 'POST') {
      const stopped = cancelJob(jobId);
      return json(res, stopped ? 200 : 409, { cancelled: stopped });
    }

    if (route.length === 2 && method === 'DELETE') {
      cancelJob(jobId);
      await store.deleteJob(jobId);
      return json(res, 200, { removed: true });
    }

    if (route[2] === 'output' && (method === 'GET' || method === 'HEAD')) {
      if (job.status !== 'done') return fail(res, 409, 'This job has not finished yet.');
      // ProRes masters are MOV, so the type follows the file rather than being assumed.
      return serveFile(req, res, job.outputPath, { contentType: mimeFor(job.outputPath) });
    }

    if (route[2] === 'download' && method === 'GET') {
      if (job.status !== 'done') return fail(res, 409, 'This job has not finished yet.');
      return serveFile(req, res, job.outputPath, { contentType: mimeFor(job.outputPath), download: job.outputName });
    }

    if (route[2] === 'poster' && method === 'GET') {
      return serveFile(req, res, job.posterPath, { contentType: 'image/jpeg', cacheControl: 'private, max-age=3600' });
    }

    if (route[2] === 'report' && method === 'GET') {
      const payload = {
        tool: 'Masterbay',
        generatedAt: new Date().toISOString(),
        source: { name: job.sourceName, ...store.publicAnalysis(job.analysis) },
        target: job.plan?.target || null,
        preset: job.presetId,
        options: job.options,
        decisions: job.reasons,
        filterGraph: job.plan?.filterGraph || null,
        ffmpegArgs: job.plan?.argv || null,
        scoreBefore: job.before,
        scoreAfter: job.afterScore,
        output: job.after ? { name: job.outputName, ...store.publicAnalysis(job.after) } : null,
        timings: job.timings || null,
      };
      const body = JSON.stringify(payload, null, 2);
      res.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="masterbay-report-${job.id}.json"`,
        'content-length': Buffer.byteLength(body),
      });
      return res.end(body);
    }

    return fail(res, 404, 'Unknown job route.');
  }

  // ---- License verification --------------------------------------------------
  if (route[0] === 'license' && method === 'POST') {
    const body = await readJson(req);
    const { licenseKey, email } = body;
    
    // In production, verify with doteta.com API
    // For now, accept any key starting with MB-
    const valid = licenseKey && licenseKey.startsWith('MB-') && licenseKey.length === 14;
    
    if (valid) {
      return json(res, 200, {
        valid: true,
        expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        features: ['batch', 'compare', 'projects', 'theme', 'subtitles', 'thumbnails'],
      });
    }
    
    return json(res, 401, { valid: false, error: 'Invalid license key' });
  }
  
  // ---- Update check --------------------------------------------------
  if (route[0] === 'update' && method === 'GET') {
    return json(res, 200, {
      current: '1.0.0',
      latest: '1.0.0',
      updateAvailable: false,
      downloadUrl: null,
    });
  }

  return fail(res, 404, 'Unknown endpoint.');
}
