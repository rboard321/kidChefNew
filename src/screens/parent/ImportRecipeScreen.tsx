import React, { useState, useContext, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Linking,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { ImportError, RecoveryAction } from '../../services/recipeImport';
import { useAuth } from '../../contexts/AuthContext';
import { useImport } from '../../contexts/ImportContext';
import { Toast } from '../../components/Toast';
import { ImportErrorBoundary } from '../../components/ErrorBoundary';

type ImportRecipeParams = {
  importUrl?: string;
};

// Helper functions for enhanced error display
const getSeverityEmoji = (severity?: string) => {
  switch (severity) {
    case 'critical': return '🚨';
    case 'high': return '⚠️';
    case 'medium': return '⚡';
    case 'low': return '💡';
    default: return '❗';
  }
};

const getActionEmoji = (action: string) => {
  switch (action) {
    case 'retry': return '🔄';
    case 'manual-entry': return '✏️';
    case 'try-different-url': return '🔗';
    case 'contact-support': return '💬';
    default: return '📱';
  }
};

const getActionButtonStyle = (action: string) => {
  switch (action) {
    case 'retry': return { backgroundColor: '#3b82f6' };
    case 'manual-entry': return { backgroundColor: '#8b5cf6' };
    case 'try-different-url': return { backgroundColor: '#06b6d4' };
    case 'contact-support': return { backgroundColor: '#ef4444' };
    default: return { backgroundColor: '#6b7280' };
  }
};

const getActionTextStyle = (action: string) => {
  switch (action) {
    case 'contact-support': return { color: '#ffffff' };
    default: return { color: '#ffffff' };
  }
};

export default function ImportRecipeScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const params = route.params as ImportRecipeParams;
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [importError, setImportError] = useState<ImportError | null>(null);
  const [showUrlImport, setShowUrlImport] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type?: 'success' | 'error' }>({ visible: false, message: '' });
  const { user, parentProfile } = useAuth();
  const { importRecipe, getImportStatus } = useImport();

  // Platform detection
  const isIOS = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';

  // Guard: Ensure parent profile exists before allowing imports
  useEffect(() => {
    if (user && !parentProfile) {
      Alert.alert(
        'Profile Setup Required',
        'Please complete your profile setup before importing recipes. This ensures your recipes are properly saved to your account.',
        [
          {
            text: 'Complete Profile',
            onPress: () => navigation.navigate('ParentSettings' as never)
          },
          {
            text: 'Go Back',
            style: 'cancel',
            onPress: () => navigation.goBack()
          }
        ]
      );
    }
  }, [user, parentProfile, navigation]);

  // Block import operations if no parent profile
  const canImport = user && parentProfile;

  // Handle deep link URL import
  useEffect(() => {
    if (params?.importUrl && canImport) {
      setUrl(params.importUrl);
      setShowUrlImport(true); // Show URL section since we have a URL from share
      // Auto-start import if URL was provided via deep link AND profile exists
      Alert.alert(
        'Import Recipe from Share',
        `Import recipe from: ${params.importUrl}?`,
        [
          {
            text: 'Import',
            onPress: () => handleImportWithUrl(params.importUrl!)
          },
          {
            text: 'Cancel',
            style: 'cancel',
            onPress: () => navigation.goBack()
          }
        ]
      );
    }
  }, [params?.importUrl, canImport]);



  const handleImportWithUrl = async (targetUrl: string) => {
    if (!targetUrl.trim()) {
      setImportError({
        code: 'EMPTY_URL',
        message: 'Invalid recipe URL',
        canRetry: false,
        severity: 'low'
      });
      return;
    }

    if (!user?.uid) {
      setImportError({
        code: 'UNAUTHENTICATED',
        message: 'You must be logged in to import recipes',
        canRetry: false,
        severity: 'high'
      });
      return;
    }

    if (!parentProfile) {
      setImportError({
        code: 'PROFILE_INCOMPLETE',
        message: 'Please complete your profile setup before importing recipes',
        suggestion: 'Complete your profile to ensure recipes are saved properly',
        canRetry: false,
        severity: 'medium' as const,
        recoveryActions: [
          {
            label: 'Complete Profile',
            action: 'try-different-url' as const,
            description: 'Set up your parent profile'
          }
        ]
      });
      return;
    }

    setLoading(true);
    setImportError(null);

    try {
      await importRecipe(targetUrl);

      // Show success message and navigate
      setToast({
        visible: true,
        message: '📥 Recipe import started! We\'ll add it to your collection shortly.',
        type: 'success'
      });

      // Stop loading immediately after successful import
      setLoading(false);

      // Navigate to home after showing success message
      setTimeout(() => {
        navigation.navigate('Home' as never);
      }, 2000);

    } catch (error: any) {
      console.error('Failed to start import:', error);
      setImportError({
        code: 'IMPORT_FAILED',
        message: error?.message || 'Failed to start import',
        canRetry: true,
        severity: 'medium'
      });
      setLoading(false);
    }
  };

  const handleImport = async () => {
    await handleImportWithUrl(url);
  };


  const handleRetry = () => {
    setImportError(null);
    if (url.trim()) {
      handleImportWithUrl(url);
    }
  };


  const handleManualEdit = () => {
    (navigation as any).navigate('ManualRecipeEntry');
  };

  const handleRecoveryAction = async (action: RecoveryAction) => {
    switch (action.action) {
      case 'retry':
        await handleRetry();
        break;

      case 'manual-entry':
        handleManualEdit();
        break;

      case 'try-different-url':
        setUrl('');
        setImportError(null);
        // Focus on the URL input (could add ref if needed)
        break;

      case 'contact-support':
        // Open support email or help page
        const supportUrl = 'mailto:kidchefapp@gmail.com?subject=Recipe Import Issue';
        Linking.openURL(supportUrl).catch(() => {
          Alert.alert(
            'Contact Support',
            'Please email us at kidchefapp@gmail.com with details about this import issue.',
            [{ text: 'OK' }]
          );
        });
        break;

      default:
        console.warn('Unknown recovery action:', action.action);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast({ ...toast, visible: false })}
      />
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.content}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.title}>Import Recipe</Text>
                <Text style={styles.subtitle}>
                  Get recipes from any website with 95% success rate
                </Text>
              </View>

              {/* Recommended Method: Share Extension */}
              <View style={styles.recommendedContainer}>
                <View style={styles.recommendedHeader}>
                  <Text style={styles.recommendedBadge}>✨ RECOMMENDED</Text>
                  <Text style={styles.recommendedTitle}>
                    {isIOS ? '📱 Use iOS Share Button' : '🤖 Use Android Share Menu'}
                  </Text>
                  <Text style={styles.successRate}>95% Success Rate</Text>
                </View>

                <View style={styles.instructionsList}>
                  {isIOS ? (
                    <>
                      <View style={styles.instructionStep}>
                        <Text style={styles.stepNumber}>1</Text>
                        <Text style={styles.stepText}>Open Safari and navigate to any recipe website</Text>
                      </View>
                      <View style={styles.instructionStep}>
                        <Text style={styles.stepNumber}>2</Text>
                        <Text style={styles.stepText}>Tap the Share button (square with arrow) in Safari</Text>
                      </View>
                      <View style={styles.instructionStep}>
                        <Text style={styles.stepNumber}>3</Text>
                        <Text style={styles.stepText}>Select "Import Recipe" from the share menu</Text>
                      </View>
                      <View style={styles.instructionStep}>
                        <Text style={styles.stepNumber}>4</Text>
                        <Text style={styles.stepText}>KidChef opens automatically with your recipe!</Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <View style={styles.instructionStep}>
                        <Text style={styles.stepNumber}>1</Text>
                        <Text style={styles.stepText}>Open Chrome (or any browser) and find a recipe</Text>
                      </View>
                      <View style={styles.instructionStep}>
                        <Text style={styles.stepNumber}>2</Text>
                        <Text style={styles.stepText}>Tap the Share button (three dots → Share)</Text>
                      </View>
                      <View style={styles.instructionStep}>
                        <Text style={styles.stepNumber}>3</Text>
                        <Text style={styles.stepText}>Select "Import Recipe" from the share menu</Text>
                      </View>
                      <View style={styles.instructionStep}>
                        <Text style={styles.stepNumber}>4</Text>
                        <Text style={styles.stepText}>KidChef opens automatically with your recipe!</Text>
                      </View>
                    </>
                  )}
                </View>

                <View style={styles.benefitsList}>
                  <Text style={styles.benefitsTitle}>Why this works better:</Text>
                  <Text style={styles.benefitItem}>• Works with ANY recipe website</Text>
                  <Text style={styles.benefitItem}>• Even works with paywalled sites like NYTimes Cooking</Text>
                  <Text style={styles.benefitItem}>• No need to copy and paste URLs</Text>
                  <Text style={styles.benefitItem}>• Faster and more reliable</Text>
                </View>
              </View>

              {/* Alternative Method: URL Import */}
              <View style={styles.alternativeContainer}>
                <TouchableOpacity
                  style={styles.alternativeHeader}
                  onPress={() => setShowUrlImport(!showUrlImport)}
                >
                  <Text style={styles.alternativeTitle}>
                    🔗 Alternative: Import by URL
                  </Text>
                  <Text style={styles.alternativeSubtitle}>
                    Less reliable (~40% success rate) {showUrlImport ? '▲' : '▼'}
                  </Text>
                </TouchableOpacity>

                {showUrlImport && (
                  <View style={styles.urlImportContainer}>
                    <Text style={styles.warningText}>
                      ⚠️ Note: URL import only works about 40% of the time. For best results, use the share method above.
                    </Text>

                    <View style={styles.formContainer}>
                      <Text style={styles.label}>Recipe URL</Text>
                      <TextInput
                        style={styles.input}
                        value={url}
                        onChangeText={setUrl}
                        placeholder="https://example.com/recipe"
                        placeholderTextColor="#9ca3af"
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                        editable={!loading}
                        clearButtonMode="while-editing"
                      />

                      <TouchableOpacity
                        style={[styles.button, (!url.trim() || loading || !canImport) && styles.buttonDisabled]}
                        onPress={handleImport}
                        disabled={!url.trim() || loading || !canImport}
                      >
                        {loading ? (
                          <View style={styles.loadingContainer}>
                            <ActivityIndicator color="white" size="small" />
                            <Text style={styles.buttonText}>Importing...</Text>
                          </View>
                        ) : (
                          <Text style={styles.buttonText}>Import Recipe</Text>
                        )}
                      </TouchableOpacity>

                      {/* Enhanced Error Display */}
                      {importError && (
                        <View style={[
                          styles.errorContainer,
                          importError.severity === 'critical' && styles.criticalError,
                          importError.severity === 'high' && styles.highError
                        ]}>
                          {/* Severity Indicator */}
                          <View style={styles.errorHeader}>
                            <Text style={styles.severityBadge}>
                              {getSeverityEmoji(importError.severity)} {importError.severity?.toUpperCase()}
                            </Text>
                          </View>

                          <Text style={styles.errorTitle}>{importError.message}</Text>

                          {importError.suggestion && (
                            <Text style={styles.errorSuggestion}>{importError.suggestion}</Text>
                          )}

                          {/* Recovery Actions */}
                          <View style={styles.errorActions}>
                            {importError.recoveryActions?.map((action, index) => (
                              <TouchableOpacity
                                key={index}
                                style={[styles.actionButton, getActionButtonStyle(action.action)]}
                                onPress={() => handleRecoveryAction(action)}
                              >
                                <Text style={[styles.actionButtonText, getActionTextStyle(action.action)]}>
                                  {getActionEmoji(action.action)} {action.label}
                                </Text>
                                {action.description && (
                                  <Text style={styles.actionDescription}>{action.description}</Text>
                                )}
                              </TouchableOpacity>
                            ))}

                            {/* Legacy support for existing error format */}
                            {!importError.recoveryActions && (
                              <>
                                {importError.canRetry && (
                                  <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
                                    <Text style={styles.retryButtonText}>🔄 Try Again</Text>
                                  </TouchableOpacity>
                                )}

                                {importError.allowManualEdit && (
                                  <TouchableOpacity style={styles.manualButton} onPress={handleManualEdit}>
                                    <Text style={styles.manualButtonText}>✏️ Enter Manually</Text>
                                  </TouchableOpacity>
                                )}
                              </>
                            )}
                          </View>
                        </View>
                      )}
                    </View>
                  </View>
                )}
              </View>

              {/* Updated Info Section */}
              <View style={styles.infoContainer}>
                <Text style={styles.infoTitle}>Success Rates:</Text>
                <Text style={styles.infoText}>
                  <Text style={styles.highlightText}>Share Method:</Text> Works with virtually any recipe website (95%+ success rate){'\n'}
                  <Text style={styles.highlightText}>URL Method:</Text> Works with some websites (~40% success rate){'\n'}
                  {'\n'}
                  Both methods support the same sites, but sharing is much more reliable because it bypasses website complexity.
                </Text>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 25,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 24,
  },

  // Recommended Method Styles
  recommendedContainer: {
    backgroundColor: 'white',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#10b981',
    marginBottom: 20,
    overflow: 'hidden',
  },
  recommendedHeader: {
    backgroundColor: '#ecfdf5',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#d1fae5',
  },
  recommendedBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065f46',
    backgroundColor: '#10b981',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    marginBottom: 8,
    color: 'white',
  },
  recommendedTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  successRate: {
    fontSize: 14,
    fontWeight: '600',
    color: '#10b981',
  },
  instructionsList: {
    padding: 16,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stepNumber: {
    backgroundColor: '#3b82f6',
    color: 'white',
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 14,
    fontWeight: '600',
    marginRight: 12,
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: '#374151',
  },
  benefitsList: {
    backgroundColor: '#f0f9ff',
    padding: 16,
    marginTop: 8,
  },
  benefitsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 8,
  },
  benefitItem: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
    marginBottom: 2,
  },

  // Alternative Method Styles
  alternativeContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 20,
    overflow: 'hidden',
  },
  alternativeHeader: {
    padding: 16,
    backgroundColor: '#f9fafb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  alternativeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 2,
  },
  alternativeSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  urlImportContainer: {
    padding: 16,
  },
  warningText: {
    backgroundColor: '#fef3c7',
    borderLeftWidth: 4,
    borderLeftColor: '#f59e0b',
    padding: 12,
    borderRadius: 6,
    marginBottom: 16,
    fontSize: 14,
    color: '#92400e',
    lineHeight: 20,
  },

  // Form Styles (updated)
  formContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  // Info Section (updated)
  infoContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    marginBottom: 20,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 22,
  },
  highlightText: {
    fontWeight: '600',
    color: '#1f2937',
  },
  errorContainer: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginTop: 20,
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#dc2626',
    marginBottom: 8,
  },
  errorSuggestion: {
    fontSize: 14,
    color: '#7f1d1d',
    lineHeight: 20,
    marginBottom: 16,
  },
  errorActions: {
    flexDirection: 'row',
    gap: 12,
  },
  retryButton: {
    flex: 1,
    backgroundColor: '#dc2626',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  retryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  manualButton: {
    flex: 1,
    backgroundColor: 'white',
    borderColor: '#dc2626',
    borderWidth: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  manualButtonText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '600',
  },
  // Enhanced error display styles
  errorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  severityBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#7f1d1d',
    backgroundColor: '#fee2e2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  criticalError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fca5a5',
    shadowColor: '#dc2626',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  highError: {
    backgroundColor: '#fffbeb',
    borderColor: '#fed7aa',
    shadowColor: '#f59e0b',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 2,
  },
  actionButtonText: {
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 12,
  },
});
