// Theme management
// Free feature - dark/light theme toggle

const THEME_KEY = 'masterbay_theme';

export const THEMES = {
  dark: {
    name: 'Dark',
    icon: '🌙',
    colors: {
      bg: '#0d1120',
      surface: '#121829',
      text: '#e8edf7',
      accent: '#f5c451',
    }
  },
  light: {
    name: 'Light',
    icon: '☀️',
    colors: {
      bg: '#f5f7fa',
      surface: '#ffffff',
      text: '#1a1a2e',
      accent: '#f5c451',
    }
  },
  midnight: {
    name: 'Midnight',
    icon: '🌌',
    colors: {
      bg: '#0a0a1a',
      surface: '#12122a',
      text: '#e0e0ff',
      accent: '#8b5cf6',
    }
  },
  forest: {
    name: 'Forest',
    icon: '🌲',
    colors: {
      bg: '#0d1a0d',
      surface: '#142814',
      text: '#e0f0e0',
      accent: '#22c55e',
    }
  }
};

export class ThemeManager {
  constructor() {
    this.current = 'dark';
    this.load();
  }
  
  load() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved && THEMES[saved]) {
        this.current = saved;
      }
    } catch {
      this.current = 'dark';
    }
    this.apply();
  }
  
  save() {
    localStorage.setItem(THEME_KEY, this.current);
  }
  
  apply() {
    const theme = THEMES[this.current];
    if (!theme) return;
    
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.colors.bg);
    root.style.setProperty('--surface', theme.colors.surface);
    root.style.setProperty('--text', theme.colors.text);
    root.style.setProperty('--accent', theme.colors.accent);
    
    // Apply theme class
    root.className = root.className.replace(/theme-\w+/g, '');
    root.classList.add(`theme-${this.current}`);
  }
  
  set(themeName) {
    if (THEMES[themeName]) {
      this.current = themeName;
      this.save();
      this.apply();
    }
  }
  
  toggle() {
    const themes = Object.keys(THEMES);
    const currentIndex = themes.indexOf(this.current);
    const nextIndex = (currentIndex + 1) % themes.length;
    this.set(themes[nextIndex]);
  }
  
  getAvailable() {
    return Object.entries(THEMES).map(([id, theme]) => ({
      id,
      name: theme.name,
      icon: theme.icon,
      current: id === this.current,
    }));
  }
}

// Singleton
export const themeManager = new ThemeManager();
