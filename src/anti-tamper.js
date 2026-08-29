// Anti-tamper and integrity checks - Hardened version
// Protects the app from modification and unauthorized use

const INTEGRITY_KEY = 'masterbay_integrity_v2';
const INTEGRITY_ENDPOINT = '/api/integrity/manifest'; // Served by server.js

// Critical files that must not be modified
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

// Generate cryptographic hash using Web Crypto API
async function cryptoHash(text) {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Fetch integrity manifest from server (signed at build time)
async function fetchIntegrityManifest() {
  try {
    const response = await fetch(INTEGRITY_ENDPOINT, { cache: 'no-store' });
    if (!response.ok) throw new Error('Manifest fetch failed');
    return await response.json();
  } catch {
    return null;
  }
}

// Check if files have been tampered with (client-side hash)
export async function checkIntegrityClient() {
  const results = [];
  
  for (const file of PROTECTED_FILES) {
    try {
      const response = await fetch(file, { cache: 'no-store' });
      if (!response.ok) {
        results.push({ file, status: 'missing', hash: null });
        continue;
      }
      const text = await response.text();
      const hash = await cryptoHash(text);
      results.push({ file, status: 'ok', hash });
    } catch {
      results.push({ file, status: 'error', hash: null });
    }
  }
  
  return results;
}

// Verify against server-provided manifest (authoritative)
export async function verifyIntegrityServer() {
  const manifest = await fetchIntegrityManifest();
  if (!manifest) {
    return { valid: false, reason: 'manifest_unavailable', fallback: true };
  }

  const current = await checkIntegrityClient();
  const violations = [];
  let checked = 0;

  for (const file of PROTECTED_FILES) {
    const currentHash = current.find(f => f.file === file)?.hash;
    const expectedHash = manifest.hashes[file];
    
    if (expectedHash) {
      checked++;
      if (!currentHash) {
        violations.push({ file, reason: 'missing', expected: expectedHash });
      } else if (currentHash !== expectedHash) {
        violations.push({ 
          file, 
          reason: 'modified', 
          expected: expectedHash.slice(0, 16) + '...',
          actual: currentHash.slice(0, 16) + '...'
        });
      }
    }
  }

  // Verify manifest signature
  const manifestValid = await verifyManifestSignature(manifest);
  
  if (!manifestValid) {
    return { valid: false, reason: 'manifest_signature_invalid' };
  }

  if (violations.length > 0) {
    return { 
      valid: false, 
      reason: 'tampered', 
      violations,
      checkedFiles: checked,
      totalFiles: PROTECTED_FILES.length,
    };
  }

  return { 
    valid: true, 
    checkedFiles: checked,
    totalFiles: PROTECTED_FILES.length,
    manifestVersion: manifest.version,
    checkedAt: new Date().toISOString() 
  };
}

// Verify manifest was signed by build process
async function verifyManifestSignature(manifest) {
  if (!manifest.signature || !manifest.publicKey) return false;
  
  try {
    const payload = JSON.stringify({
      version: manifest.version,
      hashes: manifest.hashes,
      timestamp: manifest.timestamp,
    });
    
    const key = await crypto.subtle.importKey(
      'raw',
      hexToBytes(manifest.publicKey),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    
    const sigBytes = hexToBytes(manifest.signature);
    return await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
  } catch {
    return false;
  }
}

// Store integrity baseline locally (fallback)
export async function storeIntegrityBaseline() {
  const results = await checkIntegrityClient();
  const baseline = {};
  
  for (const result of results) {
    if (result.hash) {
      baseline[result.file] = result.hash;
    }
  }
  
  localStorage.setItem(INTEGRITY_KEY, JSON.stringify({
    baseline,
    createdAt: new Date().toISOString(),
    version: '2.0',
  }));
  
  return baseline;
}

// Verify against local baseline
export async function verifyIntegrityLocal() {
  const stored = localStorage.getItem(INTEGRITY_KEY);
  if (!stored) {
    return { valid: false, reason: 'no_baseline' };
  }
  
  try {
    const data = JSON.parse(stored);
    const current = await checkIntegrityClient();
    const violations = [];
    
    for (const file of PROTECTED_FILES) {
      const currentHash = current.find(f => f.file === file)?.hash;
      const baselineHash = data.baseline[file];
      
      if (!currentHash) {
        violations.push({ file, reason: 'missing' });
      } else if (baselineHash && currentHash !== baselineHash) {
        violations.push({ file, reason: 'modified' });
      }
    }
    
    if (violations.length > 0) {
      return { valid: false, reason: 'tampered', violations };
    }
    
    return { valid: true, checkedAt: new Date().toISOString() };
  } catch {
    return { valid: false, reason: 'corrupt' };
  }
}

// Main integrity check - tries server first, falls back to local
export async function verifyIntegrity() {
  // Try server manifest first (authoritative)
  const serverResult = await verifyIntegrityServer();
  if (serverResult.fallback !== false) {
    // Server unavailable or error - use local baseline
    return verifyIntegrityLocal();
  }
  return serverResult;
}

// Advanced DevTools detection
let devToolsDetected = false;
let devToolsCallbacks = [];

export function onDevToolsDetected(callback) {
  devToolsCallbacks.push(callback);
}

function triggerDevToolsDetected() {
  if (devToolsDetected) return;
  devToolsDetected = true;
  devToolsCallbacks.forEach(cb => {
    try { cb(); } catch {}
  });
}

// Multiple detection techniques
export function detectDevTools() {
  // 1. Window size difference (classic)
  const widthDiff = window.outerWidth - window.innerWidth;
  const heightDiff = window.outerHeight - window.innerHeight;
  if (widthDiff > 160 || heightDiff > 160) {
    triggerDevToolsDetected();
    return true;
  }
  
  // 2. Timing attack (debugger pause)
  const start = performance.now();
  debugger; // This pauses if DevTools open
  const elapsed = performance.now() - start;
  if (elapsed > 100) {
    triggerDevToolsDetected();
    return true;
  }
  
  // 3. Console memory check
  if (window.console && console.firebug) {
    triggerDevToolsDetected();
    return true;
  }
  
  // 4. toString override detection
  const origToString = Function.prototype.toString;
  if (origToString.toString().length > 100) {
    triggerDevToolsDetected();
    return true;
  }
  
  // 5. Check for DevTools-specific properties
  if (window.__devtools__ || window.__REACT_DEVTOOLS_GLOBAL_HOOK__) {
    triggerDevToolsDetected();
    return true;
  }
  
  return false;
}

// Debugger trap - creates infinite debugger loop if DevTools open
export function enableDebuggerTrap() {
  setInterval(() => {
    if (detectDevTools()) {
      // Intentionally cause performance issues for inspector
      for (let i = 0; i < 10000; i++) {
        Math.random();
      }
    }
  }, 1000);
}

// Console protection - more sophisticated
export function protectConsole() {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') return;
  
  const noop = () => {};
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  
  console.log = (...args) => {
    // Allow only specific debug messages
    if (args[0] && typeof args[0] === 'string' && args[0].startsWith('[Masterbay]')) {
      originalLog.apply(console, args);
    }
  };
  console.warn = noop;
  console.error = noop;
  
  // Override console.clear to prevent clearing evidence
  console.clear = () => {
    originalLog('[Masterbay] Console clear attempted');
  };
}

// Prevent right-click in production
export function protectContextMenu() {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') return;
  
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    return false;
  }, { passive: false });
}

