# KidChef Environment Setup Guide

## Overview

KidChef uses a multi-environment architecture with proper data isolation between development, staging, and production environments. This guide covers how to set up and manage these environments securely.

## Environment Architecture

### 🛠️ Development Environment
- **Project ID**: `kidchef-dev`
- **Purpose**: Local development and testing
- **Firebase**: Separate dev project with isolated data
- **Features**: Debug mode enabled, dev tools available, mock payments
- **Bundle ID**: `com.kidchef.app.dev`

### 🧪 Staging Environment
- **Project ID**: `kidchef-staging`
- **Purpose**: Beta testing and pre-production validation
- **Firebase**: Separate staging project with test data
- **Features**: Production-like settings with beta features enabled
- **Bundle ID**: `com.kidchef.app.staging`

### 🚀 Production Environment
- **Project ID**: `kidchef`
- **Purpose**: Live app for end users
- **Firebase**: Production project with real user data
- **Features**: Full security, no debug tools, real payments
- **Bundle ID**: `com.kidchef.app`

## 📋 Initial Setup Checklist

### 1. Firebase Projects Setup

#### Create Development Project
```bash
# 1. Create new Firebase project at https://console.firebase.google.com
# 2. Project name: "KidChef Dev"
# 3. Project ID: "kidchef-dev"
# 4. Enable required services:
#    - Authentication (Email/Password, Google)
#    - Firestore Database
#    - Cloud Functions
#    - Cloud Storage
```

#### Create Staging Project
```bash
# 1. Create new Firebase project at https://console.firebase.google.com
# 2. Project name: "KidChef Staging"
# 3. Project ID: "kidchef-staging"
# 4. Enable same services as development
```

#### Production Project
- **Project ID**: `kidchef` (already exists)
- Ensure all required services are enabled and configured

### 2. Environment Configuration Files

#### `.env` (Default - Development)
```bash
EXPO_PUBLIC_ENVIRONMENT=development
EXPO_PUBLIC_APP_VARIANT=dev
EXPO_PUBLIC_FIREBASE_PROJECT_ID=kidchef-dev
# ... other development configs
```

#### `.env.development`
```bash
EXPO_PUBLIC_ENVIRONMENT=development
EXPO_PUBLIC_APP_VARIANT=dev
# Development-specific Firebase configs
# Development OpenAI API key with lower quotas
```

#### `.env.staging`
```bash
EXPO_PUBLIC_ENVIRONMENT=staging
EXPO_PUBLIC_APP_VARIANT=staging
# Staging-specific Firebase configs
# Staging OpenAI API key
```

#### `.env.production`
```bash
EXPO_PUBLIC_ENVIRONMENT=production
EXPO_PUBLIC_APP_VARIANT=production
# Production Firebase configs
# Production OpenAI API key with full quotas
```

### 3. Firebase CLI Configuration

#### Install Firebase CLI
```bash
npm install -g firebase-tools
```

#### Login and Configure Projects
```bash
# Login to Firebase
firebase login

# Initialize project (run in project root)
firebase init

# Select projects for aliases
firebase use --add kidchef-dev --alias development
firebase use --add kidchef-staging --alias staging
firebase use --add kidchef --alias production

# Set default project
firebase use development
```

### 4. Deploy Firestore Rules

#### Deploy to Development
```bash
firebase use development
firebase deploy --only firestore:rules
```

#### Deploy to Staging
```bash
firebase use staging
firebase deploy --only firestore:rules
```

#### Deploy to Production
```bash
firebase use production
firebase deploy --only firestore:rules
```

### 5. Deploy Cloud Functions

#### Development
```bash
firebase use development
cd functions
npm install
npm run build
cd ..
firebase deploy --only functions
```

#### Staging
```bash
firebase use staging
firebase deploy --only functions
```

#### Production
```bash
firebase use production
firebase deploy --only functions
```

## 🔐 Security Configuration

### API Key Management

1. **Separate API Keys**: Each environment should use different API keys
2. **Key Restrictions**: Configure API key restrictions in Google Cloud Console
3. **Environment Validation**: Automatic validation prevents key misuse

