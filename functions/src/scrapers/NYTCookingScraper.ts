import * as cheerio from 'cheerio';
import { BaseScraper, ScraperResult, ScrapedRecipe } from './BaseScraper';

export class NYTCookingScraper extends BaseScraper {
  canHandle(hostname: string): boolean {
    return hostname.includes('nytimes.com') &&
           (hostname.includes('cooking') || hostname.includes('recipes'));
  }

  async scrape($: cheerio.CheerioAPI, html: string): Promise<ScraperResult> {
    try {
      // Check for paywall first
      const paywallDetected = this.detectPaywall($);

      // NYT Cooking often has excellent JSON-LD even for paywalled content
      let recipe = this.extractFromJsonLd($);
      let method: 'json-ld' | 'site-specific' = 'json-ld';

      // If JSON-LD fails or paywall blocks, try NYT-specific selectors
      if (!recipe || !recipe.title || paywallDetected) {
        recipe = this.extractFromSelectors($);
        method = 'site-specific';
      }

      if (!recipe) {
        return {
          confidence: 0,
          method,
          issues: paywallDetected ?
            ['NYT Cooking paywall detected - limited content available'] :
            ['No recipe found using NYT Cooking extractors']
        };
      }

      const issues = this.validateRecipe(recipe);
      if (paywallDetected) {
        issues.push('Content may be limited due to NYT paywall');
      }

      const confidence = this.calculateConfidence(recipe, method);

      if (recipe) {
        recipe.sourceUrl = this.url;
        if (!recipe.tags) recipe.tags = [];
        recipe.tags.push('NYT Cooking');
      }

      return {
        recipe,
        confidence: paywallDetected ?
          Math.min(confidence - 0.1, 1.0) : // Penalty for paywall
          Math.min(confidence + 0.04, 1.0), // Bonus for NYT quality
        method,
        issues: issues.length > 0 ? issues : undefined
      };
    } catch (error) {
      return {
        confidence: 0,
        method: 'site-specific',
        issues: [`NYT Cooking parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  private detectPaywall($: cheerio.CheerioAPI): boolean {
    // Common NYT paywall indicators
    const paywallSelectors = [
      '.css-mcm29f', // NYT paywall modal
      '[data-testid="paywall"]',
      '.paywall',
      '.subscriber-only',
      '.nyt-paywall',
      '.login-modal'
    ];

    // Check for paywall elements
    for (const selector of paywallSelectors) {
      if ($(selector).length > 0) {
        return true;
      }
    }

    // Check for subscription required text
    const paywallText = $('body').text();
    const paywallIndicators = [
      'subscribe to continue reading',
      'create a free account',
      'log in or create an account',
      'subscribers only',
      'subscription required'
    ];

    return paywallIndicators.some(indicator =>
      paywallText.toLowerCase().includes(indicator)
    );
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
      // NYT often nests recipes in article or webpage structures
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
      // NYT Cooking specific selectors (updated for their current structure)
      const title = this.extractText($(
        'h1[data-testid="recipe-title"], ' +
        '.recipe-title, ' +
        '.nyt5-headline, ' +
        'h1.css-1v7bfmb, ' + // NYT cooking title class
        'h1'
      ).first());

      if (!title) return null;

      const description = this.extractText($(
        '[data-testid="recipe-description"], ' +
        '.recipe-intro, ' +
        '.nyt5-summary, ' +
        '.css-1wev1x0, ' + // NYT description class
        '.recipe-summary'
      ).first());

      // NYT image extraction - they often use specific image containers
      const imageElement = $(
        '[data-testid="recipe-image"] img, ' +
        '.recipe-photo img, ' +
        '.nyt5-image img, ' +
        '.css-1l1j2ho img, ' + // NYT image container
        '.media-viewer img'
      ).first();
      const image = imageElement.attr('src') ||
                   imageElement.attr('data-src') ||
                   imageElement.attr('data-lazy-src');

      // NYT ingredients - they have specific ingredient list structures
      const ingredientElements = $(
        '[data-testid="recipe-ingredients"] li, ' +
        '.recipe-ingredients li, ' +
        '.ingredients li, ' +
        '.nyt5-ingredients li, ' +
        '.css-1dbjc4n li, ' + // NYT ingredients container
        'section[aria-label="Ingredients"] li'
      );
      const ingredients = this.extractArray(ingredientElements);

      // NYT instructions - often well-structured
      const instructionElements = $(
        '[data-testid="recipe-instructions"] li, ' +
        '[data-testid="recipe-instructions"] ol li, ' +
        '.recipe-instructions li, ' +
        '.directions li, ' +
        '.nyt5-instructions li, ' +
        'section[aria-label="Preparation"] li, ' +
        'section[aria-label="Method"] li'
      );
      const instructions = this.extractArray(instructionElements)
        .map(instruction => this.cleanInstruction(instruction));

      // NYT timing information
      const prepTimeText = this.extractText($(
        '[data-testid="recipe-time-prep"], ' +
        '.recipe-time-prep, ' +
        '.prep-time, ' +
        '.nyt5-time .prep'
      ).first());

      const cookTimeText = this.extractText($(
        '[data-testid="recipe-time-cook"], ' +
        '.recipe-time-cook, ' +
        '.cook-time, ' +
        '.nyt5-time .cook'
      ).first());

      const totalTimeText = this.extractText($(
        '[data-testid="recipe-time-total"], ' +
        '.recipe-time-total, ' +
        '.total-time, ' +
        '.nyt5-time .total'
      ).first());

      const prepTime = this.extractTime(prepTimeText) || undefined;
      const cookTime = this.extractTime(cookTimeText) || undefined;
      const totalTime = this.extractTime(totalTimeText) || undefined;

      // Servings information
      const servingsText = this.extractText($(
        '[data-testid="recipe-yield"], ' +
        '.recipe-yield, ' +
        '.servings, ' +
        '.nyt5-yield, ' +
        '.serves'
      ).first());
      const servings = this.extractNumber(servingsText);

      // Rating if available (currently not used but kept for future enhancement)
      // const ratingText = this.extractText($(
      //   '[data-testid="recipe-rating"], ' +
      //   '.recipe-rating, ' +
      //   '.rating, ' +
      //   '.nyt5-rating'
      // ).first());

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
        tags: ['NYT Cooking']
      };
    } catch (error) {
      console.error('Error in NYT Cooking selector extraction:', error);
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
      console.error('Error parsing NYT Cooking JSON-LD:', error);
      return null;
    }
  }
}