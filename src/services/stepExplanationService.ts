import AsyncStorage from '@react-native-async-storage/async-storage';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const memoryCache = new Map<string, string>();

const cacheKeyFor = (kidRecipeId: string, stepIndex: number) =>
  `kidchef.stepExplain.${kidRecipeId}.${stepIndex}`;

export async function getStepExplanation(kidRecipeId: string, stepIndex: number): Promise<string> {
  const key = cacheKeyFor(kidRecipeId, stepIndex);
  const memoryValue = memoryCache.get(key);
  if (memoryValue) {
    return memoryValue;
  }

  const stored = await AsyncStorage.getItem(key);
  if (stored) {
    memoryCache.set(key, stored);
    return stored;
  }

  const explainRecipeStep = httpsCallable(functions, 'explainRecipeStep');
  const response = await explainRecipeStep({ kidRecipeId, stepIndex });
  const explanation = (response.data as any)?.explanation;
  if (!explanation || typeof explanation !== 'string') {
    throw new Error('No explanation returned');
  }

  memoryCache.set(key, explanation);
  await AsyncStorage.setItem(key, explanation);
  return explanation;
}
