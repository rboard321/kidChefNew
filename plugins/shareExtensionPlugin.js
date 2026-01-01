const { withXcodeProject, withPlugins } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withShareExtension = (config) => {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.projectRoot;

    // Get bundle identifier from config
    const bundleIdentifier = config.ios?.bundleIdentifier || 'com.kidchef.app';

    try {
      // Add the Share Extension target
      const target = xcodeProject.addTarget('ShareExtension', 'app_extension', 'ShareExtension', `${bundleIdentifier}.ShareExtension`);

      // Define source paths relative to project root
      const shareExtensionPath = path.join(projectRoot, 'ios', 'ShareExtension');
      const swiftFile = path.join(shareExtensionPath, 'ShareViewController.swift');
      const storyboardFile = path.join(shareExtensionPath, 'MainInterface.storyboard');
      const plistFile = path.join(shareExtensionPath, 'Info.plist');

      // Add source files if they exist
      if (fs.existsSync(swiftFile)) {
        xcodeProject.addSourceFile('ShareExtension/ShareViewController.swift', {target: target.uuid});
      } else {
        console.warn('ShareViewController.swift not found at:', swiftFile);
      }

      // Add resources if they exist
      if (fs.existsSync(storyboardFile)) {
        xcodeProject.addResourceFile('ShareExtension/MainInterface.storyboard', {target: target.uuid});
      } else {
        console.warn('MainInterface.storyboard not found at:', storyboardFile);
      }

      if (fs.existsSync(plistFile)) {
        xcodeProject.addResourceFile('ShareExtension/Info.plist', {target: target.uuid});
      } else {
        console.warn('Info.plist not found at:', plistFile);
      }

      // Set build configurations with relative paths
      xcodeProject.addBuildProperty('PRODUCT_BUNDLE_IDENTIFIER', `${bundleIdentifier}.ShareExtension`, 'Debug', target.productName);
      xcodeProject.addBuildProperty('PRODUCT_BUNDLE_IDENTIFIER', `${bundleIdentifier}.ShareExtension`, 'Release', target.productName);
      xcodeProject.addBuildProperty('INFOPLIST_FILE', 'ShareExtension/Info.plist', 'Debug', target.productName);
      xcodeProject.addBuildProperty('INFOPLIST_FILE', 'ShareExtension/Info.plist', 'Release', target.productName);

      // Add framework dependencies
      xcodeProject.addFramework('Social.framework', {target: target.uuid});
      xcodeProject.addFramework('MobileCoreServices.framework', {target: target.uuid});
      xcodeProject.addFramework('UniformTypeIdentifiers.framework', {target: target.uuid});

      console.log('✅ iOS Share Extension configured successfully');
      console.log('   Source files expected at:', shareExtensionPath);
    } catch (error) {
      console.error('❌ Error configuring iOS Share Extension:', error.message);
    }

    return config;
  });
};

module.exports = withShareExtension;