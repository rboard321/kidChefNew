import { ParentProfile, SubscriptionData, FeatureKey, SubscriptionPlan } from '../types';
import { SUBSCRIPTION_PLANS } from '../config/plans';
import { isMonetizationEnabled, betaUsersBypassPaywalls } from './featureFlags';

/**
 * Central feature gate - THE single source of truth for feature access
 *
 * CRITICAL: This is the ONLY place that decides if a user can access a feature.
 * All other code must call this function.
 */
export function canAccessFeature(
  feature: FeatureKey,
  parentProfile: ParentProfile | null,
  subscription: SubscriptionData | null
): boolean {
  // 1. If monetization is disabled globally, everyone has access
  if (!isMonetizationEnabled()) {
    return true;
  }

  // 2. No user = no access
  if (!parentProfile || !subscription) {
    return false;
  }

  // 3. Beta testers always have access (grandfathered)
  if (subscription.isBetaTester && betaUsersBypassPaywalls()) {
    return true;
  }

  // 4. Check subscription status
  if (subscription.status !== 'active' && subscription.status !== 'trialing') {
    return false;
  }

  // 5. Check feature availability by plan
  const plan = SUBSCRIPTION_PLANS[subscription.plan];
  return plan.featureKeys.includes(feature);
}

/**
 * Check if user has a valid subscription
 */
export function hasValidSubscription(subscription: SubscriptionData | null): boolean {
  if (!subscription) return false;

  // Beta testers are always valid
  if (subscription.isBetaTester && betaUsersBypassPaywalls()) {
    return true;
  }

  // Check status
  return subscription.status === 'active' || subscription.status === 'trialing';
}

/**
 * Get user's effective plan (what they can use)
 */
export function getEffectivePlan(subscription: SubscriptionData | null): SubscriptionPlan {
  // During beta or for beta testers, everyone is Plus
  if (!isMonetizationEnabled() || subscription?.isBetaTester) {
    return 'plus';
  }

  // Return actual plan or default to free
  return subscription?.plan || 'free';
}

/**
 * Get features available for a plan
 */
export function getPlanFeatures(plan: SubscriptionPlan): string[] {
  return SUBSCRIPTION_PLANS[plan].features;
}

/**
 * Get feature keys available for a plan
 */
export function getPlanFeatureKeys(plan: SubscriptionPlan): FeatureKey[] {
  return SUBSCRIPTION_PLANS[plan].featureKeys;
}

/**
 * Check if upgrade is needed for a feature
 */
export function requiresUpgrade(
  feature: FeatureKey,
  currentPlan: SubscriptionPlan
): { required: boolean; minimumPlan: SubscriptionPlan | null } {
  const plans: SubscriptionPlan[] = ['free', 'plus', 'family'];

  // Find which plan includes this feature
  for (const planId of plans) {
    const plan = SUBSCRIPTION_PLANS[planId];
    if (plan.featureKeys.includes(feature)) {
      const required = plans.indexOf(planId) > plans.indexOf(currentPlan);
      return {
        required,
        minimumPlan: required ? planId : null,
      };
    }
  }

  return { required: false, minimumPlan: null };
}
