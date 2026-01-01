import { ImportResult, ImportStatus, PartialRecipeData } from '../services/recipeImport';

export interface TestScenario {
  name: string;
  description: string;
  testUrl: string;
  mockResult: ImportResult;
  expectedOutcome: string;
  testInstructions: string[];
  timerTarget: number; // seconds - how long should it take parent to complete?
}

export const partialSuccessTestScenarios: TestScenario[] = [
  {
    name: 'Ingredients Only',
    description: 'Recipe with only ingredients extracted, missing title and instructions',
    testUrl: 'https://test-ingredients-only.com/recipe',
    mockResult: {
      success: false,
      needsReview: true,
      confidence: 0.3,
      extractionMethod: 'css-selectors',
      partialSuccess: {
        ingredients: [
          '2 cups all-purpose flour',
          '1 teaspoon baking soda',
          '1/2 teaspoon salt',
          '1 cup butter, softened',
          '3/4 cup granulated sugar',
          '3/4 cup packed brown sugar',
          '2 large eggs',
          '2 teaspoons vanilla extract',
          '2 cups chocolate chips'
        ],
        instructions: [],
        sourceUrl: 'https://test-ingredients-only.com/recipe',
        missingFields: ['title', 'instructions', 'description', 'image'],
        extractionIssues: ['Could not find recipe title', 'No cooking instructions found'],
        confidence: 0.3
      } as PartialRecipeData,
      error: {
        code: 'PARTIAL_EXTRACTION',
        message: 'Recipe partially extracted - review required',
        suggestion: 'Please add a title and cooking instructions',
        canRetry: false,
        allowManualEdit: true,
        severity: 'low' as const,
        recoveryActions: [
          {
            label: 'Review & Complete',
            action: 'manual-entry',
            description: 'Complete the missing recipe information'
          }
        ]
      }
    },
    expectedOutcome: 'Parent should be able to add title and instructions within 90 seconds',
    testInstructions: [
      '1. Import the test URL',
      '2. Verify you reach the Review Recipe screen',
      '3. Notice ingredients are pre-filled, title and instructions are empty',
      '4. Add title: "Classic Chocolate Chip Cookies"',
      '5. Add instructions step by step',
      '6. Save and verify recipe appears in library',
      '⏱️ TARGET: Complete within 90 seconds'
    ],
    timerTarget: 90
  },
  {
    name: 'Instructions Only',
    description: 'Recipe with only instructions extracted, missing title and ingredients',
    testUrl: 'https://test-instructions-only.com/recipe',
    mockResult: {
      success: false,
      needsReview: true,
      confidence: 0.35,
      extractionMethod: 'microdata',
      partialSuccess: {
        ingredients: [],
        instructions: [
          'Preheat oven to 375°F (190°C)',
          'In a large bowl, cream together butter and both sugars until light and fluffy',
          'Beat in eggs one at a time, then stir in vanilla',
          'In a separate bowl, combine flour, baking soda, and salt',
          'Gradually blend in the flour mixture',
          'Stir in chocolate chips',
          'Drop rounded tablespoons of dough onto ungreased cookie sheets',
          'Bake for 9 to 11 minutes or until golden brown',
          'Cool on baking sheet for 2 minutes; remove to wire rack'
        ],
        sourceUrl: 'https://test-instructions-only.com/recipe',
        missingFields: ['title', 'ingredients', 'description', 'image'],
        extractionIssues: ['Could not find recipe title', 'No ingredients list found'],
        confidence: 0.35
      } as PartialRecipeData,
      error: {
        code: 'PARTIAL_EXTRACTION',
        message: 'Recipe partially extracted - review required',
        suggestion: 'Please add a title and ingredients list',
        canRetry: false,
        allowManualEdit: true,
        severity: 'low' as const
      }
    },
    expectedOutcome: 'Parent should be able to add title and ingredients within 120 seconds',
    testInstructions: [
      '1. Import the test URL',
      '2. Verify you reach the Review Recipe screen',
      '3. Notice instructions are pre-filled, title and ingredients are empty',
      '4. Add title: "Grandma\'s Chocolate Chip Cookies"',
      '5. Add ingredients based on the instructions (flour, sugar, etc.)',
      '6. Save and verify recipe appears in library',
      '⏱️ TARGET: Complete within 120 seconds'
    ],
    timerTarget: 120
  },
  {
    name: 'Title Only',
    description: 'Recipe with only title extracted, missing ingredients and instructions',
    testUrl: 'https://test-title-only.com/recipe',
    mockResult: {
      success: false,
      needsReview: true,
      confidence: 0.25,
      extractionMethod: 'json-ld',
      partialSuccess: {
        title: 'Ultimate Chocolate Chip Cookies',
        description: 'The best chocolate chip cookies you\'ll ever make!',
        image: '🍪',
        prepTime: '15 mins',
        servings: 24,
        ingredients: [],
        instructions: [],
        sourceUrl: 'https://test-title-only.com/recipe',
        missingFields: ['ingredients', 'instructions'],
        extractionIssues: ['No ingredients list found', 'No cooking instructions found'],
        confidence: 0.25
      } as PartialRecipeData,
      error: {
        code: 'PARTIAL_EXTRACTION',
        message: 'Recipe partially extracted - review required',
        suggestion: 'Please add ingredients and cooking instructions',
        canRetry: false,
        allowManualEdit: true,
        severity: 'low' as const
      }
    },
    expectedOutcome: 'Parent should be able to add ingredients and instructions within 180 seconds',
    testInstructions: [
      '1. Import the test URL',
      '2. Verify you reach the Review Recipe screen',
      '3. Notice title/description are pre-filled, ingredients and instructions are empty',
      '4. Add typical cookie ingredients (flour, sugar, butter, eggs, etc.)',
      '5. Add step-by-step instructions',
      '6. Save and verify recipe appears in library',
      '⏱️ TARGET: Complete within 3 minutes (most complex scenario)'
    ],
    timerTarget: 180
  },
  {
    name: 'Partial Everything',
    description: 'Some data in all fields but incomplete (realistic scenario)',
    testUrl: 'https://test-partial-everything.com/recipe',
    mockResult: {
      success: false,
      needsReview: true,
      confidence: 0.45,
      extractionMethod: 'css-selectors',
      partialSuccess: {
        title: 'Chocolate Chip Cook', // truncated
        description: 'Delicious cookies that everyone will...',  // truncated
        prepTime: '15 mins',
        cookTime: '12 mins',
        servings: 24,
        ingredients: [
          '2 cups flour',
          '1 tsp baking soda',
          // Missing several ingredients
        ],
        instructions: [
          'Preheat oven to 375°F',
          'Mix dry ingredients',
          // Missing several steps
        ],
        sourceUrl: 'https://test-partial-everything.com/recipe',
        missingFields: ['ingredients', 'instructions'], // Some but incomplete
        extractionIssues: [
          'Title appears truncated',
          'Description incomplete',
          'Only 2 of ~8 ingredients found',
          'Only 2 of ~8 instructions found'
        ],
        confidence: 0.45
      } as PartialRecipeData,
      error: {
        code: 'PARTIAL_EXTRACTION',
        message: 'Recipe partially extracted - review required',
        suggestion: 'Please complete the missing ingredients and cooking steps',
        canRetry: false,
        allowManualEdit: true,
        severity: 'low' as const
      }
    },
    expectedOutcome: 'Parent should be able to complete partial data within 60 seconds',
    testInstructions: [
      '1. Import the test URL',
      '2. Verify you reach the Review Recipe screen',
      '3. Notice most fields have some data but are incomplete',
      '4. Fix truncated title: "Chocolate Chip Cookies"',
      '5. Complete ingredients list (add butter, sugar, eggs, vanilla, chocolate chips)',
      '6. Complete instructions (add mixing steps, baking details)',
      '7. Save and verify recipe appears in library',
      '⏱️ TARGET: Complete within 60 seconds (easiest to fix)'
    ],
    timerTarget: 60
  },
  {
    name: 'Empty Result',
    description: 'No recipe data extracted at all (confidence too low)',
    testUrl: 'https://test-empty-result.com/page',
    mockResult: {
      success: false,
      needsReview: false, // This should go to manual entry, not review
      confidence: 0.1,
      extractionMethod: 'css-selectors',
      error: {
        code: 'NO_RECIPE_FOUND',
        message: 'No recipe found on this page',
        suggestion: 'Make sure the URL points to a recipe page, not a blog post or search results',
        canRetry: false,
        allowManualEdit: true,
        severity: 'medium' as const,
        recoveryActions: [
          {
            label: 'Try Different URL',
            action: 'try-different-url',
            description: 'Look for the actual recipe page on this site'
          },
          {
            label: 'Enter Manually',
            action: 'manual-entry',
            description: 'Type the recipe details yourself'
          }
        ]
      }
    },
    expectedOutcome: 'Should trigger manual entry fallback, not review screen',
    testInstructions: [
      '1. Import the test URL',
      '2. Should NOT reach Review Recipe screen',
      '3. Should get error message with option to "Enter Manually"',
      '4. Tap "Enter Manually" to go to manual recipe entry screen',
      '5. Add complete recipe from scratch',
      '6. Save and verify recipe appears in library',
      '⏱️ TARGET: Complete within 3 minutes (full manual entry)'
    ],
    timerTarget: 180
  }
];

