import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { RecipeFavorite } from '../types';
import { validateDocumentId, ValidationError } from '../utils/validation';

export interface RecipeFavoritesService {
  toggleFavorite: (recipeId: string, parentId: string, kidId?: string) => Promise<boolean>;
  isFavorite: (recipeId: string, parentId: string, kidId?: string) => Promise<boolean>;
  getFavoriteRecipes: (parentId: string, kidId?: string) => Promise<string[]>;
  getFavoriteRecipeDetails: (parentId: string, kidId?: string) => Promise<RecipeFavorite[]>;
  removeFavorite: (recipeId: string, parentId: string, kidId?: string) => Promise<void>;
}

export const recipeFavoritesService: RecipeFavoritesService = {
  async toggleFavorite(recipeId: string, parentId: string, kidId?: string): Promise<boolean> {
    try {
      // Input validation using utility functions
      const validatedRecipeId = validateDocumentId(recipeId, 'Recipe ID');
      const validatedParentId = validateDocumentId(parentId, 'Parent ID');
      const validatedKidId = kidId ? validateDocumentId(kidId, 'Kid ID') : undefined;

      console.log('toggleFavorite called with:', { recipeId: validatedRecipeId, parentId: validatedParentId, kidId: validatedKidId });
      const favoriteId = validatedKidId ? `${validatedParentId}_${validatedKidId}_${validatedRecipeId}` : `${validatedParentId}_${validatedRecipeId}`;
      console.log('Generated favoriteId:', favoriteId);

      // Validate that the document ID is safe
      if (favoriteId.length > 1500) { // Firestore limit is ~1500 characters
        throw new Error('Document ID too long');
      }

      const favoriteRef = doc(db, 'recipeFavorites', favoriteId);

      // Check if favorite already exists
      const favoriteDoc = await getDoc(favoriteRef);
      console.log('Existing favorite document exists:', favoriteDoc.exists());

      if (__DEV__) {
        console.log('Current user auth state:', {
          uid: auth.currentUser?.uid,
          timestamp: new Date().toISOString()
        });

        console.log('Document data being written:', {
          recipeId: validatedRecipeId,
          parentId: validatedParentId,
          kidId: validatedKidId,
          favoriteId,
          documentExists: favoriteDoc.exists()
        });
      }

      const now = Timestamp.now();

      if (favoriteDoc.exists()) {
        // Toggle existing favorite
        const existingFavorite = favoriteDoc.data() as RecipeFavorite;
        const newFavoriteStatus = !existingFavorite.isFavorited;

        await setDoc(favoriteRef, {
          ...existingFavorite,
          parentUserId: auth.currentUser?.uid || existingFavorite.parentUserId,
          isFavorited: newFavoriteStatus,
          updatedAt: now,
        });

        return newFavoriteStatus;
      } else {
        // Create new favorite
        const newFavorite: Omit<RecipeFavorite, 'id'> = {
          recipeId,
          parentId,
          parentUserId: auth.currentUser?.uid || '',
          ...(kidId && { kidId }),  // Only include kidId if it exists
          isFavorited: true,
          createdAt: now,
          updatedAt: now,
        };

        await setDoc(favoriteRef, newFavorite);
        return true;
      }
    } catch (error) {
      console.error('Error toggling favorite:', error);
      throw error;
    }
  },

  async isFavorite(recipeId: string, parentId: string, kidId?: string): Promise<boolean> {
    try {
      // Input validation
      if (!recipeId || !parentId) {
        console.error('Invalid parameters for isFavorite');
        return false;
      }
      if (recipeId.length > 100 || parentId.length > 100 || (kidId && kidId.length > 100)) {
        console.error('Parameter length validation failed');
        return false;
      }

      const favoriteId = kidId ? `${parentId}_${kidId}_${recipeId}` : `${parentId}_${recipeId}`;

      if (favoriteId.length > 1500) {
        console.error('Generated favoriteId too long');
        return false;
      }

      const favoriteRef = doc(db, 'recipeFavorites', favoriteId);

      console.log('isFavorite attempting to read document:', {
        favoriteId,
        user: auth.currentUser?.uid,
        timestamp: new Date().toISOString()
      });

      const favoriteDoc = await getDoc(favoriteRef);

      if (favoriteDoc.exists()) {
        const favorite = favoriteDoc.data() as RecipeFavorite;
        return favorite.isFavorited === true; // Explicit boolean check
      }

      return false;
    } catch (error) {
      console.error('Error checking favorite status:', error);
      return false;
    }
  },

  async getFavoriteRecipes(parentId: string, kidId?: string): Promise<string[]> {
    try {
      // Input validation
      if (!parentId) {
        console.error('Invalid parentId for getFavoriteRecipes');
        return [];
      }
      if (parentId.length > 100 || (kidId && kidId.length > 100)) {
        console.error('Parameter length validation failed for getFavoriteRecipes');
        return [];
      }

      const favoritesRef = collection(db, 'recipeFavorites');
      let q;

      if (kidId) {
        q = query(
          favoritesRef,
          where('parentId', '==', parentId),
          where('kidId', '==', kidId),
          where('isFavorited', '==', true)
        );
      } else {
        // For parent-only favorites, kidId field should not exist or be undefined
        q = query(
          favoritesRef,
          where('parentId', '==', parentId),
          where('isFavorited', '==', true)
        );
      }

      const snapshot = await getDocs(q);
      const favoriteRecipeIds: string[] = [];

      snapshot.forEach((doc) => {
        const favorite = doc.data() as RecipeFavorite;
        // Additional filtering for parent-only favorites when kidId is not provided
        if (kidId) {
          // For kid favorites, ensure kidId matches
          if (favorite.kidId === kidId) {
            favoriteRecipeIds.push(favorite.recipeId);
          }
        } else {
          // For parent favorites, ensure kidId is undefined or not present
          if (!favorite.kidId) {
            favoriteRecipeIds.push(favorite.recipeId);
          }
        }
      });

      return favoriteRecipeIds;
    } catch (error) {
      console.error('Error getting favorite recipes:', error);
      return [];
    }
  },

  async getFavoriteRecipeDetails(parentId: string, kidId?: string): Promise<RecipeFavorite[]> {
    try {
      // Input validation
      if (!parentId) {
        console.error('Invalid parentId for getFavoriteRecipeDetails');
        return [];
      }
      if (parentId.length > 100 || (kidId && kidId.length > 100)) {
        console.error('Parameter length validation failed for getFavoriteRecipeDetails');
        return [];
      }

      const favoritesRef = collection(db, 'recipeFavorites');
      let q;

      if (kidId) {
        q = query(
          favoritesRef,
          where('parentId', '==', parentId),
          where('kidId', '==', kidId),
          where('isFavorited', '==', true)
        );
      } else {
        // For parent-only favorites, kidId field should not exist or be undefined
        q = query(
          favoritesRef,
          where('parentId', '==', parentId),
          where('isFavorited', '==', true)
        );
      }

      const snapshot = await getDocs(q);
      const favorites: RecipeFavorite[] = [];

      snapshot.forEach((doc) => {
        const favorite = { id: doc.id, ...doc.data() } as RecipeFavorite;
        // Additional filtering for parent-only favorites when kidId is not provided
        if (kidId) {
          // For kid favorites, ensure kidId matches
          if (favorite.kidId === kidId) {
            favorites.push(favorite);
          }
        } else {
          // For parent favorites, ensure kidId is undefined or not present
          if (!favorite.kidId) {
            favorites.push(favorite);
          }
        }
      });

      return favorites.sort((a, b) =>
        new Date(b.updatedAt.toDate()).getTime() - new Date(a.updatedAt.toDate()).getTime()
      );
    } catch (error) {
      console.error('Error getting favorite recipe details:', error);
      return [];
    }
  },

  async removeFavorite(recipeId: string, parentId: string, kidId?: string): Promise<void> {
    try {
      // Input validation
      if (!recipeId || !parentId) {
        throw new Error('Missing required parameters: recipeId and parentId are required');
      }
      if (recipeId.length > 100 || parentId.length > 100 || (kidId && kidId.length > 100)) {
        throw new Error('Invalid parameter length');
      }

      const favoriteId = kidId ? `${parentId}_${kidId}_${recipeId}` : `${parentId}_${recipeId}`;

      if (favoriteId.length > 1500) {
        throw new Error('Document ID too long');
      }

      const favoriteRef = doc(db, 'recipeFavorites', favoriteId);
      await deleteDoc(favoriteRef);
    } catch (error) {
      console.error('Error removing favorite:', error);
      throw error;
    }
  },
};
