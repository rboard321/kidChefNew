import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp,
  onSnapshot,
  limit
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from './firebase';
import type { ReadingLevel } from '../types';

export enum ConversionStatus {
  QUEUED = 'queued',
  CONVERTING = 'converting',
  READY = 'ready',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

export interface ConversionTask {
  id: string;
  recipeId: string;
  kidId: string;
  kidAge: number;
  readingLevel: ReadingLevel;
  allergyFlags: string[];
  status: ConversionStatus;
  progress?: number;
  error?: ConversionError;
  kidRecipeId?: string;
  usedCache?: boolean;
  queuedAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  estimatedCompletion?: Date;
  retryCount: number;
  maxRetries: number;
  userId: string;
}

export interface ConversionError {
  code: string;
  message: string;
  suggestion?: string;
  canRetry: boolean;
}

export interface ConversionStatusService {
  queueConversion: (
    recipeId: string,
    kidId: string,
    kidAge: number,
    readingLevel: ReadingLevel,
    allergyFlags?: string[]
  ) => Promise<string>;
  getConversionStatus: (taskId: string) => Promise<ConversionTask | null>;
  getUserConversions: (userId: string, limit?: number) => Promise<ConversionTask[]>;
  getActiveConversions: (userId: string) => Promise<ConversionTask[]>;
  cancelConversion: (taskId: string) => Promise<void>;
  retryConversion: (taskId: string) => Promise<void>;
  subscribeToConversion: (taskId: string, callback: (task: ConversionTask | null) => void) => () => void;
  subscribeToUserConversions: (userId: string, callback: (tasks: ConversionTask[]) => void) => () => void;
  cleanupOldTasks: (olderThanDays: number) => Promise<void>;
}

class ConversionStatusManager implements ConversionStatusService {

  async queueConversion(
    recipeId: string,
    kidId: string,
    kidAge: number,
    readingLevel: ReadingLevel,
    allergyFlags: string[] = []
  ): Promise<string> {
    try {
      // Check if there's already a conversion in progress for this recipe+kid combo
      const existingTask = await this.findExistingConversion(recipeId, kidId);
      if (existingTask && (existingTask.status === ConversionStatus.QUEUED || existingTask.status === ConversionStatus.CONVERTING)) {
        return existingTask.id;
      }

      const task: Omit<ConversionTask, 'id'> = {
        recipeId,
        kidId,
        kidAge,
        readingLevel,
        allergyFlags,
        status: ConversionStatus.QUEUED,
        queuedAt: new Date(),
        retryCount: 0,
        maxRetries: 3,
        userId: '', // Will be set by the calling code
        estimatedCompletion: new Date(Date.now() + 30000), // 30 seconds estimate
      };

      const docRef = await addDoc(collection(db, 'conversionTasks'), {
        ...task,
        queuedAt: Timestamp.now(),
        estimatedCompletion: Timestamp.fromDate(task.estimatedCompletion!),
      });

      // Immediately start the conversion
      this.startConversion(docRef.id);

      return docRef.id;
    } catch (error) {
      console.error('Error queueing conversion:', error);
      throw error;
    }
  }

  private async findExistingConversion(recipeId: string, kidId: string): Promise<ConversionTask | null> {
    try {
      const q = query(
        collection(db, 'conversionTasks'),
        where('recipeId', '==', recipeId),
        where('kidId', '==', kidId),
        where('status', 'in', [ConversionStatus.QUEUED, ConversionStatus.CONVERTING]),
        orderBy('queuedAt', 'desc'),
        limit(1)
      );

      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return this.docToTask(doc.id, doc.data());
      }
      return null;
    } catch (error) {
      console.error('Error finding existing conversion:', error);
      return null;
    }
  }

