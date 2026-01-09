import { logger } from '../utils/logger';
import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  getDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Recipe } from '../types';

// NOTE: This is a lightweight Recipe view built from SharedRecipe.
// It is NOT a full Recipe document and should only be used for
// display + recommendation scoring.
export type SharedRecipeRecipeView = Pick<Recipe, 'id' | 'title' | 'image'>;

export interface SharedRecipe {
  id: string;
  parentRecipeId: string;
  kidId: string;
  // DO NOT add userId here – use parentId only
  parentId: string;
  recipeTitle: string;
  recipeImage?: string;
  kidName: string;
  kidAvatarEmoji?: string;
  status: 'active' | 'archived' | 'deleted';
  sharedAt: Date;
  permissions: {
    canConvert: boolean;
  };
}

export interface SharedKidAccess {
  id: string;
  name: string;
  avatarEmoji?: string;
}

export interface RecipeSharingService {
  shareRecipeWithKid: (parentRecipeId: string, kidId: string, parentId: string) => Promise<void>;
  unshareRecipeFromKid: (parentRecipeId: string, kidId: string, parentId: string) => Promise<void>;
  getSharedRecipesForKid: (kidId: string, parentId: string) => Promise<SharedRecipeRecipeView[]>;
  getKidsWithAccess: (parentRecipeId: string, parentId: string) => Promise<SharedKidAccess[]>;
  isRecipeSharedWithKid: (parentRecipeId: string, kidId: string, parentId: string) => Promise<boolean>;
  shareRecipeWithAllKids: (parentRecipeId: string, parentId: string) => Promise<void>;
  getSharedRecipesByParent: (parentId: string) => Promise<SharedRecipe[]>;
}

export const buildSharedRecipeData = (
  parentRecipeId: string,
  kidId: string,
  parentId: string,
  recipeTitle: string,
  recipeImage: string | undefined,
  kidName: string,
  kidAvatarEmoji: string | undefined
) => ({
  parentRecipeId,
  kidId,
  // DO NOT add userId here – parentId is the only ownership field
  parentId,
  recipeTitle,
  recipeImage,
  kidName,
  kidAvatarEmoji,
  status: 'active' as const,
  sharedAt: Timestamp.now(),
  permissions: {
    canConvert: true,
  },
});

