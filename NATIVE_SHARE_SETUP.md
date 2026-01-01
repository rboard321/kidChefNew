# Native Share Extension Setup & Testing Guide

This guide covers the complete native share extension implementation for both iOS and Android platforms.

## 🎯 Overview

The KidChef native share extensions enable parents to import recipes directly from any recipe website by using the native share functionality of their device.

**Flow:**
1. Parent browses recipe in Safari (iOS) or Chrome (Android)
2. Taps native share button
3. Selects "Import Recipe" (KidChef)
4. KidChef app opens automatically with import started
5. Recipe appears in parent's library (with review if needed)

## 🏗️ Architecture

```
KidChef
├── React Native app (core UI + logic)
│   ├── Deep linking service (expo-linking)
│   ├── Import workflow with partial success handling
│   ├── Parent review flow for partial imports
│   └── Manual entry fallback
│
├── iOS native
│   ├── ShareExtension/ShareViewController.swift
│   ├── ShareExtension/Info.plist
│   ├── ShareExtension/MainInterface.storyboard
│   └── plugins/shareExtensionPlugin.js
│
└── Android native
    ├── ShareIntentActivity.kt
    ├── AndroidManifest.xml (intent filters)
    ├── strings.xml & styles.xml
    └── plugins/androidShareIntentPlugin.js
```

## 🚀 Quick Start

### 1. Install EAS CLI (if not already installed)
```bash
npm install -g @expo/eas-cli
eas login
```

### 2. Generate native projects with prebuild
```bash
# Development build with share extensions
EXPO_PUBLIC_ENVIRONMENT=development npx expo prebuild --clean

# This will:
# ✅ Generate iOS project with Share Extension
# ✅ Generate Android project with Share Intent Activity
# ✅ Configure deep linking schemes
# ✅ Set up environment-specific bundle IDs
```

### 3. Build native apps
```bash
# iOS Development Build
eas build --platform ios --profile development

# Android Development Build
eas build --platform android --profile development
```

### 4. Install & Test
- Install built apps on physical devices (required for share extensions)
- Test share flow from Safari (iOS) and Chrome (Android)

## 📱 Platform-Specific Details

### iOS Share Extension

**Files:**
- `ios/ShareExtension/ShareViewController.swift` - Main extension logic
- `ios/ShareExtension/Info.plist` - Extension configuration
- `ios/ShareExtension/MainInterface.storyboard` - Extension UI
- `plugins/shareExtensionPlugin.js` - Build configuration

**How it works:**
1. Extension appears in iOS share sheet for web URLs
2. Captures URL from Safari's share context
3. Creates deep link: `kidchef://import?url=<encoded-url>`
4. Opens main KidChef app with deep link

**Environment Support:**
- Development: `kidchef-dev://import?url=`
- Staging: `kidchef-staging://import?url=`
- Production: `kidchef://import?url=`

### Android Share Intent

**Files:**
- `android/app/src/main/java/com/kidchef/ShareIntentActivity.kt` - Intent handler
- `android/app/src/main/AndroidManifest.xml` - Intent filters
- `android/app/src/main/res/values/strings.xml` - Localized strings
- `android/app/src/main/res/values/styles.xml` - Transparent theme
- `plugins/androidShareIntentPlugin.js` - Build configuration

**Intent Filters:**
```xml
<!-- Handle text sharing (URLs shared as text) -->
<intent-filter>
    <action android:name="android.intent.action.SEND" />
    <category android:name="android.intent.category.DEFAULT" />
    <data android:mimeType="text/plain" />
</intent-filter>

<!-- Handle direct URL sharing -->
<intent-filter>
    <action android:name="android.intent.action.VIEW" />
    <category android:name="android.intent.category.DEFAULT" />
    <category android:name="android.intent.category.BROWSABLE" />
    <data android:scheme="http" />
    <data android:scheme="https" />
</intent-filter>
```

## 🧪 Testing Workflow

### Development Testing Setup

1. **Use Test Screen (Development Only)**
   ```
   Navigation: Parent Home → Settings → Test Import (Dev only)
   ```

