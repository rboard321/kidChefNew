import { ImportStatus, ImportError } from './recipeImport';
import type { Recipe } from '../types';

export interface ImportProgressEvent {
  type: 'progress' | 'complete' | 'error';
  jobId: string;
  url: string;
  status?: ImportStatus;
  progress?: string;
  recipe?: Recipe;
  error?: ImportError;
  timestamp: Date;
}

export interface ImportProgressListener {
  onProgress: (event: ImportProgressEvent) => void;
}

class ImportProgressService {
  private listeners: Map<string, ImportProgressListener[]> = new Map();
  private globalListeners: ImportProgressListener[] = [];

  // Subscribe to progress events for a specific job
  subscribe(jobId: string, listener: ImportProgressListener): () => void {
    if (!this.listeners.has(jobId)) {
      this.listeners.set(jobId, []);
    }

    this.listeners.get(jobId)!.push(listener);

    // Return unsubscribe function
    return () => {
      const jobListeners = this.listeners.get(jobId);
      if (jobListeners) {
        const index = jobListeners.indexOf(listener);
        if (index > -1) {
          jobListeners.splice(index, 1);
        }

        // Clean up empty listener arrays
        if (jobListeners.length === 0) {
          this.listeners.delete(jobId);
        }
      }
    };
  }

  // Subscribe to all import events globally
  subscribeGlobal(listener: ImportProgressListener): () => void {
    this.globalListeners.push(listener);

    return () => {
      const index = this.globalListeners.indexOf(listener);
      if (index > -1) {
        this.globalListeners.splice(index, 1);
      }
    };
  }

  // Emit progress event
  emitProgress(jobId: string, url: string, status: ImportStatus, progress?: string): void {
    const event: ImportProgressEvent = {
      type: 'progress',
      jobId,
      url,
      status,
      progress,
      timestamp: new Date()
    };

    this.notifyListeners(jobId, event);
  }

  // Emit completion event
  emitComplete(jobId: string, url: string, recipe: Recipe): void {
    const event: ImportProgressEvent = {
      type: 'complete',
      jobId,
      url,
      recipe,
      timestamp: new Date()
    };

    this.notifyListeners(jobId, event);
  }

  // Emit error event
  emitError(jobId: string, url: string, error: ImportError): void {
    const event: ImportProgressEvent = {
      type: 'error',
      jobId,
      url,
      error,
      timestamp: new Date()
    };

    this.notifyListeners(jobId, event);
  }

  private notifyListeners(jobId: string, event: ImportProgressEvent): void {
    // Notify job-specific listeners
    const jobListeners = this.listeners.get(jobId);
    if (jobListeners) {
      jobListeners.forEach(listener => {
        try {
          listener.onProgress(event);
        } catch (error) {
          console.error('Error in import progress listener:', error);
        }
      });
    }

    // Notify global listeners
    this.globalListeners.forEach(listener => {
      try {
        listener.onProgress(event);
      } catch (error) {
        console.error('Error in global import progress listener:', error);
      }
    });
  }

  // Get status message for display
  getStatusMessage(status: ImportStatus): string {
    switch (status) {
      case ImportStatus.VALIDATING:
        return 'Validating URL...';
      case ImportStatus.FETCHING:
        return 'Fetching recipe from website...';
      case ImportStatus.PARSING:
        return 'Extracting recipe data...';
      case ImportStatus.VALIDATING_CONTENT:
        return 'Validating recipe content...';
      case ImportStatus.COMPLETE:
        return 'Import complete!';
      case ImportStatus.ERROR:
        return 'Import failed';
      default:
        return 'Importing...';
    }
  }

  // Get user-friendly progress percentage (for progress bars)
  getProgressPercentage(status: ImportStatus): number {
    switch (status) {
      case ImportStatus.VALIDATING:
        return 10;
      case ImportStatus.FETCHING:
        return 30;
      case ImportStatus.PARSING:
        return 70;
      case ImportStatus.VALIDATING_CONTENT:
        return 90;
      case ImportStatus.COMPLETE:
        return 100;
      case ImportStatus.ERROR:
        return 0;
      default:
        return 0;
    }
  }

  // Clean up completed/failed jobs from listeners
  cleanup(): void {
    this.listeners.clear();
    this.globalListeners.length = 0;
  }
}

export const importProgressService = new ImportProgressService();