  private async startConversion(taskId: string): Promise<void> {
    try {
      // Update status to converting
      await updateDoc(doc(db, 'conversionTasks', taskId), {
        status: ConversionStatus.CONVERTING,
        startedAt: Timestamp.now(),
        progress: 0,
      });

      // Get the task details
      const task = await this.getConversionStatus(taskId);
      if (!task) {
        throw new Error('Task not found');
      }

      // Call the secure Cloud Function for conversion
      const convertRecipeForKid = httpsCallable(functions, 'convertRecipeForKid');

      const result = await convertRecipeForKid({
        recipeId: task.recipeId,
        kidAge: task.kidAge,
        readingLevel: task.readingLevel,
        allergyFlags: task.allergyFlags,
      });

      const data = result.data as any;

      if (data.success) {
        // Mark as completed
        await updateDoc(doc(db, 'conversionTasks', taskId), {
          status: ConversionStatus.READY,
          progress: 100,
          completedAt: Timestamp.now(),
          kidRecipeId: data.kidRecipeId,
          usedCache: data.usedCache,
        });
      } else {
        throw new Error(data.error || 'Conversion failed');
      }

    } catch (error: any) {
      console.error('Error during conversion:', error);

      const conversionError = this.parseConversionError(error);
      const shouldRetry = conversionError.canRetry && task && task.retryCount < task.maxRetries;

      if (shouldRetry) {
        // Schedule retry
        await this.scheduleRetry(taskId);
      } else {
        // Mark as failed
        await updateDoc(doc(db, 'conversionTasks', taskId), {
          status: ConversionStatus.FAILED,
          completedAt: Timestamp.now(),
          error: conversionError,
        });
      }
    }
  }

  private parseConversionError(error: any): ConversionError {
    const message = error?.message || error?.toString() || 'Unknown error';

    // Parse Firebase Functions errors
    if (error?.code) {
      switch (error.code) {
        case 'unauthenticated':
          return {
            code: 'UNAUTHENTICATED',
            message: 'Please log in to convert recipes',
            canRetry: false
          };

        case 'resource-exhausted':
          return {
            code: 'RATE_LIMITED',
            message: 'You\'ve reached your daily conversion limit',
            suggestion: 'Try again tomorrow or upgrade to premium',
            canRetry: false
          };

        case 'deadline-exceeded':
          return {
            code: 'TIMEOUT',
            message: 'Conversion timed out',
            suggestion: 'This recipe may be complex. Try again in a few minutes.',
            canRetry: true
          };

        default:
          return {
            code: 'CONVERSION_ERROR',
            message: message,
            canRetry: true
          };
      }
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred during conversion',
      suggestion: 'Please try again later',
      canRetry: true
    };
  }

  private async scheduleRetry(taskId: string): Promise<void> {
    const task = await this.getConversionStatus(taskId);
    if (!task) return;

    const retryDelay = Math.min(1000 * Math.pow(2, task.retryCount), 30000); // Max 30 seconds
    const nextRetry = new Date(Date.now() + retryDelay);

    await updateDoc(doc(db, 'conversionTasks', taskId), {
      status: ConversionStatus.QUEUED,
      retryCount: task.retryCount + 1,
      estimatedCompletion: Timestamp.fromDate(nextRetry),
    });

    // Schedule the retry
    setTimeout(() => {
      this.startConversion(taskId);
    }, retryDelay);
  }

  async getConversionStatus(taskId: string): Promise<ConversionTask | null> {
    try {
      const docSnap = await getDoc(doc(db, 'conversionTasks', taskId));
      if (docSnap.exists()) {
        return this.docToTask(docSnap.id, docSnap.data());
      }
      return null;
    } catch (error) {
      console.error('Error fetching conversion status:', error);
      return null;
    }
  }

