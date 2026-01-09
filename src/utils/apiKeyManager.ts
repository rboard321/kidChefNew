import { getEnvironmentInfo, isProduction } from './environment';
import { logger } from './logger';

interface ApiKeyValidation {
  isValid: boolean;
  environment: string;
  keyType: 'development' | 'staging' | 'production' | 'unknown';
  warnings: string[];
  errors: string[];
}

export class ApiKeyManager {
  private static instance: ApiKeyManager;
  private validationCache = new Map<string, ApiKeyValidation>();

  static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  validateFirebaseConfig(): ApiKeyValidation {
    const envInfo = getEnvironmentInfo();
    const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
    const apiKey = process.env.EXPO_PUBLIC_FIREBASE_API_KEY;
    const authDomain = process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN;

    const validation: ApiKeyValidation = {
      isValid: true,
      environment: envInfo.environment,
      keyType: 'unknown',
      warnings: [],
      errors: []
    };

    if (!projectId || !apiKey || !authDomain) {
      validation.isValid = false;
      validation.errors.push('Missing required Firebase configuration');
      return validation;
    }

    // Validate project ID matches environment
    if (envInfo.isDev && !projectId.includes('dev')) {
      validation.warnings.push('Development environment using non-dev Firebase project');
      validation.keyType = 'production';
    } else if (envInfo.isStaging && !projectId.includes('staging')) {
      validation.warnings.push('Staging environment using non-staging Firebase project');
      validation.keyType = 'production';
    } else if (envInfo.isProd && (projectId.includes('dev') || projectId.includes('staging'))) {
      validation.isValid = false;
      validation.errors.push('Production environment using development/staging Firebase project');
      validation.keyType = 'development';
    } else {
      // Determine key type based on project ID
      if (projectId.includes('dev')) {
        validation.keyType = 'development';
      } else if (projectId.includes('staging')) {
        validation.keyType = 'staging';
      } else {
        validation.keyType = 'production';
      }
    }

    // Validate auth domain matches project ID
    const expectedDomain = projectId === 'kidchef'
      ? 'kidchef.firebaseapp.com'
      : `${projectId}.firebaseapp.com`;

    if (authDomain !== expectedDomain) {
      validation.isValid = false;
      validation.errors.push(`Auth domain mismatch. Expected: ${expectedDomain}, Got: ${authDomain}`);
    }

    // Cache the validation result
    this.validationCache.set('firebase', validation);

    return validation;
  }

  // REMOVED: OpenAI validation - now server-side only via Cloud Functions
  // OpenAI API keys are no longer accessible from client-side code

  getValidationSummary(): {
    allValid: boolean;
    firebase: ApiKeyValidation;
    environmentMismatch: boolean;
  } {
    const firebase = this.validateFirebaseConfig();
    // REMOVED: OpenAI validation - now server-side only

    const allValid = firebase.isValid; // Only validate Firebase keys
    const environmentMismatch = false; // No environment mismatch without OpenAI

    return {
      allValid,
      firebase,
      environmentMismatch
    };
  }

  logSecurityWarnings(): void {
    const summary = this.getValidationSummary();

    if (__DEV__) {
      console.group('🔐 API Key Security Validation');

      if (!summary.allValid) {
        console.error('❌ Firebase API key validation failed');
        summary.firebase.errors.forEach(error => {
          console.error('  Error:', error);
        });
      } else {
        logger.debug('✅ Firebase API keys validated successfully');
      }

      summary.firebase.warnings.forEach(warning => {
        console.warn('  Warning:', warning);
      });

      logger.debug('Environment:', summary.firebase.environment);
      logger.debug('Firebase Key Type:', summary.firebase.keyType);
      logger.debug('OpenAI Keys: Server-side only (Cloud Functions)');

      console.groupEnd();
    }
  }

  // Production safety check
  assertProductionSafety(): void {
    const envInfo = getEnvironmentInfo();
    if (!envInfo.isProd) return;

    const summary = this.getValidationSummary();

    if (!summary.allValid) {
      throw new Error('Production deployment blocked: Firebase API key validation failed');
    }

    if (summary.firebase.keyType !== 'production') {
      throw new Error('Production deployment blocked: Non-production Firebase keys detected');
    }

    // OpenAI keys are validated server-side only
  }
}

// Initialize and run validation on app start
export const initializeApiKeyValidation = (): void => {
  const manager = ApiKeyManager.getInstance();
  manager.logSecurityWarnings();

  // Only assert production safety in production builds
  if (isProduction()) {
    manager.assertProductionSafety();
  }
};

export default ApiKeyManager;