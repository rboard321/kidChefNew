import { initializeApp } from 'firebase/app';
import { initializeAuth, getReactNativePersistence, onAuthStateChanged } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { initializeApiKeyValidation } from '../utils/apiKeyManager';
import { initializeFirebaseAppCheck } from './appCheck';
import { validateEnvironmentOnStartup } from '../utils/environmentValidator';
import { getEnvironment } from '../utils/environment';

// Firebase config with validation
const getFirebaseConfig = () => {
  // Debug environment variable loading
  if (__DEV__) {
    console.group('🔍 Environment Variable Debug');
    console.log('NODE_ENV:', process.env.NODE_ENV);
    console.log('EXPO_PUBLIC_ENVIRONMENT:', process.env.EXPO_PUBLIC_ENVIRONMENT);
    console.log('EXPO_PUBLIC_FIREBASE_PROJECT_ID:', process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID);
    console.log('All EXPO_PUBLIC vars:', Object.keys(process.env).filter(key => key.startsWith('EXPO_PUBLIC')));
    console.groupEnd();
  }

  // Get environment using centralized utility
  const environment = getEnvironment();

  // Environment-specific Firebase configuration using env variables
  const config = {
    apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || "AIzaSyDTcvNJbdVkoICXZwg78Sh9lIks4j_XWvo",
    authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || "kidchef.firebaseapp.com",
    projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || "kidchef",
    storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || "kidchef.firebasestorage.app",
    messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "198273265652",
    appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || "1:198273265652:web:4a10431ff054f49e0fd3a1"
  };

  // Validate required config values
  if (!config.apiKey || !config.projectId || !config.authDomain) {
    throw new Error('Firebase configuration is incomplete. Missing required fields.');
  }

  return config;
};

const firebaseConfig = getFirebaseConfig();

// Initialize Firebase with error handling
let app: any;
let auth: any;
let db: any;
let functions: any;
let storage: any;

try {
  app = initializeApp(firebaseConfig);

  // Initialize Firebase services with error handling
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage)
  });

  db = getFirestore(app);
  functions = getFunctions(app, 'us-central1');
  storage = getStorage(app);

  // Environment-specific logging and configuration
  const environment = getEnvironment();

  // Always log Firebase connection for debugging environment issues
  console.log(`🔥 Firebase connected to: ${firebaseConfig.projectId}`, {
    environment,
    projectId: firebaseConfig.projectId,
    authDomain: firebaseConfig.authDomain,
    NODE_ENV: process.env.NODE_ENV,
    EXPO_PUBLIC_ENVIRONMENT: process.env.EXPO_PUBLIC_ENVIRONMENT
  });

  // Additional debug logging for environment configuration validation
  if (__DEV__ && environment !== 'development') {
    console.group(`🧪 ${environment.toUpperCase()} ENVIRONMENT DEBUG`);
    console.log('Environment:', environment);
    console.log('Project ID:', firebaseConfig.projectId);
    console.log('Auth Domain:', firebaseConfig.authDomain);
    console.groupEnd();
  }

  if (__DEV__) {
    console.log(`Firebase app initialized for ${environment}:`, {
      appName: app.name,
      projectId: firebaseConfig.projectId,
      functionsRegion: 'us-central1',
      authPersistence: 'AsyncStorage'
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

} catch (error) {
  console.error('Failed to initialize Firebase:', error);
  throw new Error('Firebase initialization failed. Check configuration and network connection.');
}

// Set up auth state listener with security logging
onAuthStateChanged(auth, (user) => {
  if (!__DEV__) return;
  if (user) {
    console.log('Auth state changed:', {
      uid: user.uid,
      timestamp: new Date().toISOString()
    });
  } else {
    console.log('User signed out');
  }
});

// Export services with validation
export { auth, db, functions, storage };

export default app;
