import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  Timestamp,
  updateDoc,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { db } from './firebase';
import { recipeService } from './recipes';
import type { RecipeRating } from '../types';

export interface RecipeRatingsService {
  rateRecipe: (recipeId: string, kidId: string, parentId: string, rating: 1 | 2 | 3 | 4 | 5, comment?: string) => Promise<void>;
  getRecipeRatings: (recipeId: string) => Promise<RecipeRating[]>;
  getKidRating: (recipeId: string, kidId: string) => Promise<RecipeRating | null>;
  getAverageRating: (recipeId: string) => Promise<{ average: number; count: number }>;
  updateRecipeAverageRating: (recipeId: string) => Promise<void>;
}

const RATING_EMOJIS: Record<1 | 2 | 3 | 4 | 5, '😕' | '😐' | '🙂' | '😋' | '🤤'> = {
  1: '😕',
  2: '😐',
  3: '🙂',
  4: '😋',
  5: '🤤'
};

export const recipeRatingsService: RecipeRatingsService = {
  async rateRecipe(
    recipeId: string,
    kidId: string,
    parentId: string,
    rating: 1 | 2 | 3 | 4 | 5,
    comment?: string
  ): Promise<void> {
    try {
      const ratingId = `${kidId}_${recipeId}`;
      const ratingRef = doc(db, 'recipeRatings', ratingId);
      const now = Timestamp.now();

      const newRating: Omit<RecipeRating, 'id'> = {
        recipeId,
        kidId,
        parentId,
        rating,
        emoji: RATING_EMOJIS[rating],
        comment,
        createdAt: now,
      };

      await setDoc(ratingRef, newRating);

      // Update the recipe's average rating
      await this.updateRecipeAverageRating(recipeId);

    } catch (error) {
      console.error('Error rating recipe:', error);
      throw error;
    }
  },

  async getRecipeRatings(recipeId: string): Promise<RecipeRating[]> {
    try {
      const ratingsRef = collection(db, 'recipeRatings');
      const q = query(ratingsRef, where('recipeId', '==', recipeId));
      const snapshot = await getDocs(q);

      const ratings: RecipeRating[] = [];
      snapshot.forEach((doc) => {
        const rating = { id: doc.id, ...doc.data() } as RecipeRating;
        ratings.push(rating);
      });

      return ratings.sort((a, b) =>
        new Date(b.createdAt.toDate()).getTime() - new Date(a.createdAt.toDate()).getTime()
      );
    } catch (error) {
      console.error('Error getting recipe ratings:', error);
      return [];
    }
  },

  async getKidRating(recipeId: string, kidId: string): Promise<RecipeRating | null> {
    try {
      const ratingId = `${kidId}_${recipeId}`;
      const ratingRef = doc(db, 'recipeRatings', ratingId);
      const ratingDoc = await getDoc(ratingRef);

      if (ratingDoc.exists()) {
        return { id: ratingDoc.id, ...ratingDoc.data() } as RecipeRating;
      }

      return null;
    } catch (error) {
      console.error('Error getting kid rating:', error);
      return null;
    }
  },

  async getAverageRating(recipeId: string): Promise<{ average: number; count: number }> {
    try {
      const ratings = await this.getRecipeRatings(recipeId);

      if (ratings.length === 0) {
        return { average: 0, count: 0 };
      }

      const total = ratings.reduce((sum, rating) => sum + rating.rating, 0);
      const average = total / ratings.length;

      return {
        average: Math.round(average * 10) / 10, // Round to 1 decimal place
        count: ratings.length
      };
    } catch (error) {
      console.error('Error calculating average rating:', error);
      return { average: 0, count: 0 };
    }
  },

  async updateRecipeAverageRating(recipeId: string): Promise<void> {
    try {
      const { average, count } = await this.getAverageRating(recipeId);

      // Update the recipe document with the new average rating
      const recipeRef = doc(db, 'recipes', recipeId);
      await updateDoc(recipeRef, {
        averageRating: average,
        ratingCount: count,
        updatedAt: Timestamp.now()
      });

    } catch (error) {
      console.error('Error updating recipe average rating:', error);
      throw error;
    }
  },
};

// Helper functions for UI components
export const getRatingEmoji = (rating: number): string => {
  if (rating >= 4.5) return '🤤';
  if (rating >= 3.5) return '😋';
  if (rating >= 2.5) return '🙂';
  if (rating >= 1.5) return '😐';
  return '😕';
};

export const getRatingText = (rating: number): string => {
  if (rating >= 4.5) return 'Amazing!';
  if (rating >= 3.5) return 'Yummy!';
  if (rating >= 2.5) return 'Good';
  if (rating >= 1.5) return 'Okay';
  return 'Not for me';
};

export const RATING_OPTIONS = [
  { value: 5, emoji: '🤤', text: 'Amazing!', color: '#10b981' },
  { value: 4, emoji: '😋', text: 'Yummy!', color: '#34d399' },
  { value: 3, emoji: '🙂', text: 'Good', color: '#fbbf24' },
  { value: 2, emoji: '😐', text: 'Okay', color: '#f97316' },
  { value: 1, emoji: '😕', text: 'Not for me', color: '#ef4444' },
] as const;