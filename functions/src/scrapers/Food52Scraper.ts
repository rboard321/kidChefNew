import * as cheerio from 'cheerio';
import { BaseScraper, ScraperResult, ScrapedRecipe } from './BaseScraper';

export class Food52Scraper extends BaseScraper {
  canHandle(hostname: string): boolean {
    return hostname.includes('food52.com');
  }

  async scrape($: cheerio.CheerioAPI, html: string): Promise<ScraperResult> {
    try {
      // Food52 usually has good JSON-LD for recipes
      let recipe = this.extractFromJsonLd($);
      let method: 'json-ld' | 'site-specific' = 'json-ld';

      // If JSON-LD fails, use Food52-specific selectors
      if (!recipe || !recipe.title) {
        recipe = this.extractFromSelectors($);
        method = 'site-specific';
      }

      if (!recipe) {
        return {
          confidence: 0,
          method,
          issues: ['No recipe found using Food52 extractors']
        };
      }

      const issues = this.validateRecipe(recipe);
      const confidence = this.calculateConfidence(recipe, method);

      if (recipe) {
        recipe.sourceUrl = this.url;
        if (!recipe.tags) recipe.tags = [];
        recipe.tags.push('Food52');

        // Food52 is community-driven, add that context
        recipe.tags.push('Community Recipe');
      }

      return {
        recipe,
        confidence: Math.min(confidence + 0.03, 1.0), // Small bonus for Food52 quality
        method,
        issues: issues.length > 0 ? issues : undefined
      };
    } catch (error) {
      return {
        confidence: 0,
        method: 'site-specific',
        issues: [`Food52 parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
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
      // Food52 often nests recipes in webpage or article structures
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
      // Food52 specific selectors (updated for their current structure)
      const title = this.extractText($(
        'h1.recipe-title, ' +
        '.recipe-header h1, ' +
        '.recipe-name, ' +
        'h1[data-test="recipe-title"], ' +
        '.entry-title, ' +
        'h1'
      ).first());

      if (!title) return null;

      const description = this.extractText($(
        '.recipe-description, ' +
        '.recipe-summary, ' +
        '.recipe-headnote, ' +
        '.entry-summary, ' +
        '.recipe-intro, ' +
        '.description'
      ).first());

      // Food52 image extraction
      const imageElement = $(
        '.recipe-photo img, ' +
        '.recipe-image img, ' +
        '.hero-image img, ' +
        '.main-image img, ' +
        '.recipe-header img, ' +
        '.entry-image img'
      ).first();
      const image = imageElement.attr('src') ||
                   imageElement.attr('data-src') ||
                   imageElement.attr('data-lazy-src') ||
                   imageElement.attr('data-original');

      // Food52 ingredients - they have specific ingredient structures
      const ingredientElements = $(
        '.recipe-ingredients li, ' +
        '.ingredients li, ' +
        '.recipe-ingredient-list li, ' +
        '.ingredient-list li, ' +
        '[data-test="recipe-ingredients"] li, ' +
        '.recipe-list li'
      );
      const ingredients = this.extractArray(ingredientElements);

      // Food52 instructions - often numbered or bulleted
      const instructionElements = $(
        '.recipe-instructions li, ' +
        '.recipe-directions li, ' +
        '.instructions li, ' +
        '.directions li, ' +
        '.method li, ' +
        '[data-test="recipe-instructions"] li, ' +
        '.recipe-steps li, ' +
        '.preparation li'
      );
      const instructions = this.extractArray(instructionElements)
        .map(instruction => this.cleanInstruction(instruction));

      // Food52 timing information
      const prepTimeText = this.extractText($(
        '.prep-time, ' +
        '.recipe-prep-time, ' +
        '.timing .prep, ' +
        '[data-test="prep-time"], ' +
        '.recipe-time .prep'
      ).first());

      const cookTimeText = this.extractText($(
        '.cook-time, ' +
        '.recipe-cook-time, ' +
        '.timing .cook, ' +
        '[data-test="cook-time"], ' +
        '.recipe-time .cook'
      ).first());

      const totalTimeText = this.extractText($(
        '.total-time, ' +
        '.recipe-total-time, ' +
        '.timing .total, ' +
        '[data-test="total-time"], ' +
        '.recipe-time .total'
      ).first());

      const prepTime = this.extractTime(prepTimeText) || undefined;
      const cookTime = this.extractTime(cookTimeText) || undefined;
      const totalTime = this.extractTime(totalTimeText) || undefined;

      // Servings/yield information
      const servingsText = this.extractText($(
        '.recipe-yield, ' +
        '.servings, ' +
        '.serves, ' +
        '.makes, ' +
        '[data-test="recipe-yield"], ' +
        '.recipe-serves, ' +
        '.portions'
      ).first());
      const servings = this.extractNumber(servingsText);

      // Extract author for community context
      const authorText = this.extractText($(
        '.recipe-author, ' +
        '.author, ' +
        '.byline, ' +
        '.recipe-credit, ' +
        '[data-test="author"]'
      ).first());

      return {
        title,
        description: description || undefined,
        image: image || undefined,
        prepTime,
        cookTime,
        totalTime,
        servings,
        ingredients,
        instructions,
        tags: ['Food52', 'Community Recipe'],
        // Note: Could add author to recipe object if needed
        ...(authorText && { author: authorText })
      };
    } catch (error) {
      console.error('Error in Food52 selector extraction:', error);
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
      console.error('Error parsing Food52 JSON-LD:', error);
      return null;
    }
  }
}