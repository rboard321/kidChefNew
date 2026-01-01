import * as cheerio from 'cheerio';
import { BaseScraper, ScraperResult, ScrapedRecipe } from './BaseScraper';
import { JsonLdNormalizer } from '../services/jsonLdNormalizer';

export class FoodNetworkScraper extends BaseScraper {
  canHandle(hostname: string): boolean {
    return hostname.includes('foodnetwork.com');
  }

  async scrape($: cheerio.CheerioAPI, html: string): Promise<ScraperResult> {
    try {
      // First try JSON-LD (Food Network usually has this)
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
          issues: ['No recipe found using Food Network extractors']
        };
      }

      const issues = this.validateRecipe(recipe);
      const confidence = this.calculateConfidence(recipe, method);

      // Add sourceUrl
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
        issues: [`Food Network parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
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
            // Apply Food Network specific normalizations before parsing
            const hostname = new URL(this.url).hostname.toLowerCase();
            const normalizationResult = JsonLdNormalizer.normalize(recipeData, hostname);

            if (normalizationResult.improved) {
              console.log(`Food Network: Applied normalizations:`, normalizationResult.issues);
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
      // Updated Food Network specific CSS selectors (2024-2025)
      const title = this.extractText($(
        '.o-AssetTitle__a-HeadlineText, ' +
        'h1.entry-title, ' +
        '.recipe-title, ' +
        'h1[data-module="RecipeTitle"], ' +
        '.o-RecipeInfo__a-Headline, ' +
        'h1'
      ).first());

      if (!title) {
        console.log('Food Network: No title found with any selector');
        return null;
      }

      console.log(`Food Network: Found title: ${title.substring(0, 50)}...`);

      const description = this.extractText($(
        '.o-AssetSummary__a-Description, ' +
        '.recipe-summary, ' +
        '.entry-summary, ' +
        '.o-RecipeInfo__a-Description, ' +
        '[data-module="RecipeSummary"]'
      ).first());

      // Enhanced image extraction with more selector options
      const imageElement = $(
        '.m-MediaBlock__a-Image img, ' +
        '.recipe-image img, ' +
        '.entry-image img, ' +
        '.o-MediaBlock__a-Image img, ' +
        '.recipe-lead-image img, ' +
        '[data-module="RecipeImage"] img'
      ).first();
      const image = imageElement.attr('src') ||
                   imageElement.attr('data-src') ||
                   imageElement.attr('data-lazy-src');

      // Enhanced ingredient extraction with multiple selector strategies
      const ingredientElements = $(
        '.o-RecipeIngredients__a-Ingredient, ' +
        '.recipe-ingredient, ' +
        '.ingredients li, ' +
        '.o-Ingredients__a-Ingredient, ' +
        '[data-module="RecipeIngredients"] li, ' +
        '.recipe-ingredients__ingredient, ' +
        '.ingredient-list li'
      );
      const ingredients = this.extractArray(ingredientElements);

      console.log(`Food Network: Found ${ingredients.length} ingredients`);

      // Enhanced instruction extraction with multiple strategies
      const instructionElements = $(
        '.o-Method__m-Step, ' +
        '.recipe-instruction, ' +
        '.directions li, ' +
        '.instructions li, ' +
        '.o-Instructions__a-ListItem, ' +
        '[data-module="RecipeInstructions"] li, ' +
        '.recipe-directions__direction, ' +
        '.method-step'
      );
      const instructions = this.extractArray(instructionElements)
        .map(instruction => this.cleanInstruction(instruction));

      console.log(`Food Network: Found ${instructions.length} instructions`);

      // Extract prep/cook times
      const prepTimeElement = $('.o-RecipeInfo__a-Description:contains("Prep"), .prep-time, .recipe-prep-time');
      const cookTimeElement = $('.o-RecipeInfo__a-Description:contains("Cook"), .cook-time, .recipe-cook-time');

      const prepTime = this.extractTime(this.extractText(prepTimeElement)) || undefined;
      const cookTime = this.extractTime(this.extractText(cookTimeElement)) || undefined;

      // Extract servings
      const servingsElement = $('.o-RecipeInfo__a-Description:contains("Serves"), .servings, .recipe-serves, .yield');
      const servings = this.extractNumber(this.extractText(servingsElement));

      // Extract difficulty if available
      const difficultyElement = $('.difficulty, .recipe-difficulty');
      const difficulty = this.extractText(difficultyElement) || undefined;

      return {
        title,
        description: description || undefined,
        image: image || undefined,
        prepTime,
        cookTime,
        servings,
        difficulty,
        ingredients,
        instructions,
        tags: ['Food Network']
      };
    } catch (error) {
      console.error('Error in Food Network selector extraction:', error);
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

      return {
        title: extractText(recipe.name),
        description: extractText(recipe.description),
        image: extractText(recipe.image?.url || recipe.image),
        prepTime: extractText(recipe.prepTime),
        cookTime: extractText(recipe.cookTime),
        totalTime: extractText(recipe.totalTime),
        servings: this.extractNumber(extractText(recipe.recipeYield || recipe.yield)),
        ingredients: extractArray(recipe.recipeIngredient),
        instructions: extractArray(recipe.recipeInstructions).map(instruction => this.cleanInstruction(instruction)),
        tags: extractArray(recipe.recipeCategory).concat(extractArray(recipe.recipeCuisine))
      };
    } catch (error) {
      console.error('Error parsing Food Network JSON-LD:', error);
      return null;
    }
  }
}