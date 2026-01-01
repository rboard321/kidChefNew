import axios from 'axios';
import * as cheerio from 'cheerio';
import { ScraperManager } from '../scrapers/ScraperManager';

// Test URLs for various recipe sites
const TEST_URLS = [
  // Food Network (our custom scraper)
  'https://www.foodnetwork.com/recipes/alton-brown/baked-macaroni-and-cheese-recipe-1939524',
  'https://www.foodnetwork.com/recipes/bobby-flay/perfect-grilled-chicken-recipe-1927143',

  // AllRecipes (should work with JSON-LD)
  'https://www.allrecipes.com/recipe/213742/cheesy-chicken-broccoli-casserole/',
  'https://www.allrecipes.com/recipe/16354/easy-meatloaf/',

  // Serious Eats (structured data)
  'https://www.seriouseats.com/classic-caesar-salad-recipe',
  'https://www.seriouseats.com/the-best-slow-cooked-bolognese-sauce-recipe',

  // NYT Cooking (JSON-LD)
  'https://cooking.nytimes.com/recipes/1016605-chocolate-chip-cookies',
  'https://cooking.nytimes.com/recipes/1018953-spicy-penne-all-arrabbiata',

  // Bon Appétit (structured data)
  'https://www.bonappetit.com/recipe/bas-best-chocolate-chip-cookies',
  'https://www.bonappetit.com/recipe/perfect-pan-seared-chicken-thighs',

  // BBC Good Food (international)
  'https://www.bbcgoodfood.com/recipes/classic-spaghetti-carbonara-recipe',
  'https://www.bbcgoodfood.com/recipes/ultimate-chocolate-brownies-recipe',

  // Tasty (BuzzFeed)
  'https://tasty.co/recipe/the-best-chewy-chocolate-chip-cookies',
  'https://tasty.co/recipe/one-pot-garlic-parmesan-chicken-pasta',

  // Food52 (community recipes)
  'https://food52.com/recipes/23818-classic-beef-stew',
  'https://food52.com/recipes/30239-best-banana-bread',

  // Simply Recipes (detailed instructions)
  'https://www.simplyrecipes.com/recipes/beef_stew/',
  'https://www.simplyrecipes.com/recipes/banana_bread/',

  // Epicurious (detailed metadata)
  'https://www.epicurious.com/recipes/food/views/classic-beef-stew-51164550',
  'https://www.epicurious.com/recipes/food/views/chocolate-chip-cookies-109568',

  // Delish (popular media site)
  'https://www.delish.com/cooking/recipe-ideas/a19636089/best-chocolate-chip-cookie-recipe/',
  'https://www.delish.com/cooking/recipe-ideas/recipes/a58658/classic-beef-stew-recipe/',

  // King Arthur Baking (specialized)
  'https://www.kingarthurbaking.com/recipes/chocolate-chip-cookies-recipe',
  'https://www.kingarthurbaking.com/recipes/classic-birthday-cake-recipe'
];

interface TestResult {
  url: string;
  success: boolean;
  confidence: number;
  method: string;
  title?: string;
  hasIngredients: boolean;
  hasInstructions: boolean;
  hasImage: boolean;
  ingredientCount: number;
  instructionCount: number;
  processingTime: number;
  issues?: string[];
  error?: string;
}

interface TestSummary {
  totalTests: number;
  successfulExtractions: number;
  highConfidenceResults: number; // confidence >= 0.8
  mediumConfidenceResults: number; // 0.6 <= confidence < 0.8
  lowConfidenceResults: number; // confidence < 0.6
  averageConfidence: number;
  averageProcessingTime: number;
  methodBreakdown: { [method: string]: number };
  commonIssues: { [issue: string]: number };
  failedUrls: string[];
}

export class ScraperTestHarness {
  private scraperManager: ScraperManager;

  constructor() {
    this.scraperManager = new ScraperManager();
  }

  // Run tests on all URLs
  async runAllTests(): Promise<TestSummary> {
    console.log(`Starting scraper test harness with ${TEST_URLS.length} URLs...`);

    const results: TestResult[] = [];

    for (let i = 0; i < TEST_URLS.length; i++) {
      const url = TEST_URLS[i];
      console.log(`\n[${i + 1}/${TEST_URLS.length}] Testing: ${url}`);

      try {
        const result = await this.testSingleUrl(url);
        results.push(result);

        console.log(`✅ Success: ${result.success}, Confidence: ${result.confidence.toFixed(2)}, Method: ${result.method}`);
        if (result.title) console.log(`   Title: "${result.title.substring(0, 50)}..."`);
        if (result.issues && result.issues.length > 0) {
          console.log(`   Issues: ${result.issues.join(', ')}`);
        }
      } catch (error) {
        const failedResult: TestResult = {
          url,
          success: false,
          confidence: 0,
          method: 'failed',
          hasIngredients: false,
          hasInstructions: false,
          hasImage: false,
          ingredientCount: 0,
          instructionCount: 0,
          processingTime: 0,
          error: error instanceof Error ? error.message : String(error)
        };
        results.push(failedResult);
        console.log(`❌ Failed: ${failedResult.error}`);
      }

      // Add delay between requests to be respectful to servers
      await this.delay(2000);
    }

    return this.generateSummary(results);
  }

