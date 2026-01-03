import { NativeModules, Platform } from 'react-native';

type SharedAuthTokenModule = {
  setToken: (token: string) => void;
  clearToken: () => void;
};

const nativeModule = NativeModules.SharedAuthToken as SharedAuthTokenModule | undefined;

export const setSharedAuthToken = (token: string) => {
  if (Platform.OS !== 'ios') return;
  nativeModule?.setToken?.(token);
};

export const clearSharedAuthToken = () => {
  if (Platform.OS !== 'ios') return;
  nativeModule?.clearToken?.();
};
