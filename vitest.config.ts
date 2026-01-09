import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  define: {
    __DEV__: false,
  },
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'src/__mocks__/react-native.ts'),
      '@react-native-async-storage/async-storage': path.resolve(__dirname, 'src/__mocks__/async-storage.ts'),
      'expo-constants': path.resolve(__dirname, 'src/__mocks__/expo-constants.ts'),
    },
  },
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
    globals: true,
    env: {
      EXPO_PUBLIC_ENVIRONMENT: 'development',
      EXPO_PUBLIC_APP_VARIANT: 'dev',
      EXPO_PUBLIC_FIREBASE_API_KEY: 'test',
      EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'kidchef-dev.firebaseapp.com',
      EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'kidchef-dev',
      EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'kidchef-dev.appspot.com',
      EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'test',
      EXPO_PUBLIC_FIREBASE_APP_ID: 'test',
    },
  },
});
