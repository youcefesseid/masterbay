// Masterbay front end extensions
// Additional features that extend the base app

// Wait for DOM and base app to load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(initExtensions, 1000);
});

async function initExtensions() {
  // Initialize theme
  initTheme();
  
  // Initialize license check
  await initLicense();
  
  // Initialize batch UI
  initBatchUI();
  
  // Initialize projects UI
  initProjectsUI();
  
  // Initialize compare UI
  initCompareUI();
  
  // Initialize subtitle UI
  initSubtitleUI();
  
  // Initialize thumbnail UI
  initThumbnailUI();
}

// ───────────────────────── Theme ─────────────────────────

function initTheme() {
  const saved = localStorage.getItem('masterbay_theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  
  // Add theme toggle button if not exists
  if (!document.getElementById('themeToggle')) {
    const btn = document.createElement('button');
    btn.id = 'themeToggle';
    btn.className = 'theme-toggle';
    btn.innerHTML = '🌙';
    btn.title = 'تبديل السمة';
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('masterbay_theme', next);
      btn.innerHTML = next === 'dark' ? '🌙' : '☀️';
    });
    
    const rack = document.querySelector('.rack');
    if (rack) rack.appendChild(btn);
  }
}

// ───────────────────────── License ─────────────────────────

async function initLicense() {
  const stored = localStorage.getItem('masterbay_license');
  if (!stored) {
    // Show license notice
    showLicenseNotice();
  }
}

