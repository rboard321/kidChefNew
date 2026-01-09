import type { Recipe, ReadingLevel, KidIngredient, KidStep } from '../types';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { logger } from '../utils/logger';
import { waitForCallableReady } from '../utils/callableReady';

export interface AIService {
  convertToKidFriendly: (recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number, allergyFlags?: string[]) => Promise<ConversionResult>;
}

export interface ConversionResult {
  parentId?: string;
  kidId?: string;
  kidAge: number;
  targetReadingLevel: ReadingLevel;
  simplifiedIngredients: KidIngredient[];
  simplifiedSteps: KidStep[];
  safetyNotes: string[];
  estimatedDuration?: number;
  skillsRequired?: string[];
  conversionSource?: 'ai' | 'mock';
}

interface KidFriendlyConversionRequest {
  recipe: Recipe;
  readingLevel: ReadingLevel;
  ageRange: string;
  safetyNotes: boolean;
}

// OpenAI API is now server-side only - no client-side access
// All AI conversions now go through Cloud Functions for security

export const aiService: AIService = {
  async convertToKidFriendly(recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number, allergyFlags?: string[]): Promise<ConversionResult> {
    try {
      // SECURITY: All AI conversions now use Cloud Functions for security
      // OpenAI API keys are protected on the server-side

      if (__DEV__) {
        logger.debug('🚀 Calling Cloud Function for AI conversion:', {
          recipeId: recipe.id,
          readingLevel,
          kidAge: kidAge || getAgeFromLevel(readingLevel)
        });
      }

      // Call the Cloud Function for AI recipe conversion
      await waitForCallableReady();
      if (!auth.currentUser) {
        throw new Error('Please log in again to use AI recipe conversion.');
      }
      await auth.currentUser.getIdToken(true);
      const convertRecipeForKid = httpsCallable(functions, 'convertRecipeForKid');

      const response = await convertRecipeForKid({
        recipeId: recipe.id,
        kidAge: kidAge || getAgeFromLevel(readingLevel),
        readingLevel,
        allergyFlags: allergyFlags || [] // Use allergy flags from kid profile
      });

      const kidRecipeData = response.data as any;

      if (__DEV__) {
        logger.debug('✅ Cloud Function response received:', {
          success: !!kidRecipeData?.kidRecipeId,
          hasSteps: kidRecipeData?.simplifiedSteps?.length > 0,
          hasIngredients: kidRecipeData?.simplifiedIngredients?.length > 0
        });
      }

      if (!kidRecipeData?.kidRecipeId) {
        throw new Error('Invalid response from AI conversion service');
      }

      // Transform the Cloud Function response to match our ConversionResult interface
      const result: ConversionResult = {
        parentId: kidRecipeData.parentId,
        kidId: kidRecipeData.kidId,
        kidAge: kidRecipeData.kidAge || kidAge || getAgeFromLevel(readingLevel),
        targetReadingLevel: readingLevel,
        simplifiedIngredients: kidRecipeData.simplifiedIngredients || [],
        simplifiedSteps: kidRecipeData.simplifiedSteps || [],
        safetyNotes: kidRecipeData.safetyNotes || [],
        estimatedDuration: kidRecipeData.estimatedDuration,
        skillsRequired: kidRecipeData.skillsRequired || [],
        conversionSource: 'ai' // Real AI conversion from Cloud Function
      };

      return result;

    } catch (error: any) {
      console.error('💥 AI conversion failed:', error);

      // Check if it's a rate limit error
      if (error?.message?.includes('rate limit') || error?.message?.includes('Daily conversion limit')) {
        throw new Error('Daily AI conversion limit reached. Please try again tomorrow or upgrade your plan.');
      }

      // Check if it's an authentication error
      if (error?.message?.includes('unauthenticated')) {
        throw new Error('Please log in again to use AI recipe conversion.');
      }

      // Always fall back to mock conversion if Cloud Function fails
      console.warn('🔄 Cloud Function failed, falling back to enhanced mock conversion:', error?.message);
      const mockResult = await enhancedMockConversion(recipe, readingLevel, kidAge);
      return { ...mockResult, conversionSource: 'mock' };
    }
  }
};

