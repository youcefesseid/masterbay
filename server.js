// Entry point: static files, the API, and a periodic sweep of old work.
import http from 'node:http';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import crypto from 'node:crypto';
import { PORT, HOST, PUBLIC_DIR, DIRS, STORAGE, CONCURRENCY, RETENTION_HOURS } from './src/config.js';
import { mkdirp, serveFile, fail, json } from './src/util.js';
import { capabilities } from './src/ff.js';
import * as store from './src/store.js';
import { handleApi } from './src/api.js';
import { enqueue } from './src/pipeline.js';

const startedAt = Date.now();

// Integrity manifest (generated at build time, served statically)
let integrityManifest = null;
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'integrity-manifest.json');

async function loadIntegrityManifest() {
  try {
    const content = await fs.readFile(MANIFEST_PATH, 'utf8');
    integrityManifest = JSON.parse(content);
    console.log('[integrity] Manifest loaded:', MANIFEST_PATH);
  } catch (err) {
    console.warn('[integrity] Manifest not found, generating fallback:', err.message);
    integrityManifest = await generateIntegrityManifest();
  }
}

async function generateIntegrityManifest() {
  const hashes = {};
  for (const file of [
    'server.js',
    'src/api.js',
    'src/chain.js',
    'src/presets.js',
    'src/enhance.js',
    'src/license.js',
    'src/anti-tamper.js',
    'public/app.js',
    'electron/main.js',
  ]) {
    try {
      const filePath = path.join(process.cwd(), file);
      const content = await fs.readFile(filePath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      hashes[file] = hash;
    } catch {
      // File might not exist in all environments
    }
  }
  return {
    version: '2.0',
    timestamp: Date.now(),
    hashes,
    // Public key for HMAC verification (embedded in client)
    publicKey: process.env.INTEGRITY_PUBLIC_KEY || '00'.repeat(32),
    signature: '', // Will be filled by build script
  };
}

async function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.join(PUBLIC_DIR, rel);
  // Refuse anything that resolves outside the public folder.
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== PUBLIC_DIR) {
    return fail(res, 403, 'Forbidden');
  }
  const exists = await fs.stat(target).then((s) => s.isFile(), () => false);
  if (!exists) {
    if (rel === '/index.html') return fail(res, 500, 'public/index.html is missing from the install.');
    return fail(res, 404, 'Not found');
  }
  const immutable = /\.(css|js|svg|png|jpg|woff2?)$/.test(target);
  return serveFile(req, res, target, { cacheControl: immutable ? 'public, max-age=300' : 'no-store' });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const label = `${req.method} ${url.pathname}`;
  try {
    if (url.pathname === '/healthz') {
      const caps = await capabilities();
      return json(res, caps.available ? 200 : 503, {
        ok: caps.available,
        engine: caps.version || caps.reason,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
        jobs: store.jobs.size,
        uploads: store.uploads.size,
      });
    }
    
    // Integrity manifest endpoint for client-side verification
    if (url.pathname === '/api/integrity/manifest') {
      if (!integrityManifest) await loadIntegrityManifest();
      return json(res, 200, integrityManifest);
    }

    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return await handleApi(req, res, url);
    }
    return await serveStatic(req, res, url);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error(`[server] ${label} failed:`, err);
    if (res.headersSent) return res.destroy();
    return fail(res, status, err.message || 'Something went wrong on the server.');
  }
});

// Long uploads and long encodes must not be cut off by idle timeouts.
server.requestTimeout = 0;
server.headersTimeout = 120_000;
server.keepAliveTimeout = 75_000;
server.timeout = 0;

async function main() {
  await Promise.all(DIRS.map(mkdirp));
  await store.load();
  await loadIntegrityManifest(); // Load integrity manifest early

  const caps = await capabilities();
  if (!caps.available) {
    console.error('\n  FFmpeg was not found.\n');
    console.error(`  ${caps.reason}`);
    console.error('  Install it, or point FFMPEG_PATH and FFPROBE_PATH at the binaries:');
    console.error('    macOS    brew install ffmpeg');
    console.error('    Ubuntu   sudo apt install ffmpeg');
    console.error('    Windows  winget install Gyan.FFmpeg\n');
  }

  enqueue(); // pick up anything that was queued before a restart

  if (RETENTION_HOURS) {
    setInterval(() => store.sweep().catch((e) => console.error('[sweep]', e.message)), 30 * 60 * 1000).unref();
    store.sweep().catch(() => {});
  }

  server.listen(PORT, HOST, () => {
    const engine = caps.available
      ? caps.version.replace(/^ffmpeg version /i, '').split(/\s+Copyright/i)[0].trim()
      : 'not found';
    console.log('');
    console.log('  Masterbay');
    console.log(`  http://${HOST}:${PORT}`);
    console.log('');
    console.log(`  engine       ${engine}`);
    console.log(`  hardware     ${caps.hwEncoder || 'software only (libx264)'}`);
    console.log(`  concurrency  ${CONCURRENCY} job${CONCURRENCY === 1 ? '' : 's'} at a time`);
    console.log(`  storage      ${STORAGE}`);
    console.log(`  retention    ${RETENTION_HOURS ? `${RETENTION_HOURS}h` : 'keep everything'}`);
    console.log('');
  });
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`\n  Shutting down.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}

process.on('unhandledRejection', (err) => console.error('[unhandled]', err));

main().catch((err) => {
  console.error('Could not start:', err);
  process.exit(1);
});