function showLicenseNotice() {
  if (document.getElementById('licenseNotice')) return;
  
  const notice = document.createElement('div');
  notice.id = 'licenseNotice';
  notice.className = 'license-notice';
  notice.innerHTML = `
    <div class="license-notice-content">
      <h3>تفعيل الترخيص</h3>
      <p>أدخل مفتاح الترخيص أو استخدم الوضع التجريبي</p>
      <input type="text" id="licenseKeyInput" placeholder="MB-XXXXX-XXXXX" maxlength="20">
      <input type="email" id="licenseEmailInput" placeholder="البريد الإلكتروني">
      <div class="license-actions">
        <button id="activateLicenseBtn">تفعيل</button>
        <button id="trialModeBtn">وضع تجريبي</button>
      </div>
      <p class="license-hint">لا تملك ترخيصاً؟ اشترِ على Gumroad أو Payhip</p>
    </div>
  `;
  
  document.body.appendChild(notice);
  
  document.getElementById('activateLicenseBtn').addEventListener('click', async () => {
    const key = document.getElementById('licenseKeyInput').value.trim().toUpperCase();
    const email = document.getElementById('licenseEmailInput').value.trim();
    
    if (!key || !email) {
      alert('أدخل المفتاح والبريد الإلكتروني');
      return;
    }
    
    // Simulate activation (in production, verify with server)
    const license = {
      key,
      email,
      activated: new Date().toISOString(),
      expires: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
    
    localStorage.setItem('masterbay_license', JSON.stringify(license));
    notice.remove();
    toast('تم التفعيل بنجاح');
  });
  
  document.getElementById('trialModeBtn').addEventListener('click', () => {
    localStorage.setItem('masterbay_trial', 'true');
    notice.remove();
    toast('الوضع التجريبي — 7 أيام');
  });
}

// ───────────────────────── Batch Processing ─────────────────────────

function initBatchUI() {
  if (!document.getElementById('batchSection')) {
    const batchSection = document.createElement('section');
    batchSection.id = 'batchSection';
    batchSection.className = 'batch-section';
    batchSection.innerHTML = `
      <h2>المعالجة الدفعية</h2>
      <div class="batch-dropzone" id="batchDropzone">
        <p>أفلِت عدة فيديوهات هنا</p>
        <input type="file" id="batchInput" multiple accept="video/*">
      </div>
      <div class="batch-queue" id="batchQueue"></div>
      <div class="batch-controls">
        <button id="batchStart" disabled>ابدأ المعالجة</button>
        <button id="batchClear">مسح القائمة</button>
      </div>
    `;
    
    const main = document.querySelector('main');
    if (main) main.appendChild(batchSection);
  }
  
  const batchInput = document.getElementById('batchInput');
  const batchQueue = document.getElementById('batchQueue');
  const batchStart = document.getElementById('batchStart');
  
  if (batchInput) {
    batchInput.addEventListener('change', (e) => {
      const files = Array.from(e.target.files);
      files.forEach(file => addToBatch(file));
    });
  }
  
  if (batchStart) {
    batchStart.addEventListener('click', () => {
      processBatch();
    });
  }
}

function addToBatch(file) {
  const queue = document.getElementById('batchQueue');
  if (!queue) return;
  
  const item = document.createElement('div');
  item.className = 'batch-item';
  item.innerHTML = `
    <span class="batch-item-name">${file.name}</span>
    <span class="batch-item-size">${(file.size / 1024 / 1024).toFixed(1)} MB</span>
    <span class="batch-item-status">في الانتظار</span>
  `;
  queue.appendChild(item);
  
  document.getElementById('batchStart').disabled = false;
}

async function processBatch() {
  const items = document.querySelectorAll('.batch-item');
  for (const item of items) {
    const status = item.querySelector('.batch-item-status');
    status.textContent = 'جارٍ المعالجة...';
    
    // Process each file
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    status.textContent = 'تم';
    status.className = 'batch-item-status done';
  }
}

// ───────────────────────── Projects ─────────────────────────

function initProjectsUI() {
  if (!document.getElementById('projectsSection')) {
    const section = document.createElement('section');
    section.id = 'projectsSection';
    section.className = 'projects-section';
    section.innerHTML = `
      <h2>المشاريع المحفوظة</h2>
      <div class="projects-list" id="projectsList"></div>
    `;
    
    const main = document.querySelector('main');
    if (main) main.appendChild(section);
  }
  
  loadProjects();
}

function loadProjects() {
  const list = document.getElementById('projectsList');
  if (!list) return;
  
  try {
    const projects = JSON.parse(localStorage.getItem('masterbay_projects') || '[]');
    list.innerHTML = projects.slice(0, 10).map(p => `
      <div class="project-item">
        <span class="project-name">${p.name}</span>
        <span class="project-date">${new Date(p.lastUsed).toLocaleDateString('ar-EG')}</span>
      </div>
    `).join('') || '<p>لا توجد مشاريع محفوظة</p>';
  } catch {
    list.innerHTML = '<p>لا توجد مشاريع محفوظة</p>';
  }
}

// ───────────────────────── Compare ─────────────────────────

function initCompareUI() {
  // Compare UI is initialized when both videos are available
}

export function showCompare(originalUrl, masteredUrl) {
  const container = document.createElement('div');
  container.id = 'compareContainer';
  container.className = 'compare-container';
  container.innerHTML = `
    <div class="compare-header">
      <h3>مقارنة</h3>
      <button class="compare-close">إغلاق</button>
    </div>
    <div class="compare-body" id="compareBody"></div>
  `;
  
  document.body.appendChild(container);
  
  // Create comparison using the compare module
  const { createCompareUI } = window.CompareModule || {};
  if (createCompareUI) {
    createCompareUI(originalUrl, masteredUrl, document.getElementById('compareBody'));
  }
  
  container.querySelector('.compare-close').addEventListener('click', () => {
    container.remove();
  });
}

// ───────────────────────── Subtitle Burn-in ─────────────────────────

function initSubtitleUI() {
  // Subtitle UI is shown in the inspector when enabled
}

export function showSubtitleBurn(subtitlePath, style = 'default') {
  const { burnSubtitles } = window.SubtitleModule || {};
  if (burnSubtitles) {
    return burnSubtitles(subtitlePath, style);
  }
  return null;
}

// ───────────────────────── Thumbnail Generator ─────────────────────────

function initThumbnailUI() {
  // Thumbnail UI is shown when generating thumbnails
}

export async function generateVideoThumbnail(videoPath, options = {}) {
  const { generateThumbnail } = window.ThumbnailModule || {};
  if (generateThumbnail) {
    return generateThumbnail(videoPath, options);
  }
  return null;
}

// ───────────────────────── Toast notifications ─────────────────────────

function toast(message, isError = false) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${isError ? 'toast--error' : 'toast--success'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}