### Firebase App Check Setup

#### Development
- App Check disabled for development convenience
- No additional setup required

#### Staging
```bash
# 1. Enable App Check in Firebase Console
# 2. Add reCAPTCHA v3 provider
# 3. Add site key to .env.staging:
EXPO_PUBLIC_RECAPTCHA_V3_SITE_KEY=your_site_key_here
```

#### Production
```bash
# 1. Enable App Check with reCAPTCHA Enterprise
# 2. Add enterprise site key to .env.production:
EXPO_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY=your_enterprise_key_here
```

## 🚀 Deployment Commands

### Development
```bash
# Use development environment
EXPO_PUBLIC_ENVIRONMENT=development expo start

# Build development app
EXPO_PUBLIC_ENVIRONMENT=development eas build --platform all --profile development
```

### Staging
```bash
# Use staging environment
EXPO_PUBLIC_ENVIRONMENT=staging expo start

# Build staging app
EXPO_PUBLIC_ENVIRONMENT=staging eas build --platform all --profile preview
```

### Production
```bash
# Use production environment
EXPO_PUBLIC_ENVIRONMENT=production expo start --no-dev --minify

# Build production app
EXPO_PUBLIC_ENVIRONMENT=production eas build --platform all --profile production
```

## 🧪 Testing Environment Isolation

### Verify Development Setup
```bash
# 1. Start development environment
EXPO_PUBLIC_ENVIRONMENT=development expo start

# 2. Check environment banner shows "🔧 Development"
# 3. Verify console shows: "Firebase app initialized for development"
# 4. Confirm project ID is "kidchef-dev"
```

### Verify Staging Setup
```bash
# 1. Start staging environment
EXPO_PUBLIC_ENVIRONMENT=staging expo start

# 2. Check environment banner shows "🧪 Beta Version"
# 3. Verify project ID is "kidchef-staging"
# 4. Test shake-to-report functionality
```

### Verify Production Setup
```bash
# 1. Start production environment
EXPO_PUBLIC_ENVIRONMENT=production expo start --no-dev --minify

# 2. No environment banner should show
# 3. Verify project ID is "kidchef"
# 4. Confirm debug features are disabled
```

## ⚠️ Important Security Notes

### 🔴 Critical - Never Do This
- Don't use production Firebase project for development
- Don't commit real API keys to git
- Don't enable debug mode in production
- Don't use development keys in production

### ✅ Best Practices
- Always validate environment before deployment
- Use separate API keys for each environment
- Regularly rotate production API keys
- Monitor API usage and quotas
- Review Firestore security rules regularly

## 🔧 Troubleshooting

### Environment Validation Errors
The app will automatically validate environment configuration on startup and show errors in the console.

### Common Issues

#### "Environment/Project ID mismatch"
- Check that `EXPO_PUBLIC_FIREBASE_PROJECT_ID` matches expected environment
- Verify `.firebaserc` has correct project aliases

#### "Missing required Firebase configuration"
- Ensure all required environment variables are set
- Check `.env` files have correct Firebase configs

#### "App Check configuration error"
- Verify reCAPTCHA keys are configured for staging/production
- Check Firebase Console App Check settings

### Debug Commands

#### Check Current Environment
```bash
# View environment validation in console
# Look for "🛡️ Environment Validation" logs
```

#### Verify Firebase Project
```bash
firebase projects:list
firebase use
```

#### Test API Key Validation
```bash
# Environment validation runs automatically on app start
# Check console for "🔐 API Key Security Validation" logs
```

## 📚 Additional Resources

- [Firebase Multi-Environment Guide](https://firebase.google.com/docs/projects/multiprojects)
- [Expo Environment Variables](https://docs.expo.dev/guides/environment-variables/)
- [Firebase App Check Documentation](https://firebase.google.com/docs/app-check)

## 📞 Support

If you encounter issues with environment setup:
1. Check console logs for validation errors
2. Verify all environment variables are set correctly
3. Ensure Firebase projects are properly configured
4. Contact the development team if issues persist