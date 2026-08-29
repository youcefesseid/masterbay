#!/usr/bin/env node
// Masterbay Build Script
// Generates integrity manifest, signs it, and prepares for distribution

import { promises as fs } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const MANIFEST_PATH = path.join(PUBLIC_DIR, 'integrity-manifest.json');

const PROTECTED_FILES = [
  'server.js',
  'src/api.js',
  'src/chain.js',
  'src/presets.js',
  'src/enhance.js',
  'src/license.js',
  'src/anti-tamper.js',
  'public/app.js',
  'electron/main.js',
];

async function main() {
  console.log('🔨 Masterbay Build Script');
  console.log('━'.repeat(50));

  // 1. Generate or load secret key
  const secretKey = process.env.INTEGRITY_SECRET_KEY || generateSecretKey();
  console.log('🔑 Secret key:', secretKey.slice(0, 16) + '...');

  // 2. Compute hashes for all protected files
  const hashes = {};
  for (const file of PROTECTED_FILES) {
    try {
      const filePath = path.join(ROOT, file);
      const content = await fs.readFile(filePath, 'utf8');
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      hashes[file] = hash;
      console.log(`  ✓ ${file}: ${hash.slice(0, 16)}...`);
    } catch (err) {
      console.warn(`  ⚠ ${file}: ${err.message}`);
    }
  }

  // 3. Create manifest
  const manifest = {
    version: '2.0',
    timestamp: Date.now(),
    hashes,
    publicKey: secretKey,
    signature: '',
  };

  // 4. Sign the manifest
  const payload = JSON.stringify({
    version: manifest.version,
    hashes: manifest.hashes,
    timestamp: manifest.timestamp,
  });
  
  const hmac = crypto.createHmac('sha256', Buffer.from(secretKey, 'hex'));
  hmac.update(payload);
  manifest.signature = hmac.digest('hex');

  console.log('\n✍️  Manifest signed');

  // 5. Write manifest to public directory
  await fs.mkdir(PUBLIC_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`📄 Manifest written to: ${MANIFEST_PATH}`);

  // 6. Obfuscate client-side JavaScript (optional but recommended)
  if (process.argv.includes('--obfuscate')) {
    await obfuscateClientJS();
  }

  // 7. Create build info
  const buildInfo = {
    version: '1.0.0',
    buildDate: new Date().toISOString(),
    commit: getGitCommit(),
    manifestHash: crypto.createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16),
  };
  
  await fs.writeFile(path.join(PUBLIC_DIR, 'build-info.json'), JSON.stringify(buildInfo, null, 2));
  console.log('📋 Build info written');

  console.log('\n✅ Build complete!');
  console.log('\n📝 Next steps:');
  console.log('   1. Set INTEGRITY_SECRET_KEY in your environment');
  console.log('   2. Deploy worker: npx wrangler deploy');
  console.log('   3. Add publicKey to wrangler.toml as LICENSE_SECRET');
  console.log('   4. Build Electron: npm run build');
}

function generateSecretKey() {
  return crypto.randomBytes(32).toString('hex');
}

function getGitCommit() {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8', stdio: 'pipe' }).trim();
  } catch {
    return 'unknown';
  }
}

async function obfuscateClientJS() {
  console.log('\n🔒 Obfuscating client-side JavaScript...');
  
  const files = [
    'public/app.js',
    'src/license.js',
    'src/anti-tamper.js',
  ];

  for (const file of files) {
    try {
      const filePath = path.join(ROOT, file);
      const content = await fs.readFile(filePath, 'utf8');
      
      // Simple obfuscation: string encoding, dead code, control flow
      const obfuscated = simpleObfuscate(content);
      
      await fs.writeFile(filePath + '.obfuscated', obfuscated);
      console.log(`  ✓ ${file} → ${file}.obfuscated`);
    } catch (err) {
      console.warn(`  ⚠ ${file}: ${err.message}`);
    }
  }
}

function simpleObfuscate(code) {
  // This is a basic obfuscation - for production use javascript-obfuscator npm package
  let result = code;
  
  // Encode strings
  const stringRegex = /(["'])((?:\\.|(?!\1).)*)\1/g;
  result = result.replace(stringRegex, (match, quote, str) => {
    if (str.length < 4) return match; // Don't obfuscate short strings
    const encoded = Buffer.from(str).toString('base64');
    return `atob("${encoded}")`;
  });

  // Add dead code
  const deadCode = `\n;(()=>{const _=Math.random();if(_>2){console.log(${Math.random()})}})();\n`;
  
  return deadCode + result;
}

main().catch(err => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});