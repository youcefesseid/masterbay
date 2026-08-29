// Masterbay License System
// Connects to Cloudflare Worker for license verification
// Offline fallback with hardware fingerprinting

const LICENSE_DOMAIN = 'https://masterbay-license.youcefesseid07.workers.dev';
const LICENSE_ENDPOINT = '/';
const LOCAL_LICENSE_KEY = 'masterbay_license';
const LICENSE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours cache

// Generate hardware fingerprint
export function generateFingerprint() {
  const components = [];
  
  // CPU info
  if (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) {
    components.push(`cpu:${navigator.hardwareConcurrency}`);
  }
  
  // Screen resolution
  if (typeof screen !== 'undefined') {
    components.push(`screen:${screen.width}x${screen.height}`);
  }
  
  // Platform
  if (typeof navigator !== 'undefined' && navigator.platform) {
    components.push(`platform:${navigator.platform}`);
  }
  
  // Language
  if (typeof navigator !== 'undefined' && navigator.language) {
    components.push(`lang:${navigator.language}`);
  }
  
  // Timezone
  if (typeof Intl !== 'undefined') {
    components.push(`tz:${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
  }
  
  const fingerprint = components.join('|');
  
  // Simple hash
  let hash = 0;
  for (let i = 0; i < fingerprint.length; i++) {
    const char = fingerprint.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `mb_${Math.abs(hash).toString(36)}_${fingerprint.length}`;
}

// Generate license key from email + fingerprint
export function generateLicenseKey(email, fingerprint) {
  const data = `${email}:${fingerprint}:masterbay`;
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  // Simple hash (in production, use proper crypto)
  let hash = 0;
  for (let i = 0; i < dataBuffer.length; i++) {
    hash = ((hash << 5) - hash) + dataBuffer[i];
    hash = hash & hash;
  }
  
  const hashStr = Math.abs(hash).toString(36).toUpperCase();
  const formatted = hashStr.match(/.{1,5}/g)?.join('-') || hashStr;
  
  return `MB-${formatted}`;
}

// Verify license online via Cloudflare Worker
export async function verifyLicenseOnline(licenseKey, email) {
  try {
    const response = await fetch(`${LICENSE_DOMAIN}${LICENSE_ENDPOINT}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        email,
        fingerprint: generateFingerprint(),
        version: '1.0.0',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'License verification failed');
    }

    const result = await response.json();
    
    // Cache successful verification
    if (result.valid) {
      localStorage.setItem(`${LOCAL_LICENSE_KEY}_cache`, JSON.stringify({
        ...result,
        cachedAt: Date.now(),
      }));
    }

    return result;
  } catch (error) {
    console.warn('Online verification failed, trying cached/offline:', error.message);
    return verifyLicenseCached(licenseKey, email);
  }
}

// Verify license from cache (offline-capable)
export function verifyLicenseCached(licenseKey, email) {
  try {
    const cached = localStorage.getItem(`${LOCAL_LICENSE_KEY}_cache`);
    if (!cached) throw new Error('No cache');
    
    const data = JSON.parse(cached);
    if (data.key !== licenseKey || data.email !== email) throw new Error('Mismatch');
    
    // Check cache TTL
    if (Date.now() - data.cachedAt > LICENSE_CACHE_TTL) throw new Error('Cache expired');
    
    // Check expiration
    if (data.expires && new Date(data.expires) < new Date()) {
      return { valid: false, error: 'License expired', expires: data.expires };
    }

    return { 
      valid: true, 
      features: data.features || ['encode', 'presets', 'batch'],
      expires: data.expires,
      maxJobs: data.maxJobs,
      maxConcurrency: data.maxConcurrency,
      cached: true 
    };
  } catch {
    return verifyLicenseOffline(licenseKey, email);
  }
}

// Verify license offline (last resort fallback)
export function verifyLicenseOffline(licenseKey, email) {
  const stored = localStorage.getItem(LOCAL_LICENSE_KEY);
  if (!stored) return { valid: false, error: 'no_license' };

  try {
    const data = JSON.parse(stored);
    const now = new Date();
    const expires = new Date(data.expires);

    if (now > expires) {
      return { valid: false, error: 'expired', expires: data.expires };
    }

    if (data.fingerprint !== generateFingerprint()) {
      return { valid: false, error: 'hardware_mismatch' };
    }

    return { 
      valid: true, 
      email: data.email, 
      expires: data.expires,
      daysLeft: Math.ceil((expires - now) / (1000 * 60 * 60 * 24)),
      features: ['encode', 'presets', 'batch'],
      offline: true 
    };
  } catch {
    return { valid: false, error: 'corrupt' };
  }
}

// Save license locally
export function saveLicense(licenseKey, email, expiresDays = 365, features = ['encode', 'presets', 'batch']) {
  const license = {
    key: licenseKey,
    email,
    fingerprint: generateFingerprint(),
    activated: new Date().toISOString(),
    expires: new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString(),
    features,
  };

  localStorage.setItem(LOCAL_LICENSE_KEY, JSON.stringify(license));
  return license;
}

// Check if license is valid (uses cache → online → offline chain)
export async function checkLicense() {
  const stored = localStorage.getItem(LOCAL_LICENSE_KEY);
  if (!stored) return { valid: false, reason: 'no_license' };

  try {
    const data = JSON.parse(stored);
    const email = data.email;
    const licenseKey = data.key;

    // Try cached first (instant, offline-capable)
    const cached = verifyLicenseCached(licenseKey, email);
    if (cached.valid) return { ...cached, method: 'cached' };

    // Try online
    const online = await verifyLicenseOnline(licenseKey, email);
    if (online.valid) return { ...online, method: 'online' };

    // Fallback to offline
    const offline = verifyLicenseOffline(licenseKey, email);
    return { ...offline, method: 'offline' };
  } catch {
    return { valid: false, reason: 'corrupt' };
  }
}

// Activate license (full verification chain)
export async function activateLicense(licenseKey, email) {
  // Validate key format first
  if (!licenseKey.startsWith('MB-') || licenseKey.split('-').length < 5) {
    return { success: false, error: 'Invalid license key format' };
  }

  // Try online verification first (authoritative)
  const online = await verifyLicenseOnline(licenseKey, email);
  if (online.valid) {
    const license = saveLicense(licenseKey, email, 
      online.expires ? Math.ceil((new Date(online.expires) - new Date()) / (1000 * 60 * 60 * 24)) : 365,
      online.features
    );
    return { success: true, method: 'online', license };
  }

  // If online says invalid, don't allow offline fallback for new activations
  if (online.error && !online.error.includes('Server error') && !online.error.includes('Network')) {
    return { success: false, error: online.error };
  }

  // Only allow offline if server unreachable (network error)
  const offline = verifyLicenseOffline(licenseKey, email);
  if (offline.valid) {
    return { success: true, method: 'offline', license: { ...offline, key: licenseKey, email } };
  }

  return { success: false, error: online.error || 'Invalid license key' };
}

// Get available features for current license
export async function getLicenseFeatures() {
  const check = await checkLicense();
  return check.valid ? (check.features || ['encode', 'presets', 'batch']) : [];
}

// Check if a specific feature is enabled
export async function hasFeature(feature) {
  const features = await getLicenseFeatures();
  return features.includes(feature);
}
