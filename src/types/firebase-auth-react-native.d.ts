declare module 'firebase/auth/react-native' {
  import type { AuthPersistence } from 'firebase/auth';

  export function getReactNativePersistence(storage: unknown): AuthPersistence;
}
