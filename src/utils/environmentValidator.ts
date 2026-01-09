import { getEnvironmentInfo } from './environment';
import { ApiKeyManager } from './apiKeyManager';
import { validateAppCheckConfig } from '../services/appCheck';
import { logger } from './logger';

interface ValidationResult {
  isValid: boolean;
  environment: string;
  issues: {
    critical: string[];
    warnings: string[];
    info: string[];
  };
  recommendations: string[];
}

export class EnvironmentValidator {
  private static instance: EnvironmentValidator;

  static getInstance(): EnvironmentValidator {
    if (!EnvironmentValidator.instance) {
      EnvironmentValidator.instance = new EnvironmentValidator();
    }
    return EnvironmentValidator.instance;
  }

  validateEnvironment(): ValidationResult {
    const envInfo = getEnvironmentInfo();
    const result: ValidationResult = {
      isValid: true,
      environment: envInfo.environment,
      issues: {
        critical: [],
        warnings: [],
        info: []
      },
      recommendations: []
    };

    // Validate API keys
    this.validateApiKeys(result);

    // Validate App Check configuration
    this.validateAppCheck(result);

    // Validate environment consistency
    this.validateEnvironmentConsistency(result, envInfo);

    // Validate production readiness
    if (envInfo.isProd) {
      this.validateProductionReadiness(result, envInfo);
    }

    // Add environment-specific recommendations
    this.addEnvironmentRecommendations(result, envInfo);

    // Set overall validity
    result.isValid = result.issues.critical.length === 0;

    return result;
  }

  private validateApiKeys(result: ValidationResult): void {
    const apiKeyManager = ApiKeyManager.getInstance();
    const summary = apiKeyManager.getValidationSummary();

    if (!summary.allValid) {
      result.issues.critical.push('Firebase API key validation failed');
      summary.firebase.errors.forEach(error => {
        result.issues.critical.push(`Firebase: ${error}`);
      });
    }

    // Add warnings from Firebase service
    summary.firebase.warnings.forEach(warning => {
      result.issues.warnings.push(warning);
    });

    // OpenAI validation removed - now server-side only via Cloud Functions
  }

  private validateAppCheck(result: ValidationResult): void {
    const appCheckValidation = validateAppCheckConfig();

    if (!appCheckValidation.isConfigured && appCheckValidation.environment === 'production') {
      result.issues.critical.push('App Check not configured for production environment');
    }

    appCheckValidation.errors.forEach(error => {
      result.issues.critical.push(`App Check: ${error}`);
    });

    appCheckValidation.warnings.forEach(warning => {
      result.issues.warnings.push(`App Check: ${warning}`);
    });

    result.issues.info.push(`App Check provider: ${appCheckValidation.provider}`);
  }

  private validateEnvironmentConsistency(result: ValidationResult, envInfo: any): void {
    const expectedProjectId = envInfo.isDev
      ? 'kidchef-dev'
      : envInfo.isStaging
        ? 'kidchef-staging'
        : 'kidchef';

    const actualProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;

    if (actualProjectId !== expectedProjectId) {
      result.issues.critical.push(
        `Environment/Project ID mismatch: Expected ${expectedProjectId}, got ${actualProjectId}`
      );
    }

    // Validate bundle identifier consistency
    const expectedVariant = envInfo.isDev ? 'dev' : envInfo.isStaging ? 'staging' : 'production';
    const actualVariant = process.env.EXPO_PUBLIC_APP_VARIANT;

    if (actualVariant !== expectedVariant) {
      result.issues.warnings.push(
        `App variant mismatch: Expected ${expectedVariant}, got ${actualVariant}`
      );
    }

    // Check for development tools in production
    if (envInfo.isProd) {
      if (process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === 'true') {
        result.issues.critical.push('Development tools enabled in production');
      }
      if (process.env.EXPO_PUBLIC_DEBUG_MODE === 'true') {
        result.issues.critical.push('Debug mode enabled in production');
      }
    }
  }

