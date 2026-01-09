export const Platform = {
  OS: 'ios',
  select: <T,>(options: { ios?: T; android?: T; default?: T }) =>
    options.ios ?? options.default,
};

export const Dimensions = {
  get: () => ({ width: 375, height: 812 }),
};

export const NativeModules = {};

export const AppState = {
  currentState: 'active',
  addEventListener: () => ({ remove: () => {} }),
};

export default {
  Platform,
  Dimensions,
  NativeModules,
  AppState,
};
