import { describe, expect, it } from 'vitest';
import { buildKidRecipeData } from '../kidRecipeManager';

describe('buildKidRecipeData', () => {
  it('builds kid recipe data without userId', () => {
    const data = buildKidRecipeData({
      parentId: 'parent_1',
      originalRecipeId: 'recipe_1',
      originalRecipeTitle: 'Best Pancakes',
      originalRecipeImage: 'https://example.com/pancakes.jpg',
      originalRecipeUrl: 'https://example.com/pancakes',
      kidId: 'kid_1',
      kidAge: 8,
      targetReadingLevel: 'beginner',
      simplifiedIngredients: [
        {
          id: 'ing_1',
          name: 'flour',
          kidFriendlyName: 'flour',
          amount: 1,
          unit: 'cup',
          order: 1,
        },
      ],
      simplifiedSteps: [
        {
          id: 'step_1',
          step: 'Mix it up',
          kidFriendlyText: 'Mix everything together',
          order: 1,
          completed: false,
          difficulty: 'easy',
        },
      ],
      safetyNotes: [],
    });

    expect(data.parentId).toBe('parent_1');
    expect('userId' in data).toBe(false);
    expect(data.originalRecipeTitle).toBe('Best Pancakes');
    expect(data.originalRecipeImage).toBe('https://example.com/pancakes.jpg');
    expect(data.originalRecipeUrl).toBe('https://example.com/pancakes');
  });
});
