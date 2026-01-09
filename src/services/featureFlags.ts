import { getValue } from 'firebase/remote-config';
import { remoteConfig } from './firebase';

/**
 * Feature flag keys matching Remote Config
 */
export const FeatureFlags = {
  MONETIZATION_ENABLED: 'monetization_enabled',
  SHOW_PRICING_PAGE: 'show_pricing_page',
  ENFORCE_PAYWALLS: 'enforce_paywalls',
  ENABLE_PREMIUM_FEATURES: 'enable_premium_features',
  BETA_USERS_BYPASS: 'beta_users_bypass_paywalls',
} as const;

/**
 * Get boolean flag value with fallback
 */
export function getBooleanFlag(key: string, fallback: boolean = false): boolean {
  try {
    return getValue(remoteConfig, key).asBoolean();
  } catch (error) {
    console.warn(`Failed to get flag ${key}, using fallback:`, fallback);
    return fallback;
  }
}

/**
 * Get number flag value with fallback
 */
export function getNumberFlag(key: string, fallback: number = 0): number {
  try {
    return getValue(remoteConfig, key).asNumber();
  } catch (error) {
    console.warn(`Failed to get flag ${key}, using fallback:`, fallback);
    return fallback;
  }
}

/**
 * Get string flag value with fallback
 */
export function getStringFlag(key: string, fallback: string = ''): string {
  try {
    return getValue(remoteConfig, key).asString();
  } catch (error) {
    console.warn(`Failed to get flag ${key}, using fallback:`, fallback);
    return fallback;
  }
}

/**
 * Check if monetization is active globally
 */
export function isMonetizationEnabled(): boolean {
  return getBooleanFlag(FeatureFlags.MONETIZATION_ENABLED, false);
}

/**
 * Check if pricing page should be visible
 */
export function shouldShowPricingPage(): boolean {
  return getBooleanFlag(FeatureFlags.SHOW_PRICING_PAGE, true);
}

/**
 * Check if paywalls should be enforced
 */
export function shouldEnforcePaywalls(): boolean {
  return getBooleanFlag(FeatureFlags.ENFORCE_PAYWALLS, false);
}

/**
 * Check if beta users should bypass paywalls
 */
export function betaUsersBypassPaywalls(): boolean {
  return getBooleanFlag(FeatureFlags.BETA_USERS_BYPASS, true);
}
