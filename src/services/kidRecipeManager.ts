import { logger } from '../utils/logger';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { db, auth } from './firebase';
import { aiService } from './aiService';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { kidProfileService } from './kidProfile';
import type { Recipe, KidRecipe, ReadingLevel, KidProfile, KidRecipeCacheEntry, KidIngredient, KidStep } from '../types';
import { waitForCallableReady } from '../utils/callableReady';

export interface KidRecipeManagerService {
  convertAndSaveRecipe: (originalRecipe: Recipe, kidId: string, readingLevel: ReadingLevel, kidAge?: number, forceReconvert?: boolean) => Promise<{ kidRecipeId: string; conversionSource: 'ai' | 'mock' }>;
  getKidRecipe: (kidRecipeId: string) => Promise<KidRecipe | null>;
  getKidRecipeByOriginal: (originalRecipeId: string, kidId: string) => Promise<KidRecipe | null>;
  getKidRecipes: (kidId: string) => Promise<KidRecipe[]>;
  isRecipeAlreadyConverted: (originalRecipeId: string, kidId: string) => Promise<boolean>;
  deleteKidRecipe: (kidRecipeId: string) => Promise<void>;
  reconvertRecipe: (originalRecipe: Recipe, kidId: string, readingLevel: ReadingLevel, kidAge?: number) => Promise<{ kidRecipeId: string; conversionSource: 'ai' | 'mock' }>;
  updateConversionCount: (kidRecipeId: string) => Promise<void>;
}

const stripUndefined = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(stripUndefined);
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry !== undefined) {
        result[key] = stripUndefined(entry);
      }
    }
    return result;
  }
  return value;
};

export const buildKidRecipeData = (params: {
  parentId: string;
  originalRecipeId: string;
  originalRecipeTitle: string;
  originalRecipeImage?: string;
  originalRecipeUrl?: string;
  kidId: string;
  kidAge: number;
  targetReadingLevel: ReadingLevel;
  simplifiedIngredients: KidIngredient[];
  simplifiedSteps: KidStep[];
  safetyNotes: string[];
  estimatedDuration?: number;
  skillsRequired?: string[];
  conversionSource?: 'ai' | 'mock';
}): Omit<KidRecipe, 'id'> => ({
  // DO NOT add userId here – parentId is the only ownership field
  parentId: params.parentId,
  originalRecipeId: params.originalRecipeId,
  originalRecipeTitle: params.originalRecipeTitle,
  originalRecipeImage: params.originalRecipeImage,
  originalRecipeUrl: params.originalRecipeUrl,
  kidId: params.kidId,
  kidAge: params.kidAge,
  targetReadingLevel: params.targetReadingLevel,
  simplifiedIngredients: params.simplifiedIngredients,
  simplifiedSteps: params.simplifiedSteps,
  safetyNotes: params.safetyNotes,
  estimatedDuration: params.estimatedDuration,
  skillsRequired: params.skillsRequired,
  createdAt: Timestamp.now(),
  conversionCount: 1,
  lastConvertedAt: Timestamp.now(),
  approvalStatus: 'pending',
  approvalRequestedAt: Timestamp.now(),
  approvalReviewedAt: undefined,
  approvalNotes: undefined,
  conversionSource: params.conversionSource ?? 'ai',
  conversionVersion: 'v1',
  isActive: false,
  status: 'active',
});

const getAgeFromLevel = (level: ReadingLevel): number => {
  switch (level) {
    case 'beginner': return 7;
    case 'intermediate': return 10;
    case 'advanced': return 13;
    default: return 10;
  }
};

