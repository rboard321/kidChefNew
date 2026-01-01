import * as cheerio from 'cheerio';
import { BaseScraper, ScraperResult, ScrapedRecipe } from './BaseScraper';

export class BonAppetitScraper extends BaseScraper {
  canHandle(hostname: string): boolean {
    return hostname.includes('bonappetit.com');
  }

  async scrape($: cheerio.CheerioAPI, html: string): Promise<ScraperResult> {
    try {
      // Bon Appétit has evolved their structure, try JSON-LD first
      let recipe = this.extractFromJsonLd($);
      let method: 'json-ld' | 'site-specific' = 'json-ld';

      // If JSON-LD fails, use Bon Appétit-specific selectors
      if (!recipe || !recipe.title) {
        recipe = this.extractFromSelectors($);
        method = 'site-specific';
      }

      if (!recipe) {
        return {
          confidence: 0,
          method,
          issues: ['No recipe found using Bon Appétit extractors']
        };
      }

      const issues = this.validateRecipe(recipe);
      const confidence = this.calculateConfidence(recipe, method);

      if (recipe) {
        recipe.sourceUrl = this.url;
        if (!recipe.tags) recipe.tags = [];
        recipe.tags.push('Bon Appétit');
      }

      return {
        recipe,
        confidence: Math.min(confidence + 0.04, 1.0), // Bonus for BA quality
        method,
        issues: issues.length > 0 ? issues : undefined
      };
    } catch (error) {
      return {
        confidence: 0,
        method: 'site-specific',
        issues: [`Bon Appétit parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
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
      // Bon Appétit often nests recipes in complex content structures
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
      // Bon Appétit specific selectors (updated for their current structure)
      const title = this.extractText($(
        'h1[data-testid="ContentHeaderHed"], ' +
        'h1.ContentHeaderHed, ' +
        'h1.recipe-title, ' +
        '.content-header h1, ' +
        'h1.entry-title, ' +
        '.recipe-header h1, ' +
        'h1'
      ).first());

      if (!title) return null;

      const description = this.extractText($(
        '[data-testid="ContentHeaderDek"], ' +
        '.ContentHeaderDek, ' +
        '.recipe-description, ' +
        '.recipe-summary, ' +
        '.content-dek, ' +
        '.entry-summary, ' +
        '.recipe-intro'
      ).first());

      // Bon Appétit image extraction - they often use specific image containers
      const imageElement = $(
        '[data-testid="ContentHeaderLeadAsset"] img, ' +
        '.ContentHeaderLeadAsset img, ' +
        '.recipe-image img, ' +
        '.lead-image img, ' +
        '.hero-image img, ' +
        '.content-header img'
      ).first();
      const image = imageElement.attr('src') ||
                   imageElement.attr('data-src') ||
                   imageElement.attr('data-lazy-src') ||
                   imageElement.attr('data-original');

      // Bon Appétit ingredients - modern structure
      const ingredientElements = $(
        '[data-testid="IngredientList"] li, ' +
        '.recipe-ingredients li, ' +
        '.ingredients li, ' +
        '.ingredient-list li, ' +
        '[class*="ingredient"] li, ' +
        '.recipe-list li'
      );
      const ingredients = this.extractArray(ingredientElements);

      // Bon Appétit instructions - they often have detailed preparation steps
      const instructionElements = $(
        '[data-testid="InstructionList"] li, ' +
        '.recipe-instructions li, ' +
        '.preparation li, ' +
        '.instructions li, ' +
        '.directions li, ' +
        '.method li, ' +
        '[class*="instruction"] li'
      );
      const instructions = this.extractArray(instructionElements)
        .map(instruction => this.cleanInstruction(instruction));

      // Bon Appétit timing information
      const prepTimeText = this.extractText($(
        '[data-testid="prep-time"], ' +
        '.recipe-prep-time, ' +
        '.prep-time, ' +
        '.active-time, ' +
        '.recipe-time .prep'
      ).first());

      const cookTimeText = this.extractText($(
        '[data-testid="cook-time"], ' +
        '.recipe-cook-time, ' +
        '.cook-time, ' +
        '.cooking-time, ' +
        '.recipe-time .cook'
      ).first());

      const totalTimeText = this.extractText($(
        '[data-testid="total-time"], ' +
        '.recipe-total-time, ' +
        '.total-time, ' +
        '.recipe-time .total'
      ).first());

      const prepTime = this.extractTime(prepTimeText) || undefined;
      const cookTime = this.extractTime(cookTimeText) || undefined;
      const totalTime = this.extractTime(totalTimeText) || undefined;

      // Servings/yield information
      const servingsText = this.extractText($(
        '[data-testid="recipe-yield"], ' +
        '.recipe-yield, ' +
        '.recipe-serves, ' +
        '.servings, ' +
        '.serves, ' +
        '.makes, ' +
        '.portions'
      ).first());
      const servings = this.extractNumber(servingsText);

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
        tags: ['Bon Appétit']
      };
    } catch (error) {
      console.error('Error in Bon Appétit selector extraction:', error);
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
      console.error('Error parsing Bon Appétit JSON-LD:', error);
      return null;
    }
  }
}