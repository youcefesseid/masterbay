// Small helpers shared across the server. No third-party packages anywhere in this project.
import { createReadStream, promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.txt': 'text/plain; charset=utf-8',
};

export function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

export function json(res, code, body) {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  });
  res.end(payload);
}

export function fail(res, code, message, extra = {}) {
  return json(res, code, { error: message, ...extra });
}

export async function readJson(req, limitBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limitBytes) throw Object.assign(new Error('Request body too large'), { status: 413 });
    chunks.push(chunk);
  }
  if (!total) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

/** Serve a file with byte-range support so <video> can seek. */
export async function serveFile(req, res, filePath, opts = {}) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return fail(res, 404, 'File not found');
  }
  if (!stat.isFile()) return fail(res, 404, 'File not found');

  const type = opts.contentType || mimeFor(filePath);
  const headers = {
    'content-type': type,
    'accept-ranges': 'bytes',
    'cache-control': opts.cacheControl || 'no-store',
  };
  if (opts.download) {
    const name = opts.download.replace(/["\\\r\n]/g, '_');
    headers['content-disposition'] =
      `attachment; filename="${name.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }

  const range = req.headers.range;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] === '' ? null : Number(m[1]);
      let end = m[2] === '' ? null : Number(m[2]);
      if (start === null) {
        // suffix range: last N bytes
        start = Math.max(0, stat.size - (end ?? 0));
        end = stat.size - 1;
      } else if (end === null || end >= stat.size) {
        end = stat.size - 1;
      }
      if (start > end || start >= stat.size) {
        res.writeHead(416, { 'content-range': `bytes */${stat.size}` });
        return res.end();
      }
      headers['content-range'] = `bytes ${start}-${end}/${stat.size}`;
      headers['content-length'] = end - start + 1;
      res.writeHead(206, headers);
      if (req.method === 'HEAD') return res.end();
      return void createReadStream(filePath, { start, end }).pipe(res);
    }
  }

  headers['content-length'] = stat.size;
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  createReadStream(filePath).pipe(res);
}

export const id = () => randomUUID().replace(/-/g, '').slice(0, 20);

export async function mkdirp(dir) {
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Write JSON without risking a half-written file if the process dies mid-write. */
export async function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2));
  await fs.rename(tmp, file);
}

export async function readJsonFile(file, fallback = null) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function rmQuiet(target) {
  try {
    await fs.rm(target, { recursive: true, force: true });
  } catch {
    /* already gone */
  }
}

/** Strip anything that could escape a directory or upset a filesystem. */
export function safeName(name, fallback = 'video') {
  const base = String(name || '')
    .replace(/[\\/]/g, ' ')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[<>:"|?*]/g, '')
    .trim();
  return (base || fallback).slice(0, 140);
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const round = (n, places = 2) => {
  const f = 10 ** places;
  return Math.round(Number(n) * f) / f;
};
export const isNum = (n) => typeof n === 'number' && Number.isFinite(n);
export const num = (v, fallback = null) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function humanBytes(bytes) {
  if (!isNum(bytes) || bytes < 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

/** Parse an ffmpeg fraction like "30000/1001" into 29.97. */
export function parseRate(str) {
  if (!str) return null;
  const [a, b] = String(str).split('/').map(Number);
  if (!Number.isFinite(a)) return null;
  if (!b) return a;
  if (b === 0) return null;
  return a / b;
}

/** Snap a measured framerate to the nearest broadcast-standard rate. */
export function snapFps(fps) {
  if (!isNum(fps) || fps <= 0) return null;
  const standards = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120];
  let best = standards[0];
  for (const s of standards) if (Math.abs(s - fps) < Math.abs(best - fps)) best = s;
  return Math.abs(best - fps) / fps < 0.02 ? best : round(fps, 3);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
