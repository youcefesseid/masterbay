// Batch processing - process multiple videos at once
// Free feature, no cost involved

const BATCH_QUEUE_KEY = 'masterbay_batch_queue';
const BATCH_HISTORY_KEY = 'masterbay_batch_history';

// Batch job structure
export class BatchJob {
  constructor(file, options = {}) {
    this.id = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.file = file;
    this.fileName = file.name;
    this.fileSize = file.size;
    this.status = 'pending'; // pending, processing, done, error, cancelled
    this.progress = 0;
    this.output = null;
    this.error = null;
    this.createdAt = new Date().toISOString();
    this.completedAt = null;
    this.options = options;
  }
}

// Batch processor
export class BatchProcessor {
  constructor(maxConcurrent = 2) {
    this.queue = [];
    this.active = [];
    this.history = [];
    this.maxConcurrent = maxConcurrent;
    this.isProcessing = false;
  }
  
  addJob(file, options = {}) {
    const job = new BatchJob(file, options);
    this.queue.push(job);
    this.saveQueue();
    return job;
  }
  
  removeJob(jobId) {
    const index = this.queue.findIndex(j => j.id === jobId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveQueue();
      return true;
    }
    return false;
  }
  
  async processNext() {
    if (this.active.length >= this.maxConcurrent) return;
    if (this.queue.length === 0) return;
    
    const job = this.queue.shift();
    this.active.push(job);
    job.status = 'processing';
    this.saveQueue();
    
    try {
      // Process the job using the existing pipeline
      const result = await this.processJob(job);
      job.output = result;
      job.status = 'done';
      job.progress = 100;
      job.completedAt = new Date().toISOString();
      this.history.unshift({ ...job, file: undefined }); // Don't store file in history
    } catch (error) {
      job.error = error.message;
      job.status = 'error';
      job.completedAt = new Date().toISOString();
    } finally {
      this.active = this.active.filter(j => j.id !== job.id);
      this.saveQueue();
      this.saveHistory();
      
      // Process next
      if (this.queue.length > 0) {
        setTimeout(() => this.processNext(), 100);
      }
    }
  }
  
  async processJob(job) {
    // This will be connected to the actual upload/processing pipeline
    // For now, return a placeholder
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({ success: true, outputPath: `/batch/output/${job.id}.mp4` });
      }, 3000);
    });
  }
  
  start() {
    if (this.isProcessing) return;
    this.isProcessing = true;
    this.loadQueue();
    this.processNext();
  }
  
  stop() {
    this.isProcessing = false;
    this.queue.forEach(job => job.status = 'cancelled');
    this.saveQueue();
  }
  
  saveQueue() {
    const data = this.queue.map(j => ({
      id: j.id,
      fileName: j.fileName,
      fileSize: j.fileSize,
      status: j.status,
      progress: j.progress,
      options: j.options,
      createdAt: j.createdAt,
    }));
    localStorage.setItem(BATCH_QUEUE_KEY, JSON.stringify(data));
  }
  
  loadQueue() {
    try {
      const data = JSON.parse(localStorage.getItem(BATCH_QUEUE_KEY) || '[]');
      this.queue = data.map(item => ({
        ...item,
        file: null, // Files can't be serialized
      }));
    } catch {
      this.queue = [];
    }
  }
  
  saveHistory() {
    const data = this.history.slice(0, 50); // Keep last 50
    localStorage.setItem(BATCH_HISTORY_KEY, JSON.stringify(data));
  }
  
  loadHistory() {
    try {
      const data = JSON.parse(localStorage.getItem(BATCH_HISTORY_KEY) || '[]');
      this.history = data;
    } catch {
      this.history = [];
    }
  }
  
  getStats() {
    const total = this.history.length + this.queue.length;
    const done = this.history.filter(j => j.status === 'done').length;
    const errors = this.history.filter(j => j.status === 'error').length;
    
    return {
      total,
      done,
      errors,
      pending: this.queue.length,
      processing: this.active.length,
    };
  }
}

// Singleton
export const batchProcessor = new BatchProcessor(2);
