import { FirebaseError } from 'firebase/app';
import { AuthError, AuthErrorCodes } from 'firebase/auth';
import { errorReportingService } from './errorReporting';

export interface AuthErrorInfo {
  code: string;
  message: string;
  suggestion?: string;
  canRetry: boolean;
  autoRetry?: boolean;
  retryDelay?: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  actionLabel?: string;
  action?: () => void;
}

export interface AuthErrorHandlerService {
  handleAuthError: (error: any, context?: string) => AuthErrorInfo;
  shouldAutoRetry: (error: any) => boolean;
  getRetryDelay: (error: any, attemptCount: number) => number;
  getUserFriendlyMessage: (error: any) => string;
}

const AUTH_ERROR_MAP: Record<string, AuthErrorInfo> = {
  'auth/user-not-found': {
    code: 'USER_NOT_FOUND',
    message: 'No account found with this email address',
    suggestion: 'Please check your email address or create a new account',
    canRetry: false,
    severity: 'medium',
    actionLabel: 'Sign Up Instead'
  },
  'auth/wrong-password': {
    code: 'WRONG_PASSWORD',
    message: 'Incorrect password',
    suggestion: 'Please check your password and try again',
    canRetry: true,
    severity: 'medium'
  },
  'auth/invalid-email': {
    code: 'INVALID_EMAIL',
    message: 'Invalid email address',
    suggestion: 'Please enter a valid email address',
    canRetry: false,
    severity: 'low'
  },
  'auth/email-already-in-use': {
    code: 'EMAIL_IN_USE',
    message: 'An account with this email already exists',
    suggestion: 'Try signing in instead, or use a different email',
    canRetry: false,
    severity: 'medium',
    actionLabel: 'Sign In Instead'
  },
  'auth/weak-password': {
    code: 'WEAK_PASSWORD',
    message: 'Password is too weak',
    suggestion: 'Please use a password with at least 6 characters',
    canRetry: false,
    severity: 'low'
  },
  'auth/too-many-requests': {
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many failed attempts',
    suggestion: 'Please wait a few minutes before trying again',
    canRetry: true,
    autoRetry: true,
    retryDelay: 60000, // 1 minute
    severity: 'high'
  },
  'auth/network-request-failed': {
    code: 'NETWORK_ERROR',
    message: 'Network connection failed',
    suggestion: 'Please check your internet connection and try again',
    canRetry: true,
    autoRetry: true,
    retryDelay: 3000,
    severity: 'medium'
  },
  'auth/operation-not-allowed': {
    code: 'OPERATION_NOT_ALLOWED',
    message: 'This sign-in method is not enabled',
    suggestion: 'Please contact support for assistance',
    canRetry: false,
    severity: 'critical'
  },
  'auth/user-disabled': {
    code: 'USER_DISABLED',
    message: 'This account has been disabled',
    suggestion: 'Please contact support to restore your account',
    canRetry: false,
    severity: 'critical'
  },
  'auth/requires-recent-login': {
    code: 'REQUIRES_RECENT_LOGIN',
    message: 'This operation requires recent authentication',
    suggestion: 'Please sign out and sign in again to continue',
    canRetry: false,
    severity: 'medium',
    actionLabel: 'Sign Out & Try Again'
  },
  'auth/invalid-credential': {
    code: 'INVALID_CREDENTIAL',
    message: 'Invalid credentials',
    suggestion: 'Please check your email and password',
    canRetry: true,
    severity: 'medium'
  }
};

const GENERIC_AUTH_ERROR: AuthErrorInfo = {
  code: 'UNKNOWN_AUTH_ERROR',
  message: 'Authentication failed',
  suggestion: 'Please try again or contact support if the problem persists',
  canRetry: true,
  severity: 'medium'
};

export const authErrorHandler: AuthErrorHandlerService = {
  handleAuthError(error: any, context?: string): AuthErrorInfo {
    // Extract Firebase error code
    let errorCode: string;
    let originalMessage: string;

    if (error?.code) {
      errorCode = error.code;
      originalMessage = error.message || '';
    } else if (typeof error === 'string') {
      errorCode = 'auth/unknown';
      originalMessage = error;
    } else {
      errorCode = 'auth/unknown';
      originalMessage = error?.message || 'Unknown authentication error';
    }

    // Get mapped error info or use generic
    const errorInfo = AUTH_ERROR_MAP[errorCode] || {
      ...GENERIC_AUTH_ERROR,
      message: originalMessage || GENERIC_AUTH_ERROR.message
    };

    // Report error for monitoring
    errorReportingService.reportError(error, {
      severity: errorInfo.severity,
      screen: context || 'Auth',
      action: 'auth_error',
      tags: ['auth', 'error_handling'],
      customData: {
        errorCode,
        originalMessage,
        canRetry: errorInfo.canRetry,
        autoRetry: errorInfo.autoRetry || false
      }
    });

    // Log error details in development
    if (__DEV__) {
      console.error('🚫 Auth Error Details:', {
        code: errorCode,
        message: originalMessage,
        mappedInfo: errorInfo,
        context,
        timestamp: new Date().toISOString()
      });
    }

    return errorInfo;
  },

  shouldAutoRetry(error: any): boolean {
    const errorCode = error?.code;
    const errorInfo = AUTH_ERROR_MAP[errorCode];
    return errorInfo?.autoRetry || false;
  },

  getRetryDelay(error: any, attemptCount: number): number {
    const errorCode = error?.code;
    const errorInfo = AUTH_ERROR_MAP[errorCode];

    if (errorInfo?.retryDelay) {
      // Apply exponential backoff for network errors
      if (errorCode === 'auth/network-request-failed') {
        return Math.min(errorInfo.retryDelay * Math.pow(2, attemptCount - 1), 30000);
      }
      return errorInfo.retryDelay;
    }

    // Default exponential backoff: 1s, 2s, 4s, 8s, max 15s
    return Math.min(1000 * Math.pow(2, attemptCount - 1), 15000);
  },

  getUserFriendlyMessage(error: any): string {
    const errorInfo = this.handleAuthError(error);

    if (errorInfo.suggestion) {
      return `${errorInfo.message}. ${errorInfo.suggestion}`;
    }

    return errorInfo.message;
  }
};

// Enhanced auth operations with automatic error handling and retry
export class AuthOperationManager {
  private maxRetries = 3;
  private retryCount = new Map<string, number>();

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationId: string,
    context?: string
  ): Promise<T> {
    const currentRetryCount = this.retryCount.get(operationId) || 0;

    try {
      const result = await operation();

      // Reset retry count on success
      this.retryCount.delete(operationId);

      return result;
    } catch (error) {
      const errorInfo = authErrorHandler.handleAuthError(error, context);

      // Check if we should and can retry
      if (
        errorInfo.canRetry &&
        authErrorHandler.shouldAutoRetry(error) &&
        currentRetryCount < this.maxRetries
      ) {
        const retryDelay = authErrorHandler.getRetryDelay(error, currentRetryCount + 1);

        if (__DEV__) {
          console.log(`🔄 Auto-retrying ${operationId} after ${retryDelay}ms (attempt ${currentRetryCount + 1})`);
        }

        this.retryCount.set(operationId, currentRetryCount + 1);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, retryDelay));

        // Recursive retry
        return this.executeWithRetry(operation, operationId, context);
      }

      // Reset retry count and throw enhanced error
      this.retryCount.delete(operationId);
      throw error;
    }
  }

  resetRetryCount(operationId?: string) {
    if (operationId) {
      this.retryCount.delete(operationId);
    } else {
      this.retryCount.clear();
    }
  }
}

export const authOperationManager = new AuthOperationManager();