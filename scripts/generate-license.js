#!/usr/bin/env node
// Masterbay License Key Generator
// Run with: node scripts/generate-license.js <email> [days] [features...]
// Features: encode, presets, batch, ai, gpu, cli, api, pro

import crypto from 'crypto';

const SECRET_HEX = process.env.LICENSE_SECRET || '38b37ae4c4a142c643e4511222712f8fc41a95afc739073297613689b177237a';

if (SECRET_HEX.length !== 64) {
  console.error('❌ Error: LICENSE_SECRET must be 64 hex chars');
  process.exit(1);
}

const [,, email, daysStr, ...features] = process.argv;

if (!email) {
  console.log('Usage: node scripts/generate-license.js <email> [days=365] [features...]');
  console.log('Features: encode, presets, batch, ai, gpu, cli, api, pro');
  console.log('Example: node scripts/generate-license.js user@example.com 365 encode presets batch pro');
  process.exit(1);
}

const days = parseInt(daysStr) || 365;
const featureList = features.length ? features : ['encode', 'presets', 'batch'];
const expiryDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
const expiryHex = Math.floor(expiryDate.getTime() / 1000).toString(16).padStart(8, '0');

const featureMap = {
  encode: 1, presets: 2, batch: 4, ai: 8, gpu: 16, cli: 32, api: 64, pro: 128
};
let featureBits = 0;
for (const f of featureList) {
  if (featureMap[f]) featureBits |= featureMap[f];
  else console.warn(`⚠️  Unknown feature: ${f}`);
}
const featuresHex = featureBits.toString(16).padStart(4, '0');

const payload = `${email.toLowerCase()}:${expiryHex}:${featuresHex}`;

async function generate() {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(SECRET_HEX),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  const hmacFull = bytesToHex(new Uint8Array(sig));
  const hmacPart = hmacFull.slice(0, 32);

  const emailHash = await simpleHash(email.toLowerCase());

  const licenseKey = `MB-${hmacPart}-${emailHash}-${expiryHex}-${featuresHex}`;

  console.log('\n✅ License Key Generated:');
  console.log('━'.repeat(60));
  console.log(licenseKey);
  console.log('━'.repeat(60));
  console.log(`📧 Email: ${email}`);
  console.log(`📅 Expires: ${expiryDate.toLocaleDateString()} (${days} days)`);
  console.log(`⚙️  Features: ${featureList.join(', ')}`);
  console.log(`🔑 Features bitmask: 0x${featuresHex}`);
  console.log('\n💡 Set LICENSE_SECRET in wrangler.toml and deploy worker');
  console.log('💡 Add to KV: meta:{licenseKey} -> {features, expires, maxJobs, maxConcurrency}');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function simpleHash(str) {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return bytesToHex(new Uint8Array(hashBuffer)).slice(0, 8);
}

generate().catch(console.error);