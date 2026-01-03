import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import { parentalConsentService } from '../../services/parentalConsent';
import { config } from '../../utils/environment';

interface ParentalConsentScreenProps {
  onConsentVerified: () => void;
}

export default function ParentalConsentScreen({ onConsentVerified }: ParentalConsentScreenProps) {
  const { user, consentStatus, checkConsentStatus } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (consentStatus === 'verified') {
      onConsentVerified();
    }
  }, [consentStatus, onConsentVerified]);

  const handleStartConsent = async () => {
    if (!user) return;
    if (consentStatus === 'verified') {
      return;
    }
    setSubmitting(true);

    try {
      await parentalConsentService.initiateConsent({
        parentName: user.displayName || user.email?.split('@')[0] || 'Parent',
        parentEmail: user.email || 'unknown',
        method: 'digital_signature',
        childrenInfo: []
      });
      await checkConsentStatus();
      Alert.alert(
        'Consent Request Started',
        'We\'ve created a consent request. Please contact support to complete verification.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to start consent verification.';
      if (message.includes('Valid parental consent already exists')) {
        await checkConsentStatus();
        Alert.alert('Consent Verified', 'Your parental consent is already verified.');
      } else {
        console.error('Error initiating consent:', error);
        Alert.alert('Error', 'Unable to start consent verification. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const statusText = consentStatus === 'verified'
    ? 'Verified'
    : consentStatus === 'rejected'
      ? 'Rejected'
      : consentStatus === 'expired'
        ? 'Expired'
        : 'Pending';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Parental Consent Required</Text>
        <Text style={styles.subtitle}>
          Before adding kids or sharing recipes, we need verified parental consent.
        </Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>Current Status</Text>
          <Text style={styles.statusValue}>{statusText}</Text>
        </View>

        <Text style={styles.helpText}>
          To complete verification, contact {config.supportEmail}.
        </Text>

        <TouchableOpacity
          style={[
            styles.button,
            (submitting || consentStatus === 'verified') && styles.buttonDisabled
          ]}
          onPress={handleStartConsent}
          disabled={submitting || consentStatus === 'verified'}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>
              {consentStatus === 'verified' ? 'Consent Verified' : 'Start Consent Verification'}
            </Text>
          )}
        </TouchableOpacity>
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
    padding: 24,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 12,
  },
  subtitle: {
    fontSize: 16,
    color: '#475569',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  statusCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 6,
  },
  statusValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
  },
  helpText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#2563eb',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
