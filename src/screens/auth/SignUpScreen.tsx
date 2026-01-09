import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '../../contexts/AuthContext';
import type { RootStackParamList } from '../../types';

interface SignUpScreenProps {
  onSwitchToSignIn: () => void;
}

export default function SignUpScreen({ onSwitchToSignIn }: SignUpScreenProps) {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptCoppa, setAcceptCoppa] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp, setLegalAcceptance } = useAuth();

  const validatePassword = (value: string): string | null => {
    if (value.length < 8) {
      return 'Password must be at least 8 characters.';
    }
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) {
      return 'Password must include at least one letter and one number.';
    }
    return null;
  };

  const handleSignUp = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      Alert.alert('Error', passwordError);
      return;
    }

    if (!acceptTerms || !acceptPrivacy || !acceptCoppa) {
      Alert.alert(
        'Consent Required',
        'Please accept the Terms of Service, Privacy Policy, and COPPA disclosure to continue.'
      );
      return;
    }

    setLoading(true);
    try {
      const acceptanceTimestamp = new Date();
      setLegalAcceptance({
        termsAcceptedAt: acceptanceTimestamp,
        privacyPolicyAcceptedAt: acceptanceTimestamp,
        coppaDisclosureAccepted: true,
      });
      await signUp(email, password, {});

      // Show email verification success message
      Alert.alert(
        'Account Created Successfully!',
        'We\'ve sent a verification email to your address. Please check your email and click the verification link before signing in.',
        [{ text: 'OK', onPress: onSwitchToSignIn }]
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create account';
      const errorInfo = (error as any)?.errorInfo;

      if (errorInfo?.actionLabel === 'Sign In Instead') {
        Alert.alert(
          'Account Already Exists',
          errorMessage,
          [
            { text: 'Try Again', style: 'cancel' },
            {
              text: 'Sign In Instead',
              onPress: onSwitchToSignIn
            }
          ]
        );
      } else {
        Alert.alert('Sign Up Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Create Account</Text>
          <Text style={styles.subtitle}>Join KidChef and start cooking together!</Text>
        </View>

        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="your@email.com"
            placeholderTextColor="#9ca3af"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            editable={!loading}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            editable={!loading}
          />

          <Text style={styles.label}>Confirm Password</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter your password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            editable={!loading}
          />

          <View style={styles.legalSection}>
            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAcceptTerms(!acceptTerms)}
              disabled={loading}
            >
              <View style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}>
                {acceptTerms && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                I agree to the{' '}
                <Text
                  style={styles.linkText}
                  onPress={() => navigation.navigate('TermsOfService')}
                >
                  Terms of Service
                </Text>
                .
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAcceptPrivacy(!acceptPrivacy)}
              disabled={loading}
            >
              <View style={[styles.checkbox, acceptPrivacy && styles.checkboxChecked]}>
                {acceptPrivacy && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                I have read the{' '}
                <Text
                  style={styles.linkText}
                  onPress={() => navigation.navigate('PrivacyPolicy')}
                >
                  Privacy Policy
                </Text>
                .
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.checkboxRow}
              onPress={() => setAcceptCoppa(!acceptCoppa)}
              disabled={loading}
            >
              <View style={[styles.checkbox, acceptCoppa && styles.checkboxChecked]}>
                {acceptCoppa && <Text style={styles.checkboxMark}>✓</Text>}
              </View>
              <Text style={styles.checkboxLabel}>
                I am the parent or legal guardian and acknowledge the COPPA disclosure.
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignUp}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="white" size="small" />
                <Text style={styles.buttonText}>Creating account...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Create Account</Text>
            )}
          </TouchableOpacity>

          <View style={styles.switchContainer}>
            <Text style={styles.switchText}>Already have an account? </Text>
            <TouchableOpacity onPress={onSwitchToSignIn} disabled={loading}>
              <Text style={styles.switchLink}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  form: {
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  legalSection: {
    marginTop: 20,
    gap: 12,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#9ca3af',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'white',
  },
  checkboxChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkboxMark: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  checkboxLabel: {
    flex: 1,
    color: '#374151',
    fontSize: 14,
    lineHeight: 20,
  },
  linkText: {
    color: '#2563eb',
    fontWeight: '600',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
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
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  switchText: {
    color: '#6b7280',
    fontSize: 16,
  },
  switchLink: {
    color: '#2563eb',
    fontSize: 16,
    fontWeight: '600',
  },
});