// Prevent text selection in production
export function protectSelection() {
  if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') return;
  
  document.addEventListener('selectstart', (e) => {
    // Allow selection in input fields
    const target = e.target;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return true;
    }
    e.preventDefault();
    return false;
  }, { passive: false });
}

// Prevent keyboard shortcuts for DevTools
export function protectShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') return;
    
    // F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U, Ctrl+S
    if (e.key === 'F12' || 
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J')) ||
        (e.ctrlKey && e.key === 'U') ||
        (e.ctrlKey && e.key === 'S')) {
      e.preventDefault();
      return false;
    }
  });
}

// Environment detection
export function detectEnvironment() {
  const env = {
    isElectron: typeof process !== 'undefined' && process.versions?.electron,
    isDev: typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production',
    hasNodeIntegration: typeof require === 'function',
    userAgent: navigator.userAgent,
  };
  return env;
}

// Initialize all protection
export function initProtection() {
  protectConsole();
  protectContextMenu();
  protectSelection();
  protectShortcuts();
  
  // Store baseline on first run
  const stored = localStorage.getItem(INTEGRITY_KEY);
  if (!stored) {
    storeIntegrityBaseline().catch(console.error);
  }
  
  // Periodic integrity checks (server + local)
  setInterval(async () => {
    const result = await verifyIntegrity();
    if (!result.valid && result.reason === 'tampered') {
      console.warn('[Masterbay] Integrity violation detected', result);
      // Could: disable features, show warning, redirect
      document.dispatchEvent(new CustomEvent('masterbay:tampered', { detail: result }));
    }
  }, 60000); // Every minute
  
  // DevTools detection
  setInterval(() => {
    detectDevTools();
  }, 2000);
  
  // Enable debugger trap in production
  if (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') {
    enableDebuggerTrap();
  }
}

// Utility
function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}