  // Test a single URL
  async testSingleUrl(url: string): Promise<TestResult> {
    const startTime = Date.now();

    try {
      // Fetch the webpage
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9'
        }
      });

      const $ = cheerio.load(response.data);

      // Use our scraper manager
      const scraperResult = await this.scraperManager.scrapeRecipe(url, $, response.data);
      const processingTime = Date.now() - startTime;

      return {
        url,
        success: scraperResult.confidence > 0 && !!scraperResult.recipe,
        confidence: scraperResult.confidence,
        method: scraperResult.method,
        title: scraperResult.recipe?.title,
        hasIngredients: !!(scraperResult.recipe?.ingredients && scraperResult.recipe.ingredients.length > 0),
        hasInstructions: !!(scraperResult.recipe?.instructions && scraperResult.recipe.instructions.length > 0),
        hasImage: !!scraperResult.recipe?.image,
        ingredientCount: scraperResult.recipe?.ingredients?.length || 0,
        instructionCount: scraperResult.recipe?.instructions?.length || 0,
        processingTime,
        issues: scraperResult.issues
      };

    } catch (error) {
      const processingTime = Date.now() - startTime;
      throw new Error(`Failed to scrape ${url}: ${error instanceof Error ? error.message : String(error)} (${processingTime}ms)`);
    }
  }

  // Generate comprehensive test summary
  private generateSummary(results: TestResult[]): TestSummary {
    const totalTests = results.length;
    const successfulExtractions = results.filter(r => r.success).length;

    let totalConfidence = 0;
    let totalProcessingTime = 0;
    let highConfidence = 0;
    let mediumConfidence = 0;
    let lowConfidence = 0;

    const methodBreakdown: { [method: string]: number } = {};
    const commonIssues: { [issue: string]: number } = {};
    const failedUrls: string[] = [];

    for (const result of results) {
      totalConfidence += result.confidence;
      totalProcessingTime += result.processingTime;

      if (result.confidence >= 0.8) highConfidence++;
      else if (result.confidence >= 0.6) mediumConfidence++;
      else lowConfidence++;

      // Track method usage
      methodBreakdown[result.method] = (methodBreakdown[result.method] || 0) + 1;

      // Track common issues
      if (result.issues) {
        for (const issue of result.issues) {
          commonIssues[issue] = (commonIssues[issue] || 0) + 1;
        }
      }

      // Track failed URLs
      if (!result.success) {
        failedUrls.push(result.url);
      }
    }

    const summary: TestSummary = {
      totalTests,
      successfulExtractions,
      highConfidenceResults: highConfidence,
      mediumConfidenceResults: mediumConfidence,
      lowConfidenceResults: lowConfidence,
      averageConfidence: totalConfidence / totalTests,
      averageProcessingTime: totalProcessingTime / totalTests,
      methodBreakdown,
      commonIssues,
      failedUrls
    };

    this.printSummary(summary);
    return summary;
  }

  // Print detailed test summary
  private printSummary(summary: TestSummary) {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SCRAPER TEST HARNESS SUMMARY');
    console.log('='.repeat(60));

    const successRate = (summary.successfulExtractions / summary.totalTests * 100).toFixed(1);
    console.log(`\n🎯 Overall Results:`);
    console.log(`   Total Tests: ${summary.totalTests}`);
    console.log(`   Successful Extractions: ${summary.successfulExtractions}/${summary.totalTests} (${successRate}%)`);
    console.log(`   Average Confidence: ${summary.averageConfidence.toFixed(3)}`);
    console.log(`   Average Processing Time: ${summary.averageProcessingTime.toFixed(0)}ms`);

    console.log(`\n📈 Confidence Distribution:`);
    console.log(`   High (≥0.8): ${summary.highConfidenceResults} (${(summary.highConfidenceResults / summary.totalTests * 100).toFixed(1)}%)`);
    console.log(`   Medium (0.6-0.8): ${summary.mediumConfidenceResults} (${(summary.mediumConfidenceResults / summary.totalTests * 100).toFixed(1)}%)`);
    console.log(`   Low (<0.6): ${summary.lowConfidenceResults} (${(summary.lowConfidenceResults / summary.totalTests * 100).toFixed(1)}%)`);

    console.log(`\n🔧 Method Breakdown:`);
    for (const [method, count] of Object.entries(summary.methodBreakdown)) {
      const percentage = (count / summary.totalTests * 100).toFixed(1);
      console.log(`   ${method}: ${count} (${percentage}%)`);
    }

    if (Object.keys(summary.commonIssues).length > 0) {
      console.log(`\n⚠️ Common Issues:`);
      const sortedIssues = Object.entries(summary.commonIssues)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10); // Top 10 issues

      for (const [issue, count] of sortedIssues) {
        console.log(`   ${issue}: ${count} times`);
      }
    }

    if (summary.failedUrls.length > 0) {
      console.log(`\n❌ Failed URLs (${summary.failedUrls.length}):`);
      for (const url of summary.failedUrls.slice(0, 5)) { // Show first 5
        console.log(`   ${url}`);
      }
      if (summary.failedUrls.length > 5) {
        console.log(`   ... and ${summary.failedUrls.length - 5} more`);
      }
    }

    console.log('\n' + '='.repeat(60));
  }

  // Helper method to add delay between requests
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Run tests for specific sites only
  async runSiteSpecificTests(pattern: string): Promise<TestSummary> {
    const filteredUrls = TEST_URLS.filter(url => url.includes(pattern));

    if (filteredUrls.length === 0) {
      throw new Error(`No URLs found matching pattern: ${pattern}`);
    }

    console.log(`Running tests for ${filteredUrls.length} URLs matching "${pattern}"...`);

    const originalUrls = [...TEST_URLS];
    TEST_URLS.splice(0, TEST_URLS.length, ...filteredUrls);

    try {
      const summary = await this.runAllTests();
      return summary;
    } finally {
      // Restore original URLs
      TEST_URLS.splice(0, TEST_URLS.length, ...originalUrls);
    }
  }
}

// Export test function for Firebase Functions
export const runScraperTests = async (): Promise<TestSummary> => {
  const testHarness = new ScraperTestHarness();
  return testHarness.runAllTests();
};