export const realWorldFailureUrls = [
  // These are real URLs that commonly fail auto-import
  'https://www.foodnetwork.com/recipes/alton-brown/chocolate-chip-cookies-recipe-1946256',
  'https://www.allrecipes.com/recipe/10813/best-chocolate-chip-cookies/',
  'https://cooking.nytimes.com/recipes/1015819-chocolate-chip-cookies', // paywall
  'https://www.seriouseats.com/the-food-lab-best-chocolate-chip-cookie-recipe',
  'https://www.bbcgoodfood.com/recipes/chocolate-chip-cookies'
];

export interface TestSession {
  sessionId: string;
  startTime: Date;
  scenarios: TestScenarioResult[];
  completed: boolean;
  totalTime?: number;
  parentSuccessRate?: number; // Did parent get recipes into library within target time?
}

export interface TestScenarioResult {
  scenario: TestScenario;
  startTime: Date;
  endTime?: Date;
  duration?: number;
  success: boolean;
  notes?: string;
  parentRating?: 1 | 2 | 3 | 4 | 5; // How frustrated was the parent?
}

export class TestScenarioRunner {
  private mockMode: boolean = false;

  constructor(enableMockMode = false) {
    this.mockMode = enableMockMode;
  }

  enableMockMode() {
    this.mockMode = true;
  }

