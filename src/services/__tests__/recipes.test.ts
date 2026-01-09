import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { buildRecipeData } from '../recipes';
import type { Recipe } from '../../types';

describe('buildRecipeData', () => {
  it('builds recipe data without userId', () => {
    const now = Timestamp.now();
    const input: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> = {
      parentId: 'parent_123',
      title: 'Test Recipe',
      servings: 2,
      ingredients: ['1 cup flour'],
      instructions: ['Mix it up'],
    };

    const data = buildRecipeData(input, 'parent_123', now);
    expect(data.parentId).toBe('parent_123');
    expect('userId' in data).toBe(false);
  });
});