function getAgeRangeForLevel(level: ReadingLevel): string {
  switch (level) {
    case 'beginner': return '6-8';
    case 'intermediate': return '9-12';
    case 'advanced': return '12+';
    default: return '9-12';
  }
}

function getAgeFromLevel(level: ReadingLevel): number {
  switch (level) {
    case 'beginner': return 7;
    case 'intermediate': return 10;
    case 'advanced': return 13;
    default: return 10;
  }
}

// REMOVED: Real AI conversion function - now handled server-side for security
// All AI conversion logic has been moved to Cloud Functions to protect API keys

// Enhanced mock implementation with better logic
async function enhancedMockConversion(recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number): Promise<ConversionResult> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get ingredients from recipe (handle both new and legacy format)
  const recipeIngredients = recipe.ingredients || [];
  const recipeInstructions = recipe.instructions || recipe.steps?.map(step => step.step) || [];

  // Simplify ingredients based on reading level
  const simplifiedIngredients = simplifyIngredients(recipeIngredients, readingLevel);

  // Simplify instructions based on reading level
  const simplifiedSteps = simplifyInstructions(recipeInstructions, readingLevel);

  // Add safety notes
  const safetyNotes = generateSafetyNotes(recipe, readingLevel);

  return {
    kidAge: kidAge ?? getAgeFromLevel(readingLevel),
    targetReadingLevel: readingLevel,
    simplifiedIngredients,
    simplifiedSteps,
    safetyNotes,
    estimatedDuration: (recipe.totalTime || 30) + 15, // Add extra time for kids
    skillsRequired: ['measuring', 'mixing', readingLevel === 'advanced' ? 'knife skills' : 'safe cutting'],
  };
}

function simplifyTitle(title: string, level: ReadingLevel): string {
  switch (level) {
    case 'beginner':
      return title.replace(/Classic|Traditional|Perfect|Amazing|Delicious/gi, '')
        .replace(/\b\w+ly\b/g, '') // Remove adverbs
        .trim();
    case 'intermediate':
      return title.replace(/Classic|Traditional/gi, '').trim();
    default:
      return title;
  }
}

function simplifyDescription(description: string, level: ReadingLevel): string {
  if (level === 'beginner') {
    return 'A yummy recipe that\'s fun to make!';
  } else if (level === 'intermediate') {
    return description.split('.')[0] + '.'; // Just first sentence
  }
  return description;
}

function simplifyIngredients(ingredients: any[], level: ReadingLevel): KidIngredient[] {
  return ingredients.map((ingredient, index) => {
    // Handle both string and object ingredients
    const name = typeof ingredient === 'string' ? ingredient : ingredient.name;
    const amount = typeof ingredient === 'object' ? ingredient.amount : null;
    const unit = typeof ingredient === 'object' ? ingredient.unit : null;

    let kidFriendlyName = name;
    let description = '';

    if (level === 'beginner') {
      // Use simpler measurements and terms
      kidFriendlyName = kidFriendlyName
        .replace(/tablespoon/gi, 'big spoon')
        .replace(/teaspoon/gi, 'small spoon')
        .replace(/all-purpose flour/gi, 'flour')
        .replace(/granulated sugar/gi, 'white sugar')
        .replace(/packed brown sugar/gi, 'brown sugar');

      description = 'Ask an adult to help you measure this!';
    } else if (level === 'intermediate') {
      kidFriendlyName = kidFriendlyName
        .replace(/all-purpose/gi, '')
        .replace(/granulated/gi, '');

      description = 'Measure carefully for the best results.';
    } else {
      description = 'Be precise with your measurements.';
    }

    return {
      id: `ingredient-${index}`,
      name,
      amount,
      unit,
      kidFriendlyName,
      description,
      order: index,
    };
  });
}