  async getUserConversions(userId: string, limitCount: number = 20): Promise<ConversionTask[]> {
    try {
      const q = query(
        collection(db, 'conversionTasks'),
        where('userId', '==', userId),
        orderBy('queuedAt', 'desc'),
        limit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const tasks: ConversionTask[] = [];

      querySnapshot.forEach((doc) => {
        tasks.push(this.docToTask(doc.id, doc.data()));
      });

      return tasks;
    } catch (error) {
      console.error('Error fetching user conversions:', error);
      return [];
    }
  }

  async getActiveConversions(userId: string): Promise<ConversionTask[]> {
    try {
      const q = query(
        collection(db, 'conversionTasks'),
        where('userId', '==', userId),
        where('status', 'in', [ConversionStatus.QUEUED, ConversionStatus.CONVERTING]),
        orderBy('queuedAt', 'asc')
      );

      const querySnapshot = await getDocs(q);
      const tasks: ConversionTask[] = [];

      querySnapshot.forEach((doc) => {
        tasks.push(this.docToTask(doc.id, doc.data()));
      });

      return tasks;
    } catch (error) {
      console.error('Error fetching active conversions:', error);
      return [];
    }
  }

  async cancelConversion(taskId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'conversionTasks', taskId), {
        status: ConversionStatus.CANCELLED,
        completedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error cancelling conversion:', error);
      throw error;
    }
  }

  async retryConversion(taskId: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'conversionTasks', taskId), {
        status: ConversionStatus.QUEUED,
        error: null,
        queuedAt: Timestamp.now(),
        estimatedCompletion: Timestamp.fromDate(new Date(Date.now() + 30000)),
      });

      this.startConversion(taskId);
    } catch (error) {
      console.error('Error retrying conversion:', error);
      throw error;
    }
  }

  subscribeToConversion(taskId: string, callback: (task: ConversionTask | null) => void): () => void {
    return onSnapshot(doc(db, 'conversionTasks', taskId), (doc) => {
      if (doc.exists()) {
        callback(this.docToTask(doc.id, doc.data()));
      } else {
        callback(null);
      }
    }, (error) => {
      console.error('Error in conversion subscription:', error);
      callback(null);
    });
  }

  subscribeToUserConversions(userId: string, callback: (tasks: ConversionTask[]) => void): () => void {
    const q = query(
      collection(db, 'conversionTasks'),
      where('userId', '==', userId),
      orderBy('queuedAt', 'desc'),
      limit(10)
    );

    return onSnapshot(q, (querySnapshot) => {
      const tasks: ConversionTask[] = [];
      querySnapshot.forEach((doc) => {
        tasks.push(this.docToTask(doc.id, doc.data()));
      });
      callback(tasks);
    }, (error) => {
      console.error('Error in user conversions subscription:', error);
      callback([]);
    });
  }

  async cleanupOldTasks(olderThanDays: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const q = query(
        collection(db, 'conversionTasks'),
        where('queuedAt', '<', Timestamp.fromDate(cutoffDate))
      );

      const querySnapshot = await getDocs(q);
      const deletePromises: Promise<void>[] = [];

      querySnapshot.forEach((doc) => {
        deletePromises.push(deleteDoc(doc.ref));
      });

      await Promise.all(deletePromises);
      console.log(`Cleaned up ${deletePromises.length} old conversion tasks`);
    } catch (error) {
      console.error('Error cleaning up old tasks:', error);
      throw error;
    }
  }

  private docToTask(id: string, data: any): ConversionTask {
    return {
      id,
      recipeId: data.recipeId,
      kidId: data.kidId,
      kidAge: data.kidAge,
      readingLevel: data.readingLevel,
      allergyFlags: data.allergyFlags || [],
      status: data.status,
      progress: data.progress,
      error: data.error,
      kidRecipeId: data.kidRecipeId,
      usedCache: data.usedCache,
      queuedAt: data.queuedAt?.toDate() || new Date(),
      startedAt: data.startedAt?.toDate(),
      completedAt: data.completedAt?.toDate(),
      estimatedCompletion: data.estimatedCompletion?.toDate(),
      retryCount: data.retryCount || 0,
      maxRetries: data.maxRetries || 3,
      userId: data.userId,
    };
  }
}

export const conversionStatusService = new ConversionStatusManager();