import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from './firebase';
import { recipeService } from './recipes';
import { kidProgressService } from './kidProgressService';
import { recipeSharingService } from './recipeSharing';
import type { Recipe, KidProfile, RecipeRecommendation, RecipeCategory } from '../types';

export interface RecipeRecommendationsService {
  generateRecommendations: (kidId: string) => Promise<Recipe[]>;
  getRecommendationsForKid: (kidId: string, maxResults?: number) => Promise<Recipe[]>;
  updateRecommendations: (kidId: string) => Promise<void>;
  getPopularRecipes: (maxResults?: number) => Promise<Recipe[]>;
  getCategoryRecommendations: (kidProfile: KidProfile, category: RecipeCategory) => Promise<Recipe[]>;
}

export const recipeRecommendationsService: RecipeRecommendationsService = {
  async generateRecommendations(kidId: string): Promise<Recipe[]> {
    try {
      // Get kid profile and progress
      const kidProfile = await this.getKidProfile(kidId);
      if (!kidProfile) {
        console.warn('Kid profile not found for recommendations');
        return [];
      }

      // Get shared recipes available to this kid
      const sharedRecipes = await recipeSharingService.getSharedRecipesForKid(kidId);

      if (sharedRecipes.length === 0) {
        return [];
      }

      // Get kid's cooking progress
      const progress = await kidProgressService.getProgress(kidId);
      const completedRecipeIds = new Set(progress.completedRecipes || []);

      // Score recipes based on multiple factors
      const scoredRecipes = await Promise.all(
        sharedRecipes.map(async (recipe) => {
          const score = await this.calculateRecommendationScore(recipe, kidProfile, completedRecipeIds);
          return { recipe, score };
        })
      );

      // Sort by score and return top recommendations
      const recommendations = scoredRecipes
        .filter(({ score }) => score > 0.3) // Only recommend recipes with decent scores
        .sort((a, b) => b.score - a.score)
        .slice(0, 10) // Top 10 recommendations
        .map(({ recipe }) => recipe);

      return recommendations;
    } catch (error) {
      console.error('Error generating recommendations:', error);
      return [];
    }
  },

  async getRecommendationsForKid(kidId: string, maxResults = 5): Promise<Recipe[]> {
    try {
      // For now, generate fresh recommendations each time
      // In production, you might cache these
      const recommendations = await this.generateRecommendations(kidId);
      return recommendations.slice(0, maxResults);
    } catch (error) {
      console.error('Error getting recommendations for kid:', error);
      return [];
    }
  },

  async updateRecommendations(kidId: string): Promise<void> {
    try {
      // This could be used to pre-compute and store recommendations
      // For now, we generate them on-demand
      console.log('Recommendation update triggered for kid:', kidId);
    } catch (error) {
      console.error('Error updating recommendations:', error);
    }
  },

  async getPopularRecipes(maxResults = 10): Promise<Recipe[]> {
    try {
      // Get recipes with high ratings and rating counts
      const recipesRef = collection(db, 'recipes');
      const q = query(
        recipesRef,
        where('averageRating', '>=', 4),
        where('ratingCount', '>=', 3),
        orderBy('averageRating', 'desc'),
        orderBy('ratingCount', 'desc'),
        limit(maxResults)
      );

      const snapshot = await getDocs(q);
      const recipes: Recipe[] = [];

      snapshot.forEach((doc) => {
        const recipe = { id: doc.id, ...doc.data() } as Recipe;
        recipes.push(recipe);
      });

      return recipes;
    } catch (error) {
      console.error('Error getting popular recipes:', error);
      return [];
    }
  },

  async getCategoryRecommendations(kidProfile: KidProfile, category: RecipeCategory): Promise<Recipe[]> {
    try {
      // This could filter shared recipes by category
      // For now, return empty array as categories aren't fully implemented yet
      return [];
    } catch (error) {
      console.error('Error getting category recommendations:', error);
      return [];
    }
  },

  // Helper methods
  async getKidProfile(kidId: string): Promise<KidProfile | null> {
    try {
      const kidDoc = doc(db, 'kidProfiles', kidId);
      const kidSnapshot = await getDoc(kidDoc);

      if (kidSnapshot.exists()) {
        return { id: kidSnapshot.id, ...kidSnapshot.data() } as KidProfile;
      }

      return null;
    } catch (error) {
      console.error('Error getting kid profile:', error);
      return null;
    }
  },

  async calculateRecommendationScore(
    recipe: Recipe,
    kidProfile: KidProfile,
    completedRecipeIds: Set<string>
  ): Promise<number> {
    let score = 0.5; // Base score

    // Penalty for already completed recipes
    if (completedRecipeIds.has(recipe.id)) {
      score -= 0.4;
    }

    // Age appropriateness
    const recipeComplexity = this.getRecipeComplexity(recipe);
    if (this.isAgeAppropriate(recipeComplexity, kidProfile.age)) {
      score += 0.2;
    } else {
      score -= 0.3;
    }

    // Skill level match
    if (recipe.difficulty === 'easy' && kidProfile.readingLevel === 'beginner') {
      score += 0.2;
    } else if (recipe.difficulty === 'medium' && kidProfile.readingLevel === 'intermediate') {
      score += 0.2;
    } else if (recipe.difficulty === 'hard' && kidProfile.readingLevel === 'advanced') {
      score += 0.2;
    }

    // Allergy safety
    const hasAllergenConflict = this.hasAllergenConflict(recipe, kidProfile.allergyFlags || []);
    if (hasAllergenConflict) {
      score -= 0.8; // Heavy penalty for allergen conflicts
    }

    // Recipe rating boost
    if (recipe.averageRating && recipe.averageRating >= 4) {
      score += 0.1;
    }

    // Popular recipes boost
    if (recipe.ratingCount && recipe.ratingCount >= 5) {
      score += 0.1;
    }

    // Ensure score is between 0 and 1
    return Math.max(0, Math.min(1, score));
  },

  getRecipeComplexity(recipe: Recipe): 'simple' | 'moderate' | 'complex' {
    let complexity = 0;

    // Check ingredients count
    if (recipe.ingredients.length > 10) complexity += 1;
    if (recipe.ingredients.length > 15) complexity += 1;

    // Check cooking time
    const cookTime = typeof recipe.cookTime === 'number'
      ? recipe.cookTime
      : parseInt(recipe.cookTime?.toString().replace(/\D/g, '') || '30');

    if (cookTime > 45) complexity += 1;
    if (cookTime > 90) complexity += 1;

    // Check difficulty
    if (recipe.difficulty === 'medium') complexity += 1;
    if (recipe.difficulty === 'hard') complexity += 2;

    // Check equipment requirements
    if (recipe.equipment && recipe.equipment.length > 5) complexity += 1;

    if (complexity <= 1) return 'simple';
    if (complexity <= 3) return 'moderate';
    return 'complex';
  },

  isAgeAppropriate(complexity: 'simple' | 'moderate' | 'complex', age: number): boolean {
    if (age <= 6) return complexity === 'simple';
    if (age <= 10) return complexity !== 'complex';
    return true; // 11+ can handle any complexity with supervision
  },

  hasAllergenConflict(recipe: Recipe, kidAllergens: string[]): boolean {
    if (!recipe.allergens || kidAllergens.length === 0) return false;

    return recipe.allergens.some(allergen =>
      kidAllergens.some(kidAllergen =>
        kidAllergen.toLowerCase().includes(allergen.toLowerCase()) ||
        allergen.toLowerCase().includes(kidAllergen.toLowerCase())
      )
    );
  },
};