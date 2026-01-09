import { describe, expect, it } from 'vitest';
import { buildSharedRecipeData } from '../recipeSharing';

describe('buildSharedRecipeData', () => {
  it('builds shared recipe data without userId fields', () => {
    const data = buildSharedRecipeData(
      'recipe_1',
      'kid_1',
      'parent_1',
      'Pasta',
      'https://example.com/pasta.jpg',
      'Ava',
      '🧑‍🍳'
    );
    expect(data.parentId).toBe('parent_1');
    expect('userId' in data).toBe(false);
    expect('parentUserId' in data).toBe(false);
    expect(data.recipeTitle).toBe('Pasta');
    expect(data.kidName).toBe('Ava');
  });
});
