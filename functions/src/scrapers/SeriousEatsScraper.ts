import * as cheerio from 'cheerio';
import { BaseScraper, ScraperResult, ScrapedRecipe } from './BaseScraper';

export class SeriousEatsScraper extends BaseScraper {
  canHandle(hostname: string): boolean {
    return hostname.includes('seriouseats.com');
  }

  async scrape($: cheerio.CheerioAPI, html: string): Promise<ScraperResult> {
    try {
      // Serious Eats usually has excellent JSON-LD
      let recipe = this.extractFromJsonLd($);
      let method: 'json-ld' | 'site-specific' = 'json-ld';

      // If JSON-LD fails, use site-specific selectors
      if (!recipe || !recipe.title) {
        recipe = this.extractFromSelectors($);
        method = 'site-specific';
      }

      if (!recipe) {
        return {
          confidence: 0,
          method,
          issues: ['No recipe found using Serious Eats extractors']
        };
      }

      const issues = this.validateRecipe(recipe);
      const confidence = this.calculateConfidence(recipe, method);

      if (recipe) {
        recipe.sourceUrl = this.url;
        // Serious Eats is known for high quality
        if (!recipe.tags) recipe.tags = [];
        recipe.tags.push('Serious Eats');
      }

      return {
        recipe,
        confidence: Math.min(confidence + 0.05, 1.0), // Bonus for SE quality
        method,
        issues
      };
    } catch (error) {
      return {
        confidence: 0,
        method: 'site-specific',
        issues: [`Serious Eats parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
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
          // Serious Eats often uses nested structures
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
      // Serious Eats specific selectors
      const title = this.extractText($('h1.heading__title, .recipe-title, h1.entry-title, .project-name').first());

      if (!title) return null;

      const description = this.extractText($('.recipe-about, .recipe-summary, .project-description, .entry-summary').first());

      // Extract image
      const imageElement = $('.recipe-hero-image img, .lead-image img, .hero-image img, .recipe-image img').first();
      const image = imageElement.attr('src') || imageElement.attr('data-src') || imageElement.attr('data-original');

      // Serious Eats ingredients structure
      const ingredientElements = $(
        '.recipe-ingredient-group li, ' +
        '.ingredients li, ' +
        '.recipe-ingredients li, ' +
        '.ingredient-list li, ' +
        '.structured-ingredients li'
      );
      const ingredients = this.extractArray(ingredientElements);

      // Instructions
      const instructionElements = $(
        '.recipe-procedures li, ' +
        '.recipe-instruction-group li, ' +
        '.instructions li, ' +
        '.directions li, ' +
        '.recipe-instructions li, ' +
        '.procedure-text'
      );
      const instructions = this.extractArray(instructionElements)
        .map(instruction => this.cleanInstruction(instruction));

      // Extract metadata - Serious Eats often has detailed timing
      const prepTimeText = this.extractText($('.recipe-time-prep, .prep-time, .total-time-prep').first());
      const cookTimeText = this.extractText($('.recipe-time-cook, .cook-time, .total-time-cook').first());
      const totalTimeText = this.extractText($('.recipe-time-total, .total-time, .recipe-total-time').first());

      const prepTime = this.extractTime(prepTimeText) || undefined;
      const cookTime = this.extractTime(cookTimeText) || undefined;
      const totalTime = this.extractTime(totalTimeText) || undefined;

      // Servings/yield
      const servingsText = this.extractText($('.recipe-yield, .servings, .recipe-serves, .makes').first());
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
        tags: ['Serious Eats']
      };
    } catch (error) {
      console.error('Error in Serious Eats selector extraction:', error);
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
      console.error('Error parsing Serious Eats JSON-LD:', error);
      return null;
    }
  }
}