export const recipeSharingService: RecipeSharingService = {
  async shareRecipeWithKid(parentRecipeId: string, kidId: string, parentId: string) {
    try {
      // Check if already shared
      const isShared = await this.isRecipeSharedWithKid(parentRecipeId, kidId, parentId);
      if (isShared) {
        if (__DEV__) {
          logger.debug('Recipe already shared with this kid');
        }
        return;
      }

      // Verify auth state before creating shared recipe
      if (!auth.currentUser?.uid) {
        throw new Error('User must be authenticated to share recipes');
      }

      const recipeDoc = await getDoc(doc(db, 'recipes', parentRecipeId));
      if (!recipeDoc.exists()) {
        throw new Error('Recipe not found');
      }

      const kidDoc = await getDoc(doc(db, 'kidProfiles', kidId));
      if (!kidDoc.exists()) {
        throw new Error('Kid profile not found');
      }

      const recipeData = recipeDoc.data() as Recipe;
      const kidData = kidDoc.data() as { name?: string; avatarEmoji?: string };

      const sharedRecipe = buildSharedRecipeData(
        parentRecipeId,
        kidId,
        parentId,
        recipeData.title || 'Untitled Recipe',
        recipeData.image,
        kidData.name || 'Kid',
        kidData.avatarEmoji
      );

      if (__DEV__) {
        logger.debug('🔗 About to create shared recipe:', {
          parentRecipeId,
          kidId,
          parentId,
          authUid: auth.currentUser?.uid
        });
      }

      // Use deterministic document ID to prevent duplicates
      const sharedRecipeId = `${parentRecipeId}_${kidId}`;
      await setDoc(doc(db, 'sharedRecipes', sharedRecipeId), sharedRecipe);
      if (__DEV__) {
        logger.debug('✅ Recipe shared successfully');
      }
    } catch (error) {
      console.error('❌ Error sharing recipe:', {
        error: error.message || error,
        code: error.code || 'unknown',
        parentRecipeId,
        kidId,
        parentId,
        currentUserId: auth.currentUser?.uid
      });
      throw error;
    }
  },

  async unshareRecipeFromKid(parentRecipeId: string, kidId: string, parentId: string) {
    try {
      const q = query(
        collection(db, 'sharedRecipes'),
        where('parentRecipeId', '==', parentRecipeId),
        where('kidId', '==', kidId),
        where('parentId', '==', parentId)
      );

      const querySnapshot = await getDocs(q);

      for (const doc of querySnapshot.docs) {
        await deleteDoc(doc.ref);
      }

      if (__DEV__) {
        logger.debug('Recipe unshared successfully');
      }
    } catch (error) {
      console.error('Error unsharing recipe:', error);
      throw error;
    }
  },

  async getSharedRecipesForKid(kidId: string, parentId: string): Promise<SharedRecipeRecipeView[]> {
    try {
      // Get all shared recipe entries for this kid
      const q = query(
        collection(db, 'sharedRecipes'),
        where('kidId', '==', kidId),
        where('parentId', '==', parentId),
        orderBy('sharedAt', 'desc')
      );

      const sharedSnapshot = await getDocs(q);
      if (sharedSnapshot.empty) {
        return [];
      }

      return sharedSnapshot.docs.map((doc) => {
        const data = doc.data() as SharedRecipe;
        return {
          id: data.parentRecipeId,
          parentId: data.parentId,
          title: data.recipeTitle,
          image: data.recipeImage,
          ingredients: [],
        } as SharedRecipeRecipeView;
      });
    } catch (error) {
      console.error('Error getting shared recipes for kid:', error);
      return [];
    }
  },

  async getKidsWithAccess(parentRecipeId: string, parentId: string): Promise<SharedKidAccess[]> {
    try {
      const q = query(
        collection(db, 'sharedRecipes'),
        where('parentRecipeId', '==', parentRecipeId),
        where('parentId', '==', parentId)
      );

      const sharedSnapshot = await getDocs(q);
      if (sharedSnapshot.empty) {
        return [];
      }

      const kids = sharedSnapshot.docs.map((doc) => {
        const data = doc.data() as SharedRecipe;
        return {
          id: data.kidId,
          name: data.kidName,
          avatarEmoji: data.kidAvatarEmoji,
        } as SharedKidAccess;
      });

      return kids.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error getting kids with access:', error);
      return [];
    }
  },

  async isRecipeSharedWithKid(parentRecipeId: string, kidId: string, parentId: string): Promise<boolean> {
    try {
      const q = query(
        collection(db, 'sharedRecipes'),
        where('parentRecipeId', '==', parentRecipeId),
        where('kidId', '==', kidId),
        where('parentId', '==', parentId)
      );

      const querySnapshot = await getDocs(q);
      return !querySnapshot.empty;
    } catch (error) {
      console.error('Error checking if recipe is shared:', error);
      return false;
    }
  },

  async shareRecipeWithAllKids(parentRecipeId: string, parentId: string) {
    try {
      // Get all kids for this parent
      const kidsQuery = query(
        collection(db, 'kidProfiles'),
        where('parentId', '==', parentId)
      );

      const kidsSnapshot = await getDocs(kidsQuery);

      // Share with each kid
      for (const kidDoc of kidsSnapshot.docs) {
        await this.shareRecipeWithKid(parentRecipeId, kidDoc.id, parentId);
      }

      if (__DEV__) {
        logger.debug('Recipe shared with all kids successfully');
      }
    } catch (error) {
      console.error('Error sharing recipe with all kids:', error);
      throw error;
    }
  },

  async getSharedRecipesByParent(parentId: string): Promise<SharedRecipe[]> {
    try {
      const q = query(
        collection(db, 'sharedRecipes'),
        where('parentId', '==', parentId)
      );

      const querySnapshot = await getDocs(q);
      const sharedRecipes: SharedRecipe[] = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        sharedRecipes.push({
          id: doc.id,
          ...data,
          sharedAt: data.sharedAt?.toDate() || new Date(),
        } as SharedRecipe);
      });

      return sharedRecipes.sort((a, b) => b.sharedAt.getTime() - a.sharedAt.getTime());
    } catch (error) {
      console.error('Error getting shared recipes by parent:', error);
      return [];
    }
  },
};