  private validateProductionReadiness(result: ValidationResult, envInfo: any): void {
    const requiredProdVars = [
      'EXPO_PUBLIC_FIREBASE_API_KEY',
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID'
      // REMOVED: 'EXPO_PUBLIC_OPENAI_API_KEY' - now server-side only
    ];

    const missingVars = requiredProdVars.filter(varName => !process.env[varName]);
    if (missingVars.length > 0) {
      result.issues.critical.push(`Missing production environment variables: ${missingVars.join(', ')}`);
    }

    // Check for test data indicators
    if (process.env.EXPO_PUBLIC_MOCK_PAYMENTS === 'true') {
      result.issues.critical.push('Mock payments enabled in production');
    }

    // Validate security settings
    if (process.env.EXPO_PUBLIC_STRICT_SSL !== 'true') {
      result.issues.warnings.push('Strict SSL not enabled for production');
    }

    if (process.env.EXPO_PUBLIC_ENABLE_CRASH_REPORTING !== 'true') {
      result.issues.warnings.push('Crash reporting not enabled for production');
    }
  }

  private addEnvironmentRecommendations(result: ValidationResult, envInfo: any): void {
    if (envInfo.isDev) {
      result.recommendations.push('Consider using Firebase emulators for local development');
      result.recommendations.push('Enable all debugging and development features');
      result.recommendations.push('AI features are handled server-side via Cloud Functions');
    } else if (envInfo.isStaging) {
      result.recommendations.push('Test all production features in staging environment');
      result.recommendations.push('Validate App Check configuration before production');
      result.recommendations.push('Monitor API usage and quotas');
    } else if (envInfo.isProd) {
      result.recommendations.push('Regularly rotate Firebase API keys');
      result.recommendations.push('Monitor security logs and access patterns');
      result.recommendations.push('Keep production environment variables secure');
    }

    // General recommendations
    result.recommendations.push('Regularly review and update Firestore security rules');
    result.recommendations.push('Implement proper logging and monitoring');
  }

  logValidationResults(result: ValidationResult): void {
    if (!__DEV__ && result.environment !== 'development') return;

    console.group(`🛡️ Environment Validation - ${result.environment.toUpperCase()}`);

    if (result.isValid) {
      logger.debug('✅ Environment validation passed');
    } else {
      console.error('❌ Environment validation failed');
    }

    if (result.issues.critical.length > 0) {
      console.group('🚨 Critical Issues');
      result.issues.critical.forEach(issue => console.error('  ❌', issue));
      console.groupEnd();
    }

    if (result.issues.warnings.length > 0) {
      console.group('⚠️ Warnings');
      result.issues.warnings.forEach(warning => console.warn('  ⚠️', warning));
      console.groupEnd();
    }

    if (result.issues.info.length > 0) {
      console.group('ℹ️ Information');
      result.issues.info.forEach(info => logger.debug('  ℹ️', info));
      console.groupEnd();
    }

    if (result.recommendations.length > 0) {
      console.group('💡 Recommendations');
      result.recommendations.forEach(rec => logger.debug('  💡', rec));
      console.groupEnd();
    }

    console.groupEnd();
  }

  // Pre-deployment validation
  assertDeploymentReadiness(): void {
    const result = this.validateEnvironment();

    if (!result.isValid) {
      const criticalIssues = result.issues.critical.join(', ');
      throw new Error(`Deployment blocked: ${criticalIssues}`);
    }

    // Log warnings but don't block deployment
    if (result.issues.warnings.length > 0) {
      console.warn('Deployment proceeding with warnings:', result.issues.warnings);
    }
  }
}

// Initialize and validate environment on import
export const validateEnvironmentOnStartup = (): ValidationResult => {
  const validator = EnvironmentValidator.getInstance();
  const result = validator.validateEnvironment();
  validator.logValidationResults(result);
  return result;
};

export default EnvironmentValidator;