  disableMockMode() {
    this.mockMode = false;
  }

  async runScenario(scenario: TestScenario): Promise<ImportResult> {
    if (this.mockMode) {
      console.log(`🧪 MOCK MODE: Simulating "${scenario.name}" scenario`);
      console.log(`📝 Description: ${scenario.description}`);
      console.log(`⏱️ Target completion time: ${scenario.timerTarget}s`);
      console.log(`📋 Instructions:`);
      scenario.testInstructions.forEach(instruction => {
        console.log(`   ${instruction}`);
      });

      // Simulate some delay
      await new Promise(resolve => setTimeout(resolve, 1000));
      return scenario.mockResult;
    } else {
      // In real mode, fall back to actual import service
      const { recipeImportService } = await import('../services/recipeImport');
      return await recipeImportService.importFromUrl(scenario.testUrl);
    }
  }

  startTestSession(): TestSession {
    return {
      sessionId: `test_${Date.now()}`,
      startTime: new Date(),
      scenarios: [],
      completed: false
    };
  }

  completeTestSession(session: TestSession): TestSession {
    const completed = {
      ...session,
      completed: true,
      totalTime: Date.now() - session.startTime.getTime()
    };

    // Calculate parent success rate
    const successfulScenarios = session.scenarios.filter(s => s.success);
    completed.parentSuccessRate = successfulScenarios.length / session.scenarios.length;

    return completed;
  }

  generateTestReport(session: TestSession): string {
    const report = [
      '# KidChef Recipe Import UX Test Report',
      `**Session ID:** ${session.sessionId}`,
      `**Date:** ${session.startTime.toLocaleDateString()}`,
      `**Duration:** ${session.totalTime ? (session.totalTime / 1000).toFixed(1) : 'In Progress'}s`,
      `**Parent Success Rate:** ${session.parentSuccessRate ? (session.parentSuccessRate * 100).toFixed(1) : 'TBD'}%`,
      '',
      '## Test Results',
      ''
    ];

    session.scenarios.forEach((result, index) => {
      report.push(`### ${index + 1}. ${result.scenario.name}`);
      report.push(`**Result:** ${result.success ? '✅ Success' : '❌ Failed'}`);
      report.push(`**Duration:** ${result.duration ? result.duration.toFixed(1) : 'TBD'}s (Target: ${result.scenario.timerTarget}s)`);
      report.push(`**Parent Rating:** ${result.parentRating ? '⭐'.repeat(result.parentRating) : 'Not rated'}`);
      if (result.notes) {
        report.push(`**Notes:** ${result.notes}`);
      }
      report.push('');
    });

    report.push('## Summary');
    const avgTime = session.scenarios.reduce((sum, s) => sum + (s.duration || 0), 0) / session.scenarios.length;
    report.push(`**Average Completion Time:** ${avgTime.toFixed(1)}s`);

    const withinTarget = session.scenarios.filter(s => s.duration && s.duration <= s.scenario.timerTarget).length;
    report.push(`**Scenarios Completed Within Target:** ${withinTarget}/${session.scenarios.length}`);

    return report.join('\n');
  }
}

export const testScenarioRunner = new TestScenarioRunner();