# KidChef Share Extension

## Overview
The KidChef Share Extension allows parents to easily import recipes directly from Safari. When viewing a recipe website, users can tap the Share button and select "Import Recipe" to automatically import the recipe into KidChef.

## How It Works

### User Flow:
1. **Parent browses recipe in Safari**
2. **Taps Share button**
3. **Selects "Import Recipe" (KidChef)**
4. **Extension opens with import confirmation**
5. **Taps "Import" button**
6. **KidChef app opens automatically**
7. **Recipe import begins in background**
8. **Recipe appears in parent's recipe collection**

### Technical Flow:
1. Share Extension captures the URL from Safari
2. Creates deep link: `kidchef://import?url=<encoded-url>`
3. Opens main KidChef app with deep link
4. Main app navigates to Import screen with pre-filled URL
5. Shows import confirmation dialog
6. Starts background import process
7. User returns to Home screen while import completes

## Files Created

### iOS Share Extension:
- `ios/ShareExtension/ShareViewController.swift` - Main extension logic
- `ios/ShareExtension/Info.plist` - Extension configuration
- `ios/ShareExtension/MainInterface.storyboard` - Extension UI
- `plugins/shareExtensionPlugin.js` - Expo config plugin

### Deep Linking Support:
- `src/services/deepLinkService.ts` - Deep link handler service
- Updated `src/navigation/AppNavigator.tsx` - Deep link integration
- Updated `src/screens/parent/ImportRecipeScreen.tsx` - URL import handling
- Updated `app.json` - Deep link scheme configuration

## Setup Instructions

### 1. Install Dependencies
```bash
npm install expo-linking
```

### 2. Configure Bundle Identifier
Make sure your `app.json` has the correct bundle identifier:
```json
{
  "expo": {
    "ios": {
      "bundleIdentifier": "com.kidchef.app"
    }
  }
}
```

### 3. Build iOS App
```bash
# For Expo development build
eas build --platform ios --profile development

# Or for production
eas build --platform ios --profile production
```

### 4. Test the Share Extension
1. Install the built app on a physical device
2. Open Safari and navigate to a recipe website
3. Tap the Share button
4. Look for "Import Recipe" in the share sheet
5. Tap it to test the import flow

## Supported Websites
The Share Extension works with any website that contains recipe data, including:
- AllRecipes
- Food Network
- BBC Good Food
- NYTimes Cooking
- Epicurious
- And many more!

## Security & Privacy
- The Share Extension only reads the URL from Safari
- No authentication occurs in the extension itself
- All data processing happens in the main KidChef app
- URLs are passed securely via deep links

## Troubleshooting

### Share Extension Not Appearing
- Make sure the app is installed from a proper build (not Expo Go)
- Check that the bundle identifier matches in all configurations
- Verify the extension targets web URLs specifically

### Deep Link Not Working
- Confirm the `scheme: "kidchef"` is set in app.json
- Check that the deep link service is initialized in AppNavigator
- Verify URL encoding/decoding is working correctly

### Import Failing
- Check that the user is authenticated
- Verify the recipe scraping service is working
- Ensure Firebase functions are deployed and accessible

## Future Enhancements
- Add recipe preview in the Share Extension
- Support for other content types (images, text)
- Batch import from recipe collection pages
- Direct sharing to specific kids' accounts