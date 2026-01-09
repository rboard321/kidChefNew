import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  SafeAreaView,
} from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { SUBSCRIPTION_PLANS, formatPrice, calculateYearlySavings } from '../../config/plans';
import { isMonetizationEnabled, shouldShowPricingPage } from '../../services/featureFlags';
import { SubscriptionPlan } from '../../types';

export default function PricingScreen({ navigation }: any) {
  const { effectivePlan, subscription } = useAuth();
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('yearly');

  // Don't show if globally disabled
  if (!shouldShowPricingPage()) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.disabledContainer}>
          <Text style={styles.disabledText}>Pricing is not available at this time.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    // BETA MODE: Show informational message
    if (!isMonetizationEnabled()) {
      Alert.alert(
        'Free During Beta 🎉',
        'All features are completely free during beta testing. Pricing will be activated later.',
        [{ text: 'Got it!' }]
      );
      return;
    }

    // PRODUCTION MODE: Start purchase flow
    try {
      // TODO: Implement Stripe/Apple IAP checkout
      Alert.alert('Coming Soon', 'Payment processing will be enabled soon.');
    } catch (error) {
      Alert.alert('Error', 'Failed to start checkout. Please try again.');
    }
  };

  const plans = Object.values(SUBSCRIPTION_PLANS).filter(plan => plan.id !== 'free');

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.contentContainer}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Choose Your Plan</Text>
          <Text style={styles.headerSubtitle}>
            Unlock unlimited recipes and premium features
          </Text>
        </View>

        {/* Beta Banner */}
        {!isMonetizationEnabled() && subscription?.isBetaTester && (
          <View style={styles.betaBanner}>
            <Text style={styles.betaBannerEmoji}>🎉</Text>
            <Text style={styles.betaBannerTitle}>You're a Beta Tester!</Text>
            <Text style={styles.betaBannerText}>
              All features are completely free during the beta period.
            </Text>
          </View>
        )}

        {/* Billing Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              billingInterval === 'monthly' && styles.toggleActive
            ]}
            onPress={() => setBillingInterval('monthly')}
          >
            <Text style={[
              styles.toggleText,
              billingInterval === 'monthly' && styles.toggleTextActive
            ]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              billingInterval === 'yearly' && styles.toggleActive
            ]}
            onPress={() => setBillingInterval('yearly')}
          >
            <Text style={[
              styles.toggleText,
              billingInterval === 'yearly' && styles.toggleTextActive
            ]}>
              Yearly
            </Text>
            <Text style={styles.savingsTag}>Save 44%</Text>
          </TouchableOpacity>
        </View>

        {/* Plan Cards */}
        {plans.map(plan => {
          const isCurrentPlan = effectivePlan === plan.id;
          const showYearlyOnly = plan.id === 'family';

          // Determine price to display
          let priceDisplay = 'Free';
          if (billingInterval === 'monthly' && plan.priceMonthly && !showYearlyOnly) {
            priceDisplay = formatPrice(plan.priceMonthly, 'monthly');
          } else if (plan.priceYearly) {
            priceDisplay = formatPrice(plan.priceYearly, 'yearly');
          }

          return (
            <View
              key={plan.id}
              style={[
                styles.planCard,
                isCurrentPlan && styles.planCardActive,
                plan.popular && styles.planCardPopular
              ]}
            >
              {plan.badge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{plan.badge}</Text>
                </View>
              )}

              <Text style={styles.planName}>{plan.name}</Text>
              <Text style={styles.planTagline}>{plan.tagline}</Text>

              <View style={styles.priceContainer}>
                <Text style={styles.price}>{priceDisplay}</Text>
                {showYearlyOnly && (
                  <Text style={styles.yearlyOnlyNote}>Yearly billing only</Text>
                )}
              </View>

              <View style={styles.featuresContainer}>
                {plan.features.map((feature, index) => (
                  <View key={index} style={styles.featureRow}>
                    <Text style={styles.checkmark}>✓</Text>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity
                style={[
                  styles.selectButton,
                  isCurrentPlan && styles.selectButtonCurrent,
                  plan.popular && styles.selectButtonPopular
                ]}
                onPress={() => handleSelectPlan(plan.id)}
              >
                <Text style={[
                  styles.selectButtonText,
                  isCurrentPlan && styles.selectButtonTextCurrent
                ]}>
                  {isCurrentPlan ? 'Current Plan' : 'Select Plan'}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* Current Plan Display */}
        {subscription && (
          <View style={styles.currentPlanInfo}>
            <Text style={styles.currentPlanLabel}>Current Plan:</Text>
            <Text style={styles.currentPlanName}>
              {SUBSCRIPTION_PLANS[effectivePlan].name}
            </Text>
            {subscription.isBetaTester && (
              <Text style={styles.betaTesterBadge}>🎉 Beta Tester</Text>
            )}
          </View>
        )}

        {/* Footer Info */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            All plans include access to kid-friendly recipes, AI conversion, and safety features.
          </Text>
          {!isMonetizationEnabled() && (
            <Text style={styles.footerBeta}>
              Pricing shown is informational only. All features are free during beta.
            </Text>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  disabledContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  disabledText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  header: {
    marginBottom: 24,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  betaBanner: {
    backgroundColor: '#10b981',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    alignItems: 'center',
  },
  betaBannerEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  betaBannerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  betaBannerText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#e5e7eb',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
  },
  toggleButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleActive: {
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  toggleText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  toggleTextActive: {
    color: '#111827',
  },
  savingsTag: {
    fontSize: 12,
    color: '#10b981',
    marginTop: 2,
    fontWeight: '600',
  },
  planCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  planCardActive: {
    borderColor: '#3b82f6',
    backgroundColor: '#eff6ff',
  },
  planCardPopular: {
    borderColor: '#f59e0b',
  },
  badge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#f59e0b',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '700',
  },
  planName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  planTagline: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 16,
  },
  priceContainer: {
    marginBottom: 20,
  },
  price: {
    fontSize: 32,
    fontWeight: '700',
    color: '#111827',
  },
  yearlyOnlyNote: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  featuresContainer: {
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  checkmark: {
    fontSize: 18,
    color: '#10b981',
    marginRight: 12,
    fontWeight: '700',
  },
  featureText: {
    fontSize: 15,
    color: '#374151',
    flex: 1,
  },
  selectButton: {
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  selectButtonCurrent: {
    backgroundColor: '#6b7280',
  },
  selectButtonPopular: {
    backgroundColor: '#f59e0b',
  },
  selectButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  selectButtonTextCurrent: {
    color: 'white',
  },
  currentPlanInfo: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  currentPlanLabel: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 4,
  },
  currentPlanName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  betaTesterBadge: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 8,
  },
  footer: {
    marginTop: 16,
  },
  footerText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
  footerBeta: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 20,
  },
});
