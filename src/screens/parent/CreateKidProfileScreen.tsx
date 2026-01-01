import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { PinSetupModal } from '../../components/PinSetupModal';

const COMMON_ALLERGIES = [
  'nuts', 'dairy', 'eggs', 'shellfish', 'fish', 'soy', 'wheat', 'sesame'
];

const SEVERITY_LEVELS = [
  { value: 'mild', label: 'Mild', color: '#fbbf24' },
  { value: 'moderate', label: 'Moderate', color: '#f97316' },
  { value: 'severe', label: 'Severe', color: '#dc2626' }
];

export default function CreateKidProfileScreen() {
  const navigation = useNavigation();
  const { user, kidProfiles, setKidModePin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);

  const [profileData, setProfileData] = useState({
    name: '',
    age: '',
    readingLevel: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    experience: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    allergies: [] as { allergen: string; severity: 'mild' | 'moderate' | 'severe' }[],
  });

  const toggleAllergy = (allergen: string) => {
    const exists = profileData.allergies.find(a => a.allergen === allergen);
    if (exists) {
      setProfileData(prev => ({
        ...prev,
        allergies: prev.allergies.filter(a => a.allergen !== allergen)
      }));
    } else {
      setProfileData(prev => ({
        ...prev,
        allergies: [...prev.allergies, { allergen, severity: 'moderate' }]
      }));
    }
  };

  const updateAllergySeverity = (allergen: string, severity: 'mild' | 'moderate' | 'severe') => {
    setProfileData(prev => ({
      ...prev,
      allergies: prev.allergies.map(a =>
        a.allergen === allergen ? { ...a, severity } : a
      )
    }));
  };

  const handleSave = async () => {
    // Validation
    if (!profileData.name.trim()) {
      Alert.alert('Missing Information', 'Please enter your child\'s name.');
      return;
    }

    const age = parseInt(profileData.age);
    if (!age || age < 3 || age > 18) {
      Alert.alert('Invalid Age', 'Please enter a valid age between 3 and 18.');
      return;
    }

    if (!user?.uid) {
      Alert.alert('Error', 'You must be logged in to create a kid profile.');
      return;
    }

    // Check if this is the first kid profile - if so, show PIN setup
    const isFirstKid = kidProfiles.length === 0;
    if (isFirstKid) {
      setShowPinSetup(true);
      return;
    }

    // If not first kid, proceed with profile creation
    await createKidProfile();
  };

  const handlePinSet = async (pin: string) => {
    try {
      // Set the PIN first
      await setKidModePin(pin);

      // Then create the kid profile
      await createKidProfile();
    } catch (error: any) {
      console.error('Error setting PIN:', error);
      throw error;
    }
  };

  const createKidProfile = async () => {
    setLoading(true);

    try {
      const createKidProfile = httpsCallable(functions, 'createKidProfile');

      const result = await createKidProfile({
        name: profileData.name.trim(),
        age: parseInt(profileData.age),
        readingLevel: profileData.readingLevel,
        allergies: profileData.allergies,
        experience: profileData.experience
      });

      const isFirstKid = kidProfiles.length === 0;

      Alert.alert(
        'Profile Created! 👨‍👩‍👧‍👦',
        isFirstKid
          ? `${profileData.name}'s profile has been created successfully! 🔒 Your PIN has been set to secure parent mode across all kids.`
          : `${profileData.name}'s profile has been created successfully with ${profileData.allergies.length} allergy alerts configured.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );

    } catch (error: any) {
      console.error('Error creating kid profile:', error);

      // Provide specific error messages for common scenarios
      let errorTitle = 'Profile Creation Failed';
      let errorMessage = 'Failed to create kid profile. Please try again.';

      if (error?.code === 'permission-denied') {
        errorTitle = 'Permission Error';
        errorMessage = 'You don\'t have permission to create profiles. Please check your account settings.';
      } else if (error?.code === 'network-request-failed') {
        errorTitle = 'Connection Error';
        errorMessage = 'Please check your internet connection and try again.';
      } else if (error?.message?.includes('email verification')) {
        errorTitle = 'Email Verification Required';
        errorMessage = 'Please verify your email address before creating kid profiles.';
      } else if (error?.message?.includes('rate limit') || error?.message?.includes('too many requests')) {
        errorTitle = 'Too Many Attempts';
        errorMessage = 'You\'ve made too many requests. Please wait a moment and try again.';
      } else if (error?.message?.includes('name already exists')) {
        errorTitle = 'Name Already Used';
        errorMessage = `A kid profile with the name "${profileData.name}" already exists. Please choose a different name.`;
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert(errorTitle, errorMessage, [{ text: 'OK' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <PinSetupModal
        visible={showPinSetup}
        onClose={() => setShowPinSetup(false)}
        onPinSet={handlePinSet}
        title="Secure Your Family Settings"
        description={`Creating your first kid profile! Set a 4-digit PIN to secure parent mode across all your kids' accounts.`}
        isRequired={kidProfiles.length === 0}
      />
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Create Kid Profile</Text>
            <Text style={styles.subtitle}>
              Set up your child's cooking profile with safety preferences
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <Text style={styles.label}>Child's Name *</Text>
            <TextInput
              style={styles.input}
              value={profileData.name}
              onChangeText={(text) => setProfileData(prev => ({ ...prev, name: text }))}
              placeholder="Enter your child's name"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.label}>Age *</Text>
            <TextInput
              style={styles.input}
              value={profileData.age}
              onChangeText={(text) => setProfileData(prev => ({ ...prev, age: text }))}
              placeholder="Age (3-18)"
              placeholderTextColor="#9ca3af"
              keyboardType="numeric"
            />

            <Text style={styles.label}>Reading Level</Text>
            <View style={styles.levelContainer}>
              {['beginner', 'intermediate', 'advanced'].map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.levelButton,
                    profileData.readingLevel === level && styles.levelButtonActive
                  ]}
                  onPress={() => setProfileData(prev => ({ ...prev, readingLevel: level as any }))}
                >
                  <Text style={[
                    styles.levelButtonText,
                    profileData.readingLevel === level && styles.levelButtonTextActive
                  ]}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Cooking Experience</Text>
            <View style={styles.levelContainer}>
              {['beginner', 'intermediate', 'advanced'].map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.levelButton,
                    profileData.experience === level && styles.levelButtonActive
                  ]}
                  onPress={() => setProfileData(prev => ({ ...prev, experience: level as any }))}
                >
                  <Text style={[
                    styles.levelButtonText,
                    profileData.experience === level && styles.levelButtonTextActive
                  ]}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🚨 Allergy Safety</Text>
            <Text style={styles.sectionSubtitle}>
              Select any allergies to automatically flag recipes that contain these ingredients
            </Text>

            {COMMON_ALLERGIES.map((allergen) => {
              const hasAllergy = profileData.allergies.find(a => a.allergen === allergen);

              return (
                <View key={allergen} style={styles.allergyContainer}>
                  <TouchableOpacity
                    style={[
                      styles.allergyButton,
                      hasAllergy && styles.allergyButtonActive
                    ]}
                    onPress={() => toggleAllergy(allergen)}
                  >
                    <Text style={[
                      styles.allergyButtonText,
                      hasAllergy && styles.allergyButtonTextActive
                    ]}>
                      {allergen.charAt(0).toUpperCase() + allergen.slice(1)}
                    </Text>
                    {hasAllergy && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>

                  {hasAllergy && (
                    <View style={styles.severityContainer}>
                      {SEVERITY_LEVELS.map((severity) => (
                        <TouchableOpacity
                          key={severity.value}
                          style={[
                            styles.severityButton,
                            { borderColor: severity.color },
                            hasAllergy.severity === severity.value && { backgroundColor: severity.color }
                          ]}
                          onPress={() => updateAllergySeverity(allergen, severity.value as any)}
                        >
                          <Text style={[
                            styles.severityButtonText,
                            hasAllergy.severity === severity.value && styles.severityButtonTextActive
                          ]}>
                            {severity.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Create Profile</Text>
              )}
            </TouchableOpacity>
          </View>
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
  scrollView: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 30,
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
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 15,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 15,
    lineHeight: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  levelContainer: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  levelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'white',
    alignItems: 'center',
  },
  levelButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  levelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  levelButtonTextActive: {
    color: 'white',
  },
  allergyContainer: {
    marginBottom: 12,
  },
  allergyButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  allergyButtonActive: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  allergyButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#6b7280',
  },
  allergyButtonTextActive: {
    color: '#dc2626',
  },
  checkmark: {
    fontSize: 18,
    color: '#dc2626',
    fontWeight: 'bold',
  },
  severityContainer: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
    paddingLeft: 16,
  },
  severityButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  severityButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
  },
  severityButtonTextActive: {
    color: 'white',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 20,
    marginBottom: 40,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'white',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});