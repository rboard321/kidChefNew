import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

// In-memory cache for performance
const memoryCache = new Map<string, string>();

/**
 * Generate cache key for parent step explanations
 */
const cacheKeyFor = (recipeId: string, stepIndex: number) =>
  `kidchef.parentStepExplain.${recipeId}.${stepIndex}`;

/**
 * Get AI explanation for a parent recipe step
 *
 * This uses a 3-tier cache:
 * 1. Memory (instant)
 * 2. AsyncStorage (fast, device-level)
 * 3. Cloud Function → Firestore (global cache) → OpenAI (fallback)
 *
 * @param recipeId - The parent recipe ID
 * @param stepIndex - Zero-based step index
 * @param stepText - The actual step text to explain
 */
export async function getParentStepExplanation(
  recipeId: string,
  stepIndex: number,
  stepText: string
): Promise<string> {
  const key = cacheKeyFor(recipeId, stepIndex);

  // Try memory cache first
  const memoryValue = memoryCache.get(key);
  if (memoryValue) {
    return memoryValue;
  }

  // Try AsyncStorage cache
  const stored = await AsyncStorage.getItem(key);
  if (stored) {
    memoryCache.set(key, stored);
    return stored;
  }

  // Call Cloud Function (which checks Firestore global cache, then OpenAI)
  const explainParentRecipeStep = httpsCallable(functions, 'explainParentRecipeStep');
  const response = await explainParentRecipeStep({ recipeId, stepIndex, stepText });
  const explanation = (response.data as any)?.explanation;

  if (!explanation || typeof explanation !== 'string') {
    throw new Error('No explanation returned');
  }

  // Cache for future use
  memoryCache.set(key, explanation);
  await AsyncStorage.setItem(key, explanation);

  return explanation;
}

/**
 * Clear cached explanation (useful for testing or if content is stale)
 */
export async function clearCachedExplanation(recipeId: string, stepIndex: number): Promise<void> {
  const key = cacheKeyFor(recipeId, stepIndex);
  memoryCache.delete(key);
  await AsyncStorage.removeItem(key);
}

/**
 * Clear all parent step explanations from device cache
 */
export async function clearAllCachedExplanations(): Promise<void> {
  memoryCache.clear();
  // Note: AsyncStorage doesn't have a wildcard delete, would need to track keys
}