function simplifyInstructions(instructions: string[], level: ReadingLevel): KidStep[] {
  return instructions.map((instruction, index) => {
    let kidFriendlyText = instruction;

    if (level === 'beginner') {
      // Use very simple language
      kidFriendlyText = kidFriendlyText
        .replace(/Preheat oven to/gi, 'Turn oven to')
        .replace(/cream together/gi, 'mix')
        .replace(/gradually blend in/gi, 'slowly add')
        .replace(/until light and fluffy/gi, 'until mixed well')
        .replace(/wire rack/gi, 'cooling plate');
    } else if (level === 'intermediate') {
      // Moderately simple language
      kidFriendlyText = kidFriendlyText
        .replace(/gradually blend in/gi, 'slowly add')
        .replace(/until light and fluffy/gi, 'until mixed well');
    }

    const needsAdultHelp = checkIfNeedsAdultHelp(instruction);
    const stepIcon = getStepIcon(instruction);
    const stepTime = estimateStepTime(instruction);

    return {
      id: `step-${index}`,
      step: instruction,
      kidFriendlyText,
      icon: stepIcon,
      safetyNote: needsAdultHelp ? generateSafetyNote(instruction) : undefined,
      time: stepTime,
      order: index,
      completed: false,
      difficulty: getDifficultyForStep(instruction, level),
      encouragement: generateEncouragement(index, instructions.length),
    };
  });
}

function createKidFriendlySteps(instructions: string[], level: ReadingLevel): Array<{
  step: number;
  title: string;
  instruction: string;
  timeEstimate?: string;
  needsAdultHelp: boolean;
  tips?: string[];
}> {
  return instructions.map((instruction, index) => {
    const step = index + 1;
    const needsAdultHelp = checkIfNeedsAdultHelp(instruction);

    return {
      step,
      title: generateStepTitle(instruction, step),
      instruction,
      timeEstimate: estimateStepTime(instruction),
      needsAdultHelp,
      tips: generateStepTips(instruction, level),
    };
  });
}

function checkIfNeedsAdultHelp(instruction: string): boolean {
  const adultHelpKeywords = [
    'oven', 'stove', 'heat', 'hot', 'knife', 'cut', 'chop', 'sharp',
    'electric', 'mixer', 'blender', 'boiling', 'frying'
  ];

  return adultHelpKeywords.some(keyword =>
    instruction.toLowerCase().includes(keyword)
  );
}

function generateStepTitle(instruction: string, step: number): string {
  const firstWords = instruction.split(' ').slice(0, 3).join(' ');
  return `Step ${step}: ${firstWords}`;
}

function estimateStepTime(instruction: string): string | undefined {
  if (instruction.toLowerCase().includes('mix')) return '2 min';
  if (instruction.toLowerCase().includes('bake')) return '10-15 min';
  if (instruction.toLowerCase().includes('heat')) return '3-5 min';
  if (instruction.toLowerCase().includes('cool')) return '10 min';
  return undefined;
}

function generateStepTips(instruction: string, level: ReadingLevel): string[] {
  const tips: string[] = [];

  if (instruction.toLowerCase().includes('mix') && level === 'beginner') {
    tips.push('Stir in a circle motion');
    tips.push('Make sure everything is mixed together');
  }

  if (instruction.toLowerCase().includes('oven')) {
    tips.push('Ask an adult to help with the oven');
    tips.push('Hot things can hurt - be careful!');
  }

  return tips;
}

function getStepIcon(instruction: string): string {
  const text = instruction.toLowerCase();
  if (text.includes('mix') || text.includes('stir')) return '🥄';
  if (text.includes('oven') || text.includes('bake')) return '🔥';
  if (text.includes('cut') || text.includes('chop')) return '🔪';
  if (text.includes('heat') || text.includes('cook')) return '🍳';
  if (text.includes('measure') || text.includes('add')) return '📏';
  if (text.includes('wash') || text.includes('clean')) return '💧';
  if (text.includes('cool') || text.includes('wait')) return '⏰';
  return '👨‍🍳';
}

