// Project history and presets
// Free feature - save and load processing configurations

const PROJECTS_KEY = 'masterbay_projects';
const PRESETS_KEY = 'masterbay_custom_presets';

// Project structure
export class Project {
  constructor(name, videoInfo, options) {
    this.id = `proj_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.name = name;
    this.videoInfo = videoInfo; // { width, height, duration, fps, codec }
    this.options = options;
    this.createdAt = new Date().toISOString();
    this.lastUsed = new Date().toISOString();
    this.usageCount = 0;
    this.tags = [];
  }
  
  touch() {
    this.lastUsed = new Date().toISOString();
    this.usageCount++;
  }
}

// Project manager
export class ProjectManager {
  constructor() {
    this.projects = [];
    this.customPresets = [];
    this.load();
  }
  
  load() {
    try {
      const projects = localStorage.getItem(PROJECTS_KEY);
      if (projects) {
        this.projects = JSON.parse(projects);
      }
      
      const presets = localStorage.getItem(PRESETS_KEY);
      if (presets) {
        this.customPresets = JSON.parse(presets);
      }
    } catch {
      this.projects = [];
      this.customPresets = [];
    }
  }
  
  save() {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(this.projects.slice(0, 100)));
    localStorage.setItem(PRESETS_KEY, JSON.stringify(this.customPresets));
  }
  
  addProject(name, videoInfo, options) {
    const project = new Project(name, videoInfo, options);
    this.projects.unshift(project);
    this.save();
    return project;
  }
  
  getProject(id) {
    return this.projects.find(p => p.id === id);
  }
  
  deleteProject(id) {
    this.projects = this.projects.filter(p => p.id !== id);
    this.save();
  }
  
  useProject(id) {
    const project = this.getProject(id);
    if (project) {
      project.touch();
      this.save();
      return project;
    }
    return null;
  }
  
  addCustomPreset(preset) {
    this.customPresets.unshift({
      ...preset,
      id: `custom_${Date.now()}`,
      createdAt: new Date().toISOString(),
      isCustom: true,
    });
    this.save();
  }
  
  getRecentProjects(limit = 10) {
    return this.projects
      .sort((a, b) => new Date(b.lastUsed) - new Date(a.lastUsed))
      .slice(0, limit);
  }
  
  getMostUsedProjects(limit = 10) {
    return this.projects
      .sort((a, b) => b.usageCount - a.usageCount)
      .slice(0, limit);
  }
  
  search(query) {
    const q = query.toLowerCase();
    return this.projects.filter(p => 
      p.name.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q))
    );
  }
  
  exportProjects() {
    return JSON.stringify(this.projects, null, 2);
  }
  
  importProjects(json) {
    try {
      const imported = JSON.parse(json);
      this.projects = [...this.projects, ...imported];
      this.save();
      return imported.length;
    } catch {
      return 0;
    }
  }
}

// Singleton
export const projectManager = new ProjectManager();
