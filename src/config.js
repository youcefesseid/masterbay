// Everything tunable lives here. Override any of it with environment variables.
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const env = (key, fallback) => process.env[key] ?? fallback;
const envNum = (key, fallback) => {
  const n = Number(process.env[key]);
  return Number.isFinite(n) ? n : fallback;
};
const envBool = (key, fallback) => {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(v);
};

export const PORT = envNum('PORT', 4173);
export const HOST = env('HOST', '127.0.0.1');

export const FFMPEG = env('FFMPEG_PATH', 'ffmpeg');
export const FFPROBE = env('FFPROBE_PATH', 'ffprobe');

export const STORAGE = path.resolve(env('STORAGE_DIR', path.join(ROOT, 'storage')));
export const UPLOAD_DIR = path.join(STORAGE, 'uploads');
export const OUTPUT_DIR = path.join(STORAGE, 'outputs');
export const WORK_DIR = path.join(STORAGE, 'work');
export const JOBS_FILE = path.join(STORAGE, 'jobs.json');
export const PUBLIC_DIR = path.join(ROOT, 'public');

/** Hard ceiling on a single upload. 4K masters get big, so this is generous. */
export const MAX_UPLOAD_BYTES = envNum('MAX_UPLOAD_BYTES', 12 * 1024 * 1024 * 1024);
export const UPLOAD_CHUNK_BYTES = envNum('UPLOAD_CHUNK_BYTES', 8 * 1024 * 1024);

/** How many encodes run at once. One is right for most boxes: x264 already uses every core. */
export const CONCURRENCY = Math.max(1, envNum('CONCURRENCY', 1));
export const ENCODE_THREADS = envNum('ENCODE_THREADS', 0); // 0 = let x264 decide

/** Delete finished jobs and their files after this long. 0 disables cleanup. */
export const RETENTION_HOURS = envNum('RETENTION_HOURS', 48);

/** Frame interpolation and nlmeans are extremely slow; off unless you opt in. */
export const ALLOW_SLOW_FILTERS = envBool('ALLOW_SLOW_FILTERS', true);

/**
 * Ceiling on the frame size the filter graph and encoder may work at, in megapixels.
 *
 * 0 means "work it out from available RAM", which is the right default. Set it explicitly
 * if you know better than the heuristic: raise it on a machine with plenty of memory that
 * is refusing an 8K job it could actually handle, or lower it to stop a long encode
 * competing with everything else you are running.
 */
export const RENDER_MEGAPIXELS = envNum('RENDER_MEGAPIXELS', 0);

export const ACCEPTED_EXTENSIONS = new Set([
  '.mp4', '.mov', '.m4v', '.mkv', '.webm', '.avi', '.flv', '.wmv',
  '.mpg', '.mpeg', '.ts', '.m2ts', '.mts', '.3gp', '.ogv', '.mxf', '.gif',
]);

export const CPU_COUNT = os.cpus().length || 2;

export const DIRS = [STORAGE, UPLOAD_DIR, OUTPUT_DIR, WORK_DIR];
