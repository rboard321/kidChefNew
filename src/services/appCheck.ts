import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  getToken,
  CustomProvider
} from 'firebase/app-check';
import { getApp } from 'firebase/app';
import { Platform } from 'react-native';
import { getEnvironmentInfo } from '../utils/environment';

let appCheck: any = null;

// Native App Check provider using device attestation simulation
const createNativeAppCheckProvider = () => {
  return new CustomProvider({
    getToken: () => {
      // For React Native, we create a custom token based on device characteristics
      // This is a simplified implementation - in production, you'd want device attestation
      const deviceInfo = {
        platform: Platform.OS,
        version: Platform.Version,
        timestamp: Date.now()
      };

      try {
        // Create a proper base64 encoded attestation token for React Native compatibility
        const deviceInfoJson = JSON.stringify(deviceInfo);
        const attestationData = Buffer.from(deviceInfoJson, 'utf8').toString('base64');

        return Promise.resolve({
          token: `custom-native-${attestationData}`,
          expireTimeMillis: Date.now() + (60 * 60 * 1000) // 1 hour expiry
        });
      } catch (error) {
        console.error('Failed to create App Check token:', error);
        // Fallback to simple string encoding if base64 fails
        const attestationData = encodeURIComponent(JSON.stringify(deviceInfo));
        return Promise.resolve({
          token: `custom-native-${attestationData}`,
          expireTimeMillis: Date.now() + (60 * 60 * 1000) // 1 hour expiry
        });
      }
    }
  });
};


export const initializeFirebaseAppCheck = () => {
  const envInfo = getEnvironmentInfo();

  try {
    const app = getApp();

    if (Platform.OS !== 'web') {
      // Native platforms: Use custom provider for device attestation
      if (envInfo.isProd || envInfo.isStaging) {
        appCheck = initializeAppCheck(app, {
          provider: createNativeAppCheckProvider(),
          isTokenAutoRefreshEnabled: true
        });

        if (__DEV__) {
          console.log(`🔒 Firebase App Check initialized with custom native provider (${envInfo.environment})`);
        }
      } else {
        // Development: Use debug provider or disable App Check
        if (__DEV__) {
          console.log('🔓 Firebase App Check disabled in development (native platform)');
        }
        return null;
      }
    } else {
      // Web platforms: Use reCAPTCHA providers
      if (envInfo.isProd) {
        // Production: Use reCAPTCHA Enterprise for strongest security
        const enterpriseKey = process.env.EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
        if (!enterpriseKey) {
          throw new Error('Missing reCAPTCHA Enterprise site key for production');
        }

        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaEnterpriseProvider(enterpriseKey),
          isTokenAutoRefreshEnabled: true
        });

        if (__DEV__) {
          console.log('🔒 Firebase App Check initialized with reCAPTCHA Enterprise (Production)');
        }
      } else if (envInfo.isStaging) {
        // Staging: Use reCAPTCHA v3 for realistic testing
        const v3Key = process.env.EXPO_PUBLIC_RECAPTCHA_V3_SITE_KEY;
        if (!v3Key) {
          console.warn('⚠️ Missing reCAPTCHA v3 site key for staging - App Check disabled');
          return null;
        }

        appCheck = initializeAppCheck(app, {
          provider: new ReCaptchaV3Provider(v3Key),
          isTokenAutoRefreshEnabled: true
        });

        if (__DEV__) {
          console.log('🔒 Firebase App Check initialized with reCAPTCHA v3 (Staging)');
        }
      } else {
        // Development: Skip App Check to avoid blocking development
        if (__DEV__) {
          console.log('🔓 Firebase App Check disabled in development environment');
        }
        return null;
      }
    }

    // Test App Check token generation
    if (__DEV__ && appCheck) {
      getToken(appCheck)
        .then((token) => {
          console.log('✅ App Check token generated successfully:', token.token.substring(0, 20) + '...');
        })
        .catch((error) => {
          console.warn('⚠️ App Check token generation failed:', error.message);
        });
    }

    return appCheck;

  } catch (error) {
    console.error('❌ Failed to initialize Firebase App Check:', error);

    // Don't throw in development to avoid blocking the app
    if (envInfo.isProd) {
      throw new Error('Critical security failure: App Check initialization failed in production');
    }

    return null;
  }
};

export const getAppCheckToken = async (): Promise<string | null> => {
  if (!appCheck) {
    if (__DEV__) {
      console.log('App Check not initialized, returning null token');
    }
    return null;
  }

  try {
    const tokenResult = await getToken(appCheck);
    return tokenResult.token;
  } catch (error) {
    console.error('Failed to get App Check token:', error);
    return null;
  }
};

// Validate App Check configuration
export const validateAppCheckConfig = (): {
  isConfigured: boolean;
  environment: string;
  provider: string;
  platform: string;
  warnings: string[];
  errors: string[];
} => {
  const envInfo = getEnvironmentInfo();
  const result = {
    isConfigured: false,
    environment: envInfo.environment,
    provider: 'none',
    platform: Platform.OS,
    warnings: [] as string[],
    errors: [] as string[]
  };

  if (Platform.OS !== 'web') {
    // Native platforms
    if (envInfo.isProd || envInfo.isStaging) {
      result.isConfigured = true;
      result.provider = 'Custom Native Provider';
      result.warnings.push('Using custom native provider - consider implementing device attestation for enhanced security');
    } else {
      result.provider = 'disabled (development)';
      result.isConfigured = true;
    }
  } else {
    // Web platforms
    if (envInfo.isProd) {
      const enterpriseKey = process.env.EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;
      if (!enterpriseKey) {
        result.errors.push('Missing reCAPTCHA Enterprise site key for production');
      } else {
        result.isConfigured = true;
        result.provider = 'reCAPTCHA Enterprise';
      }
    } else if (envInfo.isStaging) {
      const v3Key = process.env.EXPO_PUBLIC_RECAPTCHA_V3_SITE_KEY;
      if (!v3Key) {
        result.warnings.push('Missing reCAPTCHA v3 site key for staging - falling back to disabled');
      } else {
        result.isConfigured = true;
        result.provider = 'reCAPTCHA v3';
      }
    } else {
      result.provider = 'disabled (development)';
      result.isConfigured = true; // This is expected in development
      result.warnings.push('App Check disabled in development - ensure it\'s enabled before production deployment');
    }
  }

  return result;
};

export { appCheck };
