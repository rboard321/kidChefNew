import { initializeApp } from 'firebase/app';
import { initializeAuth, getAuth, onAuthStateChanged } from 'firebase/auth';
import { getReactNativePersistence } from '@firebase/auth/dist/rn';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import { getRemoteConfig, fetchAndActivate } from 'firebase/remote-config';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApiKeyValidation } from '../utils/apiKeyManager';
import { initializeFirebaseAppCheck } from './appCheck';
import { validateEnvironmentOnStartup } from '../utils/environmentValidator';
import { getEnvironment } from '../utils/environment';
import { logger } from '../utils/logger';

// Firebase config with validation
const getFirebaseConfig = () => {
  // Debug environment variable loading
  if (__DEV__) {
    console.group('🔍 Environment Variable Debug');
    logger.debug('NODE_ENV:', process.env.NODE_ENV);
    logger.debug('EXPO_PUBLIC_ENVIRONMENT:', process.env.EXPO_PUBLIC_ENVIRONMENT);
    logger.debug('EXPO_PUBLIC_FIREBASE_PROJECT_ID:', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);
    logger.debug('All EXPO_PUBLIC vars:', Object.keys(process.env).filter(key => key.startsWith('EXPO_PUBLIC')));
    console.groupEnd();
  }

  // Get environment using centralized utility
  const environment = getEnvironment();

  // Environment-specific Firebase configuration using env variables
  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
  };

  const expectedProjectId = environment === 'development'
    ? 'kidchef-dev'
    : environment === 'staging'
      ? 'kidchef-staging'
      : 'kidchef';

  // Validate required config values
  if (!config.apiKey || !config.projectId || !config.authDomain || !config.appId) {
    throw new Error('Firebase configuration is incomplete. Missing required fields.');
  }

  if (config.projectId !== expectedProjectId) {
    throw new Error(`Environment/Project ID mismatch: Expected ${expectedProjectId}, got ${config.projectId}`);
  }

  return config;
};

const firebaseConfig = getFirebaseConfig();

const isTestEnv = typeof process !== 'undefined' && process.env.VITEST === 'true';

// Initialize Firebase with error handling
let app: any;
let auth: any;
let db: any;
let functions: any;
let storage: any;
let remoteConfig: any;

try {
  if (isTestEnv) {
    app = {};
    auth = {};
    db = {};
    functions = {};
    storage = {};
    remoteConfig = {};
  } else {
    app = initializeApp(firebaseConfig);

    // Initialize Firebase services with error handling
    auth = Platform.OS === 'web'
      ? getAuth(app)
      : initializeAuth(app, {
          persistence: getReactNativePersistence(AsyncStorage),
        });

    db = getFirestore(app);
    functions = getFunctions(app, 'us-central1');
    storage = getStorage(app);

    // Initialize Remote Config for feature flags
    remoteConfig = getRemoteConfig(app);

    // Set defaults (used when Remote Config fails or during development)
    remoteConfig.defaultConfig = {
    // Global monetization switches
    monetization_enabled: false,
    show_pricing_page: true,
    enforce_paywalls: false,

    // Granular feature flags
    enable_premium_features: false,
    enable_family_sharing: false,
    enable_advanced_filters: false,

    // Limits for free tier (when monetization enabled)
    free_tier_recipe_limit: 10,
    free_tier_import_limit: 5,
    free_tier_ai_conversions: 3,

    // Beta tester behavior
    beta_users_bypass_paywalls: true,
  };

    // Set cache expiration (1 hour in production, 0 in dev for testing)
    remoteConfig.settings = {
      minimumFetchIntervalMillis: __DEV__ ? 0 : 3600000, // 0 for dev, 1 hour for production
    };

    // Fetch on app start (non-blocking)
    fetchAndActivate(remoteConfig)
      .then(() => {
        if (__DEV__) {
          logger.debug('✅ Remote Config activated');
        }
      })
      .catch((err) => {
        console.warn('⚠️ Remote Config fetch failed (using defaults):', err);
      });

    // Environment-specific logging and configuration
    const environment = getEnvironment();

    // Always log Firebase connection for debugging environment issues
    logger.debug(`🔥 Firebase connected to: ${firebaseConfig.projectId}`, {
      environment,
      projectId: firebaseConfig.projectId,
      authDomain: firebaseConfig.authDomain,
      NODE_ENV: process.env.NODE_ENV,
      EXPO_PUBLIC_ENVIRONMENT: process.env.EXPO_PUBLIC_ENVIRONMENT
    });

    // Additional debug logging for environment configuration validation
    if (__DEV__ && environment !== 'development') {
      console.group(`🧪 ${environment.toUpperCase()} ENVIRONMENT DEBUG`);
      logger.debug('Environment:', environment);
      logger.debug('Project ID:', firebaseConfig.projectId);
      logger.debug('Auth Domain:', firebaseConfig.authDomain);
      console.groupEnd();
    }

    if (__DEV__) {
      logger.debug(`Firebase app initialized for ${environment}:`, {
        appName: app.name,
        projectId: firebaseConfig.projectId,
        functionsRegion: 'us-central1',
        authPersistence: Platform.OS === 'web' ? 'Web' : 'AsyncStorage'
      });
    }

    // Initialize API key validation
    initializeApiKeyValidation();

    // Initialize Firebase App Check for additional security
    initializeFirebaseAppCheck();

    // Validate environment configuration
    validateEnvironmentOnStartup();

  // Environment-specific Firebase settings
    if (environment === 'development') {
      // Development-specific configurations can go here
      // e.g., connect to emulators if needed
    }
  }

} catch (error) {
  console.error('Failed to initialize Firebase:', error);
  throw new Error('Firebase initialization failed. Check configuration and network connection.');
}

// Set up auth state listener with security logging
if (!isTestEnv) {
  onAuthStateChanged(auth, (user) => {
    if (!__DEV__) return;
    if (user) {
      logger.debug('Auth state changed:', {
        uid: user.uid,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.debug('User signed out');
    }
  });
}

// Export services with validation
export { auth, db, functions, storage, remoteConfig };

export default app;
