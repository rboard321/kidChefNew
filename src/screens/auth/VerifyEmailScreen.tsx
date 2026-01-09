import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { authService } from '../../services/auth';

export default function VerifyEmailScreen() {
  const { user, refreshEmailVerification, signOut } = useAuth();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    try {
      const verified = await refreshEmailVerification();
      if (!verified) {
        Alert.alert('Not Verified Yet', 'Please click the verification link in your email first.');
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to check verification status. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    if (!user) return;
    setSending(true);
    try {
      await authService.sendEmailVerification(user);
      Alert.alert('Verification Sent', 'Check your email for the verification link.');
    } catch (error) {
      Alert.alert('Error', 'Failed to resend verification email. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.card}>
        <Text style={styles.title}>Verify your email</Text>
        <Text style={styles.subtitle}>
          We sent a verification link to{'\n'}
          <Text style={styles.email}>{user?.email ?? 'your email'}</Text>
        </Text>
        <Text style={styles.helper}>
          Please click the link to finish setting up your account.
        </Text>

        <TouchableOpacity style={styles.primaryButton} onPress={handleRefresh} disabled={checking}>
          <Text style={styles.primaryButtonText}>
            {checking ? 'Checking…' : 'I verified my email'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryButton} onPress={handleResend} disabled={sending}>
          <Text style={styles.secondaryButtonText}>
            {sending ? 'Sending…' : 'Resend email'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutButton} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
  },
  email: {
    fontWeight: '600',
    color: '#111827',
  },
  helper: {
    fontSize: 13,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  primaryButton: {
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#cbd5f5',
  },
  primaryButtonText: {
    color: '#1e293b',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#2563eb',
    fontWeight: '600',
    fontSize: 14,
  },
  signOutButton: {
    marginTop: 20,
    alignItems: 'center',
  },
  signOutText: {
    color: '#6b7280',
    fontSize: 14,
  },
});
