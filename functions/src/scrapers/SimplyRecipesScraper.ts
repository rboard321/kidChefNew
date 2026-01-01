import * as cheerio from 'cheerio';
import { BaseScraper, ScraperResult, ScrapedRecipe } from './BaseScraper';

export class SimplyRecipesScraper extends BaseScraper {
  canHandle(hostname: string): boolean {
    return hostname.includes('simplyrecipes.com');
  }

  async scrape($: cheerio.CheerioAPI, html: string): Promise<ScraperResult> {
    try {
      // Simply Recipes usually has excellent JSON-LD
      let recipe = this.extractFromJsonLd($);
      let method: 'json-ld' | 'site-specific' = 'json-ld';

      // If JSON-LD fails, use Simply Recipes-specific selectors
      if (!recipe || !recipe.title) {
        recipe = this.extractFromSelectors($);
        method = 'site-specific';
      }

      if (!recipe) {
        return {
          confidence: 0,
          method,
          issues: ['No recipe found using Simply Recipes extractors']
        };
      }

      const issues = this.validateRecipe(recipe);
      const confidence = this.calculateConfidence(recipe, method);

      if (recipe) {
        recipe.sourceUrl = this.url;
        if (!recipe.tags) recipe.tags = [];
        recipe.tags.push('Simply Recipes');
      }

      return {
        recipe,
        confidence: Math.min(confidence + 0.04, 1.0), // Bonus for Simply Recipes quality
        method,
        issues: issues.length > 0 ? issues : undefined
      };
    } catch (error) {
      return {
        confidence: 0,
        method: 'site-specific',
        issues: [`Simply Recipes parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  private extractFromJsonLd($: cheerio.CheerioAPI): Partial<ScrapedRecipe> | null {
    try {
      const jsonLdScripts = $('script[type="application/ld+json"]');

      for (let i = 0; i < jsonLdScripts.length; i++) {
        const scriptContent = $(jsonLdScripts[i]).html();
        if (!scriptContent) continue;

        try {
          const data = JSON.parse(scriptContent);
          const recipe = this.findRecipeInData(data);
          if (recipe) return this.parseJsonLdRecipe(recipe);
        } catch (parseError) {
          continue;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private findRecipeInData(data: any): any {
    if (!data) return null;

    if (data['@type'] === 'Recipe') {
      return data;
    }

    if (Array.isArray(data)) {
      for (const item of data) {
        const recipe = this.findRecipeInData(item);
        if (recipe) return recipe;
      }
    }

    if (typeof data === 'object') {
      // Simply Recipes often has well-structured data
      for (const key in data) {
        if (typeof data[key] === 'object') {
          const recipe = this.findRecipeInData(data[key]);
          if (recipe) return recipe;
        }
      }
    }

    return null;
  }

  private extractFromSelectors($: cheerio.CheerioAPI): Partial<ScrapedRecipe> | null {
    try {
      // Simply Recipes specific selectors (updated for their current structure)
      const title = this.extractText($(
        'h1.entry-title, ' +
        'h1.recipe-title, ' +
        '.recipe-header h1, ' +
        'h1[data-cy="recipe-title"], ' +
        '.headline, ' +
        'h1'
      ).first());

      if (!title) return null;

      const description = this.extractText($(
        '.recipe-description, ' +
        '.recipe-summary, ' +
        '.entry-summary, ' +
        '.intro-text, ' +
        '.recipe-intro, ' +
        '.article-intro'
      ).first());

      // Simply Recipes image extraction
      const imageElement = $(
        '.recipe-photo img, ' +
        '.recipe-image img, ' +
        '.hero-image img, ' +
        '.entry-image img, ' +
        '.featured-image img, ' +
        '.lead-image img'
      ).first();
      const image = imageElement.attr('src') ||
                   imageElement.attr('data-src') ||
                   imageElement.attr('data-lazy-src') ||
                   imageElement.attr('data-original');

      // Simply Recipes ingredients - they often have detailed ingredient lists
      const ingredientElements = $(
        '.recipe-ingredients li, ' +
        '.ingredients li, ' +
        '.recipe-ingredient-list li, ' +
        '.ingredient-list li, ' +
        '[data-cy="recipe-ingredients"] li, ' +
        '.recipe-callout-ingredients li'
      );
      const ingredients = this.extractArray(ingredientElements);

      // Simply Recipes instructions - known for detailed step-by-step
      const instructionElements = $(
        '.recipe-instructions li, ' +
        '.recipe-method li, ' +
        '.instructions li, ' +
        '.directions li, ' +
        '.method-instructions li, ' +
        '[data-cy="recipe-instructions"] li, ' +
        '.recipe-steps li, ' +
        '.preparation-steps li'
      );
      const instructions = this.extractArray(instructionElements)
        .map(instruction => this.cleanInstruction(instruction));

      // Simply Recipes timing - they usually provide detailed timing
      const prepTimeText = this.extractText($(
        '.recipe-prep-time, ' +
        '.prep-time, ' +
        '.recipe-time .prep-time, ' +
        '[data-cy="prep-time"], ' +
        '.timing-prep'
      ).first());

      const cookTimeText = this.extractText($(
        '.recipe-cook-time, ' +
        '.cook-time, ' +
        '.recipe-time .cook-time, ' +
        '[data-cy="cook-time"], ' +
        '.timing-cook'
      ).first());

      const totalTimeText = this.extractText($(
        '.recipe-total-time, ' +
        '.total-time, ' +
        '.recipe-time .total-time, ' +
        '[data-cy="total-time"], ' +
        '.timing-total'
      ).first());

      const prepTime = this.extractTime(prepTimeText) || undefined;
      const cookTime = this.extractTime(cookTimeText) || undefined;
      const totalTime = this.extractTime(totalTimeText) || undefined;

      // Servings/yield information
      const servingsText = this.extractText($(
        '.recipe-yield, ' +
        '.recipe-serves, ' +
        '.servings, ' +
        '.serves, ' +
        '.makes, ' +
        '[data-cy="recipe-yield"], ' +
        '.recipe-serving-size'
      ).first());
      const servings = this.extractNumber(servingsText);

      // Simply Recipes often includes difficulty level
      const difficultyText = this.extractText($(
        '.recipe-difficulty, ' +
        '.difficulty, ' +
        '.skill-level, ' +
        '.recipe-skill-level'
      ).first());

      return {
        title,
        description: description || undefined,
        image: image || undefined,
        prepTime,
        cookTime,
        totalTime,
        servings,
        difficulty: difficultyText || undefined,
        ingredients,
        instructions,
        tags: ['Simply Recipes']
      };
    } catch (error) {
      console.error('Error in Simply Recipes selector extraction:', error);
      return null;
    }
  }

  private parseJsonLdRecipe(recipe: any): Partial<ScrapedRecipe> | null {
    try {
      const extractText = (value: any): string => {
        if (typeof value === 'string') return value;
        if (value && typeof value === 'object') {
          return value.text || value.name || value['@value'] || String(value);
        }
        return String(value || '');
      };

      const extractArray = (value: any): string[] => {
        if (!value) return [];
        if (Array.isArray(value)) {
          return value.map(extractText).filter(Boolean);
        }
        return [extractText(value)].filter(Boolean);
      };

      const extractInstructions = (instructions: any): string[] => {
        if (!instructions) return [];

        const processInstruction = (instruction: any): string => {
          if (typeof instruction === 'string') {
            return this.cleanInstruction(instruction);
          }

          if (typeof instruction === 'object' && instruction !== null) {
            if (instruction['@type'] === 'HowToStep') {
              return this.cleanInstruction(
                instruction.text || instruction.name || instruction.description || ''
              );
            }

            const textValue = instruction.text || instruction.name || instruction.description || '';
            return this.cleanInstruction(extractText(textValue));
          }

          return '';
        };

        if (Array.isArray(instructions)) {
          return instructions.map(processInstruction).filter(Boolean);
        } else {
          const processed = processInstruction(instructions);
          return processed ? [processed] : [];
        }
      };

      return {
        title: extractText(recipe.name),
        description: extractText(recipe.description),
        image: extractText(recipe.image?.url || recipe.image),
        prepTime: extractText(recipe.prepTime),
        cookTime: extractText(recipe.cookTime),
        totalTime: extractText(recipe.totalTime),
        servings: this.extractNumber(extractText(recipe.recipeYield || recipe.yield)),
        ingredients: extractArray(recipe.recipeIngredient),
        instructions: extractInstructions(recipe.recipeInstructions),
        tags: extractArray(recipe.recipeCategory).concat(extractArray(recipe.recipeCuisine))
      };
    } catch (error) {
      console.error('Error parsing Simply Recipes JSON-LD:', error);
      return null;
    }
  }
}