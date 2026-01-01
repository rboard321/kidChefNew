import type { Recipe } from '../types';

/**
 * Normalizes a search term by removing extra spaces, converting to lowercase,
 * and handling special characters for better matching
 */
export const normalizeSearchTerm = (term: string): string => {
  return term
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ') // Replace special chars with spaces
    .replace(/\s+/g, ' '); // Replace multiple spaces with single space
};

/**
 * Checks if a text field contains the search term
 */
const fieldContainsSearchTerm = (field: string | undefined, searchTerm: string): boolean => {
  if (!field) return false;
  return normalizeSearchTerm(field).includes(searchTerm);
};

/**
 * Checks if a string array field contains the search term
 */
const arrayFieldContainsSearchTerm = (field: string[] | undefined, searchTerm: string): boolean => {
  if (!field || field.length === 0) return false;
  return field.some(item => fieldContainsSearchTerm(item, searchTerm));
};

/**
 * Extracts text from ingredients array for searching
 */
const getIngredientsText = (ingredients: Recipe['ingredients']): string => {
  if (!ingredients) return '';

  return ingredients
    .map(ingredient => {
      if (typeof ingredient === 'string') {
        return ingredient;
      }
      // Handle ingredient objects
      return `${ingredient.name} ${ingredient.amount || ''} ${ingredient.unit || ''}`;
    })
    .join(' ');
};

/**
 * Searches recipes based on multiple fields with weighted relevance scoring
 */
export const searchRecipes = (recipes: Recipe[], searchTerm: string): Recipe[] => {
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

  if (!normalizedSearchTerm) {
    return recipes;
  }

  const searchWords = normalizedSearchTerm.split(' ').filter(word => word.length > 0);

  const searchResults = recipes
    .map(recipe => {
      let relevanceScore = 0;
      let matchFound = false;

      searchWords.forEach(word => {
        // Title matches (highest priority)
        if (fieldContainsSearchTerm(recipe.title, word)) {
          relevanceScore += 10;
          matchFound = true;
        }

        // Description matches
        if (fieldContainsSearchTerm(recipe.description, word)) {
          relevanceScore += 7;
          matchFound = true;
        }

        // Cuisine matches
        if (fieldContainsSearchTerm(recipe.cuisine, word)) {
          relevanceScore += 8;
          matchFound = true;
        }

        // Meal type matches
        if (fieldContainsSearchTerm(recipe.mealType, word)) {
          relevanceScore += 6;
          matchFound = true;
        }

        // Difficulty matches
        if (fieldContainsSearchTerm(recipe.difficulty, word)) {
          relevanceScore += 5;
          matchFound = true;
        }

        // Ingredients matches (lower priority but important)
        const ingredientsText = getIngredientsText(recipe.ingredients);
        if (fieldContainsSearchTerm(ingredientsText, word)) {
          relevanceScore += 3;
          matchFound = true;
        }

        // Tags matches (if we add tags in the future)
        if (recipe.tags && arrayFieldContainsSearchTerm(recipe.tags as string[], word)) {
          relevanceScore += 4;
          matchFound = true;
        }
      });

      return { recipe, relevanceScore, matchFound };
    })
    .filter(result => result.matchFound)
    .sort((a, b) => b.relevanceScore - a.relevanceScore) // Sort by relevance
    .map(result => result.recipe);

  return searchResults;
};

/**
 * Simple search for kid mode - focuses mainly on title for simplicity
 */
export const searchRecipesKidMode = (recipes: Recipe[], searchTerm: string): Recipe[] => {
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

  if (!normalizedSearchTerm) {
    return recipes;
  }

  const searchWords = normalizedSearchTerm.split(' ').filter(word => word.length > 0);

  return recipes.filter(recipe => {
    return searchWords.some(word => {
      // Focus on title and basic fields for kids
      return (
        fieldContainsSearchTerm(recipe.title, word) ||
        fieldContainsSearchTerm(recipe.cuisine, word) ||
        fieldContainsSearchTerm(recipe.mealType, word)
      );
    });
  });
};

/**
 * Gets search suggestions based on partial input
 */
export const getSearchSuggestions = (recipes: Recipe[], searchTerm: string, maxSuggestions = 5): string[] => {
  const normalizedSearchTerm = normalizeSearchTerm(searchTerm);

  if (!normalizedSearchTerm || normalizedSearchTerm.length < 2) {
    return [];
  }

  const suggestions = new Set<string>();

  recipes.forEach(recipe => {
    // Add title words that start with search term
    const titleWords = normalizeSearchTerm(recipe.title).split(' ');
    titleWords.forEach(word => {
      if (word.startsWith(normalizedSearchTerm) && word.length > normalizedSearchTerm.length) {
        suggestions.add(word);
      }
    });

    // Add cuisine types
    if (recipe.cuisine && normalizeSearchTerm(recipe.cuisine).startsWith(normalizedSearchTerm)) {
      suggestions.add(recipe.cuisine);
    }

    // Add meal types
    if (recipe.mealType && normalizeSearchTerm(recipe.mealType).startsWith(normalizedSearchTerm)) {
      suggestions.add(recipe.mealType);
    }
  });

  return Array.from(suggestions).slice(0, maxSuggestions);
};

/**
 * Filters recipes by specific criteria for advanced search
 */
export interface SearchFilters {
  cuisine?: string;
  mealType?: string;
  difficulty?: string;
  maxCookTime?: number;
  maxServings?: number;
  minServings?: number;
}

export const filterRecipes = (recipes: Recipe[], filters: SearchFilters): Recipe[] => {
  return recipes.filter(recipe => {
    // Cuisine filter
    if (filters.cuisine &&
        normalizeSearchTerm(recipe.cuisine || '') !== normalizeSearchTerm(filters.cuisine)) {
      return false;
    }

    // Meal type filter - check both mealType field and tags array
    if (filters.mealType) {
      const filterMealType = normalizeSearchTerm(filters.mealType);
      const recipeMealType = normalizeSearchTerm(recipe.mealType || '');

      // Check mealType field first
      let mealTypeMatches = recipeMealType === filterMealType;

      // If no match, check tags array as fallback
      if (!mealTypeMatches && recipe.tags && Array.isArray(recipe.tags)) {
        mealTypeMatches = recipe.tags.some(tag =>
          normalizeSearchTerm(tag) === filterMealType
        );
      }

      if (!mealTypeMatches) {
        return false;
      }
    }

    // Difficulty filter
    if (filters.difficulty &&
        normalizeSearchTerm(recipe.difficulty || '') !== normalizeSearchTerm(filters.difficulty)) {
      return false;
    }

    // Cook time filter - check cookTime first, then totalTime as fallback
    if (filters.maxCookTime) {
      const timeStr = (recipe.cookTime || recipe.totalTime || '').toString();
      if (timeStr) {
        let cookTime: number;

        // Parse time strings that might include units (e.g., "30 minutes", "1 hour")
        if (timeStr.toLowerCase().includes('hour')) {
          const hours = parseFloat(timeStr.replace(/[^\d.]/g, ''));
          cookTime = hours * 60; // Convert to minutes
        } else {
          // Extract numbers from string, assume minutes if no unit specified
          cookTime = parseFloat(timeStr.replace(/[^\d.]/g, '')) || 0;
        }

        if (cookTime > filters.maxCookTime) {
          return false;
        }
      }
    }

    // Servings filters
    if (filters.minServings && recipe.servings < filters.minServings) {
      return false;
    }
    if (filters.maxServings && recipe.servings > filters.maxServings) {
      return false;
    }

    return true;
  });
};