export const kidRecipeManagerService: KidRecipeManagerService = {
  async convertAndSaveRecipe(
    originalRecipe: Recipe,
    kidId: string,
    readingLevel: ReadingLevel,
    kidAge?: number,
    forceReconvert: boolean = false
  ): Promise<{ kidRecipeId: string; conversionSource: 'ai' | 'mock' }> {
    const originalRecipeUrl =
      (originalRecipe as { sourceUrl?: string }).sourceUrl || originalRecipe.url;

    // Get kid profile to extract allergies (before try block so it's accessible in catch)
    const kidProfile = await kidProfileService.getKidProfile(kidId);
    if (!kidProfile) {
      throw new Error(`Kid profile not found for kidId: ${kidId}`);
    }

    // Get allergy flags from kid profile
    const allergyFlags = (kidProfile.allergyFlags || []);

    const callConversionFunction = async () => {
      // Call the Cloud Function which handles conversion, caching, rate limiting, and saving
      await waitForCallableReady();
      if (!auth.currentUser) {
        throw new Error('Please log in again to convert recipes.');
      }
      await auth.currentUser.getIdToken(true);
      const convertRecipeForKid = httpsCallable(functions, 'convertRecipeForKid');

      return convertRecipeForKid({
        recipeId: originalRecipe.id,
        kidId,
        kidAge: kidAge || getAgeFromLevel(readingLevel),
        readingLevel,
        allergyFlags
      });
    };

    try {
      // Check if already converted to avoid duplicates
      logger.debug(`🔍 Checking for existing kid recipe: originalId=${originalRecipe.id}, kidId=${kidId}`);
      const existingKidRecipe = await this.getKidRecipeByOriginal(originalRecipe.id, kidId);
      if (existingKidRecipe && !forceReconvert) {
        logger.debug(`✅ Recipe already converted for this kid, returning existing ID: ${existingKidRecipe.id}`);
        return {
          kidRecipeId: existingKidRecipe.id,
          conversionSource: existingKidRecipe.conversionSource ?? 'ai',
        };
      }
      if (existingKidRecipe && forceReconvert) {
        logger.debug(`♻️ Force reconvert enabled - removing existing kid recipe: ${existingKidRecipe.id}`);
        await deleteDoc(doc(db, 'kidRecipes', existingKidRecipe.id));
      }
      logger.debug(`🆕 No existing kid recipe found, proceeding with new conversion`);

      if (__DEV__) {
        logger.debug('🚀 Calling Cloud Function for complete recipe conversion:', {
          recipeId: originalRecipe.id,
          kidId,
          readingLevel,
          kidAge,
          allergyFlags
        });
      }

      const response = await callConversionFunction();

      const result = response.data as any;

      if (__DEV__) {
        logger.debug('✅ Cloud Function response received:', {
          success: result?.success,
          kidRecipeId: result?.kidRecipeId,
          usedCache: result?.usedCache,
          hasAllergens: result?.hasAllergens
        });
      }

      if (!result?.success || !result?.kidRecipeId) {
        throw new Error('Failed to convert recipe: Invalid response from conversion service');
      }

      try {
        const displayFields = stripUndefined({
          originalRecipeTitle: originalRecipe.title,
          originalRecipeImage: originalRecipe.image,
          originalRecipeUrl,
        }) as Record<string, unknown>;
        await updateDoc(doc(db, 'kidRecipes', result.kidRecipeId), displayFields);
      } catch (updateError) {
        console.warn('⚠️ Failed to update kid recipe display fields:', updateError);
      }

      logger.debug(`Kid recipe converted and saved successfully with ID: ${result.kidRecipeId}`);
      return {
        kidRecipeId: result.kidRecipeId,
        conversionSource: 'ai',
      };

    } catch (error: any) {
      console.error('Error converting and saving recipe via Cloud Function:', {
        error: error?.message || error,
        code: error?.code || 'unknown',
        recipeTitle: originalRecipe.title,
        kidId,
        readingLevel,
        kidAge
      });

      const isUnauthenticated =
        error?.code === 'functions/unauthenticated' ||
        error?.message?.includes('Unauthenticated');

      if (isUnauthenticated) {
        try {
          await new Promise(resolve => setTimeout(resolve, 750));
          const retryResponse = await callConversionFunction();
          const retryResult = retryResponse.data as any;
          if (retryResult?.success && retryResult?.kidRecipeId) {
            try {
              const displayFields = stripUndefined({
                originalRecipeTitle: originalRecipe.title,
                originalRecipeImage: originalRecipe.image,
                originalRecipeUrl,
              }) as Record<string, unknown>;
              await updateDoc(doc(db, 'kidRecipes', retryResult.kidRecipeId), displayFields);
            } catch (updateError) {
              console.warn('⚠️ Failed to update kid recipe display fields:', updateError);
            }
            return { kidRecipeId: retryResult.kidRecipeId, conversionSource: 'ai' };
          }
        } catch (retryError) {
          console.error('Retry after unauthenticated failed:', retryError);
        }
        throw new Error('Please log in again and retry the AI conversion.');
      }

      // Provide user-friendly error messages for specific cases
      if (error?.message?.includes('rate limit') || error?.message?.includes('Daily conversion limit')) {
        throw new Error('Daily conversion limit reached. Please try again tomorrow.');
      }

      if (error?.message?.includes('unauthenticated')) {
        throw new Error('Please log in again to convert recipes.');
      }

      // For all other errors (including JSON parsing issues), fall back to aiService
      console.warn('🔄 Cloud Function failed, falling back to aiService with enhanced mock:', error?.message);

      try {
        // Use the aiService fallback which has enhanced mock conversion
        const conversionResult = await aiService.convertToKidFriendly(originalRecipe, readingLevel, kidAge, allergyFlags);

        // Get current user and kid profile info for saving
        if (!auth.currentUser?.uid) {
          throw new Error('User must be authenticated to create kid recipes');
        }

        // Note: allergyFlags is already defined at the function level
        // Re-fetch not needed since we have it from the top of the function

        // Create kid recipe object using fallback data
        const kidRecipe: Omit<KidRecipe, 'id'> = buildKidRecipeData({
          parentId: kidProfile.parentId,
          originalRecipeId: originalRecipe.id,
          originalRecipeTitle: originalRecipe.title,
          originalRecipeImage: originalRecipe.image,
          originalRecipeUrl,
          kidId,
          kidAge: conversionResult.kidAge,
          targetReadingLevel: conversionResult.targetReadingLevel,
          simplifiedIngredients: conversionResult.simplifiedIngredients,
          simplifiedSteps: conversionResult.simplifiedSteps,
          safetyNotes: conversionResult.safetyNotes,
          estimatedDuration: conversionResult.estimatedDuration,
          skillsRequired: conversionResult.skillsRequired,
          conversionSource: conversionResult.conversionSource ?? 'mock',
        });

        // Save using fallback method
        const docRef = await addDoc(collection(db, 'kidRecipes'), stripUndefined(kidRecipe));
        logger.debug('✅ Kid recipe saved successfully using fallback method with ID:', docRef.id);

        return {
          kidRecipeId: docRef.id,
          conversionSource: conversionResult.conversionSource ?? 'mock',
        };

      } catch (fallbackError) {
        console.error('❌ Both Cloud Function and fallback failed:', fallbackError);
        throw new Error(`Failed to convert recipe "${originalRecipe.title}". Please try again.`);
      }
    }
  },

  async getKidRecipe(kidRecipeId: string): Promise<KidRecipe | null> {
    try {
      const docSnap = await getDoc(doc(db, 'kidRecipes', kidRecipeId));
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        } as KidRecipe;
      }
      return null;
    } catch (error: any) {
      console.error('Error fetching kid recipe:', error);
      return null;
    }
  },

  async getKidRecipeByOriginal(originalRecipeId: string, kidId: string): Promise<KidRecipe | null> {
    try {
      if (__DEV__) {
        logger.debug(`🔍 Query kidRecipes: originalRecipeId=${originalRecipeId}, kidId=${kidId}`);
      }
      const q = query(
        collection(db, 'kidRecipes'),
        where('originalRecipeId', '==', originalRecipeId),
        where('kidId', '==', kidId)
      );

      const querySnapshot = await getDocs(q);
      if (__DEV__) {
        logger.debug(`🔍 Query result: found ${querySnapshot.docs.length} documents`);
      }
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        if (__DEV__) {
          logger.debug(`✅ Found existing kid recipe: ${doc.id}`);
        }
        return {
          id: doc.id,
          ...doc.data(),
        } as KidRecipe;
      }
      if (__DEV__) {
        logger.debug(`❌ No existing kid recipe found`);
      }
      return null;
    } catch (error: any) {
      console.error('❌ Error fetching kid recipe by original:', {
        error: error.message || error,
        code: error.code || 'unknown',
        originalRecipeId,
        kidId
      });
      return null;
    }
  },

  async getKidRecipes(kidId: string): Promise<KidRecipe[]> {
    try {
      const q = query(
        collection(db, 'kidRecipes'),
        where('kidId', '==', kidId),
        where('approvalStatus', '==', 'approved'),
        where('isActive', '==', true)
      );

      const querySnapshot = await getDocs(q);
      const kidRecipes: KidRecipe[] = [];

      querySnapshot.forEach((doc) => {
        kidRecipes.push({
          id: doc.id,
          ...doc.data(),
        } as KidRecipe);
      });

      return kidRecipes.sort((a, b) => {
        const aTime = a.createdAt
          ? (a.createdAt instanceof Date
            ? a.createdAt.getTime()
            : typeof (a.createdAt as any).toMillis === 'function'
              ? (a.createdAt as any).toMillis()
              : 0)
          : 0;
        const bTime = b.createdAt
          ? (b.createdAt instanceof Date
            ? b.createdAt.getTime()
            : typeof (b.createdAt as any).toMillis === 'function'
              ? (b.createdAt as any).toMillis()
              : 0)
          : 0;
        return bTime - aTime;
      });
    } catch (error: any) {
      console.error('Error fetching kid recipes:', error);
      return [];
    }
  },

  async getPendingApprovalRecipes(parentId: string): Promise<KidRecipe[]> {
    try {
      const q = query(
        collection(db, 'kidRecipes'),
        where('parentId', '==', parentId),
        where('approvalStatus', '==', 'pending'),
        orderBy('approvalRequestedAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const pendingRecipes: KidRecipe[] = [];

      querySnapshot.forEach((doc) => {
        pendingRecipes.push({
          id: doc.id,
          ...doc.data(),
        } as KidRecipe);
      });

      return pendingRecipes;
    } catch (error: any) {
      console.error('Error fetching pending approval recipes:', error);
      return [];
    }
  },

  async getKidRecipeById(kidRecipeId: string): Promise<KidRecipe | null> {
    try {
      const docRef = doc(db, 'kidRecipes', kidRecipeId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        } as KidRecipe;
      }

      return null;
    } catch (error: any) {
      console.error('Error fetching kid recipe by ID:', error);
      return null;
    }
  },

  async isRecipeAlreadyConverted(originalRecipeId: string, kidId: string): Promise<boolean> {
    try {
      const existingRecipe = await this.getKidRecipeByOriginal(originalRecipeId, kidId);
      return existingRecipe !== null;
    } catch (error: any) {
      console.error('Error checking if recipe is converted:', error);
      return false;
    }
  },

  async deleteKidRecipe(kidRecipeId: string): Promise<void> {
    try {
      // First, get the kid recipe to find the original recipe ID and kid ID
      const kidRecipeDoc = await getDoc(doc(db, 'kidRecipes', kidRecipeId));

      if (!kidRecipeDoc.exists()) {
        console.warn('Kid recipe not found for deletion:', kidRecipeId);
        return;
      }

      const kidRecipeData = kidRecipeDoc.data() as any;
      const originalRecipeId = kidRecipeData.originalRecipeId;
      const kidId = kidRecipeData.kidId;

      logger.debug('🗑️ Deleting kid recipe:', {
        kidRecipeId,
        originalRecipeId,
        kidId,
        timestamp: new Date().toISOString()
      });

      // Delete the kid recipe
      await deleteDoc(doc(db, 'kidRecipes', kidRecipeId));
      logger.debug('✅ Kid recipe deleted from kidRecipes collection');

      // Also remove the corresponding shared recipe entry
      if (originalRecipeId && kidId) {
        const sharedRecipesQuery = query(
          collection(db, 'sharedRecipes'),
          where('parentRecipeId', '==', originalRecipeId),
          where('kidId', '==', kidId)
        );

        const sharedRecipesSnapshot = await getDocs(sharedRecipesQuery);

        if (!sharedRecipesSnapshot.empty) {
          // Delete all matching shared recipe entries
          const deletePromises = sharedRecipesSnapshot.docs.map(doc => deleteDoc(doc.ref));
          await Promise.all(deletePromises);
          logger.debug('✅ Shared recipe entries deleted from sharedRecipes collection:', sharedRecipesSnapshot.docs.length);
        } else {
          logger.debug('ℹ️ No shared recipe entries found for deletion');
        }
      }

      logger.debug('✅ Kid recipe deletion completed successfully');
    } catch (error: any) {
      console.error('❌ Error deleting kid recipe:', {
        error: error?.message || error,
        kidRecipeId,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  },

  async reconvertRecipe(originalRecipe: Recipe, kidId: string, readingLevel: ReadingLevel, kidAge?: number): Promise<{ kidRecipeId: string; conversionSource: 'ai' | 'mock' }> {
    try {
      // Mark existing version as inactive
      const existingKidRecipe = await this.getKidRecipeByOriginal(originalRecipe.id, kidId);
      if (existingKidRecipe) {
        await updateDoc(doc(db, 'kidRecipes', existingKidRecipe.id), {
          isActive: false,
        });
      }

      // Create new conversion
      return await this.convertAndSaveRecipe(originalRecipe, kidId, readingLevel, kidAge, true);
    } catch (error: any) {
      console.error('Error reconverting recipe:', error);
      throw error;
    }
  },

  async updateConversionCount(kidRecipeId: string): Promise<void> {
    try {
      const kidRecipeRef = doc(db, 'kidRecipes', kidRecipeId);
      const kidRecipeDoc = await getDoc(kidRecipeRef);

      if (kidRecipeDoc.exists()) {
        const currentCount = kidRecipeDoc.data().conversionCount || 0;
        await updateDoc(kidRecipeRef, {
          conversionCount: currentCount + 1,
          lastConvertedAt: Timestamp.now(),
        });
      }
    } catch (error: any) {
      console.error('Error updating conversion count:', error);
      throw error;
    }
  },
};

// Helper interface for extended KidRecipe with conversion tracking
export interface ExtendedKidRecipe extends KidRecipe {
  conversionCount: number;
  lastConvertedAt: Date;
  isActive: boolean;
  deactivatedAt?: Date;
}
