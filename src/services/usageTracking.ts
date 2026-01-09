import { logger } from '../utils/logger';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  increment,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import { UsageTracking } from '../types';
import { SUBSCRIPTION_PLANS } from '../config/plans';
import { getEffectivePlan } from './featureGate';
import type { SubscriptionData } from '../types';

/**
 * Usage Tracking Service
 *
 * Tracks monthly usage quotas for:
 * - Recipe imports (Firebase function cost)
 * - AI conversions (Claude API cost)
 *
 * Automatically resets counters on the first of each month.
 */

/**
 * Get next month's first day at midnight UTC
 */
function getNextResetDate(): Date {
  const now = new Date();
  const nextMonth = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth() + 1,
    1, // First day of next month
    0, 0, 0, 0 // Midnight UTC
  ));
  return nextMonth;
}

/**
 * Check if usage needs to be reset (past the reset date)
 */
function shouldResetUsage(resetDate: Timestamp): boolean {
  const now = new Date();
  const reset = resetDate.toDate();
  return now >= reset;
}

/**
 * Get or create usage tracking for a parent
 */
export async function getUsageTracking(parentId: string): Promise<UsageTracking> {
  try {
    const usageRef = doc(db, 'usageTracking', parentId);
    const usageSnap = await getDoc(usageRef);

    if (!usageSnap.exists()) {
      // Create initial usage tracking
      const newUsage: UsageTracking = {
        parentId,
        importsThisMonth: 0,
        aiSharesThisMonth: 0,
        usageResetDate: Timestamp.fromDate(getNextResetDate()),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await setDoc(usageRef, newUsage);
      return newUsage;
    }

    const usage = usageSnap.data() as UsageTracking;

    // Check if we need to reset counters
    if (shouldResetUsage(usage.usageResetDate)) {
      const resetUsage: UsageTracking = {
        ...usage,
        importsThisMonth: 0,
        aiSharesThisMonth: 0,
        usageResetDate: Timestamp.fromDate(getNextResetDate()),
        updatedAt: Timestamp.now(),
      };

      await setDoc(usageRef, resetUsage);
      return resetUsage;
    }

    return usage;
  } catch (error) {
    console.error('Error getting usage tracking:', error);
    throw error;
  }
}

/**
 * Check if user can import a recipe (within monthly limit)
 */
export async function canImportRecipe(
  parentId: string,
  subscription: SubscriptionData | null
): Promise<{ allowed: boolean; limit: number | 'unlimited'; remaining: number | 'unlimited'; current: number }> {
  const effectivePlan = getEffectivePlan(subscription);
  const planLimits = SUBSCRIPTION_PLANS[effectivePlan].limits;
  const limit = planLimits.maxImportsPerMonth;

  // Unlimited for Plus/Family or beta testers
  if (limit === 'unlimited') {
    return {
      allowed: true,
      limit: 'unlimited',
      remaining: 'unlimited',
      current: 0,
    };
  }

  // Check current usage
  const usage = await getUsageTracking(parentId);
  const remaining = Math.max(0, limit - usage.importsThisMonth);

  return {
    allowed: usage.importsThisMonth < limit,
    limit,
    remaining,
    current: usage.importsThisMonth,
  };
}

/**
 * Check if user can perform AI conversion (within monthly limit)
 */
export async function canConvertRecipe(
  parentId: string,
  subscription: SubscriptionData | null
): Promise<{ allowed: boolean; limit: number | 'unlimited'; remaining: number | 'unlimited'; current: number }> {
  const effectivePlan = getEffectivePlan(subscription);
  const planLimits = SUBSCRIPTION_PLANS[effectivePlan].limits;
  const limit = planLimits.maxAIConversions;

  // Unlimited for Plus/Family or beta testers
  if (limit === 'unlimited') {
    return {
      allowed: true,
      limit: 'unlimited',
      remaining: 'unlimited',
      current: 0,
    };
  }

  // Check current usage
  const usage = await getUsageTracking(parentId);
  const remaining = Math.max(0, limit - usage.aiSharesThisMonth);

  return {
    allowed: usage.aiSharesThisMonth < limit,
    limit,
    remaining,
    current: usage.aiSharesThisMonth,
  };
}

/**
 * Increment import counter
 * Call this AFTER a successful import
 */
export async function incrementImportCount(parentId: string): Promise<void> {
  try {
    const usageRef = doc(db, 'usageTracking', parentId);

    // Ensure usage doc exists first
    await getUsageTracking(parentId);

    // Increment counter
    await updateDoc(usageRef, {
      importsThisMonth: increment(1),
      updatedAt: serverTimestamp(),
    });

    logger.debug('✅ Incremented import count for parent:', parentId);
  } catch (error) {
    console.error('Error incrementing import count:', error);
    // Don't throw - usage tracking failure shouldn't block the import
  }
}

/**
 * Increment AI conversion counter
 * Call this AFTER a successful conversion
 */
export async function incrementConversionCount(parentId: string): Promise<void> {
  try {
    const usageRef = doc(db, 'usageTracking', parentId);

    // Ensure usage doc exists first
    await getUsageTracking(parentId);

    // Increment counter
    await updateDoc(usageRef, {
      aiSharesThisMonth: increment(1),
      updatedAt: serverTimestamp(),
    });

    logger.debug('✅ Incremented AI conversion count for parent:', parentId);
  } catch (error) {
    console.error('Error incrementing conversion count:', error);
    // Don't throw - usage tracking failure shouldn't block the conversion
  }
}

/**
 * Get usage summary for display
 */
export async function getUsageSummary(
  parentId: string,
  subscription: SubscriptionData | null
): Promise<{
  imports: { current: number; limit: number | 'unlimited'; remaining: number | 'unlimited' };
  conversions: { current: number; limit: number | 'unlimited'; remaining: number | 'unlimited' };
  resetDate: Date;
}> {
  const usage = await getUsageTracking(parentId);
  const effectivePlan = getEffectivePlan(subscription);
  const planLimits = SUBSCRIPTION_PLANS[effectivePlan].limits;

  const importLimit = planLimits.maxImportsPerMonth;
  const conversionLimit = planLimits.maxAIConversions;

  return {
    imports: {
      current: usage.importsThisMonth,
      limit: importLimit,
      remaining: importLimit === 'unlimited' ? 'unlimited' : Math.max(0, importLimit - usage.importsThisMonth),
    },
    conversions: {
      current: usage.aiSharesThisMonth,
      limit: conversionLimit,
      remaining: conversionLimit === 'unlimited' ? 'unlimited' : Math.max(0, conversionLimit - usage.aiSharesThisMonth),
    },
    resetDate: usage.usageResetDate.toDate(),
  };
}
