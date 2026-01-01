import type { Recipe } from '../types';

export interface SafetyFlag {
  category: 'alcohol' | 'raw_food' | 'sharp_tools' | 'high_heat' | 'allergens' | 'complex_technique';
  description: string;
  found: string; // The actual text that triggered the flag
}

export interface RecipeSafetyCheck {
  isCompletelyKidSafe: boolean;
  flags: SafetyFlag[];
  warningMessage?: string;
}

const SAFETY_KEYWORDS = {
  alcohol: {
    keywords: ['wine', 'beer', 'alcohol', 'liquor', 'vodka', 'whiskey', 'rum', 'gin', 'brandy', 'champagne', 'bourbon', 'tequila', 'sake'],
    description: 'Contains alcohol'
  },
  raw_food: {
    keywords: ['raw egg', 'raw chicken', 'raw beef', 'raw pork', 'raw fish', 'sushi', 'tartare', 'carpaccio', 'raw milk'],
    description: 'Contains raw or undercooked ingredients'
  },
  sharp_tools: {
    keywords: ['sharp knife', 'chef\'s knife', 'knife skills', 'julienne', 'chiffonade', 'mandoline', 'food processor blade'],
    description: 'Requires sharp kitchen tools'
  },
  high_heat: {
    keywords: ['deep fry', 'frying oil', 'hot oil', 'broil', 'grill', 'flame', 'flambé', 'torch', 'searing'],
    description: 'Involves high heat or open flame'
  },
  complex_technique: {
    keywords: ['tempering', 'emulsification', 'reduction', 'clarify', 'confit', 'sous vide', 'molecular'],
    description: 'Uses advanced cooking techniques'
  }
};

export function checkRecipeSafety(recipe: Recipe): RecipeSafetyCheck {
  const flags: SafetyFlag[] = [];

  // Combine all text from the recipe
  const allText = [
    recipe.title,
    recipe.description || '',
    ...recipe.ingredients,
    ...recipe.instructions
  ].join(' ').toLowerCase();

  // Check for each safety category
  Object.entries(SAFETY_KEYWORDS).forEach(([category, config]) => {
    config.keywords.forEach(keyword => {
      if (allText.includes(keyword.toLowerCase())) {
        flags.push({
          category: category as SafetyFlag['category'],
          description: config.description,
          found: keyword
        });
      }
    });
  });

  // Remove duplicate flags (same category)
  const uniqueFlags = flags.filter((flag, index, self) =>
    index === self.findIndex(f => f.category === flag.category)
  );

  const isCompletelyKidSafe = uniqueFlags.length === 0;

  let warningMessage: string | undefined;
  if (!isCompletelyKidSafe) {
    const flagDescriptions = uniqueFlags.map(f => f.description.toLowerCase()).join(', ');
    warningMessage = `This recipe ${flagDescriptions}. Make sure to supervise kids closely or handle these parts yourself.`;
  }

  return {
    isCompletelyKidSafe,
    flags: uniqueFlags,
    warningMessage
  };
}

export function generateSafetyWarningText(flags: SafetyFlag[]): string {
  if (flags.length === 0) return '';

  const categories = flags.map(f => f.description.toLowerCase());
  const foundItems = flags.map(f => f.found).join(', ');

  if (flags.length === 1) {
    return `This recipe includes ${foundItems}. Kids may need adult supervision for safety.`;
  } else {
    return `This recipe includes ${foundItems} and other items that may require adult supervision.`;
  }
}