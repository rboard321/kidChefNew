import * as cheerio from 'cheerio';
import { BaseScraper, ScraperResult, ScrapedRecipe } from './BaseScraper';
import { JsonLdNormalizer } from '../services/jsonLdNormalizer';

export class AllRecipesScraper extends BaseScraper {
  canHandle(hostname: string): boolean {
    return hostname.includes('allrecipes.com');
  }

  async scrape($: cheerio.CheerioAPI, html: string): Promise<ScraperResult> {
    try {
      // AllRecipes usually has JSON-LD, but also has specific structure
      let recipe = this.extractFromJsonLd($);
      let method: 'json-ld' | 'site-specific' = 'json-ld';

      // If JSON-LD fails, use AllRecipes-specific selectors
      if (!recipe || !recipe.title) {
        recipe = this.extractFromSelectors($);
        method = 'site-specific';
      }

      if (!recipe) {
        return {
          confidence: 0,
          method,
          issues: ['No recipe found using AllRecipes extractors']
        };
      }

      const issues = this.validateRecipe(recipe);
      const confidence = this.calculateConfidence(recipe, method);

      if (recipe) {
        recipe.sourceUrl = this.url;
      }

      return {
        recipe,
        confidence,
        method,
        issues
      };
    } catch (error) {
      return {
        confidence: 0,
        method: 'site-specific',
        issues: [`AllRecipes parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
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

          // Handle arrays first
          let recipeData = data;
          if (Array.isArray(data)) {
            recipeData = data.find(item => item['@type'] === 'Recipe');
            if (!recipeData) continue;
          }

          if (recipeData['@type'] === 'Recipe') {
            // Apply AllRecipes specific normalizations before parsing
            const hostname = new URL(this.url).hostname.toLowerCase();
            const normalizationResult = JsonLdNormalizer.normalize(recipeData, hostname);

            if (normalizationResult.improved) {
              console.log(`AllRecipes: Applied normalizations:`, normalizationResult.issues);
            }

            return this.parseJsonLdRecipe(normalizationResult.recipe);
          }
        } catch (parseError) {
          continue;
        }
      }
      return null;
    } catch (error) {
      return null;
    }
  }

  private extractFromSelectors($: cheerio.CheerioAPI): Partial<ScrapedRecipe> | null {
    try {
      // Enhanced AllRecipes selectors (2024-2025)
      const title = this.extractText($(
        'h1.entry-title, ' +
        '.recipe-title, ' +
        '.entry-title, ' +
        'h1[data-module="RecipeTitle"], ' +
        '.headline-wrapper h1, ' +
        '.recipe-header h1, ' +
        'h1'
      ).first());

      if (!title) {
        console.log('AllRecipes: No title found with any selector');
        return null;
      }

      console.log(`AllRecipes: Found title: ${title.substring(0, 50)}...`);

      const description = this.extractText($(
        '.recipe-description, ' +
        '.recipe-summary, ' +
        '.entry-summary, ' +
        '.recipe-summary__description, ' +
        '.recipe-intro, ' +
        '.dek'
      ).first());

      // Enhanced image extraction for AllRecipes
      const imageElement = $(
        '.recipe-image img, ' +
        '.image-container img, ' +
        '.hero-photo__image, ' +
        '.recipe-card-image img, ' +
        '.primary-image img, ' +
        '.lead-image img, ' +
        '.recipe-photo img'
      ).first();
      const image = imageElement.attr('src') ||
                   imageElement.attr('data-src') ||
                   imageElement.attr('data-original') ||
                   imageElement.attr('data-lazy-src');

      // Enhanced ingredient extraction for AllRecipes
      const ingredientElements = $(
        '.recipe-ingred_txt, ' +
        '.ingredients li, ' +
        '.recipe-ingredient-list li, ' +
        '.ingredients-section li, ' +
        '.mntl-structured-ingredients__list li, ' +
        '[data-ingredient] span, ' +
        '.ingredient-list li, ' +
        '.recipe-ingredients__ingredient, ' +
        '.ingredients-section__ingredient, ' +
        '.component-recipe-ingredients li'
      );
      const ingredients = this.extractArray(ingredientElements);

      console.log(`AllRecipes: Found ${ingredients.length} ingredients`);

      // Extract instructions - multiple possible structures
      const instructionElements = $(
        '.recipe-directions__list--item, ' +
        '.instructions li, ' +
        '.directions li, ' +
        '.recipe-instruction-list li, ' +
        '.instructions-section li, ' +
        '.directions ol li, ' +
        '.mntl-sc-block-group--OL li, ' +
        '.instructions-section .section-body ol li'
      );
      const instructions = this.extractArray(instructionElements)
        .map(instruction => this.cleanInstruction(instruction));

      // Extract metadata
      const prepTimeElement = $('.prep-time, .recipe-prep-time, .prepTime, .total-time .prep-time');
      const cookTimeElement = $('.cook-time, .recipe-cook-time, .cookTime, .total-time .cook-time');
      const totalTimeElement = $('.total-time, .recipe-total-time, .totalTime');

      const prepTime = this.extractTime(this.extractText(prepTimeElement)) || undefined;
      const cookTime = this.extractTime(this.extractText(cookTimeElement)) || undefined;
      const totalTime = this.extractTime(this.extractText(totalTimeElement)) || undefined;

      // Extract servings/yield
      const servingsElement = $('.recipe-adjust-servings__size-quantity, .servings, .recipe-serves, .yield, .recipe-nutrition__item:contains("servings")');
      const servings = this.extractNumber(this.extractText(servingsElement));

      // Extract rating if available (for future use)
      // const ratingElement = $('.rating-stars, .recipe-rating, [data-rating]');
      // const rating = this.extractNumber(this.extractText(ratingElement));

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
        tags: ['AllRecipes']
      };
    } catch (error) {
      console.error('Error in AllRecipes selector extraction:', error);
      return null;
    }
  }

  private parseJsonLdRecipe(data: any): Partial<ScrapedRecipe> | null {
    try {
      let recipe = data;

      // Handle arrays
      if (Array.isArray(data)) {
        recipe = data.find(item => item['@type'] === 'Recipe');
        if (!recipe) return null;
      }

      if (recipe['@type'] !== 'Recipe') return null;

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
            // Handle HowToStep objects
            if (instruction['@type'] === 'HowToStep') {
              return this.cleanInstruction(
                instruction.text || instruction.name || instruction.description || ''
              );
            }

            // Extract text from any text-containing property
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
      console.error('Error parsing AllRecipes JSON-LD:', error);
      return null;
    }
  }
}