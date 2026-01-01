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
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { aiService } from './aiService';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { kidProfileService } from './kidProfile';
import type { Recipe, KidRecipe, ReadingLevel, KidProfile, KidRecipeCacheEntry } from '../types';

export interface KidRecipeManagerService {
  convertAndSaveRecipe: (originalRecipe: Recipe, kidId: string, readingLevel: ReadingLevel, kidAge?: number) => Promise<string>;
  getKidRecipe: (kidRecipeId: string) => Promise<KidRecipe | null>;
  getKidRecipeByOriginal: (originalRecipeId: string, kidId: string) => Promise<KidRecipe | null>;
  getKidRecipes: (kidId: string) => Promise<KidRecipe[]>;
  isRecipeAlreadyConverted: (originalRecipeId: string, kidId: string) => Promise<boolean>;
  deleteKidRecipe: (kidRecipeId: string) => Promise<void>;
  reconvertRecipe: (originalRecipe: Recipe, kidId: string, readingLevel: ReadingLevel, kidAge?: number) => Promise<string>;
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

const getAgeFromLevel = (level: ReadingLevel): number => {
  switch (level) {
    case 'beginner': return 7;
    case 'intermediate': return 10;
    case 'advanced': return 13;
    default: return 10;
  }
};

export const kidRecipeManagerService: KidRecipeManagerService = {
  async convertAndSaveRecipe(originalRecipe: Recipe, kidId: string, readingLevel: ReadingLevel, kidAge?: number): Promise<string> {
    try {
      // Check if already converted to avoid duplicates
      console.log(`🔍 Checking for existing kid recipe: originalId=${originalRecipe.id}, kidId=${kidId}`);
      const existingKidRecipe = await this.getKidRecipeByOriginal(originalRecipe.id, kidId);
      if (existingKidRecipe) {
        console.log(`✅ Recipe already converted for this kid, returning existing ID: ${existingKidRecipe.id}`);
        return existingKidRecipe.id;
      }
      console.log(`🆕 No existing kid recipe found, proceeding with new conversion`);

      // Get kid profile to extract allergies
      const kidProfile = await kidProfileService.getKidProfile(kidId);
      if (!kidProfile) {
        throw new Error(`Kid profile not found for kidId: ${kidId}`);
      }

      // Get allergy flags from kid profile
      const allergyFlags = (kidProfile.allergies || []).map(allergy =>
        typeof allergy === 'string' ? allergy : allergy.allergen
      );

      if (__DEV__) {
        console.log('🚀 Calling Cloud Function for complete recipe conversion:', {
          recipeId: originalRecipe.id,
          kidId,
          readingLevel,
          kidAge,
          allergyFlags
        });
      }

      // Call the Cloud Function which handles conversion, caching, rate limiting, and saving
      const convertRecipeForKid = httpsCallable(functions, 'convertRecipeForKid');

      const response = await convertRecipeForKid({
        recipeId: originalRecipe.id,
        kidId,
        kidAge: kidAge || getAgeFromLevel(readingLevel),
        readingLevel,
        allergyFlags
      });

      const result = response.data as any;

      if (__DEV__) {
        console.log('✅ Cloud Function response received:', {
          success: result?.success,
          kidRecipeId: result?.kidRecipeId,
          usedCache: result?.usedCache,
          hasAllergens: result?.hasAllergens
        });
      }

      if (!result?.success || !result?.kidRecipeId) {
        throw new Error('Failed to convert recipe: Invalid response from conversion service');
      }

      console.log(`Kid recipe converted and saved successfully with ID: ${result.kidRecipeId}`);
      return result.kidRecipeId;

    } catch (error) {
      console.error('Error converting and saving recipe via Cloud Function:', {
        error: error?.message || error,
        code: error?.code || 'unknown',
        recipeTitle: originalRecipe.title,
        kidId,
        readingLevel,
        kidAge
      });

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
        const currentUserId = auth.currentUser?.uid;
        if (!currentUserId) {
          throw new Error('User must be authenticated to create kid recipes');
        }

        const kidProfile = await kidProfileService.getKidProfile(kidId);
        if (!kidProfile) {
          throw new Error(`Kid profile not found for kidId: ${kidId}`);
        }

        // Get allergy flags from kid profile
        const allergyFlags = (kidProfile.allergies || []).map(allergy =>
          typeof allergy === 'string' ? allergy : allergy.allergen
        );

        // Create kid recipe object using fallback data
        const kidRecipe: Omit<KidRecipe, 'id'> = {
          userId: currentUserId,
          parentId: kidProfile.parentId,
          originalRecipeId: originalRecipe.id,
          kidId,
          kidAge: conversionResult.kidAge,
          targetReadingLevel: conversionResult.targetReadingLevel,
          simplifiedIngredients: conversionResult.simplifiedIngredients,
          simplifiedSteps: conversionResult.simplifiedSteps,
          safetyNotes: conversionResult.safetyNotes,
          estimatedDuration: conversionResult.estimatedDuration,
          skillsRequired: conversionResult.skillsRequired,
          createdAt: Timestamp.now(),
          conversionCount: 1,
          lastConvertedAt: Timestamp.now(),
          isActive: true,
        };

        // Save using fallback method
        const docRef = await addDoc(collection(db, 'kidRecipes'), stripUndefined(kidRecipe));
        console.log('✅ Kid recipe saved successfully using fallback method with ID:', docRef.id);

        return docRef.id;

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
    } catch (error) {
      console.error('Error fetching kid recipe:', error);
      return null;
    }
  },

  async getKidRecipeByOriginal(originalRecipeId: string, kidId: string): Promise<KidRecipe | null> {
    try {
      if (__DEV__) {
        console.log(`🔍 Query kidRecipes: originalRecipeId=${originalRecipeId}, kidId=${kidId}, isActive=true`);
      }
      const q = query(
        collection(db, 'kidRecipes'),
        where('originalRecipeId', '==', originalRecipeId),
        where('kidId', '==', kidId),
        where('isActive', '==', true)
      );

      const querySnapshot = await getDocs(q);
      if (__DEV__) {
        console.log(`🔍 Query result: found ${querySnapshot.docs.length} documents`);
      }
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        if (__DEV__) {
          console.log(`✅ Found existing kid recipe: ${doc.id}`);
        }
        return {
          id: doc.id,
          ...doc.data(),
        } as KidRecipe;
      }
      if (__DEV__) {
        console.log(`❌ No existing kid recipe found`);
      }
      return null;
    } catch (error) {
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
        const aTime = a.createdAt ? (a.createdAt instanceof Date ? a.createdAt.getTime() : a.createdAt.toMillis()) : 0;
        const bTime = b.createdAt ? (b.createdAt instanceof Date ? b.createdAt.getTime() : b.createdAt.toMillis()) : 0;
        return bTime - aTime;
      });
    } catch (error) {
      console.error('Error fetching kid recipes:', error);
      return [];
    }
  },

  async isRecipeAlreadyConverted(originalRecipeId: string, kidId: string): Promise<boolean> {
    try {
      const existingRecipe = await this.getKidRecipeByOriginal(originalRecipeId, kidId);
      return existingRecipe !== null;
    } catch (error) {
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

      console.log('🗑️ Deleting kid recipe:', {
        kidRecipeId,
        originalRecipeId,
        kidId,
        timestamp: new Date().toISOString()
      });

      // Delete the kid recipe
      await deleteDoc(doc(db, 'kidRecipes', kidRecipeId));
      console.log('✅ Kid recipe deleted from kidRecipes collection');

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
          console.log('✅ Shared recipe entries deleted from sharedRecipes collection:', sharedRecipesSnapshot.docs.length);
        } else {
          console.log('ℹ️ No shared recipe entries found for deletion');
        }
      }

      console.log('✅ Kid recipe deletion completed successfully');
    } catch (error) {
      console.error('❌ Error deleting kid recipe:', {
        error: error?.message || error,
        kidRecipeId,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  },

  async reconvertRecipe(originalRecipe: Recipe, kidId: string, readingLevel: ReadingLevel, kidAge?: number): Promise<string> {
    try {
      // Mark existing version as inactive
      const existingKidRecipe = await this.getKidRecipeByOriginal(originalRecipe.id, kidId);
      if (existingKidRecipe) {
        await updateDoc(doc(db, 'kidRecipes', existingKidRecipe.id), {
          isActive: false,
          deactivatedAt: Timestamp.now(),
        });
      }

      // Create new conversion
      return await this.convertAndSaveRecipe(originalRecipe, kidId, readingLevel, kidAge);
    } catch (error) {
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
    } catch (error) {
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
