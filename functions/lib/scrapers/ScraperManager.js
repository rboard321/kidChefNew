"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ScraperManager = void 0;
const JsonLdScraper_1 = require("./JsonLdScraper");
const FoodNetworkScraper_1 = require("./FoodNetworkScraper");
const AllRecipesScraper_1 = require("./AllRecipesScraper");
const SeriousEatsScraper_1 = require("./SeriousEatsScraper");
const BBCGoodFoodScraper_1 = require("./BBCGoodFoodScraper");
const NYTCookingScraper_1 = require("./NYTCookingScraper");
const Food52Scraper_1 = require("./Food52Scraper");
const SimplyRecipesScraper_1 = require("./SimplyRecipesScraper");
const BonAppetitScraper_1 = require("./BonAppetitScraper");
const EpicuriousScraper_1 = require("./EpicuriousScraper");
const DelishScraper_1 = require("./DelishScraper");
class ScraperManager {
    constructor() {
        // Scrapers are instantiated when needed to avoid issues with URL parameter
    }
    async scrapeRecipe(url, $, html) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        const hostname = new URL(url).hostname.toLowerCase();
        // Try scrapers in order of specificity (most specific first)
        const scraperClasses = [
            NYTCookingScraper_1.NYTCookingScraper,
            BBCGoodFoodScraper_1.BBCGoodFoodScraper,
            Food52Scraper_1.Food52Scraper,
            SimplyRecipesScraper_1.SimplyRecipesScraper,
            BonAppetitScraper_1.BonAppetitScraper,
            EpicuriousScraper_1.EpicuriousScraper,
            DelishScraper_1.DelishScraper,
            FoodNetworkScraper_1.FoodNetworkScraper,
            AllRecipesScraper_1.AllRecipesScraper,
            SeriousEatsScraper_1.SeriousEatsScraper,
            JsonLdScraper_1.JsonLdScraper // Always try JSON-LD as fallback
        ];
        let bestResult = {
            confidence: 0,
            method: 'json-ld',
            issues: ['No extraction attempted']
        };
        const allResults = [];
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
                        title: ((_b = (_a = result.recipe) === null || _a === void 0 ? void 0 : _a.title) === null || _b === void 0 ? void 0 : _b.substring(0, 50)) + '...',
                        method: result.method,
                        issues: result.issues
                    });
                    // Update best result if this is better
                    if (result.confidence > bestResult.confidence) {
                        bestResult = result;
                    }
                    // If we got a really good result, still continue to try other scrapers
                    // for potential data merging, but mark as early termination candidate
                    if (result.confidence >= 0.9 && ((_c = result.recipe) === null || _c === void 0 ? void 0 : _c.title) &&
                        ((_d = result.recipe) === null || _d === void 0 ? void 0 : _d.ingredients) && result.recipe.ingredients.length > 0 &&
                        ((_e = result.recipe) === null || _e === void 0 ? void 0 : _e.instructions) && result.recipe.instructions.length > 0) {
                        console.log(`High confidence result from ${ScraperClass.name}, but continuing for potential data merging`);
                    }
                }
                catch (error) {
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
        }
        catch (error) {
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
            title: ((_f = bestResult.recipe) === null || _f === void 0 ? void 0 : _f.title) || 'No title',
            ingredientCount: ((_h = (_g = bestResult.recipe) === null || _g === void 0 ? void 0 : _g.ingredients) === null || _h === void 0 ? void 0 : _h.length) || 0,
            instructionCount: ((_k = (_j = bestResult.recipe) === null || _j === void 0 ? void 0 : _j.instructions) === null || _k === void 0 ? void 0 : _k.length) || 0,
            totalAttempts: allResults.length,
            attempts: allResults.map(r => ({ method: r.method, confidence: r.confidence }))
        });
        return bestResult;
    }
    async extractFromGenericHtml($, url) {
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
            const recipe = {
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
        }
        catch (error) {
            return {
                confidence: 0,
                method: 'css-selectors',
                issues: [`Generic HTML extraction error: ${error instanceof Error ? error.message : 'Unknown error'}`]
            };
        }
    }
    extractBestText($, selectors) {
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
    extractTextArray($, selectors) {
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
    extractBestAttribute($, selectors, attributes) {
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
    cleanInstruction(instruction) {
        return instruction
            .replace(/^\d+\.\s*/, '') // Remove step numbers
            .replace(/^Step\s+\d+:?\s*/i, '') // Remove "Step X:"
            .trim();
    }
    validateRecipe(recipe) {
        const issues = [];
        if (!recipe.title)
            issues.push('Missing title');
        if (!recipe.ingredients || recipe.ingredients.length === 0)
            issues.push('Missing ingredients');
        if (!recipe.instructions || recipe.instructions.length === 0)
            issues.push('Missing instructions');
        return issues;
    }
    calculateConfidence(recipe, method) {
        let confidence = 0;
        // Base confidence by method
        switch (method) {
            case 'json-ld':
                confidence = 0.9;
                break;
            case 'microdata':
                confidence = 0.8;
                break;
            case 'site-specific':
                confidence = 0.85;
                break;
            case 'css-selectors':
                confidence = 0.6;
                break;
            default: confidence = 0.5;
        }
        // Adjust based on completeness
        if (recipe.title)
            confidence += 0.05;
        if (recipe.ingredients && recipe.ingredients.length > 0)
            confidence += 0.05;
        if (recipe.instructions && recipe.instructions.length > 0)
            confidence += 0.05;
        if (recipe.image)
            confidence += 0.02;
        if (recipe.description)
            confidence += 0.02;
        return Math.min(confidence, 1.0);
    }
    // Merge results from multiple scrapers to create the best possible recipe
    mergeScraperResults(results, url) {
        if (results.length === 0)
            return null;
        // Find the best recipe data by prioritizing completeness
        let bestTitle = '';
        let bestDescription = '';
        let bestImage = '';
        let bestIngredients = [];
        let bestInstructions = [];
        let bestServings;
        let bestPrepTime = '';
        let bestCookTime = '';
        const allIssues = [];
        let maxConfidence = 0;
        let bestMethod = 'merged';
        for (const result of results) {
            if (!result.recipe)
                continue;
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
                if (recipe.servings)
                    bestServings = recipe.servings;
                if (recipe.prepTime)
                    bestPrepTime = recipe.prepTime;
                if (recipe.cookTime)
                    bestCookTime = recipe.cookTime;
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
        const mergedRecipe = {
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
            method: bestMethod,
            issues: issues.length > 0 ? issues : undefined
        };
    }
    // Calculate confidence for merged results
    calculateMergedConfidence(recipe, originalResults) {
        let baseConfidence = 0.7; // Start with good base for merged data
        // Bonus for completeness
        if (recipe.title)
            baseConfidence += 0.1;
        if (recipe.ingredients && recipe.ingredients.length > 0)
            baseConfidence += 0.1;
        if (recipe.instructions && recipe.instructions.length > 0)
            baseConfidence += 0.1;
        if (recipe.image)
            baseConfidence += 0.05;
        if (recipe.description)
            baseConfidence += 0.03;
        if (recipe.servings)
            baseConfidence += 0.02;
        // Bonus for multiple sources agreeing
        const sourcesWithTitle = originalResults.filter(r => { var _a; return (_a = r.recipe) === null || _a === void 0 ? void 0 : _a.title; }).length;
        const sourcesWithIngredients = originalResults.filter(r => { var _a; return ((_a = r.recipe) === null || _a === void 0 ? void 0 : _a.ingredients) && r.recipe.ingredients.length > 0; }).length;
        if (sourcesWithTitle > 1)
            baseConfidence += 0.02;
        if (sourcesWithIngredients > 1)
            baseConfidence += 0.03;
        return Math.min(baseConfidence, 1.0);
    }
    // Enhance partial data with additional extraction attempts
    async enhancePartialData(result, $, url) {
        if (!result.recipe)
            return result;
        const enhanced = Object.assign({}, result.recipe);
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
    extractTextArrayAggressive($, selectors) {
        const texts = [];
        for (const selector of selectors) {
            const elements = $(selector);
            elements.each((_, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 10 && text.length < 200) { // Reasonable length for ingredients/instructions
                    texts.push(text);
                }
            });
            // If we found some results with this selector, don't try more aggressive ones
            if (texts.length >= 3)
                break;
        }
        return texts.slice(0, 20); // Limit to prevent spam
    }
}
exports.ScraperManager = ScraperManager;
//# sourceMappingURL=ScraperManager.js.map