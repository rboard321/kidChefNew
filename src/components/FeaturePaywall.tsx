import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { FeatureKey, SubscriptionPlan } from '../types';
import { requiresUpgrade } from '../services/featureGate';
import { isMonetizationEnabled } from '../services/featureFlags';
import { SUBSCRIPTION_PLANS } from '../config/plans';

interface FeaturePaywallProps {
  feature: FeatureKey;
  featureName: string;
  description: string;
  visible: boolean;
  onClose: () => void;
  onUpgrade: () => void;
}

/**
 * Paywall modal shown when user tries to access a premium feature
 *
 * During beta: Never blocks access, just shows informational message
 * In production: Shows upgrade prompt for premium features
 */
export default function FeaturePaywall({
  feature,
  featureName,
  description,
  visible,
  onClose,
  onUpgrade,
}: FeaturePaywallProps) {
  const { effectivePlan, subscription } = useAuth();
  const upgradeInfo = requiresUpgrade(feature, effectivePlan);

  // Don't show paywall if monetization is disabled
  if (!isMonetizationEnabled()) {
    return null;
  }

  // Don't show for beta testers
  if (subscription?.isBetaTester) {
    return null;
  }

  // Get the minimum required plan details
  const requiredPlan = upgradeInfo.minimumPlan
    ? SUBSCRIPTION_PLANS[upgradeInfo.minimumPlan]
    : null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🔒</Text>
          </View>

          <Text style={styles.title}>
            {requiredPlan ? `Upgrade to ${requiredPlan.name}` : 'Upgrade Required'}
          </Text>
          <Text style={styles.subtitle}>{featureName}</Text>
          <Text style={styles.description}>{description}</Text>

          {requiredPlan && (
            <View style={styles.planPreview}>
              <Text style={styles.planPreviewTitle}>
                What you'll get with {requiredPlan.name}:
              </Text>
              {requiredPlan.features.slice(0, 4).map((feat, index) => (
                <View key={index} style={styles.planFeatureRow}>
                  <Text style={styles.planFeatureCheck}>✓</Text>
                  <Text style={styles.planFeatureText}>{feat}</Text>
                </View>
              ))}
              {requiredPlan.features.length > 4 && (
                <Text style={styles.planFeatureMore}>
                  + {requiredPlan.features.length - 4} more features
                </Text>
              )}
            </View>
          )}

          <TouchableOpacity style={styles.upgradeButton} onPress={onUpgrade}>
            <Text style={styles.upgradeButtonText}>View All Plans</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Maybe Later</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
    color: '#111827',
  },
  subtitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  planPreview: {
    width: '100%',
    backgroundColor: '#f9fafb',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  planPreviewTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  planFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  planFeatureCheck: {
    fontSize: 16,
    color: '#10b981',
    marginRight: 8,
    fontWeight: '700',
  },
  planFeatureText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
  },
  planFeatureMore: {
    fontSize: 13,
    color: '#6b7280',
    fontStyle: 'italic',
    marginTop: 4,
  },
  upgradeButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 12,
    width: '100%',
    marginBottom: 12,
  },
  upgradeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  closeButton: {
    paddingVertical: 12,
  },
  closeButtonText: {
    color: '#6b7280',
    fontSize: 15,
  },
});
