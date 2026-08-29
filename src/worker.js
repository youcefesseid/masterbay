export default {
  async fetch(request, env) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ valid: false, error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    try {
      const { licenseKey, email } = await request.json();

      if (!licenseKey || !email) {
        return new Response(JSON.stringify({ valid: false, error: 'Missing licenseKey or email' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Verify HMAC signature embedded in license key — no KV needed.
      const decoded = await verifyLicenseKey(licenseKey, email, env.LICENSE_SECRET);

      if (!decoded) {
        return new Response(JSON.stringify({ valid: false, error: 'Invalid license key' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check expiration (decoded from the key itself)
      if (decoded.expires && new Date(decoded.expires) < new Date()) {
        return new Response(JSON.stringify({ valid: false, error: 'License expired', expires: decoded.expires }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        valid: true,
        features: decoded.features,
        expires: decoded.expires,
        maxJobs: -1,
        maxConcurrency: 4,
        serverTime: new Date().toISOString(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });

    } catch (e) {
      return new Response(JSON.stringify({ valid: false, error: 'Server error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  },
};

// Decode features bitmask
const FEATURE_MAP = {
  1: 'encode', 2: 'presets', 4: 'batch', 8: 'ai',
  16: 'gpu', 32: 'cli', 64: 'api', 128: 'pro',
};

async function verifyLicenseKey(licenseKey, email, secret) {
  // Format: MB-<hmac(32)>-<emailHash(8)>-<expiryHex(8)>-<featuresHex(4)>
  if (!licenseKey.startsWith('MB-')) return null;

  const parts = licenseKey.split('-');
  if (parts.length < 5) return null;

  const [, hmacPart, emailHash, expiryHex, featuresHex] = parts;

  // Reconstruct payload and verify HMAC
  const payload = `${email.toLowerCase()}:${expiryHex}:${featuresHex}`;
  const expectedHmac = await hmacSha256Hex(payload, secret);

  if (!timingSafeEqual(hmacPart, expectedHmac.slice(0, 32))) return null;

  // Verify email hash matches
  const emailHashCheck = await simpleHash(email.toLowerCase());
  if (emailHashCheck !== emailHash) return null;

  // Decode expiry
  const expirySec = parseInt(expiryHex, 16);
  const expires = new Date(expirySec * 1000).toISOString();

  // Decode features
  const featureBits = parseInt(featuresHex, 16);
  const features = [];
  for (const bit of [1, 2, 4, 8, 16, 32, 64, 128]) {
    if (featureBits & bit) features.push(FEATURE_MAP[bit]);
  }

  return { features, expires };
}

async function hmacSha256Hex(message, secretHex) {
  const key = await crypto.subtle.importKey(
    'raw',
    hexToBytes(secretHex),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToHex(new Uint8Array(sig));
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

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function simpleHash(str) {
  const msgBuffer = new TextEncoder().encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return bytesToHex(new Uint8Array(hashBuffer)).slice(0, 8);
}
