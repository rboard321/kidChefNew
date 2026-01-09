import { logger } from '../utils/logger';
import {
  collection,
  doc,
  addDoc,
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
import { cacheService } from './cacheService';
import type { Recipe, KidRecipe } from '../types';

export interface RecipeService {
  addRecipe: (recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>, parentId: string) => Promise<string>;
  updateRecipe: (recipeId: string, updates: Partial<Recipe>) => Promise<void>;
  deleteRecipe: (recipeId: string) => Promise<void>;
  getUserRecipes: (parentId: string) => Promise<Recipe[]>;
  getRecipe: (recipeId: string) => Promise<Recipe | null>;
  createKidFriendlyVersion: (recipeId: string, kidRecipe: Omit<KidRecipe, 'id' | 'createdAt'>) => Promise<string>;
  getKidRecipe: (kidRecipeId: string) => Promise<KidRecipe | null>;
}

export const buildRecipeData = (
  recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>,
  parentId: string,
  now: Timestamp
): Omit<Recipe, 'id'> => ({
  ...recipe,
  // DO NOT add userId here – parentId is the only ownership field
  parentId,
  status: recipe.status ?? 'active',
  createdAt: now,
  updatedAt: now,
});

export const recipeService: RecipeService = {
  async addRecipe(recipe: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>, parentId: string) {
    try {
      const now = Timestamp.now();
      const recipeData = buildRecipeData(recipe, parentId, now);

      const docRef = await addDoc(collection(db, 'recipes'), recipeData);

      // Invalidate parent's recipe list cache
      cacheService.invalidateRecipes(parentId);

      return docRef.id;
    } catch (error) {
      console.error('Error adding recipe:', error);
      throw error;
    }
  },

  async updateRecipe(recipeId: string, updates: Partial<Recipe>) {
    try {
      const updateData = {
        ...updates,
        updatedAt: Timestamp.now(),
      };

      await updateDoc(doc(db, 'recipes', recipeId), updateData);

      // Invalidate both the recipe detail and the parent's recipe list cache
      cacheService.invalidateRecipeDetail(recipeId);
      if (updates.parentId) {
        cacheService.invalidateRecipes(updates.parentId);
      }
    } catch (error) {
      console.error('Error updating recipe:', error);
      throw error;
    }
  },

  async deleteRecipe(recipeId: string) {
    try {
      // First get the recipe to find the parentId for cache invalidation
      const recipeToDelete = await this.getRecipe(recipeId);

      await deleteDoc(doc(db, 'recipes', recipeId));

      // Invalidate both the recipe detail cache and the parent's recipe list cache
      cacheService.invalidateRecipeDetail(recipeId);
      if (recipeToDelete?.parentId) {
        cacheService.invalidateRecipes(recipeToDelete.parentId);
      }
    } catch (error) {
      console.error('Error deleting recipe:', error);
      throw error;
    }
  },

  async getUserRecipes(parentId: string, skipCache: boolean = false): Promise<Recipe[]> {
    try {
      if (!auth.currentUser) {
        if (__DEV__) {
          logger.debug('Skipping recipe fetch - no authenticated user.');
        }
        return [];
      }
      // Check cache first (unless explicitly skipping cache for refresh)
      if (!skipCache) {
        const cached = cacheService.getRecipes(parentId);
        if (cached && cached.length > 0) {
          if (__DEV__) {
            logger.debug('Returning cached recipes for parentId:', parentId);
          }
          return cached;
        }
      }

      if (__DEV__) {
        logger.debug(skipCache ? 'Skipping cache - fetching fresh recipes from Firestore for parentId:' : 'Cache miss - fetching recipes from Firestore for parentId:', parentId);
      }

      // Query recipes by parentId only (simplified from legacy dual-field approach)
      const q = query(
        collection(db, 'recipes'),
        where('parentId', '==', parentId)
      );

      const querySnapshot = await getDocs(q);
      const recipes: Recipe[] = [];

      querySnapshot.forEach((doc) => {
        recipes.push({
          id: doc.id,
          ...doc.data(),
        } as Recipe);
      });

      // Sort by most recently updated
      const sortedRecipes = recipes.sort((a, b) => {
        const aTime = a.updatedAt ? (a.updatedAt instanceof Date ? a.updatedAt.getTime() : a.updatedAt.toMillis()) : 0;
        const bTime = b.updatedAt ? (b.updatedAt instanceof Date ? b.updatedAt.getTime() : b.updatedAt.toMillis()) : 0;
        return bTime - aTime;
      });

      // Cache the results
      cacheService.setRecipes(parentId, sortedRecipes);

      return sortedRecipes;
    } catch (error) {
      console.error('Error fetching parent recipes:', error);
      throw error;
    }
  },

  async getRecipe(recipeId: string): Promise<Recipe | null> {
    try {
      // Check cache first
      const cached = cacheService.getRecipeDetail(recipeId);
      if (cached) {
        logger.debug('Returning cached recipe detail for:', recipeId);
        return cached;
      }

      logger.debug('Cache miss - fetching recipe from Firestore:', recipeId);

      const docSnap = await getDoc(doc(db, 'recipes', recipeId));
      if (docSnap.exists()) {
        const recipe = {
          id: docSnap.id,
          ...docSnap.data(),
        } as Recipe;

        // Cache the result
        cacheService.setRecipeDetail(recipeId, recipe);

        return recipe;
      }
      return null;
    } catch (error) {
      console.error('Error fetching recipe:', error);
      return null;
    }
  },

  async createKidFriendlyVersion(recipeId: string, kidRecipe: Omit<KidRecipe, 'id' | 'createdAt'>) {
    try {
      const kidRecipeData: Omit<KidRecipe, 'id'> = {
        ...kidRecipe,
        originalRecipeId: recipeId,
        status: kidRecipe.status ?? 'active',
        createdAt: Timestamp.now(),
      };

      const docRef = await addDoc(collection(db, 'kidRecipes'), kidRecipeData);

      // Update the original recipe to reference the kid version
      await updateDoc(doc(db, 'recipes', recipeId), {
        kidVersionId: docRef.id,
        updatedAt: Timestamp.now(),
      });

      return docRef.id;
    } catch (error) {
      console.error('Error creating kid-friendly version:', error);
      throw error;
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
};