function generateSafetyNote(instruction: string): string {
  const text = instruction.toLowerCase();
  if (text.includes('oven') || text.includes('bake')) return '🔥 Ask an adult to help with the oven!';
  if (text.includes('cut') || text.includes('chop') || text.includes('knife')) return '🔪 Let an adult do the cutting!';
  if (text.includes('hot') || text.includes('heat')) return '🌡️ Be careful - this might be hot!';
  if (text.includes('stove') || text.includes('burner')) return '🔥 Ask an adult to help with the stove!';
  return '👨‍👩‍👧‍👦 Ask for help if you need it!';
}

function getDifficultyForStep(instruction: string, level: ReadingLevel): 'easy' | 'medium' | 'hard' {
  const text = instruction.toLowerCase();
  const isComplex = text.includes('cut') || text.includes('oven') || text.includes('timing') || text.includes('temperature');

  if (level === 'beginner') {
    return isComplex ? 'medium' : 'easy';
  } else if (level === 'intermediate') {
    return isComplex ? 'hard' : 'easy';
  } else {
    return isComplex ? 'medium' : 'easy';
  }
}

function generateEncouragement(stepIndex: number, totalSteps: number): string {
  const encouragements = [
    '🌟 You\'re doing amazing!',
    '👏 Great job following along!',
    '🎉 You\'re becoming a real chef!',
    '💪 Keep up the fantastic work!',
    '😋 This is going to taste incredible!',
  ];

  if (stepIndex === 0) return '🚀 Let\'s start cooking together!';
  if (stepIndex === totalSteps - 1) return '🏁 Almost done! You\'ve got this!';

  return encouragements[stepIndex % encouragements.length];
}

function generateSafetyNotes(recipe: Recipe, level: ReadingLevel): string[] {
  const notes: string[] = [];
  const instructions = recipe.instructions || recipe.steps?.map(s => s.step) || [];

  const hasOven = instructions.some(inst =>
    inst.toLowerCase().includes('oven') || inst.toLowerCase().includes('bake')
  );

  const hasKnife = instructions.some(inst =>
    inst.toLowerCase().includes('cut') || inst.toLowerCase().includes('chop')
  );

  const hasHeat = instructions.some(inst =>
    inst.toLowerCase().includes('heat') || inst.toLowerCase().includes('hot')
  );

  if (hasOven) {
    notes.push('🔥 Ask an adult to help with the oven - it gets very hot!');
  }

  if (hasKnife) {
    notes.push('🔪 Let an adult do all the cutting with knives');
  }

  if (hasHeat) {
    notes.push('🌡️ Be careful around hot things - they can burn you');
  }

  notes.push('👨‍👩‍👧‍👦 Always cook with a grown-up nearby');
  notes.push('🧼 Wash your hands before and after cooking');

  return notes;
}

function generateEncouragements(level: ReadingLevel): string[] {
  const encouragements = [
    '🌟 You\'re doing great!',
    '👏 Nice job following the recipe!',
    '🎉 You\'re becoming a real chef!',
    '💪 Keep up the good work!',
    '😋 This is going to taste amazing!',
  ];

  if (level === 'beginner') {
    encouragements.push('🤗 Ask for help anytime you need it!');
    encouragements.push('🎈 Cooking is fun when we do it together!');
  }

  return encouragements;
}

function mapDifficultyForKids(difficulty: string, level: ReadingLevel): 'super easy' | 'easy' | 'medium' | 'challenging' {
  const originalDifficulty = difficulty.toLowerCase();

  if (level === 'beginner') {
    if (originalDifficulty.includes('easy')) return 'super easy';
    if (originalDifficulty.includes('medium')) return 'easy';
    return 'medium';
  } else if (level === 'intermediate') {
    if (originalDifficulty.includes('easy')) return 'super easy';
    if (originalDifficulty.includes('medium')) return 'easy';
    if (originalDifficulty.includes('hard')) return 'medium';
    return 'easy';
  } else {
    if (originalDifficulty.includes('easy')) return 'easy';
    if (originalDifficulty.includes('medium')) return 'medium';
    return 'challenging';
  }
}
