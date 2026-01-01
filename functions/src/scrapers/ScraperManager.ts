import * as cheerio from 'cheerio';
import { ScrapedRecipe, ScraperResult } from './BaseScraper';
import { JsonLdScraper } from './JsonLdScraper';
import { FoodNetworkScraper } from './FoodNetworkScraper';
import { AllRecipesScraper } from './AllRecipesScraper';
import { SeriousEatsScraper } from './SeriousEatsScraper';
import { BBCGoodFoodScraper } from './BBCGoodFoodScraper';
import { NYTCookingScraper } from './NYTCookingScraper';
import { Food52Scraper } from './Food52Scraper';
import { SimplyRecipesScraper } from './SimplyRecipesScraper';
import { BonAppetitScraper } from './BonAppetitScraper';
import { EpicuriousScraper } from './EpicuriousScraper';
import { DelishScraper } from './DelishScraper';

export class ScraperManager {
  constructor() {
    // Scrapers are instantiated when needed to avoid issues with URL parameter
  }

  async scrapeRecipe(url: string, $: cheerio.CheerioAPI, html: string): Promise<ScraperResult> {
    const hostname = new URL(url).hostname.toLowerCase();

    // Try scrapers in order of specificity (most specific first)
    const scraperClasses = [
      NYTCookingScraper,
      BBCGoodFoodScraper,
      Food52Scraper,
      SimplyRecipesScraper,
      BonAppetitScraper,
      EpicuriousScraper,   // Add new Epicurious scraper
      DelishScraper,       // Add new Delish scraper
      FoodNetworkScraper,
      AllRecipesScraper,
      SeriousEatsScraper,
      JsonLdScraper  // Always try JSON-LD as fallback
    ];

    let bestResult: ScraperResult = {
      confidence: 0,
      method: 'json-ld',
      issues: ['No extraction attempted']
    };

    const allResults: ScraperResult[] = [];

    // Try all scrapers to collect partial data
    console.log('ScraperManager: Trying scrapers for hostname:', hostname);

    for (const ScraperClass of scraperClasses) {
      const scraper = new ScraperClass(url);
      const scraperName = ScraperClass.name;

      console.log(`Checking if ${scraperName} can handle ${hostname}:`, scraper.canHandle(hostname));

      if (scraper.canHandle(hostname)) {
        try {
          console.log(`Running ${scraperName} for ${url}`);
          const result = await scraper.scrape($, html);
          allResults.push(result);

          console.log(`${scraperName} result:`, {
            confidence: result.confidence,
            hasRecipe: !!result.recipe,
            title: result.recipe?.title?.substring(0, 50) + '...',
            method: result.method,
            issues: result.issues
          });

          // Update best result if this is better
          if (result.confidence > bestResult.confidence) {
            bestResult = result;
          }

          // If we got a really good result, still continue to try other scrapers
          // for potential data merging, but mark as early termination candidate
          if (result.confidence >= 0.9 && result.recipe?.title &&
              result.recipe?.ingredients && result.recipe.ingredients.length > 0 &&
              result.recipe?.instructions && result.recipe.instructions.length > 0) {
            console.log(`High confidence result from ${ScraperClass.name}, but continuing for potential data merging`);
          }
        } catch (error) {
          console.error(`Error with ${ScraperClass.name}:`, error);
          // Continue to next scraper
        }
      }
    }

    // Always try generic HTML extraction as final fallback
    try {
      const genericResult = await this.extractFromGenericHtml($, url);
      allResults.push(genericResult);

      // Update best result if generic extraction is better
      if (genericResult.confidence > bestResult.confidence) {
        console.log('Generic HTML extraction provided better result:', {
          genericConfidence: genericResult.confidence,
          previousBest: bestResult.confidence
        });
        bestResult = genericResult;
      }
    } catch (error) {
      console.error('Generic HTML extraction failed:', error);
      // Add error info to results for debugging
      allResults.push({
        confidence: 0,
        method: 'css-selectors',
        issues: [`Generic HTML extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      });
    }

    // Implement graceful degradation: merge data from multiple sources
    const mergedResult = this.mergeScraperResults(allResults, url);

    // Use merged result if it's better than individual results
    if (mergedResult && mergedResult.confidence > bestResult.confidence) {
      bestResult = mergedResult;
    }

    // If we still have low confidence, try to enhance with fallback methods
    if (bestResult.confidence < 0.6) {
      console.log('Attempting to enhance partial data, current confidence:', bestResult.confidence);
      bestResult = await this.enhancePartialData(bestResult, $, url);
    }

    // Final summary
    console.log('ScraperManager final result:', {
      confidence: bestResult.confidence,
      method: bestResult.method,
      hasRecipe: !!bestResult.recipe,
      title: bestResult.recipe?.title || 'No title',
      ingredientCount: bestResult.recipe?.ingredients?.length || 0,
      instructionCount: bestResult.recipe?.instructions?.length || 0,
      totalAttempts: allResults.length,
      attempts: allResults.map(r => ({ method: r.method, confidence: r.confidence }))
    });

    return bestResult;
  }

  private async extractFromGenericHtml($: cheerio.CheerioAPI, url: string): Promise<ScraperResult> {
    try {
      // Generic HTML extraction for sites without structured data
      const title = this.extractBestText($, [
        'h1',
        '.recipe-title',
        '.entry-title',
        '[itemprop="name"]',
        'title'
      ]);

      if (!title) {
        return {
          confidence: 0,
          method: 'css-selectors',
          issues: ['No recipe title found']
        };
      }

      // Extract ingredients using common patterns
      const ingredients = this.extractTextArray($, [
        '.recipe-ingredient',
        '.ingredients li',
        '[itemprop="recipeIngredient"]',
        '.ingredient',
        '.recipe-ingredients li',
        '.ingredients-section li'
      ]);

      // Extract instructions using common patterns
      const instructions = this.extractTextArray($, [
        '.recipe-instruction',
        '.instructions li',
        '.directions li',
        '[itemprop="recipeInstructions"]',
        '.instruction',
        '.recipe-instructions li',
        '.method li',
        '.directions-section li'
      ]).map(instruction => this.cleanInstruction(instruction));

      // Extract other metadata
      const description = this.extractBestText($, [
        '.recipe-description',
        '.entry-summary',
        '[itemprop="description"]',
        '.summary'
      ]);

      const image = this.extractBestAttribute($, [
        '.recipe-image img',
        '.entry-image img',
        '[itemprop="image"]'
      ], ['src', 'data-src']);

      const recipe: Partial<ScrapedRecipe> = {
        title,
        description: description || undefined,
        image: image || undefined,
        ingredients,
        instructions,
        sourceUrl: url
      };

      const issues = this.validateRecipe(recipe);
      const confidence = this.calculateConfidence(recipe, 'css-selectors');

      return {
        recipe,
        confidence,
        method: 'css-selectors',
        issues
      };
    } catch (error) {
      return {
        confidence: 0,
        method: 'css-selectors',
        issues: [`Generic HTML extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  private extractBestText($: cheerio.CheerioAPI, selectors: string[]): string {
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const text = element.text().trim();
        if (text && text.length > 0) {
          return text;
        }
      }
    }
    return '';
  }

  private extractTextArray($: cheerio.CheerioAPI, selectors: string[]): string[] {
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        const texts = elements.map((_, el) => $(el).text().trim()).get().filter(Boolean);
        if (texts.length > 0) {
          return texts;
        }
      }
    }
    return [];
  }

  private extractBestAttribute($: cheerio.CheerioAPI, selectors: string[], attributes: string[]): string | null {
    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        for (const attr of attributes) {
          const value = element.attr(attr);
          if (value && value.trim()) {
            return value.trim();
          }
        }
      }
    }
    return null;
  }

  private cleanInstruction(instruction: string): string {
    return instruction
      .replace(/^\d+\.\s*/, '') // Remove step numbers
      .replace(/^Step\s+\d+:?\s*/i, '') // Remove "Step X:"
      .trim();
  }

  private validateRecipe(recipe: Partial<ScrapedRecipe>): string[] {
    const issues: string[] = [];

    if (!recipe.title) issues.push('Missing title');
    if (!recipe.ingredients || recipe.ingredients.length === 0) issues.push('Missing ingredients');
    if (!recipe.instructions || recipe.instructions.length === 0) issues.push('Missing instructions');

    return issues;
  }

  private calculateConfidence(recipe: Partial<ScrapedRecipe>, method: string): number {
    let confidence = 0;

    // Base confidence by method
    switch (method) {
      case 'json-ld': confidence = 0.9; break;
      case 'microdata': confidence = 0.8; break;
      case 'site-specific': confidence = 0.85; break;
      case 'css-selectors': confidence = 0.6; break;
      default: confidence = 0.5;
    }

    // Adjust based on completeness
    if (recipe.title) confidence += 0.05;
    if (recipe.ingredients && recipe.ingredients.length > 0) confidence += 0.05;
    if (recipe.instructions && recipe.instructions.length > 0) confidence += 0.05;
    if (recipe.image) confidence += 0.02;
    if (recipe.description) confidence += 0.02;

    return Math.min(confidence, 1.0);
  }

  // Merge results from multiple scrapers to create the best possible recipe
  private mergeScraperResults(results: ScraperResult[], url: string): ScraperResult | null {
    if (results.length === 0) return null;

    // Find the best recipe data by prioritizing completeness
    let bestTitle = '';
    let bestDescription = '';
    let bestImage = '';
    let bestIngredients: string[] = [];
    let bestInstructions: string[] = [];
    let bestServings: number | undefined;
    let bestPrepTime = '';
    let bestCookTime = '';
    const allIssues: string[] = [];
    let maxConfidence = 0;
    let bestMethod = 'merged';

    for (const result of results) {
      if (!result.recipe) continue;

      const recipe = result.recipe;

      // Prioritize title from highest confidence result with title
      if (recipe.title && (!bestTitle || result.confidence > maxConfidence)) {
        bestTitle = recipe.title;
      }

      // Merge descriptions (prefer longer, more detailed ones)
      if (recipe.description && recipe.description.length > bestDescription.length) {
        bestDescription = recipe.description;
      }

      // Prioritize image from structured data sources
      if (recipe.image && (!bestImage ||
          (result.method === 'json-ld' || result.method === 'site-specific'))) {
        bestImage = recipe.image;
      }

      // Use ingredients from most complete source
      if (recipe.ingredients && recipe.ingredients.length > bestIngredients.length) {
        bestIngredients = recipe.ingredients;
      }

      // Use instructions from most complete source
      if (recipe.instructions && recipe.instructions.length > bestInstructions.length) {
        bestInstructions = recipe.instructions;
      }

      // Use metadata from highest confidence source
      if (result.confidence > maxConfidence) {
        maxConfidence = result.confidence;
        bestMethod = `merged-${result.method}`;
        if (recipe.servings) bestServings = recipe.servings;
        if (recipe.prepTime) bestPrepTime = recipe.prepTime;
        if (recipe.cookTime) bestCookTime = recipe.cookTime;
      }

      // Collect all issues
      if (result.issues) {
        allIssues.push(...result.issues);
      }
    }

    // Only create merged result if we have essential data
    if (!bestTitle || bestIngredients.length === 0) {
      return null;
    }

    const mergedRecipe: Partial<ScrapedRecipe> = {
      title: bestTitle,
      description: bestDescription || undefined,
      image: bestImage || undefined,
      ingredients: bestIngredients,
      instructions: bestInstructions,
      servings: bestServings,
      prepTime: bestPrepTime || undefined,
      cookTime: bestCookTime || undefined,
      sourceUrl: url
    };

    const issues = this.validateRecipe(mergedRecipe);
    const confidence = this.calculateMergedConfidence(mergedRecipe, results);

    return {
      recipe: mergedRecipe,
      confidence,
      method: bestMethod as any,
      issues: issues.length > 0 ? issues : undefined
    };
  }

  // Calculate confidence for merged results
  private calculateMergedConfidence(recipe: Partial<ScrapedRecipe>, originalResults: ScraperResult[]): number {
    let baseConfidence = 0.7; // Start with good base for merged data

    // Bonus for completeness
    if (recipe.title) baseConfidence += 0.1;
    if (recipe.ingredients && recipe.ingredients.length > 0) baseConfidence += 0.1;
    if (recipe.instructions && recipe.instructions.length > 0) baseConfidence += 0.1;
    if (recipe.image) baseConfidence += 0.05;
    if (recipe.description) baseConfidence += 0.03;
    if (recipe.servings) baseConfidence += 0.02;

    // Bonus for multiple sources agreeing
    const sourcesWithTitle = originalResults.filter(r => r.recipe?.title).length;
    const sourcesWithIngredients = originalResults.filter(r => r.recipe?.ingredients && r.recipe.ingredients.length > 0).length;

    if (sourcesWithTitle > 1) baseConfidence += 0.02;
    if (sourcesWithIngredients > 1) baseConfidence += 0.03;

    return Math.min(baseConfidence, 1.0);
  }

  // Enhance partial data with additional extraction attempts
  private async enhancePartialData(result: ScraperResult, $: cheerio.CheerioAPI, url: string): Promise<ScraperResult> {
    if (!result.recipe) return result;

    const enhanced = { ...result.recipe };
    let confidenceBonus = 0;
    const newIssues = [...(result.issues || [])];

    // Try to fill missing ingredients with broader selectors
    if (!enhanced.ingredients || enhanced.ingredients.length === 0) {
      const ingredients = this.extractTextArrayAggressive($, [
        'li:contains("cup")', 'li:contains("tablespoon")', 'li:contains("teaspoon")',
        'li:contains("lb")', 'li:contains("oz")', 'li:contains("pound")',
        'p:contains("cup")', 'p:contains("tablespoon")', 'div:contains("ingredient")',
        '[class*="ingredient"]', '[id*="ingredient"]'
      ]);
      if (ingredients.length > 0) {
        enhanced.ingredients = ingredients;
        confidenceBonus += 0.15;
        newIssues.push('Ingredients found with aggressive extraction');
      }
    }

    // Try to fill missing instructions with broader selectors
    if (!enhanced.instructions || enhanced.instructions.length === 0) {
      const instructions = this.extractTextArrayAggressive($, [
        'ol li', 'div:contains("step")', 'p:contains("step")',
        '[class*="direction"]', '[class*="instruction"]', '[class*="method"]',
        '[id*="direction"]', '[id*="instruction"]'
      ]).map(instruction => this.cleanInstruction(instruction));

      if (instructions.length > 0) {
        enhanced.instructions = instructions;
        confidenceBonus += 0.15;
        newIssues.push('Instructions found with aggressive extraction');
      }
    }

    // Try to enhance image with meta tags if missing
    if (!enhanced.image) {
      const ogImage = $('meta[property="og:image"]').attr('content');
      const twitterImage = $('meta[name="twitter:image"]').attr('content');
      if (ogImage || twitterImage) {
        enhanced.image = ogImage || twitterImage;
        confidenceBonus += 0.03;
      }
    }

    return {
      recipe: enhanced,
      confidence: Math.min(result.confidence + confidenceBonus, 1.0),
      method: result.method,
      issues: newIssues.length > 0 ? newIssues : undefined
    };
  }

  // More aggressive text extraction for partial data enhancement
  private extractTextArrayAggressive($: cheerio.CheerioAPI, selectors: string[]): string[] {
    const texts: string[] = [];

    for (const selector of selectors) {
      const elements = $(selector);
      elements.each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 10 && text.length < 200) { // Reasonable length for ingredients/instructions
          texts.push(text);
        }
      });

      // If we found some results with this selector, don't try more aggressive ones
      if (texts.length >= 3) break;
    }

    return texts.slice(0, 20); // Limit to prevent spam
  }
}