2. **Test Scenarios Available:**
   - Mock partial success scenarios
   - Real-world URL testing
   - Timer-based UX validation

### Manual Testing Process

1. **iOS Testing:**
   ```bash
   # Build and install development app
   eas build --platform ios --profile development
   # Install on physical iOS device
   # Open Safari → Navigate to recipe website
   # Tap Share → Look for "Import Recipe"
   # Tap and verify KidChef opens with import
   ```

2. **Android Testing:**
   ```bash
   # Build and install development app
   eas build --platform android --profile development
   # Install APK on physical Android device
   # Open Chrome → Navigate to recipe website
   # Tap Share → Look for "Import Recipe"
   # Tap and verify KidChef opens with import
   ```

### Test Recipe Websites

**Known Working Sites:**
- AllRecipes.com
- Food.com
- Taste.com.au
- BBC Good Food

**Previously Problematic Sites (now should work via share):**
- Food Network (complex DOM)
- NYTimes Cooking (paywall)
- Serious Eats (JavaScript-heavy)

## 🔍 Debugging

### iOS Share Extension Debugging
```bash
# View iOS device logs during share extension testing
xcrun devicectl list devices
xcrun devicectl devicelogs stream --device <device-id>

# Filter for KidChef logs
xcrun devicectl devicelogs stream --device <device-id> | grep -i kidchef
```

### Android Share Intent Debugging
```bash
# View Android device logs
adb logcat | grep -i ShareIntentActivity

# Filter for KidChef package
adb logcat | grep com.kidchef
```

### Deep Link Testing
```bash
# Test deep links directly (iOS)
xcrun simctl openurl booted "kidchef-dev://import?url=https%3A//example.com/recipe"

# Test deep links directly (Android)
adb shell am start -W -a android.intent.action.VIEW -d "kidchef-dev://import?url=https%3A//example.com/recipe" com.kidchef.app.dev
```

## ⚡ Performance Expectations

### Success Metrics
- **Share Extension Appearance Rate:** 99%+ (native OS integration)
- **URL Capture Success Rate:** 99%+ (direct from share context)
- **Deep Link Success Rate:** 98%+ (app installation required)
- **Overall Parent Success Rate:** 95%+ (vs 42% with web scraping)

### Timing Targets
- **Share → App Launch:** < 2 seconds
- **App Launch → Import Started:** < 1 second
- **Total Time to Recipe in Library:** < 30 seconds (including review)

## 🔧 Troubleshooting

### Share Extension Not Appearing

**iOS:**
- Ensure app is installed via development build (not Expo Go)
- Check bundle identifier matches in all configurations
- Verify iOS device supports Share Extensions (iOS 8+)

**Android:**
- Ensure app is installed via APK/AAB build (not Expo Go)
- Check intent filters are properly configured in AndroidManifest.xml
- Verify Android version supports intent handling (Android 4.1+)

### Deep Link Not Working
- Confirm scheme matches environment: `kidchef-dev` / `kidchef-staging` / `kidchef`
- Check deep link service is initialized in AppNavigator.tsx
- Verify URL encoding/decoding is working correctly

### Import Failing After Share
- Check user is authenticated in KidChef
- Verify ImportContext handles the URL properly
- Test with known working recipe URLs first

## 🚀 Production Deployment

### iOS App Store
```bash
# Production build for App Store
eas build --platform ios --profile production

# Submit to App Store
eas submit --platform ios --profile production
```

### Android Play Store
```bash
# Production build for Play Store
eas build --platform android --profile production

# Submit to Play Store
eas submit --platform android --profile production
```

### Share Extension Store Review Notes

**iOS App Store:**
- Share Extension enhances core app functionality
- No standalone functionality - requires main app
- Clear value proposition for users

**Android Play Store:**
- Share Intent follows Android guidelines
- Transparent activity provides good UX
- No background processing without user consent

## 📈 Next Steps

1. **Test with real users** using development builds
2. **Measure success rates** vs. web scraping approach
3. **Optimize for popular recipe websites**
4. **Add analytics** to track share extension usage
5. **Consider additional share content types** (images, text)

This native approach should dramatically improve the "parent success rate" from recipe intention to saved in KidChef library!