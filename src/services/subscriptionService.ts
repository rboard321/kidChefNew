import { logger } from '../utils/logger';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { SubscriptionData, SubscriptionPlan, SubscriptionStatus } from '../types';

/**
 * Get user's subscription data from Firestore
 */
export async function getSubscription(parentId: string): Promise<SubscriptionData | null> {
  try {
    if (!auth.currentUser) {
      if (__DEV__) {
        logger.debug('Skipping subscription fetch - no authenticated user.');
      }
      return null;
    }
    const subRef = doc(db, 'subscriptions', parentId);
    const subSnap = await getDoc(subRef);

    if (!subSnap.exists()) {
      // No subscription = create free tier with beta tester status
      return createFreeSubscription(parentId);
    }

    return subSnap.data() as SubscriptionData;
  } catch (error) {
    console.error('Error fetching subscription:', error);
    return null;
  }
}

/**
 * Create initial free subscription for new users
 */
export async function createFreeSubscription(
  parentId: string,
  isBetaTester: boolean = true  // All users during beta are beta testers!
): Promise<SubscriptionData> {
  // docStatus lifecycle:
  // - active: current subscription document
  // - archived: canceled subscription (may be reactivated)
  // - deleted: permanently removed (unused in v1)
  // Reactivation flips docStatus back to 'active'
  const subscription: SubscriptionData = {
    plan: 'free',
    status: isBetaTester ? 'beta' : 'active',
    docStatus: 'active',
    isBetaTester,
    betaStartDate: isBetaTester ? Timestamp.now() : undefined,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  try {
    const subRef = doc(db, 'subscriptions', parentId);
    await setDoc(subRef, subscription);
    logger.debug('✅ Created subscription for parent:', parentId, { isBetaTester });
  } catch (error) {
    console.error('Error creating subscription:', error);
  }

  return subscription;
}

/**
 * Update subscription plan (after successful purchase)
 */
export async function updateSubscriptionPlan(
  parentId: string,
  plan: SubscriptionPlan,
  subscriptionId: string,
  periodEnd: Date
): Promise<void> {
  try {
    const subRef = doc(db, 'subscriptions', parentId);

    await updateDoc(subRef, {
      plan,
      status: 'active' as SubscriptionStatus,
      docStatus: 'active',
      subscriptionId,
      currentPeriodEnd: Timestamp.fromDate(periodEnd),
      updatedAt: serverTimestamp(),
    });

    logger.debug('✅ Updated subscription plan:', { parentId, plan });
  } catch (error) {
    console.error('Error updating subscription:', error);
    throw error;
  }
}

/**
 * Cancel subscription (marks for cancellation at period end)
 */
export async function cancelSubscription(parentId: string): Promise<void> {
  try {
    const subRef = doc(db, 'subscriptions', parentId);

    await updateDoc(subRef, {
      status: 'canceled' as SubscriptionStatus,
      docStatus: 'archived',
      cancelAtPeriodEnd: true,
      updatedAt: serverTimestamp(),
    });

    logger.debug('✅ Canceled subscription:', parentId);
  } catch (error) {
    console.error('Error canceling subscription:', error);
    throw error;
  }
}

/**
 * Reactivate subscription
 */
export async function reactivateSubscription(parentId: string): Promise<void> {
  try {
    const subRef = doc(db, 'subscriptions', parentId);

    await updateDoc(subRef, {
      status: 'active' as SubscriptionStatus,
      cancelAtPeriodEnd: false,
      updatedAt: serverTimestamp(),
    });

    logger.debug('✅ Reactivated subscription:', parentId);
  } catch (error) {
    console.error('Error reactivating subscription:', error);
    throw error;
  }
}

/**
 * Check if subscription exists
 */
export async function subscriptionExists(parentId: string): Promise<boolean> {
  try {
    if (!auth.currentUser) {
      if (__DEV__) {
        logger.debug('Skipping subscription check - no authenticated user.');
      }
      return false;
    }
    const subRef = doc(db, 'subscriptions', parentId);
    const subSnap = await getDoc(subRef);
    return subSnap.exists();
  } catch (error) {
    console.error('Error checking subscription:', error);
    return false;
  }
}
