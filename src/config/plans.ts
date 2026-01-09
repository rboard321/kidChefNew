import { PricingPlan, SubscriptionPlan } from '../types';

/**
 * Subscription plan configurations
 *
 * IMPORTANT: Prices shown here are informational only during beta.
 * When monetization launches, these MUST match Apple IAP/Stripe products.
 */
export const SUBSCRIPTION_PLANS: Record<SubscriptionPlan, PricingPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Get started with basic features',

    // No pricing for free tier
    priceMonthly: 0,
    priceYearly: 0,

    features: [
      'Up to 10 recipes',
      '5 imports per day',
      'Basic AI conversions',
      'Single parent account',
    ],

    featureKeys: [
      'recipe_import',
      'ai_helper',
      'favorites',
      'collections',
    ],

    limits: {
      maxRecipes: 'unlimited', // Free users can save unlimited recipes
      maxImportsPerMonth: 5, // But only import 5 per month
      maxAIConversions: 5, // And only convert 5 per month
      maxCollections: 5,
    },
  },

  plus: {
    id: 'plus',
    name: 'KidChef Plus',
    tagline: 'Unlimited recipes for your family',
    popular: true,
    badge: 'Most Popular',

    // Pricing in cents
    priceMonthly: 299,  // $2.99
    priceYearly: 1999,  // $19.99 (save 44%)

    // Apple IAP Product IDs (set when configuring App Store Connect)
    appleProductIdMonthly: 'kidchef_plus_monthly',
    appleProductIdYearly: 'kidchef_plus_yearly',

    // Stripe Product IDs (set when configuring Stripe)
    stripeProductIdMonthly: 'price_xxxxx',  // TODO: Replace with real IDs
    stripeProductIdYearly: 'price_xxxxx',

    features: [
      'Unlimited recipes',
      'Unlimited imports',
      'Advanced AI helper',
      'Explain cooking steps with AI',
      'Favorites & collections',
      'Advanced search filters',
      'Recipe scheduling',
      'Priority support',
    ],

    featureKeys: [
      'unlimited_recipes',
      'recipe_import',
      'ai_helper',
      'explain_step_ai',
      'explain_parent_step_ai',
      'favorites',
      'collections',
      'advanced_filters',
      'recipe_scheduling',
      'grocery_lists',
      'meal_planning',
    ],

    limits: {
      maxRecipes: 'unlimited',
      maxImportsPerMonth: 'unlimited',
      maxAIConversions: 'unlimited',
      maxCollections: 'unlimited',
    },
  },

  family: {
    id: 'family',
    name: 'Family Plan',
    tagline: 'Share with multiple parents',
    badge: 'Best Value',

    // Family plan yearly only
    priceYearly: 2999,  // $29.99

    appleProductIdYearly: 'kidchef_family_yearly',
    stripeProductIdYearly: 'price_xxxxx',

    features: [
      'Everything in Plus',
      'Up to 2 parent accounts',
      'Shared recipe library',
      'Family meal planning',
      'Shared grocery lists',
      'Priority support',
    ],

    featureKeys: [
      'unlimited_recipes',
      'recipe_import',
      'ai_helper',
      'explain_step_ai',
      'explain_parent_step_ai',
      'favorites',
      'collections',
      'family_sharing',
      'advanced_filters',
      'recipe_scheduling',
      'grocery_lists',
      'meal_planning',
    ],

    limits: {
      maxRecipes: 'unlimited',
      maxImportsPerMonth: 'unlimited',
      maxAIConversions: 'unlimited',
      maxCollections: 'unlimited',
    },
  },
};

/**
 * Get plan configuration by ID
 */
export function getPlan(planId: SubscriptionPlan): PricingPlan {
  return SUBSCRIPTION_PLANS[planId];
}

/**
 * Get all plans as array (useful for rendering)
 */
export function getAllPlans(): PricingPlan[] {
  return Object.values(SUBSCRIPTION_PLANS);
}

/**
 * Format price for display
 */
export function formatPrice(cents: number, interval: 'monthly' | 'yearly'): string {
  const dollars = cents / 100;
  const formatted = dollars.toFixed(2);

  if (interval === 'monthly') {
    return `$${formatted}/month`;
  } else {
    return `$${formatted}/year`;
  }
}

/**
 * Calculate yearly savings
 */
export function calculateYearlySavings(monthlyPrice: number, yearlyPrice: number): string {
  const monthlyTotal = monthlyPrice * 12;
  const savings = monthlyTotal - yearlyPrice;
  const percentage = Math.round((savings / monthlyTotal) * 100);

  return `Save ${percentage}%`;
}
