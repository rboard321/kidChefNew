import * as cheerio from 'cheerio';

export interface ScrapedRecipe {
  title: string;
  description?: string;
  image?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: number;
  difficulty?: string;
  ingredients: string[];
  instructions: string[];
  sourceUrl: string;
  tags?: string[];
}

export interface ScraperResult {
  recipe?: Partial<ScrapedRecipe>;
  confidence: number; // 0-1, how confident we are in the extraction
  method: 'json-ld' | 'microdata' | 'css-selectors' | 'site-specific';
  issues?: string[]; // Any issues found during extraction
}

export abstract class BaseScraper {
  protected hostname: string;
  protected url: string;

  constructor(url: string) {
    this.url = url;
    this.hostname = new URL(url).hostname.toLowerCase();
  }

  abstract canHandle(hostname: string): boolean;
  abstract scrape($: cheerio.CheerioAPI, html: string): Promise<ScraperResult>;

  // Common utility methods for all scrapers
  protected extractText(element: cheerio.Cheerio<any>): string {
    return element.text().trim().replace(/\s+/g, ' ');
  }

  protected extractArray(elements: cheerio.Cheerio<any>): string[] {
    return elements.map((_, el) => this.extractText(cheerio.load(el)(el))).get().filter(Boolean);
  }

  protected cleanInstruction(instruction: string): string {
    return instruction
      .replace(/^\d+\.\s*/, '') // Remove step numbers
      .replace(/^Step\s+\d+:?\s*/i, '') // Remove "Step X:"
      .trim();
  }

  protected extractNumber(text: string): number | undefined {
    const match = text.match(/(\d+(?:\.\d+)?)/);
    return match ? parseFloat(match[1]) : undefined;
  }

  protected extractTime(timeString: string): string | undefined {
    if (!timeString) return undefined;

    // Handle various time formats
    const hourMatch = timeString.match(/(\d+)\s*(?:hours?|hrs?|h)/i);
    const minMatch = timeString.match(/(\d+)\s*(?:minutes?|mins?|m)/i);

    const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
    const minutes = minMatch ? parseInt(minMatch[1]) : 0;

    if (hours && minutes) return `${hours}h ${minutes}m`;
    if (hours) return `${hours}h`;
    if (minutes) return `${minutes}m`;

    return timeString;
  }

  protected validateRecipe(recipe: Partial<ScrapedRecipe>): string[] {
    const issues: string[] = [];

    if (!recipe.title) issues.push('Missing title');
    if (!recipe.ingredients || recipe.ingredients.length === 0) issues.push('Missing ingredients');
    if (!recipe.instructions || recipe.instructions.length === 0) issues.push('Missing instructions');

    return issues;
  }

  protected calculateConfidence(recipe: Partial<ScrapedRecipe>, method: string): number {
    let confidence = 0;

    // More generous base confidence - focus on partial success
    switch (method) {
      case 'json-ld': confidence = 0.70; break;      // Start lower, build up with data
      case 'site-specific': confidence = 0.65; break; // Still reward targeted scrapers
      case 'microdata': confidence = 0.60; break;
      case 'css-selectors': confidence = 0.50; break; // More generous for generic extraction
      default: confidence = 0.40;  // Give any extraction a base chance
    }

    // Essential data scoring (more generous)
    if (recipe.title && recipe.title.length > 3) {
      confidence += 0.08; // Higher reward for title
    }

    if (recipe.ingredients && recipe.ingredients.length > 0) {
      // Scale by ingredient count (more = better confidence)
      const ingredientBonus = Math.min(0.12, recipe.ingredients.length * 0.02);
      confidence += ingredientBonus;
    }

    if (recipe.instructions && recipe.instructions.length > 0) {
      // Scale by instruction count (more detailed = better confidence)
      const instructionBonus = Math.min(0.10, recipe.instructions.length * 0.02);
      confidence += instructionBonus;
    }

    // Bonus features (less critical, smaller bonuses)
    if (recipe.image) confidence += 0.03;
    if (recipe.description && recipe.description.length > 20) confidence += 0.03;
    if (recipe.prepTime || recipe.cookTime || recipe.totalTime) confidence += 0.02;
    if (recipe.servings && recipe.servings > 0) confidence += 0.02;

    // Domain reputation bonus (if we can determine high-quality sites)
    const url = recipe.sourceUrl || '';
    const highQualitySites = ['seriouseats.com', 'bbcgoodfood.com', 'food52.com', 'nytimes.com'];
    if (highQualitySites.some(site => url.includes(site))) {
      confidence += 0.03;
    }

    // Ensure we never exceed 1.0 but allow for higher confidence from good extraction
    return Math.min(confidence, 1.0);
  }
}