/**
 * Environment detection and configuration utilities
 * Provides a consistent way to check environment and feature flags across the app
 */

export type Environment = 'development' | 'staging' | 'production';
export type AppVariant = 'dev' | 'staging' | 'production';

/**
 * Get the current environment
 * Uses EXPO_PUBLIC_ENVIRONMENT which is available at runtime in React Native
 */
export const getEnvironment = (): Environment => {
  // Use EXPO_PUBLIC_ENVIRONMENT as primary source (available at runtime in React Native)
  const expoEnv = process.env.EXPO_PUBLIC_ENVIRONMENT as Environment;
  if (expoEnv && ['development', 'staging', 'production'].includes(expoEnv)) {
    return expoEnv;
  }

  // Fallback to NODE_ENV for build-time detection (only available during build)
  if (typeof process !== 'undefined' && process.env.NODE_ENV) {
    if (process.env.NODE_ENV === 'production') return 'production';
    if (process.env.NODE_ENV === 'development') return 'development';
  }

  // Default fallback
  return 'development';
};

/**
 * Get the current app variant
 */
export const getAppVariant = (): AppVariant => {
  return (process.env.EXPO_PUBLIC_APP_VARIANT as AppVariant) || 'dev';
};

/**
 * Environment checks
 */
export const isDevelopment = (): boolean => getEnvironment() === 'development';
export const isStaging = (): boolean => getEnvironment() === 'staging';
export const isProduction = (): boolean => getEnvironment() === 'production';

/**
 * Feature flags based on environment variables
 */
export const featureFlags = {
  debugMode: process.env.EXPO_PUBLIC_DEBUG_MODE === 'true',
  enableDevTools: process.env.EXPO_PUBLIC_ENABLE_DEV_TOOLS === 'true',
  enableShakeReporting: process.env.EXPO_PUBLIC_ENABLE_SHAKE_REPORTING === 'true',
  enableBetaFeatures: process.env.EXPO_PUBLIC_ENABLE_BETA_FEATURES === 'true',
  showBetaBadge: process.env.EXPO_PUBLIC_SHOW_BETA_BADGE === 'true',
  mockPayments: process.env.EXPO_PUBLIC_MOCK_PAYMENTS === 'true',
  bypassEmailVerification: process.env.EXPO_PUBLIC_BYPASS_EMAIL_VERIFICATION === 'true',
  enableFeedbackCollection: process.env.EXPO_PUBLIC_ENABLE_FEEDBACK_COLLECTION === 'true',
  betaTestingMode: process.env.EXPO_PUBLIC_BETA_TESTING_MODE === 'true',
  strictSSL: process.env.EXPO_PUBLIC_STRICT_SSL === 'true',
  enableCrashReporting: process.env.EXPO_PUBLIC_ENABLE_CRASH_REPORTING === 'true',
};

/**
 * Get environment-specific configuration values
 */
export const config = {
  apiBaseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://dev-api.kidchef.app',
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'dev-support@kidchef.app',
  logLevel: (process.env.EXPO_PUBLIC_LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'debug',
  // SECURITY: OpenAI API key removed - now server-side only via Cloud Functions
};

/**
 * Get environment display information
 */
export const getEnvironmentInfo = () => {
  const environment = getEnvironment();
  const variant = getAppVariant();

  return {
    environment,
    variant,
    displayName: getEnvironmentDisplayName(environment),
    color: getEnvironmentColor(environment),
    isDev: isDevelopment(),
    isStaging: isStaging(),
    isProd: isProduction(),
    shouldShowDebugInfo: featureFlags.debugMode && !isProduction(),
  };
};

/**
 * Get user-friendly environment names
 */
export const getEnvironmentDisplayName = (env: Environment): string => {
  switch (env) {
    case 'development':
      return 'Development';
    case 'staging':
      return 'Beta';
    case 'production':
      return 'KidChef';
    default:
      return 'Unknown';
  }
};

/**
 * Get environment-specific colors for UI indicators
 */
export const getEnvironmentColor = (env: Environment): string => {
  switch (env) {
    case 'development':
      return '#f59e0b'; // Amber
    case 'staging':
      return '#3b82f6'; // Blue
    case 'production':
      return '#10b981'; // Green
    default:
      return '#6b7280'; // Gray
  }
};

/**
 * Get app version with environment suffix
 */
export const getAppVersionString = (): string => {
  const baseVersion = '1.0.0';
  const environment = getEnvironment();

  switch (environment) {
    case 'development':
      return `${baseVersion}-dev`;
    case 'staging':
      return `${baseVersion}-beta`;
    case 'production':
      return baseVersion;
    default:
      return `${baseVersion}-unknown`;
  }
};

/**
 * Conditional logging based on environment
 */
export const envLog = {
  debug: (...args: any[]) => {
    if (config.logLevel === 'debug' && (isDevelopment() || featureFlags.debugMode)) {
      console.log('[DEBUG]', ...args);
    }
  },
  info: (...args: any[]) => {
    if (['debug', 'info'].includes(config.logLevel)) {
      console.info('[INFO]', ...args);
    }
  },
  warn: (...args: any[]) => {
    if (['debug', 'info', 'warn'].includes(config.logLevel)) {
      console.warn('[WARN]', ...args);
    }
  },
  error: (...args: any[]) => {
    console.error('[ERROR]', ...args);
  },
};