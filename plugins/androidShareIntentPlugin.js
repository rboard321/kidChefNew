const { withAndroidManifest } = require('expo/config-plugins');
const path = require('path');
const fs = require('fs');

const withAndroidShareIntent = (config) => {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults;

    // Ensure application element exists
    if (!androidManifest.manifest.application) {
      androidManifest.manifest.application = [{}];
    }

    const application = androidManifest.manifest.application[0];

    // Ensure activity array exists
    if (!application.activity) {
      application.activity = [];
    }

    // Get package name from config (with environment-specific bundle identifier)
    const packageName = config.android?.package || 'com.kidchef.app';

    // Define the share intent activity
    const shareIntentActivity = {
      '$': {
        'android:name': 'com.kidchef.ShareIntentActivity',
        'android:label': '@string/share_extension_name',
        'android:theme': '@style/Theme.Transparent',
        'android:exported': 'true',
        'android:noHistory': 'true',
        'android:excludeFromRecents': 'true'
      },
      'intent-filter': [
        // Handle text sharing (URLs shared as text)
        {
          'action': [{ '$': { 'android:name': 'android.intent.action.SEND' } }],
          'category': [{ '$': { 'android:name': 'android.intent.category.DEFAULT' } }],
          'data': [{ '$': { 'android:mimeType': 'text/plain' } }]
        },
        // Handle direct URL sharing
        {
          'action': [{ '$': { 'android:name': 'android.intent.action.VIEW' } }],
          'category': [
            { '$': { 'android:name': 'android.intent.category.DEFAULT' } },
            { '$': { 'android:name': 'android.intent.category.BROWSABLE' } }
          ],
          'data': [
            { '$': { 'android:scheme': 'http' } },
            { '$': { 'android:scheme': 'https' } }
          ]
        }
      ]
    };

    // Check if the activity already exists
    const existingActivity = application.activity.find(
      activity => activity.$?.['android:name'] === 'com.kidchef.ShareIntentActivity'
    );

    if (!existingActivity) {
      application.activity.push(shareIntentActivity);
      console.log('✅ Added ShareIntentActivity to AndroidManifest.xml');
    } else {
      console.log('ℹ️  ShareIntentActivity already exists in AndroidManifest.xml');
    }

    return config;
  });
};

module.exports = function withAndroidShareIntentPlugin(config) {
  // Apply manifest modifications only
  config = withAndroidShareIntent(config);

  console.log('✅ Android Share Intent plugin configured');
  return config;
};