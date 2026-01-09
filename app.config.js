const IS_DEV = process.env.EXPO_PUBLIC_ENVIRONMENT === 'development';
const IS_STAGING = process.env.EXPO_PUBLIC_ENVIRONMENT === 'staging';
const IS_PRODUCTION = process.env.EXPO_PUBLIC_ENVIRONMENT === 'production';

const getAppName = () => {
  if (IS_DEV) return 'KidChef Dev';
  if (IS_STAGING) return 'KidChef Beta';
  return 'KidChef';
};

const getBundleIdentifier = () => {
  if (IS_DEV) return 'com.kidchef.app.dev';
  if (IS_STAGING) return 'com.kidchef.app.staging';
  return 'com.kidchef.app';
};

const getAppIcon = () => {
  // You can create different icons for different environments
  if (IS_DEV) return './assets/icon-dev.png';
  if (IS_STAGING) return './assets/icon-staging.png';
  return './assets/icon.png';
};

const getScheme = () => {
  if (IS_DEV) return 'kidchef-dev';
  if (IS_STAGING) return 'kidchef-staging';
  return 'kidchef';
};

export default {
  expo: {
    name: getAppName(),
    slug: 'kidchef',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/kidChefIcon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    scheme: getScheme(),
    splash: {
      image: './assets/splash-icon1.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff'
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: getBundleIdentifier(),
      ...(IS_DEV || IS_STAGING ? {
        // Development/staging specific iOS config
        buildNumber: `${Date.now()}`, // Auto-increment for dev/staging
      } : {}),
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/kidChefIcon.png',
        backgroundColor: '#ffffff'
      },
      package: getBundleIdentifier(),
      edgeToEdgeEnabled: true,
      predictiveBackGestureEnabled: false,
      ...(IS_DEV || IS_STAGING ? {
        // Development/staging specific Android config
        versionCode: Math.floor(Date.now() / 1000), // Auto-increment for dev/staging
      } : {}),
    },
    web: {
      favicon: './assets/favicon.png'
    },
    plugins: [
      './plugins/shareExtensionPlugin.js',
      './plugins/androidShareIntentPlugin.js',
      ...(IS_DEV ? [
        // Development-only plugins
      ] : []),
      ...(IS_STAGING ? [
        // Staging-only plugins
      ] : []),
    ],
    extra: {
      // Environment information accessible in the app
      environment: process.env.EXPO_PUBLIC_ENVIRONMENT || 'development',
      appVariant: process.env.EXPO_PUBLIC_APP_VARIANT || 'dev',
      buildTime: new Date().toISOString(),
    },
    updates: {
      // Environment-specific update configuration
      url: IS_PRODUCTION
        ? 'https://u.expo.dev/your-production-project-id'
        : undefined,
      enabled: IS_PRODUCTION,
    },
  },
};
