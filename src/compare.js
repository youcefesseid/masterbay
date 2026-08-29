// Side-by-side comparison
// Compare original and mastered videos

const COMPARE_STORAGE_KEY = 'masterbay_compare';

// Comparison state
export class CompareState {
  constructor() {
    this.original = null;
    this.mastered = null;
    this.position = 50; // 0-100, slider position
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 1;
  }
  
  load() {
    try {
      const data = localStorage.getItem(COMPARE_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        Object.assign(this, parsed);
      }
    } catch {
      // Ignore errors
    }
  }
  
  save() {
    localStorage.setItem(COMPARE_STORAGE_KEY, JSON.stringify({
      position: this.position,
      isMuted: this.isMuted,
      volume: this.volume,
    }));
  }
  
  reset() {
    this.position = 50;
    this.isPlaying = false;
    this.isMuted = false;
    this.volume = 1;
    this.save();
  }
}

// Create comparison UI
export function createCompareUI(originalUrl, masteredUrl, container) {
  container.innerHTML = '';
  
  const wrapper = document.createElement('div');
  wrapper.className = 'compare-wrap';
  
  // Videos container
  const videosContainer = document.createElement('div');
  videosContainer.className = 'compare-videos';
  
  // Original video (left side)
  const originalVideo = document.createElement('video');
  originalVideo.src = originalUrl;
  originalVideo.className = 'compare-video compare-original';
  originalVideo.controls = false;
  originalVideo.muted = true;
  originalVideo.playsInline = true;
  
  // Mastered video (right side, clipped)
  const masteredVideo = document.createElement('video');
  masteredVideo.src = masteredUrl;
  masteredVideo.className = 'compare-video compare-mastered';
  masteredVideo.controls = false;
  masteredVideo.muted = true;
  masteredVideo.playsInline = true;
  
  videosContainer.appendChild(originalVideo);
  videosContainer.appendChild(masteredVideo);
  
  // Slider
  const slider = document.createElement('div');
  slider.className = 'compare-slider';
  slider.innerHTML = `
    <div class="compare-slider-line"></div>
    <div class="compare-slider-handle"></div>
  `;
  
  // Labels
  const labels = document.createElement('div');
  labels.className = 'compare-labels';
  labels.innerHTML = `
    <span class="compare-label compare-label--original">قبل</span>
    <span class="compare-label compare-label--mastered">بعد</span>
  `;
  
  // Controls
  const controls = document.createElement('div');
  controls.className = 'compare-controls';
  controls.innerHTML = `
    <button class="compare-btn" id="comparePlay">▶</button>
    <button class="compare-btn" id="compareReset">↺</button>
    <span class="compare-position" id="comparePosition">50%</span>
  `;
  
  wrapper.appendChild(videosContainer);
  wrapper.appendChild(slider);
  wrapper.appendChild(labels);
  wrapper.appendChild(controls);
  container.appendChild(wrapper);
  
  // Interaction
  const state = new CompareState();
  state.load();
  
  let isDragging = false;
  
  const updatePosition = (clientX) => {
    const rect = videosContainer.getBoundingClientRect();
    const x = clientX - rect.left;
    const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
    
    state.position = percent;
    masteredVideo.style.clipPath = `inset(0 0 0 ${percent}%)`;
    slider.style.left = `${percent}%`;
    
    document.getElementById('comparePosition').textContent = `${Math.round(percent)}%`;
    state.save();
  };
  
  slider.addEventListener('mousedown', (e) => {
    isDragging = true;
    updatePosition(e.clientX);
  });
  
  document.addEventListener('mousemove', (e) => {
    if (isDragging) {
      updatePosition(e.clientX);
    }
  });
  
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // Touch support
  slider.addEventListener('touchstart', (e) => {
    isDragging = true;
    updatePosition(e.touches[0].clientX);
  });
  
  document.addEventListener('touchmove', (e) => {
    if (isDragging) {
      updatePosition(e.touches[0].clientX);
    }
  });
  
  document.addEventListener('touchend', () => {
    isDragging = false;
  });
  
  // Controls
  const playBtn = document.getElementById('comparePlay');
  playBtn.addEventListener('click', () => {
    if (state.isPlaying) {
      originalVideo.pause();
      masteredVideo.pause();
      playBtn.textContent = '▶';
    } else {
      originalVideo.currentTime = 0;
      masteredVideo.currentTime = 0;
      originalVideo.play();
      masteredVideo.play();
      playBtn.textContent = '⏸';
    }
    state.isPlaying = !state.isPlaying;
  });
  
  document.getElementById('compareReset').addEventListener('click', () => {
    state.reset();
    masteredVideo.style.clipPath = 'inset(0 0 0 50%)';
    slider.style.left = '50%';
    document.getElementById('comparePosition').textContent = '50%';
  });
  
  // Sync videos
  originalVideo.addEventListener('timeupdate', () => {
    if (Math.abs(originalVideo.currentTime - masteredVideo.currentTime) > 0.1) {
      masteredVideo.currentTime = originalVideo.currentTime;
    }
  });
  
  // Initial position
  masteredVideo.style.clipPath = `inset(0 0 0 ${state.position}%)`;
  slider.style.left = `${state.position}%`;
}
