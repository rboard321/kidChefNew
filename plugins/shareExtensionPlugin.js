const { withXcodeProject } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const withShareExtension = (config) => {
  return withXcodeProject(config, (config) => {
    const xcodeProject = config.modResults;
    const projectRoot = config.modRequest?.projectRoot || config.projectRoot;

    // Get bundle identifier from config
    const bundleIdentifier = config.ios?.bundleIdentifier || 'com.kidchef.app';
    const appScheme = config.scheme || 'kidchef';
    const appGroupId = config.extra?.appGroupId || `group.${bundleIdentifier}`;

    const ensureFile = (filePath, contents) => {
      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, contents);
        return;
      }
    };

    const ensureFileContains = (filePath, replacer) => {
      if (!fs.existsSync(filePath)) return;
      const existing = fs.readFileSync(filePath, 'utf8');
      const updated = replacer(existing);
      if (updated !== existing) {
        fs.writeFileSync(filePath, updated);
      }
    };

    try {
      if (!projectRoot) {
        throw new Error('Project root not available in Expo config.');
      }

      const getTargetUuid = () => {
        let targetUuid = xcodeProject.findTargetKey('ShareExtension');
        if (!targetUuid) {
          const createdTarget = xcodeProject.addTarget(
            'ShareExtension',
            'app_extension',
            'ShareExtension',
            `${bundleIdentifier}.ShareExtension`
          );
          targetUuid = createdTarget?.uuid || xcodeProject.findTargetKey('ShareExtension');
        }
        if (!targetUuid) {
          throw new Error('Failed to create or find ShareExtension target.');
        }
        return targetUuid;
      };

      const targetUuid = getTargetUuid();

      const findGroupKeyByName = (groupName) => {
        const groups = xcodeProject.hash.project.objects['PBXGroup'];
        for (const key in groups) {
          if (!key.endsWith('_comment')) continue;
          if (groups[key] === groupName) {
            return key.replace('_comment', '');
          }
        }
        return null;
      };

      const ensureNamedGroup = (groupName, groupPath) => {
        let groupKey = findGroupKeyByName(groupName);
        if (!groupKey) {
          xcodeProject.addPbxGroup([], groupName, groupPath || groupName);
          groupKey = findGroupKeyByName(groupName);
          const mainGroupId = xcodeProject.getFirstProject()?.firstProject?.mainGroup;
          if (groupKey && mainGroupId) {
            xcodeProject.addToPbxGroup(groupKey, mainGroupId);
          }
        }
        return groupKey;
      };

      const ensureShareGroupKey = () => {
        return ensureNamedGroup('ShareExtension', 'ShareExtension');
      };

      ensureNamedGroup('Resources', 'Resources');
      ensureNamedGroup('Plugins', 'Plugins');

      const shareGroupKey = ensureShareGroupKey();
      const mainGroupId = xcodeProject.getFirstProject()?.firstProject?.mainGroup;
      const fileGroupKey = shareGroupKey || mainGroupId || undefined;

      const setBuildSettingsForTarget = (targetUuid, settings) => {
        const configurationListId = xcodeProject.pbxNativeTargetSection()[targetUuid]?.buildConfigurationList;
        if (!configurationListId) return;
        const configList = xcodeProject.pbxXCConfigurationList()[configurationListId];
        if (!configList?.buildConfigurations) return;
        const configs = xcodeProject.pbxXCBuildConfigurationSection();
        for (const buildConfig of configList.buildConfigurations) {
          const config = configs[buildConfig.value];
          if (!config?.buildSettings) continue;
          Object.assign(config.buildSettings, settings);
        }
      };

      const setBuildSettingsForProject = (settings) => {
        const projectConfigListId = xcodeProject.getFirstProject()?.firstProject?.buildConfigurationList;
        if (!projectConfigListId) return;
        const configList = xcodeProject.pbxXCConfigurationList()[projectConfigListId];
        if (!configList?.buildConfigurations) return;
        const configs = xcodeProject.pbxXCBuildConfigurationSection();
        for (const buildConfig of configList.buildConfigurations) {
          const config = configs[buildConfig.value];
          if (!config?.buildSettings) continue;
          Object.assign(config.buildSettings, settings);
        }
      };

      const getTargetsByProductType = () => {
        const targets = xcodeProject.pbxNativeTargetSection();
        let appTargetUuid;
        let shareTargetUuid;
        for (const key in targets) {
          if (key.endsWith('_comment')) continue;
          const target = targets[key];
          const productType = (target.productType || '').replace(/"/g, '');
          if (productType === 'com.apple.product-type.application') {
            appTargetUuid = key;
          } else if (productType === 'com.apple.product-type.app-extension') {
            shareTargetUuid = key;
          }
        }
        return { appTargetUuid, shareTargetUuid };
      };

      const { appTargetUuid, shareTargetUuid } = getTargetsByProductType();
      const extensionTargetUuid = shareTargetUuid || targetUuid;
      const appTargetName = appTargetUuid
        ? xcodeProject.pbxNativeTargetSection()[appTargetUuid]?.name
        : 'KidChef';
      const appInfoPlistPath = `${appTargetName}/Info.plist`;

      const ensureSourcesBuildPhase = (targetUuid) => {
        const sourcesPhase = xcodeProject.pbxSourcesBuildPhaseObj(targetUuid);
        if (!sourcesPhase) {
          xcodeProject.addBuildPhase([], 'PBXSourcesBuildPhase', 'Sources', targetUuid);
        }
      };

      const getFileRefKeyByName = (fileName) => {
        const fileRefs = xcodeProject.hash.project.objects['PBXFileReference'];
        for (const key in fileRefs) {
          if (key.endsWith('_comment')) continue;
          const fileRef = fileRefs[key];
          if (fileRef?.name === fileName || fileRef?.path === fileName) {
            return key;
          }
          if (typeof fileRef?.path === 'string' && fileRef.path.endsWith(`/${fileName}`)) {
            return key;
          }
        }
        return null;
      };

      const getBuildFileKeysForFileRef = (fileRefKey) => {
        const buildFiles = xcodeProject.hash.project.objects['PBXBuildFile'];
        const matches = [];
        for (const key in buildFiles) {
          if (key.endsWith('_comment')) continue;
          if (buildFiles[key]?.fileRef === fileRefKey) {
            matches.push(key);
          }
        }
        return matches;
      };

      const removeBuildFilesFromTargetSources = (targetUuid, buildFileKeys) => {
        const sourcesPhase = xcodeProject.pbxSourcesBuildPhaseObj(targetUuid);
        if (!sourcesPhase?.files) return;
        sourcesPhase.files = sourcesPhase.files.filter((file) => !buildFileKeys.includes(file.value));
      };

      // Define source paths relative to project root
      const shareExtensionPath = path.join(projectRoot, 'ios', 'ShareExtension');
      const swiftFile = path.join(shareExtensionPath, 'ShareViewController.swift');
      const storyboardFile = path.join(shareExtensionPath, 'MainInterface.storyboard');
      const plistFile = path.join(shareExtensionPath, 'Info.plist');
      const entitlementsFile = path.join(shareExtensionPath, 'ShareExtension.entitlements');
      const sharedAuthHeaderFile = path.join(projectRoot, 'ios', appTargetName, 'SharedAuthTokenModule.h');
      const sharedAuthImplFile = path.join(projectRoot, 'ios', appTargetName, 'SharedAuthTokenModule.m');

      ensureFile(plistFile, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Import Recipe</string>
  <key>CFBundleIdentifier</key>
  <string>$(PRODUCT_BUNDLE_IDENTIFIER)</string>
  <key>CFBundleName</key>
  <string>ShareExtension</string>
  <key>CFBundleExecutable</key>
  <string>$(EXECUTABLE_NAME)</string>
  <key>CFBundleShortVersionString</key>
  <string>$(MARKETING_VERSION)</string>
  <key>CFBundleVersion</key>
  <string>$(CURRENT_PROJECT_VERSION)</string>
  <key>FirebaseProjectId</key>
  <string>$(FIREBASE_PROJECT_ID)</string>
  <key>FunctionRegion</key>
  <string>us-central1</string>
  <key>AppGroupId</key>
  <string>${appGroupId}</string>
  <key>CFBundlePackageType</key>
  <string>XPC!</string>
  <key>HostAppScheme</key>
  <string>$(APP_SCHEME)</string>
  <key>NSAppTransportSecurity</key>
  <dict>
    <key>NSAllowsArbitraryLoads</key>
    <true/>
  </dict>
  <key>NSExtension</key>
  <dict>
    <key>NSExtensionAttributes</key>
    <dict>
      <key>NSExtensionActivationRule</key>
      <dict>
        <key>NSExtensionActivationSupportsWebURLWithMaxCount</key>
        <integer>1</integer>
      </dict>
    </dict>
    <key>NSExtensionPrincipalClass</key>
    <string>$(PRODUCT_MODULE_NAME).ShareViewController</string>
    <key>NSExtensionPointIdentifier</key>
    <string>com.apple.share-services</string>
  </dict>
</dict>
</plist>
`);

      ensureFile(entitlementsFile, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.application-groups</key>
    <array>
      <string>${appGroupId}</string>
    </array>
  </dict>
</plist>
`);

      ensureFile(sharedAuthHeaderFile, `#import <React/RCTBridgeModule.h>

@interface SharedAuthToken : NSObject <RCTBridgeModule>
@end
`);

      ensureFile(sharedAuthImplFile, `#import "SharedAuthTokenModule.h"

@implementation SharedAuthToken

RCT_EXPORT_MODULE(SharedAuthToken);

static NSString *const kKidChefAppGroupId = @"${appGroupId}";
static NSString *const kKidChefTokenKey = @"kidchef.firebaseIdToken";

RCT_EXPORT_METHOD(setToken:(NSString *)token)
{
  NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:kKidChefAppGroupId];
  [defaults setObject:token forKey:kKidChefTokenKey];
}

RCT_EXPORT_METHOD(clearToken)
{
  NSUserDefaults *defaults = [[NSUserDefaults alloc] initWithSuiteName:kKidChefAppGroupId];
  [defaults removeObjectForKey:kKidChefTokenKey];
}

@end
`);

      // Update existing files to current app group id
      ensureFileContains(plistFile, (contents) =>
        contents.replace(/<key>AppGroupId<\/key>\s*<string>[^<]*<\/string>/, `<key>AppGroupId</key>\n  <string>${appGroupId}</string>`)
      );
      ensureFileContains(entitlementsFile, (contents) =>
        contents.replace(/<string>group\.[^<]*<\/string>/, `<string>${appGroupId}</string>`)
      );
      ensureFileContains(sharedAuthImplFile, (contents) =>
        contents.replace(/static NSString \*const kKidChefAppGroupId = @"[^"]+";/, `static NSString *const kKidChefAppGroupId = @"${appGroupId}";`)
      );

      ensureFile(swiftFile, String.raw`import UIKit
import UniformTypeIdentifiers
import MobileCoreServices

final class ShareViewController: UIViewController, UITableViewDataSource, UITableViewDelegate, UITextViewDelegate {
  private enum Tab {
    case ingredients
    case steps
  }

  private let statusLabel = UILabel()
  private let spinner = UIActivityIndicatorView(style: .medium)
  private let headerStack = UIStackView()
  private let cancelButton = UIButton(type: .system)
  private let saveButton = UIButton(type: .system)
  private let titleField = UITextField()
  private let recipeImageView: UIImageView = {
    let imageView = UIImageView()
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.layer.cornerRadius = 8
    imageView.backgroundColor = UIColor.systemGray6
    imageView.image = UIImage(systemName: "photo")
    imageView.tintColor = .tertiaryLabel
    imageView.translatesAutoresizingMaskIntoConstraints = false
    return imageView
  }()
  private let reviewBanner = UILabel()
  private let contentStack = UIStackView()
  private let segmentedControl = UISegmentedControl(items: ["Ingredients", "Steps"])
  private let tableView = UITableView(frame: .zero, style: .plain)
  private let footerLabel = UILabel()
  private let addItemButton = UIButton(type: .system)
  private let metadataStackView: UIStackView = {
    let stack = UIStackView()
    stack.axis = .horizontal
    stack.spacing = 12
    stack.alignment = .center
    stack.distribution = .fillProportionally
    stack.translatesAutoresizingMaskIntoConstraints = false
    return stack
  }()

  private let tokenKey = "kidchef.firebaseIdToken"

  private var selectedTab: Tab = .ingredients
  private var recipeTitle: String = ""
  private var recipeImageUrl: String = ""
  private var recipeIngredients: [String] = []
  private var recipeSteps: [String] = []
  private var recipeSourceUrl: String = ""
  private var isSaving = false
  private var didStartImport = false
  private var importConfidence: Double = 0.0
  private var recipeServings: Int? = nil
  private var recipePrepTime: String? = nil
  private var recipeCookTime: String? = nil
  private var recipeTotalTime: String? = nil

  private func runOnMain(_ block: @escaping () -> Void) {
    if Thread.isMainThread {
      block()
    } else {
      DispatchQueue.main.async {
        block()
      }
    }
  }

  private func loadRecipeImage(urlString: String) {
    guard let url = URL(string: urlString) else {
      print("❌ Invalid image URL: \\(urlString)")
      return
    }

    print("📸 Loading recipe image from: \\(urlString)")

    URLSession.shared.dataTask(with: url) { [weak self] data, response, error in
      guard let self = self else { return }

      if let error = error {
        print("❌ Image load error: \\(error.localizedDescription)")
        DispatchQueue.main.async {
          self.recipeImageView.image = UIImage(systemName: "photo")
          self.recipeImageView.tintColor = .tertiaryLabel
        }
        return
      }

      guard let data = data, let image = UIImage(data: data) else {
        print("❌ Invalid image data")
        return
      }

      DispatchQueue.main.async {
        self.recipeImageView.image = image
        self.recipeImageView.tintColor = nil
        print("✅ Image loaded successfully")
      }
    }.resume()
  }

  private func createMetadataBadge(icon: String, text: String) -> UIView {
    let container = UIView()
    let label = UILabel()
    label.text = "\(icon) \(text)"
    label.font = UIFont.systemFont(ofSize: 12, weight: .medium)
    label.textColor = .secondaryLabel
    label.backgroundColor = .secondarySystemBackground
    label.textAlignment = .center
    label.layer.cornerRadius = 10
    label.layer.masksToBounds = true
    label.translatesAutoresizingMaskIntoConstraints = false

    container.addSubview(label)
    NSLayoutConstraint.activate([
      label.leadingAnchor.constraint(equalTo: container.leadingAnchor, constant: 8),
      label.trailingAnchor.constraint(equalTo: container.trailingAnchor, constant: -8),
      label.topAnchor.constraint(equalTo: container.topAnchor, constant: 4),
      label.bottomAnchor.constraint(equalTo: container.bottomAnchor, constant: -4),
    ])

    return container
  }

  private func updateMetadataDisplay() {
    // Clear existing badges
    metadataStackView.arrangedSubviews.forEach { $0.removeFromSuperview() }

    var badges: [UIView] = []

    // Servings badge
    if let servings = recipeServings, servings > 0 {
      let text = servings == 1 ? "1 serving" : "\\(servings) servings"
      badges.append(createMetadataBadge(icon: "👥", text: text))
    }

    // Prep time badge
    if let prepTime = recipePrepTime, !prepTime.isEmpty {
      badges.append(createMetadataBadge(icon: "⏱", text: "\\(prepTime) prep"))
    }

    // Cook time badge
    if let cookTime = recipeCookTime, !cookTime.isEmpty {
      badges.append(createMetadataBadge(icon: "🍳", text: "\\(cookTime) cook"))
    }

    // Fallback to total time if prep/cook not available
    if recipePrepTime == nil && recipeCookTime == nil,
       let totalTime = recipeTotalTime, !totalTime.isEmpty {
      badges.append(createMetadataBadge(icon: "⏱", text: "\\(totalTime) total"))
    }

    // Only show metadata view if we have at least one badge
    if badges.isEmpty {
      metadataStackView.isHidden = true
      return
    }

    badges.forEach { metadataStackView.addArrangedSubview($0) }

    metadataStackView.isHidden = false
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .systemBackground

    statusLabel.text = "Importing recipe..."
    statusLabel.textAlignment = .center
    statusLabel.textColor = .secondaryLabel
    statusLabel.numberOfLines = 0

    cancelButton.setTitle("Cancel", for: .normal)
    cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)

    saveButton.setTitle("Save", for: .normal)
    saveButton.addTarget(self, action: #selector(saveTapped), for: .touchUpInside)
    saveButton.isEnabled = false

    headerStack.axis = .horizontal
    headerStack.alignment = .center
    headerStack.distribution = .equalSpacing
    headerStack.addArrangedSubview(cancelButton)
    headerStack.addArrangedSubview(UIView())
    headerStack.addArrangedSubview(saveButton)

    titleField.placeholder = "Recipe title"
    titleField.borderStyle = .roundedRect
    titleField.addTarget(self, action: #selector(titleChanged), for: .editingChanged)
    titleField.isHidden = true

    reviewBanner.text = "We couldn't find everything - review before saving."
    reviewBanner.textAlignment = .center
    reviewBanner.numberOfLines = 0
    reviewBanner.font = UIFont.systemFont(ofSize: 13, weight: .semibold)
    reviewBanner.textColor = UIColor(red: 0.55, green: 0.35, blue: 0.1, alpha: 1.0)
    reviewBanner.backgroundColor = UIColor(red: 0.99, green: 0.95, blue: 0.85, alpha: 1.0)
    reviewBanner.layer.cornerRadius = 8
    reviewBanner.layer.masksToBounds = true
    reviewBanner.isHidden = true

    contentStack.axis = .vertical
    contentStack.spacing = 8
    contentStack.addArrangedSubview(titleField)
    contentStack.addArrangedSubview(recipeImageView)
    contentStack.addArrangedSubview(metadataStackView)
    contentStack.addArrangedSubview(reviewBanner)

    // Set image view height constraint
    recipeImageView.heightAnchor.constraint(equalToConstant: 200).isActive = true
    recipeImageView.isHidden = true
    metadataStackView.isHidden = true

    segmentedControl.selectedSegmentIndex = 0
    segmentedControl.addTarget(self, action: #selector(tabChanged), for: .valueChanged)
    segmentedControl.selectedSegmentTintColor = .systemBlue
    segmentedControl.setTitleTextAttributes([.foregroundColor: UIColor.white], for: .selected)
    segmentedControl.setTitleTextAttributes([.foregroundColor: UIColor.label], for: .normal)
    segmentedControl.isHidden = true
    contentStack.addArrangedSubview(segmentedControl)

    tableView.dataSource = self
    tableView.delegate = self
    tableView.isHidden = true
    tableView.tableFooterView = UIView()
    tableView.rowHeight = UITableView.automaticDimension
    tableView.estimatedRowHeight = 56
    tableView.keyboardDismissMode = .interactive
    tableView.backgroundColor = .systemGroupedBackground

    footerLabel.textAlignment = .center
    footerLabel.font = UIFont.systemFont(ofSize: 12)
    footerLabel.textColor = .tertiaryLabel
    footerLabel.numberOfLines = 2
    footerLabel.text = "Powered by KidChef"
    footerLabel.isHidden = true

    addItemButton.setTitle("Add Ingredient", for: .normal)
    addItemButton.addTarget(self, action: #selector(addItemTapped), for: .touchUpInside)

    spinner.translatesAutoresizingMaskIntoConstraints = false
    statusLabel.translatesAutoresizingMaskIntoConstraints = false
    headerStack.translatesAutoresizingMaskIntoConstraints = false
    contentStack.translatesAutoresizingMaskIntoConstraints = false
    tableView.translatesAutoresizingMaskIntoConstraints = false
    footerLabel.translatesAutoresizingMaskIntoConstraints = false

    view.addSubview(spinner)
    view.addSubview(statusLabel)
    view.addSubview(headerStack)
    view.addSubview(contentStack)
    view.addSubview(tableView)
    view.addSubview(footerLabel)

    NSLayoutConstraint.activate([
      spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -10),
      statusLabel.topAnchor.constraint(equalTo: spinner.bottomAnchor, constant: 12),
      statusLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      statusLabel.leadingAnchor.constraint(greaterThanOrEqualTo: view.leadingAnchor, constant: 16),
      statusLabel.trailingAnchor.constraint(lessThanOrEqualTo: view.trailingAnchor, constant: -16),

      headerStack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
      headerStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      headerStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),

      contentStack.topAnchor.constraint(equalTo: headerStack.bottomAnchor, constant: 8),
      contentStack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      contentStack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),

      tableView.topAnchor.constraint(equalTo: contentStack.bottomAnchor, constant: 12),
      tableView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      tableView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      tableView.bottomAnchor.constraint(equalTo: footerLabel.topAnchor, constant: -8),

      footerLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
      footerLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
      footerLabel.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -8),
    ])
  }

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    spinner.startAnimating()
    handleSharedContent()
  }

  @objc private func cancelTapped() {
    finishExtension()
  }

  @objc private func saveTapped() {
    guard !isSaving else { return }
    let trimmedTitle = titleField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let statusInfo = draftStatus(title: trimmedTitle, steps: recipeSteps, ingredients: recipeIngredients)
    if statusInfo.status == "not_recipe" {
      showError("Please add a title or steps before saving.")
      return
    }
    isSaving = true
    saveButton.isEnabled = false
    statusLabel.text = "Saving recipe..."
    statusLabel.isHidden = false
    spinner.startAnimating()
    saveRecipe()
  }

  @objc private func tabChanged() {
    selectedTab = segmentedControl.selectedSegmentIndex == 0 ? .ingredients : .steps
    updateAddButtonTitle()
    UIView.transition(with: tableView, duration: 0.2, options: .transitionCrossDissolve, animations: {
      self.tableView.reloadData()
    })
    DispatchQueue.main.async {
      self.tableView.beginUpdates()
      self.tableView.endUpdates()
      self.tableView.invalidateIntrinsicContentSize()
    }
  }

  @objc private func addItemTapped() {
    switch selectedTab {
    case .ingredients:
      recipeIngredients.append("")
    case .steps:
      recipeSteps.append("")
    }
    tableView.reloadData()
    tableView.layoutIfNeeded()
  }

  @objc private func titleChanged() {
    recipeTitle = titleField.text ?? ""
    updateReviewBanner()
    updateSaveButtonState()
  }

  private func handleSharedContent() {
    guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
      showError("No shared content found.")
      return
    }

    for item in items {
      guard let providers = item.attachments else { continue }
      for provider in providers {
        if tryLoadUrl(from: provider) {
          return
        }
      }
    }

    showError("No URL found in the shared content.")
  }

  private func tryLoadUrl(from provider: NSItemProvider) -> Bool {
    let urlTypeIdentifier: String
    let textTypeIdentifier: String

    if #available(iOS 14.0, *) {
      urlTypeIdentifier = UTType.url.identifier
      textTypeIdentifier = UTType.text.identifier
    } else {
      urlTypeIdentifier = kUTTypeURL as String
      textTypeIdentifier = kUTTypeText as String
    }

    if provider.hasItemConformingToTypeIdentifier(urlTypeIdentifier) {
      provider.loadItem(forTypeIdentifier: urlTypeIdentifier, options: nil) { [weak self] item, _ in
        guard let self else { return }
        if let url = item as? URL {
          self.loadHtmlThenFetch(from: provider, urlString: url.absoluteString)
        } else {
          self.showError("Shared URL could not be read.")
        }
      }
      return true
    }

    if provider.hasItemConformingToTypeIdentifier(textTypeIdentifier) {
      provider.loadItem(forTypeIdentifier: textTypeIdentifier, options: nil) { [weak self] item, _ in
        guard let self else { return }
        if let text = item as? String, let url = self.extractUrl(from: text) {
          self.loadHtmlThenFetch(from: provider, urlString: url.absoluteString)
        } else {
          self.showError("No URL detected in shared text.")
        }
      }
      return true
    }

    return false
  }

  private func loadHtmlThenFetch(from provider: NSItemProvider, urlString: String) {
    let activeWebpageType = "com.apple.active-webpage"
    let webArchiveTypeIdentifier: String
    if #available(iOS 14.0, *) {
      webArchiveTypeIdentifier = UTType.webArchive.identifier
    } else {
      webArchiveTypeIdentifier = "com.apple.webarchive"
    }

    if provider.hasItemConformingToTypeIdentifier(webArchiveTypeIdentifier) {
      if #available(iOS 14.0, *) {
        provider.loadDataRepresentation(forTypeIdentifier: webArchiveTypeIdentifier) { [weak self] data, _ in
          guard let self else { return }
          if let data, let html = self.extractHtmlFromWebArchiveData(data) {
            print("ShareExtension: extracted webarchive html length", html.count)
            self.fetchRecipe(from: urlString, html: html)
          } else {
            self.loadHtmlFromProvider(provider, urlString: urlString)
          }
        }
      } else {
        provider.loadItem(forTypeIdentifier: webArchiveTypeIdentifier, options: nil) { [weak self] item, _ in
          guard let self else { return }
          if let html = self.extractHtmlFromWebArchive(item: item) {
            print("ShareExtension: extracted webarchive html length", html.count)
            self.fetchRecipe(from: urlString, html: html)
          } else {
            self.loadHtmlFromProvider(provider, urlString: urlString)
          }
        }
      }
      return
    }

    if provider.hasItemConformingToTypeIdentifier(activeWebpageType) {
      provider.loadItem(forTypeIdentifier: activeWebpageType, options: nil) { [weak self] item, _ in
        guard let self else { return }
        if let url = self.extractUrlFromActiveWebpage(item: item) {
          self.fetchHtmlFromUrl(url.absoluteString)
        } else {
          self.loadHtmlFromProvider(provider, urlString: urlString)
        }
      }
      return
    }

    loadHtmlFromProvider(provider, urlString: urlString)
  }

  private func loadHtmlFromProvider(_ provider: NSItemProvider, urlString: String) {
    let htmlTypeIdentifier: String
    if #available(iOS 14.0, *) {
      htmlTypeIdentifier = UTType.html.identifier
    } else {
      htmlTypeIdentifier = kUTTypeHTML as String
    }

    if provider.hasItemConformingToTypeIdentifier(htmlTypeIdentifier) {
      if #available(iOS 14.0, *) {
        provider.loadDataRepresentation(forTypeIdentifier: htmlTypeIdentifier) { [weak self] data, _ in
          guard let self else { return }
          if let data, let html = String(data: data, encoding: .utf8) {
            print("ShareExtension: extracted html length", html.count)
            self.fetchRecipe(from: urlString, html: html)
          } else {
            self.fetchRecipe(from: urlString, html: nil)
          }
        }
      } else {
        provider.loadItem(forTypeIdentifier: htmlTypeIdentifier, options: nil) { [weak self] item, _ in
          guard let self else { return }
          if let data = item as? Data, let html = String(data: data, encoding: .utf8) {
            print("ShareExtension: extracted html length", html.count)
            self.fetchRecipe(from: urlString, html: html)
          } else if let html = item as? String {
            print("ShareExtension: extracted html length", html.count)
            self.fetchRecipe(from: urlString, html: html)
          } else {
            self.fetchRecipe(from: urlString, html: nil)
          }
        }
      }
      return
    }

    fetchHtmlFromUrl(urlString)
  }

  private func extractUrlFromActiveWebpage(item: NSSecureCoding?) -> URL? {
    if let url = item as? URL {
      return url
    }
    guard let data = item as? Data else { return nil }
    do {
      let plist = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
      guard let dict = plist as? [String: Any] else { return nil }
      if let urlString = dict["URL"] as? String, let url = URL(string: urlString) {
        return url
      }
      if let urlString = dict["WebPageURL"] as? String, let url = URL(string: urlString) {
        return url
      }
      if let urlString = dict["WebPageSourceURL"] as? String, let url = URL(string: urlString) {
        return url
      }
    } catch {
      return nil
    }
    return nil
  }

  private func extractHtmlFromWebArchiveData(_ data: Data) -> String? {
    do {
      let plist = try PropertyListSerialization.propertyList(from: data, options: [], format: nil)
      guard let dict = plist as? [String: Any] else { return nil }
      guard let mainResource = dict["WebMainResource"] as? [String: Any] else { return nil }
      guard let resourceData = mainResource["WebResourceData"] as? Data else { return nil }
      return String(data: resourceData, encoding: .utf8)
    } catch {
      return nil
    }
  }

  private func extractHtmlFromWebArchive(item: NSSecureCoding?) -> String? {
    guard let data = item as? Data else { return nil }
    return extractHtmlFromWebArchiveData(data)
  }

  private func fetchHtmlFromUrl(_ urlString: String) {
    guard let url = URL(string: urlString) else {
      fetchRecipe(from: urlString, html: nil)
      return
    }

    var request = URLRequest(url: url)
    request.httpMethod = "GET"
    request.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", forHTTPHeaderField: "User-Agent")
    request.setValue("text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", forHTTPHeaderField: "Accept")
    request.setValue("en-US,en;q=0.9", forHTTPHeaderField: "Accept-Language")

    URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
      guard let self else { return }
      if let data, let html = String(data: data, encoding: .utf8) {
        self.fetchRecipe(from: urlString, html: html)
      } else {
        self.fetchRecipe(from: urlString, html: nil)
      }
    }.resume()
  }

  private func extractUrl(from text: String) -> URL? {
    if let url = URL(string: text), url.scheme?.hasPrefix("http") == true {
      return url
    }

    for part in text.split(separator: " ") {
      if let url = URL(string: String(part)), url.scheme?.hasPrefix("http") == true {
        return url
      }
    }

    return nil
  }

  private func fetchRecipe(from urlString: String, html: String?) {
    guard !didStartImport else { return }
    didStartImport = true
    recipeSourceUrl = urlString
    runOnMain { [weak self] in
      guard let self else { return }
      self.statusLabel.text = "Importing recipe..."
      self.statusLabel.isHidden = false
      self.spinner.startAnimating()
    }

    guard let token = readAuthToken() else {
      showAuthRequired()
      return
    }

    guard let requestUrl = functionUrl(path: "importRecipeHttp") else {
      showError("Missing function configuration.")
      return
    }

    print("DEBUG: FUNCTION URL:", requestUrl.absoluteString)
    print("DEBUG: Auth token present:", !token.isEmpty)

    var request = URLRequest(url: requestUrl)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    var body: [String: Any] = ["url": urlString]
    if let html, !html.isEmpty {
      body["html"] = html
    }
    request.httpBody = try? JSONSerialization.data(withJSONObject: body, options: [])

    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        self?.handleRecipeResponse(data: data, response: response, error: error)
      }
    }.resume()
  }

  private func handleRecipeResponse(data: Data?, response: URLResponse?, error: Error?) {
    if let error {
      showError("Failed to import: \(error.localizedDescription)")
      return
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      showError("Unexpected response from server.")
      return
    }

    guard let data = data else {
      showError("No data received.")
      return
    }

    guard httpResponse.statusCode == 200,
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      showError("Import failed (status \(httpResponse.statusCode)).")
      return
    }

    if let status = json["status"] as? String,
       let recipe = json["recipe"] as? [String: Any] {
      importConfidence = json["confidence"] as? Double ?? 0.0
      let issues = json["issues"] as? [String] ?? []
      updateRecipeUI(recipe, status: status, issues: issues, confidence: importConfidence)
      return
    }

    showError("Recipe could not be imported.")
  }

  private func updateRecipeUI(_ recipe: [String: Any], status: String, issues: [String], confidence: Double) {
    recipeTitle = recipe["title"] as? String ?? ""
    recipeImageUrl = recipe["image"] as? String ?? ""
    recipeIngredients = recipe["ingredients"] as? [String] ?? []
    recipeSteps = recipe["instructions"] as? [String] ?? []
    importConfidence = confidence

    // Extract metadata
    recipeServings = recipe["servings"] as? Int
    recipePrepTime = recipe["prepTime"] as? String
    recipeCookTime = recipe["cookTime"] as? String
    recipeTotalTime = recipe["totalTime"] as? String

    runOnMain { [weak self] in
      guard let self else { return }
      self.spinner.stopAnimating()
      self.statusLabel.isHidden = true

      self.titleField.text = self.recipeTitle
      self.titleField.isHidden = false

      // Load and display the image
      if !self.recipeImageUrl.isEmpty {
        self.loadRecipeImage(urlString: self.recipeImageUrl)
        self.recipeImageView.isHidden = false
      } else {
        self.recipeImageView.image = UIImage(systemName: "photo")
        self.recipeImageView.tintColor = .tertiaryLabel
        self.recipeImageView.isHidden = false
        print("⚠️ No image URL provided for recipe")
      }

      // Update metadata display
      self.updateMetadataDisplay()

      self.segmentedControl.isHidden = false
      self.tableView.isHidden = false
      self.footerLabel.isHidden = false

      self.updateReviewBanner(status: status, issues: issues)
      self.updateSaveButtonState()
      self.updateAddButtonTitle()
      self.tableView.reloadData()
      self.tableView.layoutIfNeeded()
      self.tableView.tableFooterView = self.buildFooterView()
    }
  }

  private func saveRecipe() {
    guard let token = readAuthToken() else {
      showAuthRequired()
      return
    }

    guard let requestUrl = functionUrl(path: "saveImportedRecipeHttp") else {
      showError("Missing function configuration.")
      return
    }

    let trimmedTitle = titleField.text?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    let statusInfo = draftStatus(title: trimmedTitle, steps: recipeSteps, ingredients: recipeIngredients)
    let finalTitle = trimmedTitle.isEmpty ? "Untitled Recipe" : trimmedTitle

    var recipeDict: [String: Any] = [
      "title": finalTitle,
      "image": recipeImageUrl,
      "ingredients": recipeIngredients,
      "instructions": recipeSteps,
      "sourceUrl": recipeSourceUrl,
      "importStatus": statusInfo.status,
      "importIssues": statusInfo.issues,
      "importConfidence": importConfidence
    ]

    // Add metadata if available
    if let servings = recipeServings {
      recipeDict["servings"] = servings
    }
    if let prepTime = recipePrepTime {
      recipeDict["prepTime"] = prepTime
    }
    if let cookTime = recipeCookTime {
      recipeDict["cookTime"] = cookTime
    }
    if let totalTime = recipeTotalTime {
      recipeDict["totalTime"] = totalTime
    }

    let payload: [String: Any] = ["recipe": recipeDict]

    var request = URLRequest(url: requestUrl)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
    request.httpBody = try? JSONSerialization.data(withJSONObject: payload, options: [])

    URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
      DispatchQueue.main.async {
        self?.handleSaveResponse(data: data, response: response, error: error)
      }
    }.resume()
  }

  private func handleSaveResponse(data: Data?, response: URLResponse?, error: Error?) {
    isSaving = false
    spinner.stopAnimating()

    if let error {
      showError("Save failed: \(error.localizedDescription)")
      return
    }

    guard let httpResponse = response as? HTTPURLResponse else {
      showError("Unexpected response when saving.")
      return
    }

    guard httpResponse.statusCode == 200 else {
      showError("Save failed (status \(httpResponse.statusCode)).")
      return
    }

    runOnMain { [weak self] in
      guard let self else { return }
      self.statusLabel.text = "Saved - you can finish editing anytime."
      self.statusLabel.isHidden = false
      self.footerLabel.text = "You can return to Safari."
      self.saveButton.isEnabled = false
    }

    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
      self?.finishExtension()
    }
  }

  private func showAuthRequired() {
    runOnMain { [weak self] in
      guard let self else { return }
      self.spinner.stopAnimating()
      self.statusLabel.text = "Please open KidChef and sign in to save recipes."
      self.statusLabel.isHidden = false
      self.saveButton.isEnabled = false
      self.footerLabel.isHidden = true
      self.tableView.isHidden = true
      self.segmentedControl.isHidden = true
      self.titleField.isHidden = true
      self.reviewBanner.isHidden = true
    }
  }

  private func showError(_ message: String) {
    runOnMain { [weak self] in
      guard let self else { return }
      self.spinner.stopAnimating()
      self.statusLabel.text = message
      self.statusLabel.isHidden = false
      self.saveButton.isEnabled = false
      self.tableView.isHidden = true
      self.segmentedControl.isHidden = true
      self.titleField.isHidden = true
      self.reviewBanner.isHidden = true
    }
  }

  private func draftStatus(title: String, steps: [String], ingredients: [String]) -> (status: String, issues: [String]) {
    var issues: [String] = []
    let hasTitle = !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    let hasSteps = steps.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    let hasIngredients = ingredients.contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    if !hasTitle { issues.append("missing_title") }
    if !hasSteps { issues.append("missing_steps") }
    if !hasIngredients { issues.append("missing_ingredients") }

    if !hasTitle && !hasSteps {
      return ("not_recipe", issues)
    }

    let status = hasTitle && hasSteps && hasIngredients ? "complete" : "needs_review"
    return (status, issues)
  }

  private func updateReviewBanner(status: String? = nil, issues: [String] = []) {
    let currentTitle = titleField.text ?? recipeTitle
    let statusInfo = draftStatus(title: currentTitle, steps: recipeSteps, ingredients: recipeIngredients)
    let hasIssues = !issues.isEmpty || !statusInfo.issues.isEmpty
    let show = (status ?? statusInfo.status) != "complete" || hasIssues || importConfidence < 0.7
    reviewBanner.isHidden = !show
  }

  private func updateSaveButtonState() {
    let currentTitle = titleField.text ?? recipeTitle
    let statusInfo = draftStatus(title: currentTitle, steps: recipeSteps, ingredients: recipeIngredients)
    if statusInfo.status == "not_recipe" {
      saveButton.isEnabled = false
      saveButton.setTitle("Save", for: .normal)
      return
    }

    saveButton.isEnabled = true
    if statusInfo.status == "needs_review" {
      saveButton.setTitle("Save & Finish Later", for: .normal)
    } else {
      saveButton.setTitle("Save", for: .normal)
    }
  }

  private func updateAddButtonTitle() {
    switch selectedTab {
    case .ingredients:
      addItemButton.setTitle("Add Ingredient", for: .normal)
    case .steps:
      addItemButton.setTitle("Add Step", for: .normal)
    }
    tableView.tableFooterView = buildFooterView()
  }

  private func buildFooterView() -> UIView {
    let container = UIView(frame: CGRect(x: 0, y: 0, width: tableView.bounds.width, height: 60))
    addItemButton.frame = CGRect(x: 16, y: 10, width: max(120, tableView.bounds.width - 32), height: 40)
    addItemButton.contentHorizontalAlignment = .center
    container.addSubview(addItemButton)
    return container
  }

  private func readAuthToken() -> String? {
    let defaults = UserDefaults(suiteName: appGroupId())
    return defaults?.string(forKey: tokenKey)
  }

  private func functionUrl(path: String) -> URL? {
    guard let projectId = Bundle.main.object(forInfoDictionaryKey: "FirebaseProjectId") as? String, !projectId.isEmpty else {
      print("DEBUG: FirebaseProjectId not found in Info.plist")
      return nil
    }
    let region = (Bundle.main.object(forInfoDictionaryKey: "FunctionRegion") as? String) ?? "us-central1"
    let urlString = "https://\(region)-\(projectId).cloudfunctions.net/\(path)"
    print("DEBUG: Constructed URL:", urlString)
    print("DEBUG: Project ID:", projectId)
    print("DEBUG: Region:", region)
    print("DEBUG: Path:", path)
    return URL(string: urlString)
  }

  private func appGroupId() -> String {
    return (Bundle.main.object(forInfoDictionaryKey: "AppGroupId") as? String) ?? "group.com.kidchef.app"
  }

  private func finishExtension() {
    extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
  }

  func tableView(_ tableView: UITableView, numberOfRowsInSection section: Int) -> Int {
    switch selectedTab {
    case .ingredients:
      return recipeIngredients.count
    case .steps:
      return recipeSteps.count
    }
  }

  func tableView(_ tableView: UITableView, cellForRowAt indexPath: IndexPath) -> UITableViewCell {
    let cell = tableView.dequeueReusableCell(withIdentifier: "EditableCell") ?? UITableViewCell(style: .default, reuseIdentifier: "EditableCell")
    cell.selectionStyle = .none
    cell.backgroundColor = .systemGroupedBackground

    let textView: UITextView
    if let existing = cell.contentView.viewWithTag(1001) as? UITextView {
      textView = existing
    } else {
      textView = UITextView()
      textView.tag = 1001
      textView.font = UIFont.systemFont(ofSize: 16)
      textView.textColor = .label
      textView.isScrollEnabled = false
      textView.delegate = self
      textView.backgroundColor = .secondarySystemBackground
      textView.layer.cornerRadius = 8
      textView.textContainerInset = UIEdgeInsets(top: 8, left: 8, bottom: 8, right: 8)
      textView.translatesAutoresizingMaskIntoConstraints = false
      cell.contentView.addSubview(textView)

      NSLayoutConstraint.activate([
        textView.leadingAnchor.constraint(equalTo: cell.contentView.leadingAnchor, constant: 16),
        textView.trailingAnchor.constraint(equalTo: cell.contentView.trailingAnchor, constant: -16),
        textView.topAnchor.constraint(equalTo: cell.contentView.topAnchor, constant: 8),
        textView.bottomAnchor.constraint(equalTo: cell.contentView.bottomAnchor, constant: -8),
      ])
      let heightConstraint = textView.heightAnchor.constraint(greaterThanOrEqualToConstant: 40)
      heightConstraint.priority = .defaultHigh
      heightConstraint.isActive = true
    }

    textView.accessibilityIdentifier = selectedTab == .ingredients ? "ingredients" : "steps"
    textView.tag = indexPath.row
    textView.textColor = .label

    switch selectedTab {
    case .ingredients:
      textView.text = recipeIngredients[indexPath.row]
    case .steps:
      textView.text = recipeSteps[indexPath.row]
    }
    textView.invalidateIntrinsicContentSize()

    return cell
  }

  func tableView(_ tableView: UITableView, commit editingStyle: UITableViewCell.EditingStyle, forRowAt indexPath: IndexPath) {
    if editingStyle == .delete {
      switch selectedTab {
      case .ingredients:
        recipeIngredients.remove(at: indexPath.row)
      case .steps:
        recipeSteps.remove(at: indexPath.row)
      }
      tableView.deleteRows(at: [indexPath], with: .automatic)
      updateReviewBanner()
      updateSaveButtonState()
    }
  }

  func textViewDidChange(_ textView: UITextView) {
    let row = textView.tag
    let text = textView.text ?? ""
    let list = textView.accessibilityIdentifier

    if list == "ingredients" {
      if row < recipeIngredients.count {
        recipeIngredients[row] = text
      }
    } else {
      if row < recipeSteps.count {
        recipeSteps[row] = text
      }
    }

    updateReviewBanner()
    updateSaveButtonState()
    tableView.beginUpdates()
    tableView.endUpdates()
    tableView.layoutIfNeeded()
  }
}

`);

      // Add source files if they exist
      if (fs.existsSync(swiftFile)) {
        const fileRefKey = getFileRefKeyByName('ShareViewController.swift');
        if (fileRefKey && appTargetUuid && appTargetUuid !== extensionTargetUuid) {
          const buildFileKeys = getBuildFileKeysForFileRef(fileRefKey);
          if (buildFileKeys.length > 0) {
            removeBuildFilesFromTargetSources(appTargetUuid, buildFileKeys);
          }
        }

        if (extensionTargetUuid) {
          ensureSourcesBuildPhase(extensionTargetUuid);
        }
        const sourcePath = shareGroupKey ? 'ShareViewController.swift' : 'ShareExtension/ShareViewController.swift';
        xcodeProject.addSourceFile(sourcePath, { target: extensionTargetUuid }, fileGroupKey);
      } else {
        console.warn('ShareViewController.swift not found at:', swiftFile);
      }

      if (fs.existsSync(sharedAuthImplFile) && appTargetUuid) {
        const appGroupKey = findGroupKeyByName(appTargetName) || mainGroupId || undefined;
        const authFileRefKey = getFileRefKeyByName('SharedAuthTokenModule.m');
        if (!authFileRefKey) {
          ensureSourcesBuildPhase(appTargetUuid);
          xcodeProject.addSourceFile(`${appTargetName}/SharedAuthTokenModule.m`, { target: appTargetUuid }, appGroupKey);
          xcodeProject.addSourceFile(`${appTargetName}/SharedAuthTokenModule.h`, { target: appTargetUuid }, appGroupKey);
        }
      }

      // Info.plist is referenced via build settings; no resource additions needed.

      if (appTargetUuid) {
        setBuildSettingsForTarget(appTargetUuid, {
          INFOPLIST_FILE: appInfoPlistPath,
          PRODUCT_BUNDLE_IDENTIFIER: bundleIdentifier
        });
      }

      setBuildSettingsForProject({
        INFOPLIST_FILE: appInfoPlistPath,
        PRODUCT_BUNDLE_IDENTIFIER: bundleIdentifier
      });

      if (extensionTargetUuid) {
        const firebaseProjectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
        setBuildSettingsForTarget(extensionTargetUuid, {
          INFOPLIST_FILE: 'ShareExtension/Info.plist',
          PRODUCT_BUNDLE_IDENTIFIER: `${bundleIdentifier}.ShareExtension`,
          PRODUCT_NAME: 'ShareExtension',
          SWIFT_VERSION: '5.0',
          MARKETING_VERSION: '1.0.0',
          CURRENT_PROJECT_VERSION: '1',
          SKIP_INSTALL: 'YES',
          APP_SCHEME: appScheme,
          CODE_SIGN_ENTITLEMENTS: 'ShareExtension/ShareExtension.entitlements',
          FIREBASE_PROJECT_ID: firebaseProjectId || ''
        });
      }

      // Add framework dependencies
      if (extensionTargetUuid) {
        xcodeProject.addFramework('Social.framework', { target: extensionTargetUuid });
        xcodeProject.addFramework('MobileCoreServices.framework', { target: extensionTargetUuid });
        xcodeProject.addFramework('UniformTypeIdentifiers.framework', { target: extensionTargetUuid });
      }

      console.log('✅ iOS Share Extension configured successfully');
      console.log('   Source files expected at:', shareExtensionPath);
    } catch (error) {
      console.error('❌ Error configuring iOS Share Extension:', error.message);
    }

    return config;
  });
};

module.exports = withShareExtension;
