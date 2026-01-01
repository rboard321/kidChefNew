import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/AuthContext';
import { errorReportingService } from '../services/errorReporting';

interface BugReportModalProps {
  visible: boolean;
  onClose: () => void;
  prefilledCategory?: string;
  prefilledContext?: {
    screen?: string;
    action?: string;
    customData?: Record<string, any>;
  };
}

type BugCategory = 'crash' | 'ui_issue' | 'feature_problem' | 'suggestion' | 'other';

interface BugCategoryInfo {
  id: BugCategory;
  title: string;
  description: string;
  icon: string;
  severity: 'low' | 'medium' | 'high';
}

const BUG_CATEGORIES: BugCategoryInfo[] = [
  {
    id: 'crash',
    title: 'App Crash',
    description: 'The app stopped working or closed unexpectedly',
    icon: '💥',
    severity: 'high',
  },
  {
    id: 'ui_issue',
    title: 'Display Problem',
    description: 'Something looks wrong or buttons don\'t work',
    icon: '🎨',
    severity: 'medium',
  },
  {
    id: 'feature_problem',
    title: 'Feature Not Working',
    description: 'A specific feature isn\'t working as expected',
    icon: '⚙️',
    severity: 'medium',
  },
  {
    id: 'suggestion',
    title: 'Suggestion',
    description: 'Ideas to make KidChef better',
    icon: '💡',
    severity: 'low',
  },
  {
    id: 'other',
    title: 'Other Issue',
    description: 'Something else that needs attention',
    icon: '❓',
    severity: 'medium',
  },
];

export function BugReportModal({
  visible,
  onClose,
  prefilledCategory,
  prefilledContext
}: BugReportModalProps) {
  const [selectedCategory, setSelectedCategory] = useState<BugCategory | null>(
    prefilledCategory as BugCategory || null
  );
  const [description, setDescription] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { user, parentProfile } = useAuth();

  const handleSubmit = async () => {
    if (!selectedCategory) {
      Alert.alert('Missing Information', 'Please select a category for your bug report.');
      return;
    }

    if (!description.trim()) {
      Alert.alert('Missing Information', 'Please provide a description of the issue.');
      return;
    }

    setSubmitting(true);

    try {
      const categoryInfo = BUG_CATEGORIES.find(c => c.id === selectedCategory)!;

      // Create a mock error for the bug report system
      const bugError = new Error(`Beta Bug Report: ${categoryInfo.title} - ${description.substring(0, 100)}`);

      await errorReportingService.reportError(bugError, {
        severity: categoryInfo.severity,
        userId: user?.uid,
        screen: prefilledContext?.screen || 'bug_report_modal',
        action: 'beta_bug_report',
        tags: ['beta_feedback', 'bug_report', selectedCategory],
        customData: {
          category: selectedCategory,
          categoryTitle: categoryInfo.title,
          description: description.trim(),
          stepsToReproduce: stepsToReproduce.trim() || undefined,
          userEmail: user?.email,
          familyName: parentProfile?.familyName,
          reportSource: 'bug_report_modal',
          ...prefilledContext?.customData,
        },
      });

      Alert.alert(
        'Report Sent!',
        'Thank you for helping us improve KidChef. Your bug report has been sent to our team.',
        [
          {
            text: 'OK',
            onPress: () => {
              setSelectedCategory(null);
              setDescription('');
              setStepsToReproduce('');
              onClose();
            },
          },
        ]
      );
    } catch (error) {
      console.error('Error submitting bug report:', error);
      Alert.alert(
        'Error',
        'Failed to send bug report. Please try again or contact support directly.',
        [{ text: 'OK' }]
      );
    } finally {
      setSubmitting(false);
    }
  };

  const CategoryCard = ({ category }: { category: BugCategoryInfo }) => (
    <TouchableOpacity
      style={[
        styles.categoryCard,
        selectedCategory === category.id && styles.categoryCardSelected,
      ]}
      onPress={() => setSelectedCategory(category.id)}
    >
      <Text style={styles.categoryIcon}>{category.icon}</Text>
      <View style={styles.categoryContent}>
        <Text style={styles.categoryTitle}>{category.title}</Text>
        <Text style={styles.categoryDescription}>{category.description}</Text>
      </View>
      {selectedCategory === category.id && (
        <View style={styles.selectedIndicator}>
          <Text style={styles.selectedIcon}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
    >
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.header}>
            <View style={styles.headerContent}>
              <Text style={styles.title}>Report a Bug</Text>
              <Text style={styles.subtitle}>
                Help us make KidChef better by reporting issues you find
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
            >
              <Text style={styles.closeIcon}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>What type of issue are you reporting?</Text>

              {BUG_CATEGORIES.map(category => (
                <CategoryCard key={category.id} category={category} />
              ))}
            </View>

            {selectedCategory && (
              <>
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    Describe the issue <Text style={styles.required}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.textInput}
                    value={description}
                    onChangeText={setDescription}
                    placeholder="Tell us what happened and what you expected to happen..."
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={4}
                    maxLength={1000}
                  />
                  <Text style={styles.charCount}>{description.length}/1000</Text>
                </View>

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Steps to reproduce (optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={stepsToReproduce}
                    onChangeText={setStepsToReproduce}
                    placeholder="1. Go to...&#10;2. Tap on...&#10;3. See error"
                    placeholderTextColor="#9ca3af"
                    multiline
                    numberOfLines={4}
                    maxLength={500}
                  />
                  <Text style={styles.charCount}>{stepsToReproduce.length}/500</Text>
                </View>

                <View style={styles.infoBox}>
                  <Text style={styles.infoIcon}>ℹ️</Text>
                  <Text style={styles.infoText}>
                    Your device info, app version, and user context will be automatically included to help us debug the issue.
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[
                styles.submitButton,
                (!selectedCategory || !description.trim() || submitting) && styles.submitButtonDisabled,
              ]}
              onPress={handleSubmit}
              disabled={!selectedCategory || !description.trim() || submitting}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'Sending Report...' : 'Send Bug Report'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    padding: 20,
    paddingBottom: 10,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 22,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 15,
  },
  closeIcon: {
    fontSize: 18,
    color: '#6b7280',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  section: {
    marginBottom: 25,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  required: {
    color: '#ef4444',
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    marginBottom: 12,
  },
  categoryCardSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  categoryIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  categoryContent: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  categoryDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  selectedIndicator: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedIcon: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  textInput: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1f2937',
    textAlignVertical: 'top',
    minHeight: 100,
  },
  charCount: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  infoIcon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  footer: {
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  submitButton: {
    backgroundColor: '#2563eb',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#d1d5db',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});