import { logger } from '../utils/logger';
import {
  collection,
  doc,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { errorReportingService } from './errorReporting';

export type FeedbackType = 'general' | 'feature_request' | 'usability' | 'beta_testing' | 'bug_report';

export interface BetaFeedback {
  id: string;
  userId: string;
  userEmail?: string;
  feedbackType: FeedbackType;
  category?: string;
  title: string;
  description: string;
  rating?: number; // 1-5 stars for general feedback
  deviceInfo?: {
    platform: string;
    appVersion: string;
    osVersion?: string;
  };
  context?: {
    screen?: string;
    action?: string;
    sessionId?: string;
  };
  metadata?: Record<string, any>;
  createdAt: Timestamp;
  status: 'new' | 'reviewing' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
}

export interface FeedbackSubmission {
  feedbackType: FeedbackType;
  category?: string;
  title: string;
  description: string;
  rating?: number;
  context?: {
    screen?: string;
    action?: string;
    customData?: Record<string, any>;
  };
}

export interface BetaFeedbackService {
  submitFeedback: (feedback: FeedbackSubmission) => Promise<string>;
  submitBugReport: (bugDetails: {
    category: string;
    description: string;
    stepsToReproduce?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, any>;
  }) => Promise<string>;
  submitFeatureRequest: (request: {
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high';
    context?: Record<string, any>;
  }) => Promise<string>;
  submitUsabilityFeedback: (usability: {
    area: string;
    description: string;
    suggestion?: string;
    rating?: number;
    context?: Record<string, any>;
  }) => Promise<string>;
}

class BetaFeedbackManager implements BetaFeedbackService {
  private stripUndefinedValues(obj: any): any {
    if (obj === null || obj === undefined) {
      return undefined;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.stripUndefinedValues(item)).filter(item => item !== undefined);
    }

    if (typeof obj === 'object') {
      const result: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        const cleanedValue = this.stripUndefinedValues(value);
        if (cleanedValue !== undefined) {
          result[key] = cleanedValue;
        }
      }
      return Object.keys(result).length > 0 ? result : undefined;
    }

    return obj;
  }

  private async getDeviceInfo() {
    try {
      // Import device info packages
      const Device = await import('expo-device');
      const Application = await import('expo-application');
      const { Platform } = await import('react-native');

      return {
        platform: Platform.OS,
        appVersion: Application.nativeApplicationVersion || '1.0.0-beta',
        osVersion: Platform.Version?.toString() || Device.osVersion || 'unknown',
        deviceModel: Device.modelName || 'unknown',
        deviceBrand: Device.brand || 'unknown',
        buildVersion: Application.nativeBuildVersion || 'unknown',
      };
    } catch (error) {
      console.warn('Failed to get device info in betaFeedbackService:', error);
      return {
        platform: 'react-native',
        appVersion: '1.0.0-beta',
        osVersion: 'unknown',
      };
    }
  }

  private async getSessionContext() {
    return {
      sessionId: `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
    };
  }

  async submitFeedback(feedback: FeedbackSubmission): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to submit feedback');
    }

    try {
      const deviceInfo = await this.getDeviceInfo();
      const sessionContext = await this.getSessionContext();

      // Ensure category is never undefined for Firestore validation
      const validatedCategory = feedback.category || this.getDefaultCategory(feedback.feedbackType);

      const rawFeedbackData: Omit<BetaFeedback, 'id'> = {
        userId: currentUser.uid,
        userEmail: currentUser.email || undefined,
        feedbackType: feedback.feedbackType,
        category: validatedCategory,
        title: feedback.title,
        description: feedback.description,
        rating: feedback.rating,
        deviceInfo,
        context: {
          screen: feedback.context?.screen,
          action: feedback.context?.action,
          sessionId: sessionContext.sessionId,
        },
        metadata: {
          submissionMethod: 'feedback_modal',
          ...feedback.context?.customData,
        },
        createdAt: Timestamp.now(),
        status: 'new',
        priority: this.determinePriority(feedback),
      };

      // Strip all undefined values to prevent Firestore validation errors
      const cleanedFeedbackData = this.stripUndefinedValues(rawFeedbackData);

      const docRef = await addDoc(collection(db, 'betaFeedback'), cleanedFeedbackData);

      // Also log as a structured event for analytics
      if (__DEV__) {
        logger.debug('Beta feedback submitted:', {
          feedbackId: docRef.id,
          type: feedback.feedbackType,
          category: feedback.category,
          hasRating: !!feedback.rating,
        });
      }

      return docRef.id;
    } catch (error) {
      console.error('Error submitting beta feedback:', error);
      throw error;
    }
  }

  async submitBugReport(bugDetails: {
    category: string;
    description: string;
    stepsToReproduce?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    context?: Record<string, any>;
  }): Promise<string> {
    // Use the existing error reporting system for bug reports
    try {
      const mockError = new Error(`Beta Bug Report: ${bugDetails.category} - ${bugDetails.description.substring(0, 100)}`);

      await errorReportingService.reportError(mockError, {
        severity: bugDetails.severity || 'medium',
        userId: auth.currentUser?.uid,
        screen: bugDetails.context?.screen || 'beta_feedback',
        action: 'beta_bug_report',
        tags: ['beta_feedback', 'bug_report', bugDetails.category.toLowerCase().replace(/\s+/g, '_')],
        customData: {
          category: bugDetails.category,
          description: bugDetails.description,
          stepsToReproduce: bugDetails.stepsToReproduce,
          reportSource: 'beta_feedback_service',
          ...bugDetails.context,
        },
      });

      // Also create a feedback record for tracking
      return await this.submitFeedback({
        feedbackType: 'bug_report',
        category: bugDetails.category,
        title: `Bug Report: ${bugDetails.category}`,
        description: bugDetails.description,
        context: {
          customData: {
            stepsToReproduce: bugDetails.stepsToReproduce,
            severity: bugDetails.severity,
            ...bugDetails.context,
          },
        },
      });
    } catch (error) {
      console.error('Error submitting bug report:', error);
      throw error;
    }
  }

  async submitFeatureRequest(request: {
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high';
    context?: Record<string, any>;
  }): Promise<string> {
    return await this.submitFeedback({
      feedbackType: 'feature_request',
      title: request.title,
      description: request.description,
      context: {
        customData: {
          requestedPriority: request.priority || 'medium',
          ...request.context,
        },
      },
    });
  }

  async submitUsabilityFeedback(usability: {
    area: string;
    description: string;
    suggestion?: string;
    rating?: number;
    context?: Record<string, any>;
  }): Promise<string> {
    return await this.submitFeedback({
      feedbackType: 'usability',
      category: usability.area,
      title: `Usability Feedback: ${usability.area}`,
      description: usability.description,
      rating: usability.rating,
      context: {
        customData: {
          suggestion: usability.suggestion,
          ...usability.context,
        },
      },
    });
  }

  private getDefaultCategory(feedbackType: FeedbackType): string {
    // Provide default categories to prevent undefined validation errors
    switch (feedbackType) {
      case 'bug_report':
        return 'general_bug';
      case 'feature_request':
        return 'new_feature';
      case 'usability':
        return 'user_experience';
      case 'beta_testing':
        return 'beta_feedback';
      case 'general':
      default:
        return 'general_feedback';
    }
  }

  private determinePriority(feedback: FeedbackSubmission): 'low' | 'medium' | 'high' {
    // Auto-prioritize based on feedback type and rating
    if (feedback.feedbackType === 'bug_report') {
      return 'high';
    }

    if (feedback.feedbackType === 'feature_request') {
      return 'medium';
    }

    if (feedback.rating !== undefined) {
      if (feedback.rating <= 2) {
        return 'high'; // Low ratings indicate significant issues
      } else if (feedback.rating === 3) {
        return 'medium';
      }
    }

    return 'low';
  }
}

// Utility functions for quick feedback submission
export const betaFeedbackService = new BetaFeedbackManager();

// Quick feedback functions for common scenarios
export const submitQuickFeedback = async (
  type: FeedbackType,
  description: string,
  context?: Record<string, any>
) => {
  return await betaFeedbackService.submitFeedback({
    feedbackType: type,
    title: `Quick ${type} feedback`,
    description,
    context: { customData: context },
  });
};

export const submitQuickBugReport = async (
  category: string,
  description: string,
  context?: Record<string, any>
) => {
  return await betaFeedbackService.submitBugReport({
    category,
    description,
    context,
  });
};

export const submitAppRating = async (
  rating: number,
  comment?: string,
  context?: Record<string, any>
) => {
  return await betaFeedbackService.submitFeedback({
    feedbackType: 'general',
    title: `App Rating: ${rating}/5 stars`,
    description: comment || `User gave ${rating} out of 5 stars`,
    rating,
    context: { customData: context },
  });
};

// Beta testing specific functions
export const submitBetaTestingFeedback = async (
  area: string,
  feedback: string,
  issues?: string[],
  suggestions?: string[]
) => {
  return await betaFeedbackService.submitFeedback({
    feedbackType: 'beta_testing',
    category: area,
    title: `Beta Testing Feedback: ${area}`,
    description: feedback,
    context: {
      customData: {
        issues: issues || [],
        suggestions: suggestions || [],
        testingPhase: 'beta',
      },
    },
  });
};
