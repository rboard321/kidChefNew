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
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import type { Recipe, KidProfile } from '../types';

export interface SharedRecipe {
  id: string;
  parentRecipeId: string;
  kidId: string;
  parentId: string;
  sharedAt: Date;
  permissions: {
    canConvert: boolean;
    canReconvert: boolean;
  };
}

export interface RecipeSharingService {
  shareRecipeWithKid: (parentRecipeId: string, kidId: string, parentId: string) => Promise<void>;
  unshareRecipeFromKid: (parentRecipeId: string, kidId: string) => Promise<void>;
  getSharedRecipesForKid: (kidId: string) => Promise<Recipe[]>;
  getKidsWithAccess: (parentRecipeId: string) => Promise<KidProfile[]>;
  isRecipeSharedWithKid: (parentRecipeId: string, kidId: string) => Promise<boolean>;
  shareRecipeWithAllKids: (parentRecipeId: string, parentId: string) => Promise<void>;
  getSharedRecipesByParent: (parentId: string) => Promise<SharedRecipe[]>;
}

export const recipeSharingService: RecipeSharingService = {
  async shareRecipeWithKid(parentRecipeId: string, kidId: string, parentId: string) {
    try {
      // Check if already shared
      const isShared = await this.isRecipeSharedWithKid(parentRecipeId, kidId);
      if (isShared) {
        console.log('Recipe already shared with this kid');
        return;
      }

      // Verify auth state before creating shared recipe
      const currentUserId = auth.currentUser?.uid;
      if (!currentUserId) {
        throw new Error('User must be authenticated to share recipes');
      }

      const sharedRecipe = {
        parentRecipeId,
        kidId,
        parentId,
<<<<<<< HEAD
=======
        parentUserId: currentUserId,
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
        sharedAt: Timestamp.now(),
        permissions: {
          canConvert: true,
          canReconvert: false, // Default: one-time conversion
        },
      };

<<<<<<< HEAD
      await addDoc(collection(db, 'sharedRecipes'), sharedRecipe);
      console.log('Recipe shared successfully');
=======
      if (__DEV__) {
        console.log('🔗 About to create shared recipe:', {
          parentRecipeId,
          kidId,
          parentId,
          parentUserId: currentUserId,
          authUid: auth.currentUser?.uid
        });
      }

      // Use deterministic document ID to prevent duplicates
      const sharedRecipeId = `${parentRecipeId}_${kidId}`;
      await setDoc(doc(db, 'sharedRecipes', sharedRecipeId), sharedRecipe);
      if (__DEV__) {
        console.log('✅ Recipe shared successfully');
      }
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
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

  async unshareRecipeFromKid(parentRecipeId: string, kidId: string) {
    try {
      const q = query(
        collection(db, 'sharedRecipes'),
        where('parentRecipeId', '==', parentRecipeId),
        where('kidId', '==', kidId),
        where('parentUserId', '==', auth.currentUser?.uid)
      );

      const querySnapshot = await getDocs(q);

      for (const doc of querySnapshot.docs) {
        await deleteDoc(doc.ref);
      }

      console.log('Recipe unshared successfully');
    } catch (error) {
      console.error('Error unsharing recipe:', error);
      throw error;
    }
  },

  async getSharedRecipesForKid(kidId: string): Promise<Recipe[]> {
    try {
      // Get all shared recipe entries for this kid
      const q = query(
        collection(db, 'sharedRecipes'),
        where('kidId', '==', kidId),
        where('parentUserId', '==', auth.currentUser?.uid)
      );

      const sharedSnapshot = await getDocs(q);
      // Deduplicate recipe IDs to handle any existing duplicate sharedRecipes
      const recipeIds = [...new Set(sharedSnapshot.docs.map(doc => doc.data().parentRecipeId))];

      if (recipeIds.length === 0) {
        return [];
      }

      // Get the actual recipe data
      const recipes: Recipe[] = [];
      for (const recipeId of recipeIds) {
        const recipeDoc = await getDoc(doc(db, 'recipes', recipeId));
        if (recipeDoc.exists()) {
          recipes.push({
            id: recipeDoc.id,
            ...recipeDoc.data(),
          } as Recipe);
        }
      }

      return recipes.sort((a, b) => {
        const aTime = a.updatedAt ? (a.updatedAt instanceof Date ? a.updatedAt.getTime() : a.updatedAt.toMillis()) : 0;
        const bTime = b.updatedAt ? (b.updatedAt instanceof Date ? b.updatedAt.getTime() : b.updatedAt.toMillis()) : 0;
        return bTime - aTime;
      });
    } catch (error) {
      console.error('Error getting shared recipes for kid:', error);
      return [];
    }
  },

  async getKidsWithAccess(parentRecipeId: string): Promise<KidProfile[]> {
    try {
      const q = query(
        collection(db, 'sharedRecipes'),
        where('parentRecipeId', '==', parentRecipeId),
        where('parentUserId', '==', auth.currentUser?.uid)
      );

      const sharedSnapshot = await getDocs(q);
      const kidIds = sharedSnapshot.docs.map(doc => doc.data().kidId);

      if (kidIds.length === 0) {
        return [];
      }

      // Get the kid profiles
      const kids: KidProfile[] = [];
      for (const kidId of kidIds) {
        const kidDoc = await getDoc(doc(db, 'kidProfiles', kidId));
        if (kidDoc.exists()) {
          kids.push({
            id: kidDoc.id,
            ...kidDoc.data(),
          } as KidProfile);
        }
      }

      return kids.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error getting kids with access:', error);
      return [];
    }
  },

  async isRecipeSharedWithKid(parentRecipeId: string, kidId: string): Promise<boolean> {
    try {
      const q = query(
        collection(db, 'sharedRecipes'),
        where('parentRecipeId', '==', parentRecipeId),
        where('kidId', '==', kidId),
        where('parentUserId', '==', auth.currentUser?.uid)
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

      console.log('Recipe shared with all kids successfully');
    } catch (error) {
      console.error('Error sharing recipe with all kids:', error);
      throw error;
    }
  },

  async getSharedRecipesByParent(parentId: string): Promise<SharedRecipe[]> {
    try {
      const q = query(
        collection(db, 'sharedRecipes'),
        where('parentId', '==', parentId),
        where('parentUserId', '==', auth.currentUser?.uid)
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