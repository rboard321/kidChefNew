import {
  collection,
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  Timestamp,
  increment
} from 'firebase/firestore';
import { db } from './firebase';
import type { KidBadge, KidAchievement, Recipe } from '../types';

export interface KidProgress {
  kidId: string;
  recipesCompleted: number;
  badges: KidBadge[];
  achievements: KidAchievement[];
  streaks: {
    current: number;
    best: number;
    lastActivity?: Date;
  };
  categoryProgress: {
    vegetables: number;
    fruits: number;
    desserts: number;
    breakfast: number;
    dinner: number;
  };
  safetyScore: number; // 0-100, tracks how well they follow safety notes
  createdAt: Date;
  updatedAt: Date;
}

// Predefined badge definitions
export const AVAILABLE_BADGES: Omit<KidBadge, 'earnedAt'>[] = [
  {
    id: 'first_recipe',
    name: 'First Recipe',
    description: 'Completed your very first recipe!',
    emoji: '🎯',
    category: 'cooking'
  },
  {
    id: 'recipe_5',
    name: '5 Recipes',
    description: 'Completed 5 delicious recipes!',
    emoji: '⭐',
    category: 'cooking'
  },
  {
    id: 'recipe_10',
    name: 'Recipe Explorer',
    description: 'Completed 10 amazing recipes!',
    emoji: '🌟',
    category: 'cooking'
  },
  {
    id: 'recipe_20',
    name: 'Recipe Master',
    description: 'Completed 20 fantastic recipes!',
    emoji: '👑',
    category: 'cooking'
  },
  {
    id: 'safety_star',
    name: 'Safety Star',
    description: 'Followed all safety notes perfectly!',
    emoji: '🛡️',
    category: 'safety'
  },
  {
    id: 'careful_chef',
    name: 'Careful Chef',
    description: 'Completed 5 recipes with perfect safety!',
    emoji: '🥇',
    category: 'safety'
  },
  {
    id: 'veggie_lover',
    name: 'Veggie Lover',
    description: 'Completed 3 vegetable-focused recipes!',
    emoji: '🥕',
    category: 'healthy'
  },
  {
    id: 'fruit_fan',
    name: 'Fruit Fan',
    description: 'Completed 3 fruit-based recipes!',
    emoji: '🍎',
    category: 'healthy'
  },
  {
    id: 'balanced_chef',
    name: 'Balanced Chef',
    description: 'Cooked recipes from all food groups!',
    emoji: '🌈',
    category: 'healthy'
  },
  {
    id: 'weekend_warrior',
    name: 'Weekend Warrior',
    description: 'Cooked on 3 different weekends!',
    emoji: '💪',
    category: 'special'
  },
  {
    id: 'week_streak',
    name: 'Weekly Chef',
    description: 'Cooked for 7 days in a row!',
    emoji: '🔥',
    category: 'special'
  },
  {
    id: 'breakfast_master',
    name: 'Breakfast Master',
    description: 'Completed 5 breakfast recipes!',
    emoji: '🥞',
    category: 'cooking'
  },
  {
    id: 'dessert_artist',
    name: 'Dessert Artist',
    description: 'Completed 3 dessert recipes!',
    emoji: '🎂',
    category: 'creativity'
  }
];

export interface BadgeEarnedResult {
  newBadges: KidBadge[];
  achievements: KidAchievement[];
}

