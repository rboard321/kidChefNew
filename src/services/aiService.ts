import type { Recipe, KidRecipe, ReadingLevel, KidIngredient, KidStep } from '../types';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

export interface AIService {
<<<<<<< HEAD
  convertToKidFriendly: (recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number) => Promise<Omit<KidRecipe, 'id' | 'originalRecipeId' | 'createdAt'>>;
=======
  convertToKidFriendly: (recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number, allergyFlags?: string[]) => Promise<ConversionResult>;
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
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
<<<<<<< HEAD
  async convertToKidFriendly(recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number): Promise<Omit<KidRecipe, 'id' | 'originalRecipeId' | 'createdAt'>> {
    try {
      // Check if API key is available and has quota
      if (OPENAI_API_KEY && !OPENAI_API_KEY.includes('your_')) {
        try {
          console.log(`Converting recipe "${recipe.title}" for ${readingLevel} reading level (age: ${kidAge || 'auto'})`);
          const result = await realAIConversion(recipe, readingLevel, kidAge);
          console.log('✅ Real AI conversion successful');
          return result;
        } catch (error) {
          // If quota exceeded or other API error, fall back gracefully
          console.log('❌ Real AI conversion failed, falling back to enhanced mock:', error instanceof Error ? error.message : 'Unknown error');
          return await enhancedMockConversion(recipe, readingLevel, kidAge);
        }
      } else {
        console.log('📝 Using enhanced mock AI conversion (OpenAI API not configured)');
        return await enhancedMockConversion(recipe, readingLevel, kidAge);
=======
  async convertToKidFriendly(recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number, allergyFlags?: string[]): Promise<ConversionResult> {
    try {
      // SECURITY: All AI conversions now use Cloud Functions for security
      // OpenAI API keys are protected on the server-side

      if (__DEV__) {
        console.log('🚀 Calling Cloud Function for AI conversion:', {
          recipeId: recipe.id,
          readingLevel,
          kidAge: kidAge || getAgeFromLevel(readingLevel)
        });
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
      }

      // Call the Cloud Function for AI recipe conversion
      const convertRecipeForKid = httpsCallable(functions, 'convertRecipeForKid');

      const response = await convertRecipeForKid({
        recipeId: recipe.id,
        kidAge: kidAge || getAgeFromLevel(readingLevel),
        readingLevel,
        allergyFlags: allergyFlags || [] // Use allergy flags from kid profile
      });

      const kidRecipeData = response.data as any;

      if (__DEV__) {
        console.log('✅ Cloud Function response received:', {
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
        userId: recipe.userId || '',
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

    } catch (error) {
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

<<<<<<< HEAD
// Real AI conversion using OpenAI
async function realAIConversion(recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number): Promise<Omit<KidRecipe, 'id' | 'originalRecipeId' | 'createdAt'>> {
  const ageRange = kidAge ? `${kidAge}` : getAgeRangeForLevel(readingLevel);
  const ageForPrompt = kidAge ?? getAgeFromLevel(readingLevel);

  // Retry configuration
  const maxRetries = 3;
  let retryCount = 0;

  const prompt = `You are a professional chef and child development expert. Convert this recipe into a kid-friendly version for children aged ${ageRange} with ${readingLevel} reading level.

Original Recipe:
Title: ${recipe.title}
Ingredients: ${recipe.ingredients?.map(ing => (typeof ing === 'string' ? ing : `${ing.amount || ''} ${ing.unit || ''} ${ing.name}`.trim())).join(', ') || 'No ingredients listed'}
Instructions: ${recipe.instructions?.join('. ') || recipe.steps?.map(step => step.step).join('. ') || 'No instructions available'}

Please provide a JSON response with this exact structure:
{
  "userId": "",
  "kidAge": ${ageForPrompt},
  "targetReadingLevel": "${readingLevel}",
  "simplifiedIngredients": [
    {
      "id": "unique_id",
      "name": "ingredient_name",
      "amount": number_or_null,
      "unit": "unit_or_null",
      "kidFriendlyName": "simple_name_for_kids",
      "description": "helpful_description",
      "order": number
    }
  ],
  "simplifiedSteps": [
    {
      "id": "unique_id",
      "step": "original_step",
      "kidFriendlyText": "simplified_instruction_for_kids",
      "icon": "relevant_emoji",
      "safetyNote": "safety_warning_if_needed",
      "time": "time_estimate",
      "order": number,
      "completed": false,
      "difficulty": "easy|medium|hard",
      "encouragement": "motivational_message"
    }
  ],
  "safetyNotes": ["important safety note 1", "safety note 2"],
  "estimatedDuration": number_in_minutes,
  "skillsRequired": ["skill1", "skill2"]
}

Guidelines:
- Use simple words for ${readingLevel} level (${ageRange} years old)
- Add safety notes for any dangerous steps (knives, heat, etc.)
- Include encouraging messages for kids
- Use food emojis for steps
- Break complex steps into smaller ones
- Suggest adult help when needed`;

  while (retryCount <= maxRetries) {
    try {
      // Add delay for retries
      if (retryCount > 0) {
        const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
        console.log(`Retrying OpenAI API call in ${delay}ms (attempt ${retryCount + 1}/${maxRetries + 1})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }

      const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that converts recipes to be kid-friendly. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`OpenAI API error ${response.status}:`, errorText);

      // Parse error for quota issues
      let isQuotaError = false;
      try {
        const errorData = JSON.parse(errorText);
        isQuotaError = errorData.error?.type === 'insufficient_quota';
      } catch (e) {
        // Ignore JSON parse errors
      }

      if (response.status === 429) {
        if (isQuotaError) {
          console.log('OpenAI quota exceeded, falling back to mock conversion');
          throw new Error(`OpenAI API error: ${response.status} - insufficient_quota`);
        } else {
          console.log('Rate limit exceeded, falling back to mock conversion');
        }
      } else if (response.status === 401) {
        console.log('Invalid API key, falling back to mock conversion');
      } else if (response.status >= 500) {
        console.log('OpenAI server error, falling back to mock conversion');
      }

      throw new Error(`OpenAI API error: ${response.status}`);
    }

      const data = await response.json();

      // Get the content from OpenAI response
      const rawContent = data.choices[0]?.message?.content;
      if (!rawContent) {
        throw new Error('No content received from OpenAI API');
      }

      console.log('Raw OpenAI response:', rawContent.substring(0, 200) + '...');

      // Clean up the response content - remove any markdown formatting and comments
      let cleanContent = rawContent
        .replace(/```json\s*/g, '')  // Remove ```json
        .replace(/```\s*/g, '')      // Remove ending ```
        .replace(/\/\/.*$/gm, '')    // Remove single-line comments
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
        .trim();

      // Replace common Unicode fractions with decimal numbers
      const fractionReplacements: { [key: string]: string } = {
        '½': '0.5',
        '⅓': '0.33',
        '⅔': '0.67',
        '¼': '0.25',
        '¾': '0.75',
        '⅕': '0.2',
        '⅖': '0.4',
        '⅗': '0.6',
        '⅘': '0.8',
        '⅙': '0.17',
        '⅚': '0.83',
        '⅛': '0.125',
        '⅜': '0.375',
        '⅝': '0.625',
        '⅞': '0.875'
      };

      for (const [fraction, decimal] of Object.entries(fractionReplacements)) {
        cleanContent = cleanContent.replace(new RegExp(fraction, 'g'), decimal);
      }

      // Find JSON content if it's wrapped in text
      const jsonStart = cleanContent.indexOf('{');
      const jsonEnd = cleanContent.lastIndexOf('}') + 1;

      if (jsonStart !== -1 && jsonEnd > jsonStart) {
        cleanContent = cleanContent.substring(jsonStart, jsonEnd);
      }

      console.log('Cleaned content for parsing:', cleanContent.substring(0, 100) + '...');

      // Parse the cleaned JSON
      let aiResponse;
      try {
        aiResponse = JSON.parse(cleanContent);
      } catch (parseError) {
        console.error('Failed to parse OpenAI JSON response:', parseError);
        console.error('Content that failed to parse:', cleanContent);
        throw new Error(`Invalid JSON response from OpenAI: ${parseError instanceof Error ? parseError.message : 'Unknown parsing error'}`);
      }

      // Validate the response has expected structure
      if (!aiResponse.simplifiedIngredients || !aiResponse.simplifiedSteps) {
        console.error('Missing required fields in AI response:', aiResponse);
        throw new Error('AI response missing required fields (simplifiedIngredients or simplifiedSteps)');
      }

      console.log('Successfully parsed AI response with', aiResponse.simplifiedIngredients.length, 'ingredients and', aiResponse.simplifiedSteps.length, 'steps');

      return aiResponse;

    } catch (error) {
      console.error(`OpenAI API attempt ${retryCount + 1} failed:`, error);

      // Check if it's a quota issue - don't retry for these
      if (error instanceof Error && error.message.includes('insufficient_quota')) {
        console.log('OpenAI quota exceeded - falling back to enhanced mock');
        throw error; // Let the parent function handle fallback
      }

      // Check if it's a JSON parsing error - don't retry these
      if (error instanceof Error && error.message.includes('Invalid JSON response')) {
        console.log('JSON parsing failed - falling back to enhanced mock');
        throw error; // Let the parent function handle fallback
      }

      // Check if it's a rate limit error and we have retries left
      if (error instanceof Error && error.message.includes('429') && retryCount < maxRetries) {
        retryCount++;
        continue; // Retry
      }

      // For other errors or max retries reached, fall back to mock
      console.error('Real AI conversion failed, falling back to enhanced mock:', error);
      throw error; // Let the parent function handle fallback
    }
  }

  // This shouldn't be reached, but just in case
  return await enhancedMockConversion(recipe, readingLevel, kidAge);
}
=======
// REMOVED: Real AI conversion function - now handled server-side for security
// All AI conversion logic has been moved to Cloud Functions to protect API keys
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)

// Enhanced mock implementation with better logic
async function enhancedMockConversion(recipe: Recipe, readingLevel: ReadingLevel, kidAge?: number): Promise<Omit<KidRecipe, 'id' | 'originalRecipeId' | 'createdAt'>> {
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
    userId: recipe.userId || '',
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
