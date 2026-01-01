import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
<<<<<<< HEAD
=======
import { authService } from '../../services/auth';
import { authErrorHandler } from '../../services/authErrorHandler';
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)

interface SignInScreenProps {
  onSwitchToSignUp: () => void;
}

export default function SignInScreen({ onSwitchToSignUp }: SignInScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setLoading(true);
    try {
      await signIn(email, password);
    } catch (error) {
<<<<<<< HEAD
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to sign in');
=======
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign in';

      // Check if error has enhanced error info from AuthContext
      const errorInfo = (error as any)?.errorInfo;

      // If it's an email verification error, offer to resend verification email
      if (errorMessage.includes('verify your email')) {
        Alert.alert(
          'Email Verification Required',
          errorMessage,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Resend Email',
              onPress: () => handleResendVerification()
            }
          ]
        );
      } else if (errorInfo?.actionLabel && errorInfo?.action) {
        // Show enhanced error with action button
        Alert.alert(
          'Sign In Error',
          errorMessage,
          [
            { text: 'OK', style: 'cancel' },
            {
              text: errorInfo.actionLabel,
              onPress: errorInfo.action
            }
          ]
        );
      } else if (errorInfo?.actionLabel === 'Sign Up Instead') {
        // Handle specific case for user not found
        Alert.alert(
          'Account Not Found',
          errorMessage,
          [
            { text: 'Try Again', style: 'cancel' },
            {
              text: 'Sign Up Instead',
              onPress: onSwitchToSignUp
            }
          ]
        );
      } else {
        // Show basic error alert
        Alert.alert('Sign In Error', errorMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address first');
      return;
    }

    try {
      setLoading(true);
      console.log('🔄 Starting resend email verification for:', email);

      // Sign in temporarily to get user object for verification email
      const user = await authService.signIn(email, password);
      console.log('✅ Successfully signed in for email verification resend');

      await authService.sendEmailVerification(user);
      console.log('✅ Email verification resend completed');

      await authService.signOut(); // Sign out immediately
      console.log('✅ User signed out after email verification resend');

      Alert.alert(
        'Verification Email Sent',
        'A new verification email has been sent to your address. Please check your email and click the verification link.'
      );
    } catch (error: any) {
      console.error('❌ Failed to resend verification email:', {
        error: error.message || error,
        code: error.code || 'unknown',
        email: email
      });
      Alert.alert('Error', `Failed to resend verification email: ${error.message || 'Please check your credentials.'}`);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      Alert.alert('Google Sign-In Error', error instanceof Error ? error.message : 'Failed to sign in with Google');
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Welcome Back!</Text>
          <Text style={styles.subtitle}>Sign in to access your recipes</Text>
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
            placeholder="Enter your password"
            placeholderTextColor="#9ca3af"
            secureTextEntry
            editable={!loading}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSignIn}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color="white" size="small" />
                <Text style={styles.buttonText}>Signing in...</Text>
              </View>
            ) : (
              <Text style={styles.buttonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          <View style={styles.switchContainer}>
            <Text style={styles.switchText}>Don't have an account? </Text>
            <TouchableOpacity onPress={onSwitchToSignUp} disabled={loading}>
              <Text style={styles.switchLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
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
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
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