class KidProgressService {
  // Get or create progress for a kid
  async getProgress(kidId: string): Promise<KidProgress> {
    const progressDoc = doc(db, 'kidProgress', kidId);
    const progressSnap = await getDoc(progressDoc);

    if (progressSnap.exists()) {
      return {
        ...progressSnap.data(),
        createdAt: progressSnap.data().createdAt?.toDate() || new Date(),
        updatedAt: progressSnap.data().updatedAt?.toDate() || new Date(),
      } as KidProgress;
    }

    // Create initial progress
    const initialProgress: KidProgress = {
      kidId,
      recipesCompleted: 0,
      badges: [],
      achievements: [],
      streaks: { current: 0, best: 0 },
      categoryProgress: {
        vegetables: 0,
        fruits: 0,
        desserts: 0,
        breakfast: 0,
        dinner: 0,
      },
      safetyScore: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await setDoc(progressDoc, {
      ...initialProgress,
      createdAt: Timestamp.fromDate(initialProgress.createdAt),
      updatedAt: Timestamp.fromDate(initialProgress.updatedAt),
    });

    return initialProgress;
  }

  // Record recipe completion and check for new badges
  async recordRecipeCompletion(kidId: string, recipe: Recipe, safetyFollowed: boolean = true): Promise<BadgeEarnedResult> {
    const progress = await this.getProgress(kidId);
    const newBadges: KidBadge[] = [];
    const achievements: KidAchievement[] = [];

    // Update basic progress
    const updates: any = {
      recipesCompleted: increment(1),
      updatedAt: Timestamp.now(),
    };

    // Update category progress based on recipe tags/type
    const recipeCategories = this.categorizeRecipe(recipe);
    for (const category of recipeCategories) {
      updates[`categoryProgress.${category}`] = increment(1);
    }

    // Update safety score
    if (safetyFollowed) {
      updates.safetyScore = Math.min(100, progress.safetyScore + 1);
    } else {
      updates.safetyScore = Math.max(0, progress.safetyScore - 5);
    }

    // Apply updates first
    await updateDoc(doc(db, 'kidProgress', kidId), updates);

    // Check for new badges based on updated progress
    const updatedProgress = await this.getProgress(kidId);
    const earnedBadges = this.checkForNewBadges(updatedProgress);

    // Award new badges
    if (earnedBadges.length > 0) {
      const badgesToAdd = earnedBadges.map(badge => ({
        ...badge,
        earnedAt: Timestamp.now()
      }));

      await updateDoc(doc(db, 'kidProgress', kidId), {
        badges: arrayUnion(...badgesToAdd)
      });

      newBadges.push(...earnedBadges.map(badge => ({
        ...badge,
        earnedAt: new Date()
      })));
    }

    return { newBadges, achievements };
  }

  // Check which new badges should be awarded
  private checkForNewBadges(progress: KidProgress): Omit<KidBadge, 'earnedAt'>[] {
    const earnedBadgeIds = new Set(progress.badges.map(b => b.id));
    const newBadges: Omit<KidBadge, 'earnedAt'>[] = [];

    // Check cooking milestones
    if (progress.recipesCompleted >= 1 && !earnedBadgeIds.has('first_recipe')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'first_recipe')!);
    }
    if (progress.recipesCompleted >= 5 && !earnedBadgeIds.has('recipe_5')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'recipe_5')!);
    }
    if (progress.recipesCompleted >= 10 && !earnedBadgeIds.has('recipe_10')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'recipe_10')!);
    }
    if (progress.recipesCompleted >= 20 && !earnedBadgeIds.has('recipe_20')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'recipe_20')!);
    }

    // Check safety badges
    if (progress.safetyScore >= 95 && !earnedBadgeIds.has('safety_star')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'safety_star')!);
    }
    if (progress.safetyScore >= 90 && progress.recipesCompleted >= 5 && !earnedBadgeIds.has('careful_chef')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'careful_chef')!);
    }

    // Check category badges
    if (progress.categoryProgress.vegetables >= 3 && !earnedBadgeIds.has('veggie_lover')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'veggie_lover')!);
    }
    if (progress.categoryProgress.fruits >= 3 && !earnedBadgeIds.has('fruit_fan')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'fruit_fan')!);
    }
    if (progress.categoryProgress.breakfast >= 5 && !earnedBadgeIds.has('breakfast_master')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'breakfast_master')!);
    }
    if (progress.categoryProgress.desserts >= 3 && !earnedBadgeIds.has('dessert_artist')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'dessert_artist')!);
    }

    // Check balanced cooking
    const categories = progress.categoryProgress;
    if (categories.vegetables > 0 && categories.fruits > 0 && categories.desserts > 0 &&
        categories.breakfast > 0 && categories.dinner > 0 && !earnedBadgeIds.has('balanced_chef')) {
      newBadges.push(AVAILABLE_BADGES.find(b => b.id === 'balanced_chef')!);
    }

    return newBadges;
  }

  // Categorize recipe based on ingredients, tags, and title
  private categorizeRecipe(recipe: Recipe): string[] {
    const categories: string[] = [];
    const text = `${recipe.title} ${recipe.description || ''} ${recipe.ingredients.join(' ')}`.toLowerCase();

    // Check for vegetables
    const veggieKeywords = ['vegetable', 'veggie', 'carrot', 'broccoli', 'spinach', 'lettuce', 'tomato', 'onion', 'pepper', 'cucumber'];
    if (veggieKeywords.some(keyword => text.includes(keyword))) {
      categories.push('vegetables');
    }

    // Check for fruits
    const fruitKeywords = ['fruit', 'apple', 'banana', 'orange', 'strawberry', 'blueberry', 'grape', 'peach', 'berry'];
    if (fruitKeywords.some(keyword => text.includes(keyword))) {
      categories.push('fruits');
    }

    // Check for desserts
    const dessertKeywords = ['dessert', 'cake', 'cookie', 'pie', 'ice cream', 'chocolate', 'candy', 'sweet'];
    if (dessertKeywords.some(keyword => text.includes(keyword))) {
      categories.push('desserts');
    }

    // Check meal type
    if (recipe.mealType) {
      if (recipe.mealType === 'breakfast') categories.push('breakfast');
      if (recipe.mealType === 'dinner') categories.push('dinner');
    } else {
      // Infer from title
      const breakfastKeywords = ['breakfast', 'pancake', 'waffle', 'cereal', 'oatmeal', 'toast'];
      const dinnerKeywords = ['dinner', 'pasta', 'soup', 'stew', 'casserole', 'chicken', 'beef'];

      if (breakfastKeywords.some(keyword => text.includes(keyword))) {
        categories.push('breakfast');
      }
      if (dinnerKeywords.some(keyword => text.includes(keyword))) {
        categories.push('dinner');
      }
    }

    return categories;
  }

  // Get all available badges for display
  getAvailableBadges(): Omit<KidBadge, 'earnedAt'>[] {
    return AVAILABLE_BADGES;
  }

  // Reset progress (for parent use only)
  async resetProgress(kidId: string): Promise<void> {
    const initialProgress: Omit<KidProgress, 'kidId'> = {
      recipesCompleted: 0,
      badges: [],
      achievements: [],
      streaks: { current: 0, best: 0 },
      categoryProgress: {
        vegetables: 0,
        fruits: 0,
        desserts: 0,
        breakfast: 0,
        dinner: 0,
      },
      safetyScore: 100,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await setDoc(doc(db, 'kidProgress', kidId), {
      ...initialProgress,
      createdAt: Timestamp.fromDate(initialProgress.createdAt),
      updatedAt: Timestamp.fromDate(initialProgress.updatedAt),
    });
  }
}

export const kidProgressService = new KidProgressService();