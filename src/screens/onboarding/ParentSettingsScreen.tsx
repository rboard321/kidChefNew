import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  TextInput,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { parentProfileService } from '../../services/parentProfile';
import { kidProfileService } from '../../services/kidProfile';
import type { UserSettings } from '../../types';

interface ParentSettingsScreenProps {
  onComplete: () => void;
}

interface RouteParams {
  kidData?: {
    name: string;
    age: number;
    readingLevel: 'beginner' | 'intermediate' | 'advanced';
  };
}

export default function ParentSettingsScreen({ onComplete }: ParentSettingsScreenProps) {
  const route = useRoute();
  const { kidData } = (route.params as RouteParams) || {};
  const { user, refreshProfile, legalAcceptance, consentStatus } = useAuth();

  const [showForm, setShowForm] = useState(false);
  const [parentName, setParentName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const parentNameRef = useRef<TextInput>(null);

  // Debug logging for input issues
  const handleParentNameChange = (text: string) => {
    console.log('🔤 ParentName input change:', text);
    setParentName(text);
  };

  const handleFamilyNameChange = (text: string) => {
    console.log('🏠 FamilyName input change:', text);
    setFamilyName(text);
  };
  const [safetyNotes, setSafetyNotes] = useState(true);
  const [readAloud, setReadAloud] = useState(false);
  const [autoSimplify, setAutoSimplify] = useState(true);
  const [showDifficulty, setShowDifficulty] = useState(true);
  const [enableVoiceInstructions, setEnableVoiceInstructions] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log('👨‍👩‍👧‍👦 ParentSettingsScreen mounted');
    console.log('Input states:', { parentName, familyName });
    return () => {
      console.log('👨‍👩‍👧‍👦 ParentSettingsScreen unmounting');
    };
  }, []);

  useEffect(() => {
    if (!showForm) return;
    const timer = setTimeout(() => {
      parentNameRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [showForm]);

  const saveParentProfile = async (): Promise<boolean> => {
    console.log('🔍 Form submission - Current state:', { parentName, familyName });
    console.log('🔍 Trimmed values:', {
      parentNameTrimmed: parentName.trim(),
      familyNameTrimmed: familyName.trim(),
      parentNameLength: parentName.length,
      familyNameLength: familyName.length
    });

    if (!parentName.trim() || !familyName.trim()) {
      console.log('❌ Validation failed - missing required fields');
      Alert.alert('Missing Information', 'Please fill in all required fields.');
      return false;
    }

    if (!user) {
      Alert.alert('Error', 'User not authenticated.');
      return false;
    }

    setLoading(true);

    try {
      const userSettings: UserSettings = {
        safetyNotes,
        readAloud,
        autoSimplify,
        fontSize: 'medium',
        temperatureUnit: 'fahrenheit',
        language: 'en',
        showDifficulty,
        enableVoiceInstructions,
        theme: 'light',
      };

      const profileData = {
        familyName: familyName.trim(),
        parentName: parentName.trim(),
        email: user.email || '',
        settings: userSettings,
        termsAcceptedAt: legalAcceptance?.termsAcceptedAt || new Date(),
        privacyPolicyAcceptedAt: legalAcceptance?.privacyPolicyAcceptedAt || new Date(),
        coppaDisclosureAccepted: legalAcceptance?.coppaDisclosureAccepted ?? false,
        consentStatus,
      };

      console.log('📝 About to create parent profile with data:', profileData);
      console.log('📝 User UID:', user.uid);

      await parentProfileService.createParentProfile(user.uid, profileData);
      await refreshProfile();
      return true;
    } catch (error) {
      console.error('Error saving profile:', error);
      Alert.alert('Error', 'Failed to save your information. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleSetupKids = async () => {
    const saved = await saveParentProfile();
    if (!saved) return;

    // Complete onboarding first, then navigate to kid management
    onComplete();
    // Navigate to kid management screen after a short delay to ensure navigation is ready
    setTimeout(() => {
      navigation.navigate('Main' as never, { screen: 'Kids' } as never);
    }, 100);
  };

  const handleComplete = async () => {
    const saved = await saveParentProfile();
    if (!saved) return;
    onComplete();
  };

  if (!showForm) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.welcomeContent}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoEmoji}>👨‍🍳👩‍🍳</Text>
            <Text style={styles.appName}>KidChef</Text>
            <Text style={styles.tagline}>Cooking Made Simple & Safe</Text>
          </View>

          <View style={styles.illustrationContainer}>
            <Text style={styles.illustration}>🍳✨</Text>
          </View>

          <View style={styles.textContainer}>
            <Text style={styles.welcomeTitle}>Welcome to KidChef!</Text>
            <Text style={styles.welcomeSubtitle}>
              Turn any recipe into kid-friendly cooking adventures.
              Parents import recipes, kids learn to cook safely!
            </Text>
          </View>

          <TouchableOpacity
            style={styles.button}
            onPress={() => setShowForm(true)}
          >
            <Text style={styles.buttonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView
          style={styles.keyboardContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="none"
        >
        <Text style={styles.title}>Complete Your Profile</Text>
        <Text style={styles.subtitle}>
          Let's set up your profile and customize how recipes are presented to your family. This information helps us provide age-appropriate content for your children.
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Your Name</Text>
          <TextInput
            ref={parentNameRef}
            style={styles.input}
            value={parentName}
            onChangeText={handleParentNameChange}
            placeholder="Enter your name"
            placeholderTextColor="#9ca3af"
            returnKeyType="next"
            onFocus={() => console.log('👤 ParentName input focused')}
            onBlur={() => console.log('👤 ParentName input blurred')}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            clearButtonMode="while-editing"
            selectTextOnFocus={false}
            editable={true}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Family Name</Text>
          <TextInput
            style={styles.input}
            value={familyName}
            onChangeText={handleFamilyNameChange}
            placeholder="e.g., The Smith Family"
            placeholderTextColor="#9ca3af"
            returnKeyType="done"
            onFocus={() => console.log('🏠 FamilyName input focused')}
            onBlur={() => console.log('🏠 FamilyName input blurred')}
            autoCapitalize="words"
            autoCorrect={false}
            autoComplete="off"
            textContentType="none"
            importantForAutofill="no"
            clearButtonMode="while-editing"
            selectTextOnFocus={false}
            editable={true}
          />
        </View>

        <View style={styles.settingsContainer}>
          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Show Safety Notes</Text>
              <Text style={styles.settingDescription}>
                Highlight when adult help is needed
              </Text>
            </View>
            <Switch
              value={safetyNotes}
              onValueChange={setSafetyNotes}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={safetyNotes ? '#2563eb' : '#f3f4f6'}
            />
          </View>

          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Enable Read-Aloud Mode</Text>
              <Text style={styles.settingDescription}>
                Kids can hear instructions spoken out loud
              </Text>
            </View>
            <Switch
              value={readAloud}
              onValueChange={setReadAloud}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={readAloud ? '#2563eb' : '#f3f4f6'}
            />
          </View>

          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Simplify Recipes Automatically</Text>
              <Text style={styles.settingDescription}>
                Auto-convert all recipes to kid-friendly versions
              </Text>
            </View>
            <Switch
              value={autoSimplify}
              onValueChange={setAutoSimplify}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={autoSimplify ? '#2563eb' : '#f3f4f6'}
            />
          </View>

          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Show Difficulty Levels</Text>
              <Text style={styles.settingDescription}>
                Display recipe difficulty ratings
              </Text>
            </View>
            <Switch
              value={showDifficulty}
              onValueChange={setShowDifficulty}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={showDifficulty ? '#2563eb' : '#f3f4f6'}
            />
          </View>

          <View style={styles.setting}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingTitle}>Voice Instructions</Text>
              <Text style={styles.settingDescription}>
                Enable voice guidance for cooking steps
              </Text>
            </View>
            <Switch
              value={enableVoiceInstructions}
              onValueChange={setEnableVoiceInstructions}
              trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
              thumbColor={enableVoiceInstructions ? '#2563eb' : '#f3f4f6'}
            />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, (!parentName.trim() || !familyName.trim() || loading) && styles.buttonDisabled]}
          onPress={handleComplete}
          disabled={!parentName.trim() || !familyName.trim() || loading}
        >
          <Text style={styles.buttonText}>
            {loading ? 'Setting up...' : 'Start Cooking! 🎉'}
          </Text>
        </TouchableOpacity>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  keyboardContainer: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 10,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
  },
  inputContainer: {
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
    color: '#1f2937',
    minHeight: 50,
  },
  welcomeContent: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoEmoji: {
    fontSize: 60,
    marginBottom: 10,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  tagline: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  illustrationContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  illustration: {
    fontSize: 80,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 15,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  settingsContainer: {
    marginBottom: 30,
    marginTop: 20,
  },
  setting: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  settingInfo: {
    flex: 1,
    marginRight: 15,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});
