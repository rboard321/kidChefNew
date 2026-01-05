"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.testScraperHarness = exports.trackAnalyticsEvent = exports.trackFeatureUsage = exports.trackPerformanceMetrics = exports.trackUserSession = exports.reportError = exports.deleteKidRecipe = exports.triggerQualityAutoRegeneration = exports.getQualityAnalytics = exports.reportUnclearStep = exports.rateKidRecipe = exports.getKidProfileById = exports.createKidProfile = exports.importRecipeSecure = exports.saveImportedRecipeHttp = exports.importRecipeHttp = exports.convertRecipeForKid = exports.scrapeRecipeV2 = void 0;
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios_1 = require("axios");
const cheerio = require("cheerio");
const crypto = require("crypto");
const openai_1 = require("openai");
const ScraperManager_1 = require("./scrapers/ScraperManager");
const enhancedAIService_1 = require("./services/enhancedAIService");
const enhancedRequestService_1 = require("./services/enhancedRequestService");
admin.initializeApp();
// Initialize OpenAI - API key stored securely in environment variables
const openaiApiKey = ((_a = functions.config().openai) === null || _a === void 0 ? void 0 : _a.api_key) || process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new openai_1.default({ apiKey: openaiApiKey }) : null;
if (!openai) {
    console.warn('⚠️ OpenAI API key not configured');
    console.warn('Basic recipe scraping will work, but AI enhancement is disabled');
}
exports.scrapeRecipeV2 = functions.https.onCall(async (data, context) => {
    try {
        const { url } = data;
        if (!url) {
            throw new functions.https.HttpsError('invalid-argument', 'URL is required');
        }
        if (!isValidUrl(url)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid URL format');
        }
        const recipe = await extractRecipeFromUrl(url);
        return { recipe };
    }
    catch (error) {
        console.error('Error scraping recipe:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Failed to scrape recipe');
    }
});
function isValidUrl(urlString) {
    try {
        const url = new URL(urlString);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch (_a) {
        return false;
    }
}
function normalizeUrlForCache(urlString) {
    try {
        const url = new URL(urlString);
        url.hash = '';
        url.search = '';
        return url.toString().replace(/\/+$/, '');
    }
    catch (_a) {
        return urlString.trim().toLowerCase().replace(/\/+$/, '');
    }
}
function hashString(input) {
    let hash = 5381;
    for (let i = 0; i < input.length; i += 1) {
        hash = ((hash << 5) + hash) + input.charCodeAt(i);
        hash >>>= 0;
    }
    return hash.toString(36);
}
/**
 * Decodes HTML entities in text content to clean up scraped recipe data
 * Handles common entities like &quot;, &#39;, &amp;, etc.
 */
function decodeHtmlEntities(text) {
    if (!text)
        return text;
    return text
        // Common named entities
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        // Numeric entities (decimal)
        .replace(/&#(\d+);/g, (match, num) => {
        const code = parseInt(num, 10);
        return (code > 0 && code < 1114112) ? String.fromCharCode(code) : match;
    })
        // Numeric entities (hexadecimal)
        .replace(/&#x([0-9a-f]+);/g, (match, hex) => {
        const code = parseInt(hex, 16);
        return (code > 0 && code < 1114112) ? String.fromCharCode(code) : match;
    });
}
function validateAndCleanRecipe(recipe, url) {
    var _a, _b, _c, _d, _e, _f;
    // More permissive validation - allow partial recipes
    if (!recipe.title || recipe.title.trim().length === 0) {
        throw new Error('Recipe must have a title');
    }
    // Allow recipes with either ingredients OR instructions (graceful degradation)
    const hasIngredients = recipe.ingredients && recipe.ingredients.length > 0;
    const hasInstructions = recipe.instructions && recipe.instructions.length > 0;
    if (!hasIngredients && !hasInstructions) {
        throw new Error('Recipe must have either ingredients or instructions');
    }
    // Log what we're missing for debugging
    if (!hasIngredients) {
        console.warn('Validation: Recipe missing ingredients, but has instructions:', recipe.title);
    }
    if (!hasInstructions) {
        console.warn('Validation: Recipe missing instructions, but has ingredients:', recipe.title);
    }
    // Clean ingredients (only if they exist)
    const cleanedIngredients = recipe.ingredients
        ? recipe.ingredients
            .map(ingredient => ingredient.trim())
            .filter(ingredient => ingredient.length > 0)
            .map(ingredient => {
            // Remove any HTML tags that might have slipped through
            let cleaned = ingredient.replace(/<[^>]*>/g, '');
            // Decode HTML entities
            cleaned = decodeHtmlEntities(cleaned);
            return cleaned;
        })
        : [];
    // Clean instructions (only if they exist)
    const cleanedInstructions = recipe.instructions
        ? recipe.instructions
            .map(instruction => instruction.trim())
            .filter(instruction => instruction.length > 0)
            .map(instruction => {
            // Remove any HTML tags that might have slipped through
            let cleaned = instruction.replace(/<[^>]*>/g, '');
            // Decode HTML entities
            cleaned = decodeHtmlEntities(cleaned);
            // Ensure instruction ends with period if it doesn't end with punctuation
            if (cleaned && !/[.!?]$/.test(cleaned)) {
                cleaned += '.';
            }
            return cleaned;
        })
        : [];
    // No longer throw error for missing instructions - allow partial recipes
    // Validate title length (reasonable bounds)
    let cleanedTitle = recipe.title.trim();
    // Decode HTML entities in title
    cleanedTitle = decodeHtmlEntities(cleanedTitle);
    if (cleanedTitle.length > 200) {
        throw new Error('Recipe title is too long - this might not be a recipe page');
    }
    // Clean servings - ensure it's a reasonable number
    let cleanedServings = recipe.servings;
    if (cleanedServings && (cleanedServings < 1 || cleanedServings > 50)) {
        cleanedServings = 4; // Default to 4 servings if unreasonable
    }
    return {
        title: cleanedTitle,
        description: decodeHtmlEntities(((_a = recipe.description) === null || _a === void 0 ? void 0 : _a.trim()) || ''),
        image: ((_b = recipe.image) === null || _b === void 0 ? void 0 : _b.trim()) || '',
        prepTime: ((_c = recipe.prepTime) === null || _c === void 0 ? void 0 : _c.trim()) || '',
        cookTime: ((_d = recipe.cookTime) === null || _d === void 0 ? void 0 : _d.trim()) || '',
        totalTime: ((_e = recipe.totalTime) === null || _e === void 0 ? void 0 : _e.trim()) || '',
        servings: cleanedServings || 4,
        difficulty: ((_f = recipe.difficulty) === null || _f === void 0 ? void 0 : _f.trim()) || 'Medium',
        ingredients: cleanedIngredients,
        instructions: cleanedInstructions,
        sourceUrl: url,
        tags: recipe.tags || []
    };
}
// @ts-ignore - Legacy function, replaced by EnhancedAIService
async function extractRecipeWithAI(url, html, hints) {
    var _a, _b, _c;
    const apiKey = ((_a = functions.config().openai) === null || _a === void 0 ? void 0 : _a.api_key) || process.env.OPENAI_API_KEY;
    if (!apiKey || !openai) {
        console.warn('⚠️ OpenAI not available - returning basic extraction');
        // Return basic extraction result without AI
        const $ = cheerio.load(html);
        const title = $('h1').first().text().trim() || hints.title || 'Recipe';
        const ingredients = $('.ingredient, .recipe-ingredient, .ingredients li').map((_, el) => $(el).text().trim()).get().filter(Boolean);
        const instructions = $('.instruction, .directions li, .instructions li').map((_, el) => $(el).text().trim()).get().filter(Boolean);
        return {
            title,
            ingredients: ingredients.length > 0 ? ingredients : [],
            instructions: instructions.length > 0 ? instructions : [],
            sourceUrl: url
        };
    }
    const $ = cheerio.load(html);
    const articleText = $('article').text() || $('main').text() || $('.recipe').text() || $('.entry-content').text() || $('body').text();
    const cleanedText = articleText.replace(/\s+/g, ' ').trim().slice(0, 15000);
    const prompt = `You are extracting recipe data from a web page.
Return JSON only with this shape:
{
  "title": "string",
  "description": "string",
  "image": "string",
  "prepTime": "string",
  "cookTime": "string",
  "totalTime": "string",
  "servings": number_or_null,
  "difficulty": "string",
  "ingredients": ["string"],
  "instructions": ["string"],
  "tags": ["string"]
}

Use only the provided text. If a field is missing, use empty string or empty array. Ingredients and instructions must be arrays of strings.

Title hint: ${hints.title || 'unknown'}
URL: ${url}
PAGE TEXT:
${cleanedText}`;
    const response = await Promise.race([
        openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: 'You extract recipe data and respond with JSON only.' },
                { role: 'user', content: prompt }
            ],
            temperature: 0.2,
            max_tokens: 4000,
        }),
        // Timeout after 90 seconds
        new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout after 90 seconds')), 90000))
    ]);
    const content = ((_c = (_b = response.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) || '';
    const jsonText = content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
    const parsed = safeJsonParse(jsonText, 'OpenAI recipe extraction');
    const aiRecipe = {
        title: parsed.title,
        description: parsed.description,
        image: parsed.image,
        prepTime: parsed.prepTime,
        cookTime: parsed.cookTime,
        totalTime: parsed.totalTime,
        servings: parsed.servings,
        difficulty: parsed.difficulty,
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
        instructions: Array.isArray(parsed.instructions) ? parsed.instructions : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags : []
    };
    const validated = validateAndCleanRecipe(aiRecipe, url);
    if (!validated) {
        throw new Error('AI fallback did not return a valid recipe');
    }
    console.log('Scrape debug: AI fallback success', {
        title: validated.title,
        ingredientCount: validated.ingredients.length,
        instructionCount: validated.instructions.length
    });
    return validated;
}
async function extractRecipeWithDetails(url) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j;
    try {
        const cached = await getRecipeFromCache(url);
        if (cached) {
            console.log('Scrape debug: cache hit', { url });
            return { recipe: cached, confidence: 1.0, method: 'cache' };
        }
        // Use enhanced request service to bypass bot detection
        const requestResult = await enhancedRequestService_1.enhancedRequestService.fetchWithRetry(url, {
            timeout: 15000,
            retries: 3,
            delay: 2000,
            userAgent: 'random'
        });
        console.log('Scrape debug: Request completed', {
            status: requestResult.status,
            attempts: requestResult.attempts,
            userAgent: requestResult.finalUserAgent.substring(0, 50) + '...',
            dataLength: ((_a = requestResult.data) === null || _a === void 0 ? void 0 : _a.length) || 0
        });
        const $ = cheerio.load(requestResult.data);
        console.log('Scrape debug: Starting modular scraper extraction', {
            url,
            htmlLength: ((_b = requestResult.data) === null || _b === void 0 ? void 0 : _b.length) || 0
        });
        // Use the new modular scraper system
        const scraperManager = new ScraperManager_1.ScraperManager();
        const result = await scraperManager.scrapeRecipe(url, $, requestResult.data);
        console.log('Scrape debug: Scraper result', {
            confidence: result.confidence,
            method: result.method,
            hasRecipe: !!result.recipe,
            title: (_c = result.recipe) === null || _c === void 0 ? void 0 : _c.title,
            issues: result.issues
        });
        // If we got a result with some data, try to validate and clean it
        if (result.recipe && result.confidence > 0.2) {
            // Add meta tag image fallback if no image found
            if (!result.recipe.image) {
                result.recipe.image = extractImageFromMetaTags($);
            }
            if (result.recipe) {
                const meta = extractJsonLdRecipeMeta($);
                result.recipe.servings = (_d = result.recipe.servings) !== null && _d !== void 0 ? _d : meta.servings;
                result.recipe.prepTime = (_e = result.recipe.prepTime) !== null && _e !== void 0 ? _e : meta.prepTime;
                result.recipe.cookTime = (_f = result.recipe.cookTime) !== null && _f !== void 0 ? _f : meta.cookTime;
                result.recipe.totalTime = (_g = result.recipe.totalTime) !== null && _g !== void 0 ? _g : meta.totalTime;
            }
            try {
                // Only validate if we have essential fields
                if (result.recipe.title && result.recipe.ingredients && result.recipe.instructions) {
                    const validated = validateAndCleanRecipe(result.recipe, url);
                    if (validated) {
                        console.log('Scrape debug: Validation successful', {
                            title: validated.title,
                            method: result.method,
                            confidence: result.confidence
                        });
                        return {
                            recipe: validated,
                            confidence: result.confidence,
                            method: result.method,
                            issues: result.issues
                        };
                    }
                }
                else {
                    // Return partial data without validation
                    console.log('Scrape debug: Essential fields missing, returning partial', {
                        hasTitle: !!result.recipe.title,
                        hasIngredients: !!((_h = result.recipe.ingredients) === null || _h === void 0 ? void 0 : _h.length),
                        hasInstructions: !!((_j = result.recipe.instructions) === null || _j === void 0 ? void 0 : _j.length),
                        method: result.method,
                        confidence: result.confidence
                    });
                    return {
                        recipe: result.recipe,
                        confidence: result.confidence,
                        method: result.method,
                        issues: result.issues
                    };
                }
            }
            catch (error) {
                console.warn('Scrape debug: Validation failed', {
                    error: error instanceof Error ? error.message : String(error),
                    method: result.method,
                    confidence: result.confidence
                });
                // Return unvalidated partial data for review
                return {
                    recipe: result.recipe,
                    confidence: Math.max(result.confidence - 0.1, 0.1),
                    method: result.method,
                    issues: [...(result.issues || []), `Validation failed: ${error instanceof Error ? error.message : String(error)}`]
                };
            }
        }
        // Return whatever we got, even if confidence is low
        return {
            recipe: result.recipe || undefined,
            confidence: result.confidence,
            method: result.method,
            issues: result.issues
        };
    }
    catch (error) {
        console.error('Error in extractRecipeWithDetails:', {
            message: error.message,
            url: url,
            timestamp: new Date().toISOString()
        });
        return {
            confidence: 0,
            method: 'error',
            issues: [error.message]
        };
    }
}
async function extractRecipeWithDetailsFromHtml(url, html) {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const cached = await getRecipeFromCache(url);
        if (cached) {
            console.log('Scrape debug: cache hit', { url });
            return { recipe: cached, confidence: 1.0, method: 'cache' };
        }
        const $ = cheerio.load(html);
        console.log('Scrape debug: Starting modular scraper extraction (html)', {
            url,
            htmlLength: (html === null || html === void 0 ? void 0 : html.length) || 0
        });
        const scraperManager = new ScraperManager_1.ScraperManager();
        const result = await scraperManager.scrapeRecipe(url, $, html);
        console.log('Scrape debug: Scraper result (html)', {
            confidence: result.confidence,
            method: result.method,
            hasRecipe: !!result.recipe,
            title: (_a = result.recipe) === null || _a === void 0 ? void 0 : _a.title,
            issues: result.issues
        });
        if (result.recipe && result.confidence > 0.2) {
            if (!result.recipe.image) {
                result.recipe.image = extractImageFromMetaTags($);
            }
            if (result.recipe) {
                const meta = extractJsonLdRecipeMeta($);
                result.recipe.servings = (_b = result.recipe.servings) !== null && _b !== void 0 ? _b : meta.servings;
                result.recipe.prepTime = (_c = result.recipe.prepTime) !== null && _c !== void 0 ? _c : meta.prepTime;
                result.recipe.cookTime = (_d = result.recipe.cookTime) !== null && _d !== void 0 ? _d : meta.cookTime;
                result.recipe.totalTime = (_e = result.recipe.totalTime) !== null && _e !== void 0 ? _e : meta.totalTime;
            }
            try {
                if (result.recipe.title && result.recipe.ingredients && result.recipe.instructions) {
                    const validated = validateAndCleanRecipe(result.recipe, url);
                    if (validated) {
                        console.log('Scrape debug: Validation successful (html)', {
                            title: validated.title,
                            method: result.method,
                            confidence: result.confidence
                        });
                        return {
                            recipe: validated,
                            confidence: result.confidence,
                            method: result.method,
                            issues: result.issues
                        };
                    }
                }
                else {
                    console.log('Scrape debug: Essential fields missing, returning partial (html)', {
                        hasTitle: !!result.recipe.title,
                        hasIngredients: !!((_f = result.recipe.ingredients) === null || _f === void 0 ? void 0 : _f.length),
                        hasInstructions: !!((_g = result.recipe.instructions) === null || _g === void 0 ? void 0 : _g.length),
                        method: result.method,
                        confidence: result.confidence
                    });
                    return {
                        recipe: result.recipe,
                        confidence: result.confidence,
                        method: result.method,
                        issues: result.issues
                    };
                }
            }
            catch (error) {
                console.warn('Scrape debug: Validation failed (html)', {
                    error: error instanceof Error ? error.message : String(error),
                    method: result.method,
                    confidence: result.confidence
                });
                return {
                    recipe: result.recipe,
                    confidence: Math.max(result.confidence - 0.1, 0.1),
                    method: result.method,
                    issues: [...(result.issues || []), `Validation failed: ${error instanceof Error ? error.message : String(error)}`]
                };
            }
        }
        return {
            recipe: result.recipe || undefined,
            confidence: result.confidence,
            method: result.method,
            issues: result.issues
        };
    }
    catch (error) {
        console.error('Error in extractRecipeWithDetailsFromHtml:', {
            message: error.message,
            url: url,
            timestamp: new Date().toISOString()
        });
        return {
            confidence: 0,
            method: 'error',
            issues: [error.message]
        };
    }
}
async function extractRecipeFromHtml(url, html) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    try {
        const cached = await getRecipeFromCache(url);
        if (cached) {
            console.log('Scrape debug: cache hit', { url });
            return cached;
        }
        const $ = cheerio.load(html);
        console.log('Scrape debug: Starting modular scraper extraction (html)', {
            url,
            htmlLength: (html === null || html === void 0 ? void 0 : html.length) || 0
        });
        const scraperManager = new ScraperManager_1.ScraperManager();
        const result = await scraperManager.scrapeRecipe(url, $, html);
        console.log('Scrape debug: Scraper result (html)', {
            confidence: result.confidence,
            method: result.method,
            hasRecipe: !!result.recipe,
            title: (_a = result.recipe) === null || _a === void 0 ? void 0 : _a.title,
            issues: result.issues
        });
        if (result.recipe && result.confidence > 0.3) {
            if (!result.recipe.image) {
                result.recipe.image = extractImageFromMetaTags($);
            }
            if (result.recipe) {
                const meta = extractJsonLdRecipeMeta($);
                result.recipe.servings = (_b = result.recipe.servings) !== null && _b !== void 0 ? _b : meta.servings;
                result.recipe.prepTime = (_c = result.recipe.prepTime) !== null && _c !== void 0 ? _c : meta.prepTime;
                result.recipe.cookTime = (_d = result.recipe.cookTime) !== null && _d !== void 0 ? _d : meta.cookTime;
                result.recipe.totalTime = (_e = result.recipe.totalTime) !== null && _e !== void 0 ? _e : meta.totalTime;
            }
            try {
                const validated = validateAndCleanRecipe(result.recipe, url);
                if (validated) {
                    console.log('Scrape debug: Modular scraper success (html)', {
                        title: validated.title,
                        method: result.method,
                        confidence: result.confidence,
                        hasImage: !!validated.image,
                        ingredientCount: validated.ingredients.length,
                        instructionCount: validated.instructions.length
                    });
                    await saveRecipeToCache(url, validated);
                    return validated;
                }
            }
            catch (error) {
                console.warn('Scrape debug: Modular scraper validation failed (html)', {
                    error: error instanceof Error ? error.message : String(error),
                    method: result.method,
                    confidence: result.confidence
                });
            }
        }
        console.log('Scrape debug: Falling back to AI extraction (html)', {
            reason: result.confidence < 0.3 ? 'low_confidence' : 'validation_failed',
            confidence: result.confidence,
            candidateTitle: (_f = result.recipe) === null || _f === void 0 ? void 0 : _f.title,
            hasIngredients: !!((_h = (_g = result.recipe) === null || _g === void 0 ? void 0 : _g.ingredients) === null || _h === void 0 ? void 0 : _h.length),
            hasInstructions: !!((_k = (_j = result.recipe) === null || _j === void 0 ? void 0 : _j.instructions) === null || _k === void 0 ? void 0 : _k.length)
        });
        try {
            const enhancedAI = new enhancedAIService_1.EnhancedAIService();
            let fallbackLevel = 'detailed';
            if (result.confidence > 0.2 && ((_l = result.recipe) === null || _l === void 0 ? void 0 : _l.title)) {
                fallbackLevel = 'fast';
            }
            else if (result.confidence < 0.05 || !result.recipe) {
                fallbackLevel = 'aggressive';
            }
            const aiResult = await enhancedAI.extractRecipeWithAI(url, html, {
                hints: {
                    title: (_m = result.recipe) === null || _m === void 0 ? void 0 : _m.title,
                    ingredients: (_o = result.recipe) === null || _o === void 0 ? void 0 : _o.ingredients,
                    partialInstructions: (_p = result.recipe) === null || _p === void 0 ? void 0 : _p.instructions
                },
                fallbackLevel,
                includePartialData: true
            });
            console.log('Scrape debug: Enhanced AI fallback (html)', {
                method: aiResult.method,
                confidence: aiResult.confidence,
                processingTime: aiResult.processingTime,
                tokensUsed: aiResult.tokensUsed
            });
            const fallback = Object.assign(Object.assign({}, aiResult.recipe), { sourceUrl: url });
            await saveRecipeToCache(url, fallback);
            return fallback;
        }
        catch (aiError) {
            console.error('Scrape debug: Enhanced AI fallback failed (html)', {
                error: aiError instanceof Error ? aiError.message : String(aiError)
            });
            if (result.recipe && (result.recipe.title || ((_q = result.recipe.ingredients) === null || _q === void 0 ? void 0 : _q.length))) {
                throw new Error(`Partial recipe data found but incomplete. Issues: ${((_r = result.issues) === null || _r === void 0 ? void 0 : _r.join(', ')) || 'Unknown'}`);
            }
            throw new Error('No recipe data found on this page and AI extraction failed');
        }
    }
    catch (error) {
        console.error('Error in extractRecipeFromHtml:', {
            message: error instanceof Error ? error.message : String(error),
            url,
            timestamp: new Date().toISOString()
        });
        if (error instanceof Error) {
            throw error;
        }
        throw new Error('An unexpected error occurred while processing the recipe page');
    }
}
async function extractRecipeFromUrl(url) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z;
    try {
        const cached = await getRecipeFromCache(url);
        if (cached) {
            console.log('Scrape debug: cache hit', { url });
            return cached;
        }
        // Use enhanced request service to bypass bot detection
        const requestResult = await enhancedRequestService_1.enhancedRequestService.fetchWithRetry(url, {
            timeout: 15000,
            retries: 3,
            delay: 2000,
            userAgent: 'random'
        });
        console.log('Scrape debug: Request completed', {
            status: requestResult.status,
            attempts: requestResult.attempts,
            userAgent: requestResult.finalUserAgent.substring(0, 50) + '...',
            dataLength: ((_a = requestResult.data) === null || _a === void 0 ? void 0 : _a.length) || 0
        });
        const $ = cheerio.load(requestResult.data);
        console.log('Scrape debug: Starting modular scraper extraction', {
            url,
            htmlLength: ((_b = requestResult.data) === null || _b === void 0 ? void 0 : _b.length) || 0
        });
        // Use the new modular scraper system
        const scraperManager = new ScraperManager_1.ScraperManager();
        const result = await scraperManager.scrapeRecipe(url, $, requestResult.data);
        console.log('Scrape debug: Scraper result', {
            confidence: result.confidence,
            method: result.method,
            hasRecipe: !!result.recipe,
            title: (_c = result.recipe) === null || _c === void 0 ? void 0 : _c.title,
            issues: result.issues
        });
        // If we got a good result, validate and cache it
        if (result.recipe && result.confidence > 0.3) {
            // Add meta tag image fallback if no image found
            if (!result.recipe.image) {
                result.recipe.image = extractImageFromMetaTags($);
            }
            if (result.recipe) {
                const meta = extractJsonLdRecipeMeta($);
                result.recipe.servings = (_d = result.recipe.servings) !== null && _d !== void 0 ? _d : meta.servings;
                result.recipe.prepTime = (_e = result.recipe.prepTime) !== null && _e !== void 0 ? _e : meta.prepTime;
                result.recipe.cookTime = (_f = result.recipe.cookTime) !== null && _f !== void 0 ? _f : meta.cookTime;
                result.recipe.totalTime = (_g = result.recipe.totalTime) !== null && _g !== void 0 ? _g : meta.totalTime;
            }
            try {
                const validated = validateAndCleanRecipe(result.recipe, url);
                if (validated) {
                    console.log('Scrape debug: Modular scraper success', {
                        title: validated.title,
                        method: result.method,
                        confidence: result.confidence,
                        hasImage: !!validated.image,
                        ingredientCount: validated.ingredients.length,
                        instructionCount: validated.instructions.length
                    });
                    await saveRecipeToCache(url, validated);
                    return validated;
                }
            }
            catch (error) {
                console.warn('Scrape debug: Modular scraper validation failed', {
                    error: error instanceof Error ? error.message : String(error),
                    method: result.method,
                    confidence: result.confidence
                });
            }
        }
        // If modular scraper failed or low confidence, try AI fallback
        console.log('Scrape debug: Falling back to AI extraction', {
            reason: result.confidence < 0.3 ? 'low_confidence' : 'validation_failed',
            confidence: result.confidence,
            candidateTitle: (_h = result.recipe) === null || _h === void 0 ? void 0 : _h.title,
            hasIngredients: !!((_k = (_j = result.recipe) === null || _j === void 0 ? void 0 : _j.ingredients) === null || _k === void 0 ? void 0 : _k.length),
            hasInstructions: !!((_m = (_l = result.recipe) === null || _l === void 0 ? void 0 : _l.instructions) === null || _m === void 0 ? void 0 : _m.length)
        });
        try {
            const enhancedAI = new enhancedAIService_1.EnhancedAIService();
            // Choose AI fallback strategy based on confidence level and available data
            let fallbackLevel = 'detailed';
            if (result.confidence > 0.2 && ((_o = result.recipe) === null || _o === void 0 ? void 0 : _o.title)) {
                fallbackLevel = 'fast'; // Quick enhancement for partial data
            }
            else if (result.confidence < 0.05 || !result.recipe) {
                fallbackLevel = 'aggressive'; // Deep extraction for very poor results
            }
            const aiResult = await enhancedAI.extractRecipeWithAI(url, requestResult.data, {
                hints: {
                    title: (_p = result.recipe) === null || _p === void 0 ? void 0 : _p.title,
                    ingredients: (_q = result.recipe) === null || _q === void 0 ? void 0 : _q.ingredients,
                    partialInstructions: (_r = result.recipe) === null || _r === void 0 ? void 0 : _r.instructions
                },
                fallbackLevel,
                includePartialData: true
            });
            console.log('Scrape debug: Enhanced AI fallback', {
                method: aiResult.method,
                confidence: aiResult.confidence,
                processingTime: aiResult.processingTime,
                tokensUsed: aiResult.tokensUsed
            });
            const fallback = Object.assign(Object.assign({}, aiResult.recipe), { sourceUrl: url });
            await saveRecipeToCache(url, fallback);
            return fallback;
        }
        catch (aiError) {
            console.error('Scrape debug: Enhanced AI fallback failed', {
                error: aiError instanceof Error ? aiError.message : String(aiError)
            });
            // If we have any recipe data at all with issues, include them in the error
            if (result.recipe && (result.recipe.title || ((_s = result.recipe.ingredients) === null || _s === void 0 ? void 0 : _s.length))) {
                throw new Error(`Partial recipe data found but incomplete. Issues: ${((_t = result.issues) === null || _t === void 0 ? void 0 : _t.join(', ')) || 'Unknown'}`);
            }
            throw new Error('No recipe data found on this page and AI extraction failed');
        }
    }
    catch (error) {
        console.error('Error in extractRecipeFromUrl:', {
            message: error instanceof Error ? error.message : String(error),
            url,
            timestamp: new Date().toISOString()
        });
        if (axios_1.default.isAxiosError(error)) {
            if (error.code === 'ENOTFOUND') {
                throw new Error('Website not found');
            }
            if (((_u = error.response) === null || _u === void 0 ? void 0 : _u.status) === 404) {
                throw new Error('Recipe page not found');
            }
            if (((_v = error.response) === null || _v === void 0 ? void 0 : _v.status) === 403) {
                throw new Error('This website blocks automated recipe imports. Please try copying the recipe manually or use a different website.');
            }
            if (((_w = error.response) === null || _w === void 0 ? void 0 : _w.status) === 429) {
                throw new Error('This website is rate limiting requests. Please try again later.');
            }
            if (((_x = error.response) === null || _x === void 0 ? void 0 : _x.status) === 500 || ((_y = error.response) === null || _y === void 0 ? void 0 : _y.status) === 502 || ((_z = error.response) === null || _z === void 0 ? void 0 : _z.status) === 503) {
                throw new Error('The website is temporarily unavailable. Please try again later.');
            }
            if (error.code === 'ECONNABORTED') {
                throw new Error('Request timed out');
            }
            if (error.code === 'ECONNRESET' || error.code === 'ECONNREFUSED') {
                throw new Error('Connection failed - the website may be down');
            }
        }
        // Handle parsing errors that might occur with malformed HTML/JSON
        if (error instanceof SyntaxError) {
            throw new Error('The website returned malformed content that could not be parsed');
        }
        // Handle cheerio/DOM parsing errors
        if (error instanceof Error && error.message.includes('cheerio')) {
            throw new Error('Failed to parse the website content');
        }
        // Re-throw the original error but ensure it's an Error object
        if (error instanceof Error) {
            throw error;
        }
        else {
            throw new Error('An unexpected error occurred while processing the recipe page');
        }
    }
}
function normalizeRecipeDraft(recipe, sourceUrl) {
    const title = typeof (recipe === null || recipe === void 0 ? void 0 : recipe.title) === 'string' ? recipe.title.trim() : '';
    const ingredients = Array.isArray(recipe === null || recipe === void 0 ? void 0 : recipe.ingredients) ? recipe.ingredients.filter(Boolean) : [];
    const instructions = Array.isArray(recipe === null || recipe === void 0 ? void 0 : recipe.instructions)
        ? recipe.instructions.filter(Boolean)
        : Array.isArray(recipe === null || recipe === void 0 ? void 0 : recipe.steps)
            ? recipe.steps.map((step) => (step === null || step === void 0 ? void 0 : step.step) || step).filter(Boolean)
            : [];
    const draft = {
        title,
        description: typeof (recipe === null || recipe === void 0 ? void 0 : recipe.description) === 'string' ? recipe.description : '',
        image: typeof (recipe === null || recipe === void 0 ? void 0 : recipe.image) === 'string' ? recipe.image : '',
        prepTime: recipe === null || recipe === void 0 ? void 0 : recipe.prepTime,
        cookTime: recipe === null || recipe === void 0 ? void 0 : recipe.cookTime,
        totalTime: recipe === null || recipe === void 0 ? void 0 : recipe.totalTime,
        servings: recipe === null || recipe === void 0 ? void 0 : recipe.servings,
        difficulty: recipe === null || recipe === void 0 ? void 0 : recipe.difficulty,
        ingredients,
        instructions,
        sourceUrl,
        tags: Array.isArray(recipe === null || recipe === void 0 ? void 0 : recipe.tags) ? recipe.tags : []
    };
    const issues = [];
    const hasTitle = title.length > 0;
    const hasSteps = instructions.length > 0;
    const hasIngredients = ingredients.length > 0;
    if (!hasTitle)
        issues.push('missing_title');
    if (!hasSteps)
        issues.push('missing_steps');
    if (!hasIngredients)
        issues.push('missing_ingredients');
    if (!hasTitle && !hasSteps) {
        return { recipe: draft, status: 'not_recipe', issues };
    }
    const status = hasTitle && hasSteps && hasIngredients ? 'complete' : 'needs_review';
    return { recipe: draft, status, issues };
}
function extractImageFromMetaTags($) {
    // Priority order: og:image, twitter:image, fallback image selectors
    const imageSelectors = [
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[name="twitter:image"]',
        'meta[name="twitter:image:src"]',
        'link[rel="image_src"]',
        // Common recipe site image selectors
        '.recipe-image img',
        '.recipe-hero img',
        '.recipe-photo img',
        '[class*="recipe-image"] img',
        '.post-thumbnail img',
        '.featured-image img'
    ];
    for (const selector of imageSelectors) {
        let imageUrl;
        if (selector.startsWith('meta') || selector.startsWith('link')) {
            // Meta tags and link tags
            const element = $(selector).first();
            imageUrl = element.attr('content') || element.attr('href');
        }
        else {
            // Image tags
            const imgElement = $(selector).first();
            imageUrl = imgElement.attr('src') || imgElement.attr('data-src');
        }
        if (imageUrl) {
            // Clean and validate the image URL
            const cleanedUrl = imageUrl.trim();
            // Skip if it's not a valid image URL
            if (!cleanedUrl || cleanedUrl === '#' || cleanedUrl === '/' || cleanedUrl.length < 10) {
                continue;
            }
            // Skip common placeholder/loading images
            const skipPatterns = [
                'placeholder', 'loading', 'spinner', 'default',
                '1x1', 'pixel', 'spacer', 'blank'
            ];
            if (skipPatterns.some(pattern => cleanedUrl.toLowerCase().includes(pattern))) {
                continue;
            }
            // Reassign cleaned URL
            imageUrl = cleanedUrl;
            // Convert relative URLs to absolute
            if (imageUrl.startsWith('//')) {
                imageUrl = 'https:' + imageUrl;
            }
            else if (imageUrl.startsWith('/')) {
                // Would need the base URL to make this absolute - skip for now
                continue;
            }
            // Check if it's a valid image file extension or has image query params
            const hasImageExtension = /\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i.test(imageUrl);
            const isHttpsUrl = imageUrl.startsWith('https://');
            if (isHttpsUrl && (hasImageExtension || imageUrl.includes('image') || selector.includes('og:') || selector.includes('twitter:'))) {
                return imageUrl;
            }
        }
    }
    return undefined;
}
function extractJsonLdRecipeMeta($) {
    const jsonLdScripts = $('script[type="application/ld+json"]');
    const extractText = (value) => {
        if (typeof value === 'string')
            return value;
        if (value && value.text)
            return value.text;
        if (value && value['@value'])
            return value['@value'];
        return '';
    };
    const extractNumber = (value) => {
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            const str = value.toString().trim();
            const numberMatch = str.match(/(\d+(?:\.\d+)?)/);
            if (numberMatch) {
                const num = parseFloat(numberMatch[1]);
                return !isNaN(num) ? num : undefined;
            }
        }
        return undefined;
    };
    const extractTime = (duration) => {
        if (!duration)
            return '';
        if (typeof duration === 'string') {
            const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (match) {
                const hours = match[1] ? parseInt(match[1]) : 0;
                const minutes = match[2] ? parseInt(match[2]) : 0;
                if (hours && minutes)
                    return `${hours}h ${minutes}min`;
                if (hours)
                    return `${hours}h`;
                if (minutes)
                    return `${minutes}min`;
            }
        }
        return extractText(duration);
    };
    const findRecipe = (data) => {
        if (!data)
            return undefined;
        if (Array.isArray(data)) {
            for (const item of data) {
                const found = findRecipe(item);
                if (found)
                    return found;
            }
            return undefined;
        }
        if (data['@type'] === 'Recipe')
            return data;
        if (Array.isArray(data['@type']) && data['@type'].includes('Recipe'))
            return data;
        if (data['@graph'])
            return findRecipe(data['@graph']);
        return undefined;
    };
    for (let i = 0; i < jsonLdScripts.length; i++) {
        const scriptContent = $(jsonLdScripts[i]).html();
        if (!scriptContent)
            continue;
        try {
            const data = JSON.parse(scriptContent);
            const recipe = findRecipe(data);
            if (recipe) {
                return {
                    servings: extractNumber(recipe.recipeYield || recipe.yield),
                    prepTime: extractTime(recipe.prepTime),
                    cookTime: extractTime(recipe.cookTime),
                    totalTime: extractTime(recipe.totalTime)
                };
            }
        }
        catch (_a) {
            continue;
        }
    }
    return {};
}
function resolveAbsoluteUrl(baseUrl, imageUrl) {
    try {
        if (!imageUrl)
            return undefined;
        if (imageUrl.startsWith('//')) {
            return `https:${imageUrl}`;
        }
        return new URL(imageUrl, baseUrl).toString();
    }
    catch (_a) {
        return undefined;
    }
}
function isLikelyBadImageUrl(imageUrl) {
    const lowered = imageUrl.toLowerCase();
    // Reject SVG and ICO files
    if (lowered.endsWith('.svg') || lowered.endsWith('.ico'))
        return true;
    // Use word-boundary matching for bad tokens to avoid false positives
    // (e.g., don't reject "Pad-Thai" because it contains "ad")
    const badTokens = ['logo', 'icon', 'sprite', 'avatar', 'ad', 'banner', 'placeholder', 'pixel', 'spacer'];
    for (const token of badTokens) {
        // Match token as whole word with word boundaries
        const regex = new RegExp(`\\b${token}\\b`, 'i');
        if (regex.test(lowered)) {
            return true;
        }
    }
    return false;
}
function extractImageFromJsonLd($, baseUrl) {
    var _a, _b;
    const jsonLdScripts = $('script[type="application/ld+json"]');
    const normalizeImageEntry = (value) => {
        if (!value)
            return {};
        if (typeof value === 'string') {
            return { url: resolveAbsoluteUrl(baseUrl, value) };
        }
        if (typeof value === 'object') {
            const rawUrl = value.url || value['@id'] || value.contentUrl;
            const width = typeof value.width === 'number' ? value.width : parseInt(value.width || '', 10);
            const height = typeof value.height === 'number' ? value.height : parseInt(value.height || '', 10);
            return { url: typeof rawUrl === 'string' ? resolveAbsoluteUrl(baseUrl, rawUrl) : undefined, width, height };
        }
        return {};
    };
    const pickBestImage = (value) => {
        if (!value)
            return undefined;
        const entries = Array.isArray(value) ? value.map(normalizeImageEntry) : [normalizeImageEntry(value)];
        const filtered = entries.filter((entry) => {
            if (!entry.url || isLikelyBadImageUrl(entry.url))
                return false;
            if (Number.isFinite(entry.width) && entry.width < 400)
                return false;
            return true;
        });
        if (filtered.length === 0)
            return undefined;
        const scored = filtered
            .map((entry) => (Object.assign(Object.assign({}, entry), { score: Number.isFinite(entry.width) ? entry.width : Number.isFinite(entry.height) ? entry.height : 0 })))
            .sort((a, b) => b.score - a.score);
        return scored[0].url;
    };
    const findRecipeNode = (data) => {
        if (!data)
            return undefined;
        if (Array.isArray(data)) {
            for (const item of data) {
                const found = findRecipeNode(item);
                if (found)
                    return found;
            }
            return undefined;
        }
        if (data['@type'] === 'Recipe')
            return data;
        if (data['@graph'])
            return findRecipeNode(data['@graph']);
        return undefined;
    };
    for (let i = 0; i < jsonLdScripts.length; i++) {
        const scriptContent = $(jsonLdScripts[i]).html();
        if (!scriptContent)
            continue;
        try {
            const data = JSON.parse(scriptContent);
            const recipeNode = findRecipeNode(data);
            if (recipeNode) {
                // Primary location: recipe.image
                let candidate = pickBestImage(recipeNode.image);
                if (candidate)
                    return candidate;
                // Alternative: AggregateRating.image (rated recipes)
                if ((_a = recipeNode.aggregateRating) === null || _a === void 0 ? void 0 : _a.image) {
                    candidate = pickBestImage(recipeNode.aggregateRating.image);
                    if (candidate)
                        return candidate;
                }
            }
            // Alternative: root-level image property (some schemas use this)
            if (data.image) {
                const candidate = pickBestImage(data.image);
                if (candidate)
                    return candidate;
            }
            // Alternative: mainEntity.image (nested recipe schemas)
            if ((_b = data.mainEntity) === null || _b === void 0 ? void 0 : _b.image) {
                const candidate = pickBestImage(data.mainEntity.image);
                if (candidate)
                    return candidate;
            }
        }
        catch (_c) {
            continue;
        }
    }
    return undefined;
}
function extractImageFromOpenGraph($, baseUrl) {
    const content = $('meta[property="og:image"], meta[property="og:image:url"]').first().attr('content');
    return content ? resolveAbsoluteUrl(baseUrl, content) : undefined;
}
function extractImageFromTwitter($, baseUrl) {
    const content = $('meta[name="twitter:image"], meta[name="twitter:image:src"]').first().attr('content');
    return content ? resolveAbsoluteUrl(baseUrl, content) : undefined;
}
function extractImageCandidatesFromImgTags($, baseUrl) {
    const candidates = [];
    $('img').each((_, el) => {
        const $el = $(el);
        // Check all common lazy-loading patterns
        const lazyAttributes = [
            'src',
            'data-src',
            'data-lazy-src',
            'data-original',
            'data-lazy',
            'data-real-src',
            'data-enlarge-src',
            'data-srcset', // Responsive lazy loading
        ];
        let rawUrl;
        for (const attr of lazyAttributes) {
            const value = $el.attr(attr);
            if (value && value.trim() && !value.startsWith('data:')) {
                rawUrl = value.trim();
                // For srcset, extract first URL
                if (attr === 'data-srcset') {
                    rawUrl = value.split(',')[0].trim().split(/\s+/)[0];
                }
                break;
            }
        }
        if (!rawUrl)
            return;
        let resolved = resolveAbsoluteUrl(baseUrl, rawUrl);
        if (!resolved || isLikelyBadImageUrl(resolved))
            return;
        // Check if there's a higher-res version in srcset
        const srcset = $el.attr('srcset');
        if (srcset) {
            // Parse srcset: "image-400.jpg 400w, image-800.jpg 800w, image-1200.jpg 1200w"
            const sources = srcset.split(',').map((s) => s.trim());
            let maxWidth = 0;
            let bestSource = resolved;
            for (const source of sources) {
                const parts = source.split(/\s+/);
                if (parts.length >= 2) {
                    const widthMatch = parts[1].match(/^(\d+)w$/);
                    if (widthMatch) {
                        const width = parseInt(widthMatch[1], 10);
                        if (width > maxWidth) {
                            maxWidth = width;
                            bestSource = parts[0];
                        }
                    }
                }
            }
            // Prefer higher-res if available
            if (maxWidth >= 600) {
                const higherResResolved = resolveAbsoluteUrl(baseUrl, bestSource);
                if (higherResResolved && !isLikelyBadImageUrl(higherResResolved)) {
                    resolved = higherResResolved;
                }
            }
        }
        let score = 0;
        const width = parseInt($el.attr('width') || '', 10);
        const height = parseInt($el.attr('height') || '', 10);
        if (!isNaN(width) && width < 300)
            return;
        if (!isNaN(width)) {
            if (width >= 600)
                score += 3;
            else if (width >= 400)
                score += 2;
        }
        if (!isNaN(height)) {
            if (height >= 400)
                score += 2;
            else if (height >= 300)
                score += 1;
        }
        if (!isNaN(width) && !isNaN(height) && height > 0) {
            const ratio = width / height;
            if (ratio >= 1.2 && ratio <= 2.2)
                score += 2;
        }
        const className = `${$el.attr('class') || ''} ${$el.parent().attr('class') || ''}`.toLowerCase();
        if (className.includes('recipe') || className.includes('hero') || className.includes('featured'))
            score += 2;
        if (className.includes('nav') || className.includes('footer') || className.includes('aside'))
            score -= 4;
        const inRecipeContainer = $el.closest('article, .recipe, .entry-content, .post-content').length > 0;
        if (inRecipeContainer)
            score += 3;
        const lowered = resolved.toLowerCase();
        if (lowered.includes('recipe') || lowered.includes('hero') || lowered.includes('featured') || lowered.includes('main'))
            score += 2;
        if (isLikelyBadImageUrl(lowered))
            score -= 5;
        candidates.push({ url: resolved, score });
    });
    return candidates
        .sort((a, b) => b.score - a.score)
        .map((candidate) => candidate.url);
}
function extractImageFromPictureElements($, baseUrl) {
    const pictureElements = $('picture');
    for (let i = 0; i < pictureElements.length; i++) {
        const $picture = $(pictureElements[i]);
        // Check source elements first (higher quality options)
        const sources = $picture.find('source');
        for (let j = 0; j < sources.length; j++) {
            const $source = $(sources[j]);
            const srcset = $source.attr('srcset');
            if (srcset) {
                // Extract first URL from srcset (usually highest quality)
                const firstUrl = srcset.split(',')[0].trim().split(/\s+/)[0];
                if (firstUrl && !firstUrl.startsWith('data:')) {
                    const resolved = resolveAbsoluteUrl(baseUrl, firstUrl);
                    if (resolved && !isLikelyBadImageUrl(resolved)) {
                        return resolved;
                    }
                }
            }
        }
        // Fallback to img element inside picture
        const $img = $picture.find('img');
        if ($img.length > 0) {
            const src = $img.first().attr('src');
            if (src && !src.startsWith('data:')) {
                const resolved = resolveAbsoluteUrl(baseUrl, src);
                if (resolved && !isLikelyBadImageUrl(resolved)) {
                    return resolved;
                }
            }
        }
    }
    return undefined;
}
async function validateImageUrl(imageUrl) {
    if (!imageUrl) {
        console.log('[validateImageUrl] Empty URL');
        return false;
    }
    if (isLikelyBadImageUrl(imageUrl)) {
        console.log('[validateImageUrl] Rejected as likely bad image:', imageUrl);
        return false;
    }
    try {
        const response = await axios_1.default.head(imageUrl, {
            timeout: 8000,
            maxRedirects: 3,
            validateStatus: (status) => status >= 200 && status < 400
        });
        const contentType = response.headers['content-type'] || '';
        const contentLength = parseInt(response.headers['content-length'] || '0', 10);
        if (!contentType.startsWith('image/')) {
            console.log('[validateImageUrl] Invalid content-type:', { url: imageUrl, contentType });
            return false;
        }
        if (contentLength && contentLength < 15 * 1024) {
            console.log('[validateImageUrl] Image too small:', { url: imageUrl, sizeKB: Math.round(contentLength / 1024) });
            return false;
        }
        console.log('[validateImageUrl] ✅ Valid image:', { url: imageUrl, contentType, sizeKB: Math.round(contentLength / 1024) });
        return true;
    }
    catch (error) {
        console.log('[validateImageUrl] Validation error:', {
            url: imageUrl,
            error: error instanceof Error ? error.message : String(error)
        });
        return false;
    }
}
async function resolveRecipeImage(url, htmlPayload) {
    let freshHtml;
    try {
        const requestResult = await enhancedRequestService_1.enhancedRequestService.fetchWithRetry(url, {
            timeout: 12000,
            retries: 2,
            delay: 1500,
            userAgent: 'chrome'
        });
        freshHtml = requestResult.data;
    }
    catch (error) {
        console.warn('Image fetch failed, falling back to client HTML:', {
            url,
            error: error instanceof Error ? error.message : String(error)
        });
    }
    const html = freshHtml || htmlPayload;
    if (!html) {
        console.log('[resolveRecipeImage] No HTML available for image extraction');
        return undefined;
    }
    console.log('[resolveRecipeImage] Starting image extraction:', {
        url,
        usingFreshHtml: !!freshHtml,
        usingClientHtml: !freshHtml && !!htmlPayload,
        htmlLength: html.length
    });
    const $ = cheerio.load(html);
    // Extract Instagram meta tag
    const instagramImage = $('meta[property="instagram:image"]').first().attr('content');
    const resolvedInstagramImage = instagramImage ? resolveAbsoluteUrl(url, instagramImage) : undefined;
    // Extract Pinterest meta tag
    const pinterestImage = $('meta[name="pinterest:media"]').first().attr('content');
    const resolvedPinterestImage = pinterestImage ? resolveAbsoluteUrl(url, pinterestImage) : undefined;
    // Extract image_src link tag
    const imageSrcLink = $('link[rel="image_src"]').first().attr('href');
    const resolvedImageSrcLink = imageSrcLink ? resolveAbsoluteUrl(url, imageSrcLink) : undefined;
    const jsonLdImage = extractImageFromJsonLd($, url);
    const ogImage = extractImageFromOpenGraph($, url);
    const twitterImage = extractImageFromTwitter($, url);
    const pictureImage = extractImageFromPictureElements($, url);
    const imgTagCandidates = extractImageCandidatesFromImgTags($, url);
    console.log('[resolveRecipeImage] Extraction results:', {
        jsonLdImage,
        ogImage,
        twitterImage,
        instagramImage: resolvedInstagramImage,
        pinterestImage: resolvedPinterestImage,
        imageSrcLink: resolvedImageSrcLink,
        pictureImage,
        imgTagCount: imgTagCandidates.length,
        firstImgTag: imgTagCandidates[0]
    });
    const candidates = [
        jsonLdImage,
        ogImage,
        twitterImage,
        resolvedInstagramImage,
        resolvedPinterestImage,
        resolvedImageSrcLink,
        pictureImage,
        ...imgTagCandidates
    ].filter(Boolean);
    console.log(`[resolveRecipeImage] Found ${candidates.length} image candidates, validating...`);
    const seen = new Set();
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        if (seen.has(candidate))
            continue;
        seen.add(candidate);
        console.log(`[resolveRecipeImage] Validating candidate ${i + 1}/${candidates.length}:`, candidate);
        if (await validateImageUrl(candidate)) {
            console.log(`[resolveRecipeImage] ✅ Found valid image (candidate ${i + 1}):`, candidate);
            return candidate;
        }
        else {
            console.log(`[resolveRecipeImage] ❌ Validation failed for candidate ${i + 1}`);
        }
    }
    console.log('[resolveRecipeImage] No valid image found after checking all candidates');
    return undefined;
}
// @ts-ignore - Legacy function, will be removed
function extractFromJsonLd($) {
    try {
        const jsonLdScripts = $('script[type="application/ld+json"]');
        for (let i = 0; i < jsonLdScripts.length; i++) {
            const scriptContent = $(jsonLdScripts[i]).html();
            if (!scriptContent)
                continue;
            try {
                const data = JSON.parse(scriptContent);
                const recipe = findRecipeInJsonLd(data);
                if (recipe)
                    return recipe;
            }
            catch (parseError) {
                continue; // Try next script tag
            }
        }
        return null;
    }
    catch (error) {
        return null;
    }
}
function findRecipeInJsonLd(data) {
    // Handle different JSON-LD structures
    if (Array.isArray(data)) {
        for (const item of data) {
            const recipe = findRecipeInJsonLd(item);
            if (recipe)
                return recipe;
        }
        return null;
    }
    if (data['@type'] === 'Recipe') {
        return parseJsonLdRecipe(data);
    }
    // Handle nested structures
    if (data['@graph']) {
        return findRecipeInJsonLd(data['@graph']);
    }
    return null;
}
function parseJsonLdRecipe(recipe) {
    var _a;
    const extractText = (value) => {
        if (typeof value === 'string')
            return value;
        if (value && value.text)
            return value.text;
        if (value && value['@value'])
            return value['@value'];
        return '';
    };
    const extractArray = (value) => {
        if (!value)
            return [];
        if (Array.isArray(value)) {
            return value.map(extractText).filter(Boolean);
        }
        return [extractText(value)].filter(Boolean);
    };
    const extractInstructions = (instructions) => {
        if (!instructions)
            return [];
        const processInstruction = (instruction) => {
            // Handle HowToStep objects
            if (instruction && typeof instruction === 'object') {
                if (Array.isArray(instruction.itemListElement)) {
                    return instruction.itemListElement.map(processInstruction).filter(Boolean).join('\n');
                }
                if (Array.isArray(instruction.steps)) {
                    return instruction.steps.map(processInstruction).filter(Boolean).join('\n');
                }
                // Standard HowToStep with text property
                if (instruction.text) {
                    return extractText(instruction.text);
                }
                // Some sites use name instead of text
                if (instruction.name) {
                    return extractText(instruction.name);
                }
                // Some use description
                if (instruction.description) {
                    return extractText(instruction.description);
                }
                // Handle @type HowToStep
                if (instruction['@type'] === 'HowToStep') {
                    return instruction.text || instruction.name || instruction.description || '';
                }
                if (instruction['@type'] === 'HowToSection' && instruction.itemListElement) {
                    const sectionSteps = Array.isArray(instruction.itemListElement)
                        ? instruction.itemListElement
                        : [instruction.itemListElement];
                    return sectionSteps.map(processInstruction).filter(Boolean).join('\n');
                }
                if (instruction['@type'] === 'ItemList' && instruction.itemListElement) {
                    const listSteps = Array.isArray(instruction.itemListElement)
                        ? instruction.itemListElement
                        : [instruction.itemListElement];
                    return listSteps.map(processInstruction).filter(Boolean).join('\n');
                }
                // If it's an object but no recognizable text, try to extract text from it
                return extractText(instruction);
            }
            // Handle plain strings
            return extractText(instruction);
        };
        let result = [];
        if (Array.isArray(instructions)) {
            result = instructions.map(processInstruction).filter(Boolean);
        }
        else {
            const processed = processInstruction(instructions);
            if (processed)
                result = [processed];
        }
        // Clean up instruction text
        const flattened = result.flatMap((instruction) => instruction.split('\n').map(step => step.trim()).filter(Boolean));
        return flattened.map((instruction, index) => {
            let cleaned = instruction
                // Remove step numbers at the beginning
                .replace(/^\d+\.\s*/, '')
                .replace(/^Step\s+\d+:?\s*/i, '')
                // Remove extra whitespace
                .trim();
            // Ensure instruction ends with period if it doesn't end with punctuation
            if (cleaned && !/[.!?]$/.test(cleaned)) {
                cleaned += '.';
            }
            return cleaned;
        }).filter(Boolean);
    };
    const extractTime = (duration) => {
        if (!duration)
            return '';
        if (typeof duration === 'string') {
            // Parse ISO 8601 duration (PT15M = 15 minutes)
            const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            if (match) {
                const hours = match[1] ? parseInt(match[1]) : 0;
                const minutes = match[2] ? parseInt(match[2]) : 0;
                if (hours && minutes)
                    return `${hours}h ${minutes}min`;
                if (hours)
                    return `${hours}h`;
                if (minutes)
                    return `${minutes}min`;
            }
        }
        return extractText(duration);
    };
    const extractNumber = (value) => {
        if (typeof value === 'number')
            return value;
        if (typeof value === 'string') {
            const str = value.toString().trim();
            // Handle fractions like "1/2", "3/4", etc.
            const fractionMatch = str.match(/^(\d+)\/(\d+)$/);
            if (fractionMatch) {
                const numerator = parseFloat(fractionMatch[1]);
                const denominator = parseFloat(fractionMatch[2]);
                return denominator !== 0 ? numerator / denominator : undefined;
            }
            // Handle mixed numbers like "1 1/2", "2 3/4"
            const mixedMatch = str.match(/^(\d+)\s+(\d+)\/(\d+)$/);
            if (mixedMatch) {
                const whole = parseFloat(mixedMatch[1]);
                const numerator = parseFloat(mixedMatch[2]);
                const denominator = parseFloat(mixedMatch[3]);
                return denominator !== 0 ? whole + (numerator / denominator) : undefined;
            }
            // Handle ranges like "2-3", "4-6" - take the middle value
            const rangeMatch = str.match(/^(\d+(?:\.\d+)?)\s*[-–—]\s*(\d+(?:\.\d+)?)$/);
            if (rangeMatch) {
                const min = parseFloat(rangeMatch[1]);
                const max = parseFloat(rangeMatch[2]);
                return !isNaN(min) && !isNaN(max) ? (min + max) / 2 : undefined;
            }
            // Handle "about", "approximately" prefixes
            const approxMatch = str.match(/(?:about|approximately|around|~)\s*(\d+(?:\.\d+)?)/i);
            if (approxMatch) {
                const num = parseFloat(approxMatch[1]);
                return !isNaN(num) ? num : undefined;
            }
            // Extract first number from string (handles cases like "4 servings", "serves 6", etc.)
            const numberMatch = str.match(/(\d+(?:\.\d+)?)/);
            if (numberMatch) {
                const num = parseFloat(numberMatch[1]);
                return !isNaN(num) ? num : undefined;
            }
            return undefined;
        }
        return undefined;
    };
    const structuredImage = extractText(((_a = recipe.image) === null || _a === void 0 ? void 0 : _a.url) || recipe.image);
    return {
        title: extractText(recipe.name),
        description: extractText(recipe.description),
        image: structuredImage,
        prepTime: extractTime(recipe.prepTime),
        cookTime: extractTime(recipe.cookTime),
        totalTime: extractTime(recipe.totalTime),
        servings: extractNumber(recipe.recipeYield || recipe.yield),
        ingredients: extractArray(recipe.recipeIngredient),
        instructions: recipe.recipeInstructions ?
            extractInstructions(recipe.recipeInstructions) : [],
        tags: extractArray(recipe.recipeCategory).concat(extractArray(recipe.recipeCuisine)),
    };
}
// @ts-ignore - Legacy function, will be removed
function extractFromMicrodata($) {
    const recipeElement = $('[itemtype*="schema.org/Recipe"]').first();
    if (!recipeElement.length)
        return null;
    const extractProp = (prop) => {
        const elements = recipeElement.find(`[itemprop="${prop}"]`);
        const values = [];
        elements.each((_, el) => {
            const $el = $(el);
            const text = $el.text().trim() || $el.attr('content') || '';
            if (text)
                values.push(text);
        });
        return values;
    };
    const title = extractProp('name')[0];
    if (!title)
        return null;
    return {
        title,
        description: extractProp('description')[0],
        image: recipeElement.find('[itemprop="image"]').attr('src'),
        prepTime: extractProp('prepTime')[0],
        cookTime: extractProp('cookTime')[0],
        totalTime: extractProp('totalTime')[0],
        servings: parseInt(extractProp('recipeYield')[0]) || undefined,
        ingredients: extractProp('recipeIngredient'),
        instructions: extractProp('recipeInstructions'),
    };
}
// @ts-ignore - Legacy function, will be removed
function extractFromCommonSelectors($) {
    // Common recipe site patterns
    const titleSelectors = [
        '.recipe-title', '.entry-title', 'h1.recipe-name', '.recipe-header h1',
        '[class*="recipe-title"]', '[class*="recipe-name"]'
    ];
    const ingredientSelectors = [
        '.recipe-ingredient', '.ingredient', '.recipe-ingredients li',
        '[class*="ingredient"]', '.ingredients li'
    ];
    const instructionSelectors = [
        '.recipe-instruction', '.instruction', '.recipe-instructions li',
        '.recipe-method li', '[class*="instruction"]', '.directions li'
    ];
    const title = findTextBySelectors($, titleSelectors);
    if (!title)
        return null;
    const ingredients = findMultipleTextBySelectors($, ingredientSelectors);
    const instructions = findMultipleTextBySelectors($, instructionSelectors);
    if (ingredients.length === 0 && instructions.length === 0)
        return null;
    return {
        title: title.trim(),
        ingredients,
        instructions,
    };
}
function findTextBySelectors($, selectors) {
    for (const selector of selectors) {
        const element = $(selector).first();
        if (element.length) {
            const text = element.text().trim();
            if (text)
                return text;
        }
    }
    return '';
}
function findMultipleTextBySelectors($, selectors) {
    for (const selector of selectors) {
        const elements = $(selector);
        if (elements.length) {
            const texts = [];
            elements.each((_, el) => {
                const text = $(el).text().trim();
                if (text)
                    texts.push(text);
            });
            if (texts.length > 0)
                return texts;
        }
    }
    return [];
}
// @ts-ignore - Legacy function, will be removed
function extractFromAllrecipes($, html) {
    var _a, _b;
    try {
        // Try to extract from Allrecipes-specific JSON structure
        const scriptTags = $('script[type="application/javascript"], script[type="text/javascript"], script:not([type])');
        for (let i = 0; i < scriptTags.length; i++) {
            const scriptContent = $(scriptTags[i]).html();
            if (!scriptContent)
                continue;
            // Look for window.__INITIAL_STATE__ or similar data structures
            if (scriptContent.includes('__INITIAL_STATE__') || scriptContent.includes('RECIPE_DATA') || scriptContent.includes('"@type":"Recipe"')) {
                try {
                    // Extract JSON from various patterns
                    const jsonMatches = [
                        /window\.__INITIAL_STATE__\s*=\s*(\{.*?\});?\s*$/gm,
                        /RECIPE_DATA\s*=\s*(\{.*?\});?\s*$/gm,
                        /"@type"\s*:\s*"Recipe"[^}]*\}/g
                    ];
                    for (const pattern of jsonMatches) {
                        const matches = scriptContent.match(pattern);
                        if (matches) {
                            for (const match of matches) {
                                try {
                                    let jsonStr = match.replace(/^[^{]*/, '').replace(/;?\s*$/, '');
                                    const data = JSON.parse(jsonStr);
                                    if (data.recipe || data.recipes || data['@type'] === 'Recipe') {
                                        const recipe = data.recipe || ((_a = data.recipes) === null || _a === void 0 ? void 0 : _a[0]) || data;
                                        if (recipe.name && recipe.recipeIngredient && recipe.recipeInstruction) {
                                            return {
                                                title: recipe.name,
                                                description: recipe.description,
                                                ingredients: Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [],
                                                instructions: Array.isArray(recipe.recipeInstruction)
                                                    ? recipe.recipeInstruction.map((inst) => inst.text || inst.toString())
                                                    : [],
                                                image: ((_b = recipe.image) === null || _b === void 0 ? void 0 : _b.url) || recipe.image,
                                                prepTime: recipe.prepTime,
                                                cookTime: recipe.cookTime,
                                                totalTime: recipe.totalTime,
                                                servings: recipe.recipeYield || recipe.serves
                                            };
                                        }
                                    }
                                }
                                catch (parseError) {
                                    continue; // Try next match
                                }
                            }
                        }
                    }
                }
                catch (error) {
                    continue; // Try next script tag
                }
            }
        }
        // Fallback to Allrecipes-specific CSS selectors
        const allrecipesSelectors = {
            title: [
                '.recipe-summary__h1',
                '.entry-title',
                'h1[class*="recipe"]',
                '.recipe-title',
                '[data-module="RecipeTitle"] h1'
            ],
            ingredients: [
                '.recipe-ingred_txt',
                '.ingredients-section li',
                '[data-ingredient] span',
                '.recipe-ingredient-list li',
                '.mntl-structured-ingredients__list li'
            ],
            instructions: [
                '.recipe-directions__list--item',
                '.instructions-section li',
                '.recipe-instruction',
                '.directions ol li',
                '.mntl-sc-block-group--OL li'
            ]
        };
        const title = findTextBySelectors($, allrecipesSelectors.title);
        if (!title)
            return null;
        const ingredients = findMultipleTextBySelectors($, allrecipesSelectors.ingredients);
        const instructions = findMultipleTextBySelectors($, allrecipesSelectors.instructions);
        if (ingredients.length === 0 && instructions.length === 0)
            return null;
        return {
            title: title.trim(),
            description: $('.recipe-summary__description, .recipe-description').first().text().trim(),
            ingredients,
            instructions,
            image: $('.recipe-summary__image img, .recipe-image img').first().attr('src'),
            servings: parseInt($('.recipe-adjust-servings__size-quantity, .recipe-nutrition__item:contains("servings")').first().text()) || undefined
        };
    }
    catch (error) {
        console.warn('Allrecipes extraction error:', error);
        return null;
    }
}
// Environment-aware rate limiting configuration
const getRateLimitConfig = () => {
    var _a;
    const environment = ((_a = functions.config().environment) === null || _a === void 0 ? void 0 : _a.name) || process.env.NODE_ENV || 'development';
    // Default to development limits if environment not specified
    const configs = {
        development: {
            dailyImports: 5,
            dailyConversions: 10,
            importsPerHour: 3,
            conversionsPerHour: 5,
        },
        staging: {
            dailyImports: 25,
            dailyConversions: 50,
            importsPerHour: 10,
            conversionsPerHour: 20,
        },
        production: {
            dailyImports: 50,
            dailyConversions: 100,
            importsPerHour: 20,
            conversionsPerHour: 40,
        }
    };
    return configs[environment] || configs.development;
};
// Rolling window rate limiting (60 minutes)
const RATE_LIMIT_WINDOW_MINUTES = 60;
// Improved rate limiting functions with rolling window, TTL, and transaction support
async function checkRateLimit(userId, actionType) {
    const config = getRateLimitConfig();
    const now = admin.firestore.Timestamp.now();
    const windowStart = admin.firestore.Timestamp.fromDate(new Date(now.toDate().getTime() - (RATE_LIMIT_WINDOW_MINUTES * 60 * 1000)));
    // Use separate collections for imports and conversions to prevent field conflicts
    const collectionName = actionType === 'import' ? 'userImportLimits' : 'userConversionLimits';
    const docRef = admin.firestore().collection(collectionName).doc(userId);
    // Use transaction to prevent race conditions
    await admin.firestore().runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        const data = doc.data();
        const today = new Date().toDateString();
        if (!data) {
            // First time user - create new document with TTL
            const expiresAt = admin.firestore.Timestamp.fromDate(new Date(now.toDate().getTime() + (7 * 24 * 60 * 60 * 1000)) // 7 days TTL
            );
            const newData = {
                userId,
                actionType,
                actionTimestamps: [now],
                dailyCount: 1,
                lastActionTimestamp: now,
                lastResetDate: today,
                createdAt: now,
                expiresAt,
            };
            transaction.set(docRef, newData);
            return;
        }
        // Filter timestamps within rolling window
        const recentTimestamps = data.actionTimestamps.filter(timestamp => timestamp.toDate() > windowStart.toDate());
        // Reset daily counter if new day
        let dailyCount = data.dailyCount;
        if (data.lastResetDate !== today) {
            dailyCount = 0;
        }
        // Check rolling window limit (hourly equivalent)
        const hourlyLimit = actionType === 'import' ? config.importsPerHour : config.conversionsPerHour;
        if (recentTimestamps.length >= hourlyLimit) {
            const oldestInWindow = Math.min(...recentTimestamps.map(t => t.toDate().getTime()));
            const waitMinutes = Math.ceil((RATE_LIMIT_WINDOW_MINUTES - (now.toDate().getTime() - oldestInWindow) / (60 * 1000)));
            throw new functions.https.HttpsError('resource-exhausted', `${actionType === 'import' ? 'Import' : 'Conversion'} rate limit exceeded (${hourlyLimit}/${RATE_LIMIT_WINDOW_MINUTES} minutes). Please wait ${waitMinutes} minutes.`);
        }
        // Check daily limit
        const dailyLimit = actionType === 'import' ? config.dailyImports : config.dailyConversions;
        if (dailyCount >= dailyLimit) {
            throw new functions.https.HttpsError('resource-exhausted', `Daily ${actionType} limit reached (${dailyLimit}/day). Please try again tomorrow.`);
        }
        // Update with new action timestamp and refresh TTL
        const updatedTimestamps = [...recentTimestamps, now];
        const expiresAt = admin.firestore.Timestamp.fromDate(new Date(now.toDate().getTime() + (7 * 24 * 60 * 60 * 1000)) // 7 days TTL
        );
        transaction.update(docRef, {
            actionTimestamps: updatedTimestamps,
            dailyCount: dailyCount + 1,
            lastActionTimestamp: now,
            lastResetDate: today,
            expiresAt,
        });
    });
}
// Cloud Function to convert recipes to kid-friendly versions with caching and rate limiting
exports.convertRecipeForKid = functions.https.onCall(async (data, context) => {
    var _a, _b, _c, _d;
    try {
        // Authentication check
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { recipeId, kidId, kidAge, readingLevel, allergyFlags = [] } = data;
        // Input validation
        if (!recipeId || !kidAge || !readingLevel) {
            throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
        }
        if (kidAge < 3 || kidAge > 18) {
            throw new functions.https.HttpsError('invalid-argument', 'Kid age must be between 3 and 18');
        }
        if (!['beginner', 'intermediate', 'advanced'].includes(readingLevel)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid reading level');
        }
        // Check rate limits using improved rolling window system
        await checkRateLimit(context.auth.uid, 'conversion');
        // Get the original recipe
        const recipeDoc = await admin.firestore().collection('recipes').doc(recipeId).get();
        if (!recipeDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Recipe not found');
        }
        const recipe = recipeDoc.data();
        if (!recipe) {
            throw new functions.https.HttpsError('internal', 'Recipe data is invalid');
        }
        // Verify user owns this recipe
        const isOwner = recipe.userId === context.auth.uid ||
            (recipe.parentId && await isUserOwnerOfParentProfile(context.auth.uid, recipe.parentId));
        if (!isOwner) {
            throw new functions.https.HttpsError('permission-denied', 'You do not have permission to convert this recipe');
        }
        // Check cache first
        const sourceUrl = recipe.url || recipe.title;
        const ageRange = getAgeRange(kidAge);
        const cacheKey = generateCacheKey(sourceUrl, readingLevel, ageRange, allergyFlags || [], 'beginner' // Default experience level for now
        );
        console.log('🔍 Cache lookup:', {
            sourceUrl: sourceUrl,
            readingLevel: readingLevel,
            kidAge: kidAge,
            ageRange: ageRange,
            allergyFlags: allergyFlags || [],
            cacheKey: cacheKey
        });
        const cached = await checkConversionCache(cacheKey);
        if (cached) {
            console.log('✅ Cache HIT - using cached conversion:', {
                cacheKey: cacheKey,
                cachedAt: ((_b = (_a = cached.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || cached.createdAt
            });
            // Check for allergies in original recipe even when using cache
            const allergyInfo = allergyFlags && allergyFlags.length > 0
                ? detectAllergensInIngredients(recipe.ingredients || [], allergyFlags.map(allergen => ({ allergen, severity: 'moderate' })))
                : { hasAllergens: false, detectedAllergens: [], warnings: [] };
            // Get parentId from kidId if provided
            let parentId = null;
            if (kidId) {
                try {
                    const kidDoc = await admin.firestore().collection('kidProfiles').doc(kidId).get();
                    if (kidDoc.exists) {
                        parentId = (_c = kidDoc.data()) === null || _c === void 0 ? void 0 : _c.parentId;
                    }
                }
                catch (error) {
                    console.warn('Could not fetch kid profile for parentId:', error);
                }
            }
            const kidRecipeId = await createKidRecipeFromCache(recipeId, kidAge, readingLevel, cached, context.auth.uid, kidId, parentId);
            // Rate limit counter already updated by checkRateLimit transaction
            return {
                success: true,
                kidRecipeId,
                usedCache: true,
                allergyWarnings: allergyInfo.warnings,
                hasAllergens: allergyInfo.hasAllergens
            };
        }
        console.log('❌ Cache MISS - proceeding with AI conversion');
        // Check for allergies in original recipe
        const allergyInfo = allergyFlags && allergyFlags.length > 0
            ? detectAllergensInIngredients(recipe.ingredients || [], allergyFlags.map(allergen => ({ allergen, severity: 'moderate' })))
            : { hasAllergens: false, detectedAllergens: [], warnings: [] };
        // Convert with AI
        console.log('🤖 Converting recipe with AI');
        const conversion = await convertRecipeWithAI(recipe, kidAge, readingLevel, allergyFlags);
        // Add allergy information to conversion
        const enhancedConversion = Object.assign(Object.assign({}, conversion), { allergyInfo: allergyInfo });
        // Store in cache
        console.log('💾 Storing conversion in cache:', {
            cacheKey: cacheKey,
            sourceUrl: sourceUrl
        });
        await storeConversionInCache(cacheKey, enhancedConversion, sourceUrl);
        // Create kid recipe
        // Get parentId from kidId if provided (same logic as cache path)
        let parentId = null;
        if (kidId) {
            try {
                const kidDoc = await admin.firestore().collection('kidProfiles').doc(kidId).get();
                if (kidDoc.exists) {
                    parentId = (_d = kidDoc.data()) === null || _d === void 0 ? void 0 : _d.parentId;
                }
            }
            catch (error) {
                console.warn('Could not fetch kid profile for parentId:', error);
            }
        }
        const kidRecipeId = await createKidRecipe(recipeId, kidAge, readingLevel, enhancedConversion, context.auth.uid, kidId, parentId);
        // Rate limit counter already updated by checkRateLimit transaction
        return {
            success: true,
            kidRecipeId,
            usedCache: false,
            allergyWarnings: allergyInfo.warnings,
            hasAllergens: allergyInfo.hasAllergens
        };
    }
    catch (error) {
        console.error('Error converting recipe:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Failed to convert recipe');
    }
});
// HTTP endpoint for recipe import that handles React Native auth properly
exports.importRecipeHttp = functions.https.onRequest(async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q;
    try {
        // Set CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        // Get the authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Missing or invalid authorization header' });
            return;
        }
        const token = authHeader.split('Bearer ')[1];
        // Verify the Firebase token
        const decodedToken = await admin.auth().verifyIdToken(token);
        console.log('Authenticated user:', decodedToken.uid, decodedToken.email);
        const { url, html } = req.body;
        if (!url) {
            res.status(400).json({ error: 'URL is required' });
            return;
        }
        if (!isValidUrl(url)) {
            res.status(400).json({ error: 'Invalid URL format' });
            return;
        }
        // No rate limit for imports; only AI conversions are limited.
        const htmlPayload = typeof html === 'string' && html.trim().length > 0 ? html : undefined;
        // Check global recipe cache first
        const cachedRecipe = await getRecipeFromCache(url);
        let recipe;
        let status = 'complete';
        let issues = [];
        let confidence = 1.0;
        let method = 'cache';
        if (cachedRecipe) {
            console.log('Recipe found in cache:', url);
            const normalized = normalizeRecipeDraft(cachedRecipe, url);
            recipe = normalized.recipe;
            status = normalized.status;
            issues = normalized.issues;
            confidence = 1.0;
            method = 'cache';
            if (!recipe.image) {
                const resolvedImage = await resolveRecipeImage(url, htmlPayload);
                if (resolvedImage) {
                    recipe.image = resolvedImage;
                }
            }
        }
        else {
            console.log('Recipe not in cache, scraping:', { url, hasHtml: !!htmlPayload });
            const scraperResult = htmlPayload
                ? await extractRecipeWithDetailsFromHtml(url, htmlPayload)
                : await extractRecipeWithDetails(url);
            if (scraperResult.recipe) {
                const normalized = normalizeRecipeDraft(scraperResult.recipe, url);
                recipe = normalized.recipe;
                status = normalized.status;
                issues = normalized.issues.concat(scraperResult.issues || []);
                confidence = scraperResult.confidence;
                method = scraperResult.method;
                const resolvedImage = await resolveRecipeImage(url, htmlPayload);
                if (resolvedImage) {
                    recipe.image = resolvedImage;
                }
                if (status === 'not_recipe') {
                    res.status(400).json({
                        error: 'Not a recipe',
                        message: 'No recipe data found on this page',
                        canRetry: false
                    });
                    return;
                }
                if (recipe.title) {
                    await saveRecipeToCache(url, recipe);
                }
                res.json({
                    status,
                    recipe,
                    confidence,
                    method,
                    issues
                });
                return;
            }
            // Low confidence or failed scrape - try AI/legacy extraction path
            try {
                const aiFallback = htmlPayload
                    ? await extractRecipeFromHtml(url, htmlPayload)
                    : await extractRecipeFromUrl(url);
                const normalized = normalizeRecipeDraft(aiFallback, url);
                recipe = normalized.recipe;
                status = normalized.status;
                issues = normalized.issues;
                confidence = 0.5;
                method = 'ai-fallback';
                const resolvedImage = await resolveRecipeImage(url, htmlPayload);
                if (resolvedImage) {
                    recipe.image = resolvedImage;
                }
                if (status === 'not_recipe') {
                    res.status(400).json({
                        error: 'Not a recipe',
                        message: 'No recipe data found on this page',
                        canRetry: false
                    });
                    return;
                }
                if (recipe.title) {
                    await saveRecipeToCache(url, recipe);
                }
                res.json({
                    status,
                    recipe,
                    confidence,
                    method,
                    issues
                });
                return;
            }
            catch (fallbackError) {
                // Complete failure
                throw new Error(`Failed to extract recipe. ${((_a = scraperResult.issues) === null || _a === void 0 ? void 0 : _a.join(', ')) || 'Unknown error'}`);
            }
        }
        // Return recipe data without saving to user collection
        res.json({
            status,
            recipe,
            confidence,
            method,
            issues
        });
    }
    catch (error) {
        console.error('Error in importRecipeHttp:', {
            message: error.message,
            code: error.code,
            stack: error.stack,
            url: (_b = req.body) === null || _b === void 0 ? void 0 : _b.url,
            userAgent: req.headers['user-agent'],
            timestamp: new Date().toISOString()
        });
        // Authentication errors
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked') {
            res.status(401).json({
                error: 'Authentication expired',
                message: 'Please log in again to continue importing recipes',
                canRetry: false
            });
            return;
        }
        // Rate limiting errors
        if (error.code === 'resource-exhausted' ||
            ((_c = error.message) === null || _c === void 0 ? void 0 : _c.includes('rate limit')) ||
            ((_d = error.message) === null || _d === void 0 ? void 0 : _d.includes('Daily import limit reached'))) {
            res.status(429).json({
                error: 'Rate limit exceeded',
                message: error.message || 'Too many requests. Please try again soon.',
                canRetry: false,
                suggestion: 'Please try again soon.'
            });
            return;
        }
        // Recipe validation and scraping errors
        if (((_e = error.message) === null || _e === void 0 ? void 0 : _e.includes('Missing instructions from this recipe page')) ||
            ((_f = error.message) === null || _f === void 0 ? void 0 : _f.includes('No cooking instructions found')) ||
            ((_g = error.message) === null || _g === void 0 ? void 0 : _g.includes('This site might not expose steps properly'))) {
            res.status(400).json({
                error: 'Incomplete recipe data',
                message: error.message,
                canRetry: false,
                allowManualEdit: true,
                suggestion: 'This website didn\'t provide complete recipe instructions. Try a different recipe URL or enter the recipe manually.'
            });
            return;
        }
        if ((_h = error.message) === null || _h === void 0 ? void 0 : _h.includes('Recipe must have a title')) {
            res.status(400).json({
                error: 'Invalid recipe page',
                message: 'No recipe found on this page',
                canRetry: false,
                allowManualEdit: true,
                suggestion: 'Make sure the URL points to a recipe page, not a blog post or search results'
            });
            return;
        }
        if (((_j = error.message) === null || _j === void 0 ? void 0 : _j.includes('Missing ingredients from this recipe page')) ||
            ((_k = error.message) === null || _k === void 0 ? void 0 : _k.includes('Recipe must have at least one ingredient')) ||
            ((_l = error.message) === null || _l === void 0 ? void 0 : _l.includes('No valid ingredients found'))) {
            res.status(400).json({
                error: 'Missing ingredients',
                message: 'No recipe ingredients found on this page',
                canRetry: false,
                allowManualEdit: true,
                suggestion: 'This might not be a complete recipe page. Try a different URL or enter the recipe manually.'
            });
            return;
        }
        // Network and website errors
        if ((_m = error.message) === null || _m === void 0 ? void 0 : _m.includes('Website not found')) {
            res.status(404).json({
                error: 'Website not found',
                message: 'The website could not be reached',
                canRetry: true,
                suggestion: 'Check that the URL is correct and the website is online'
            });
            return;
        }
        if ((_o = error.message) === null || _o === void 0 ? void 0 : _o.includes('Recipe page not found')) {
            res.status(404).json({
                error: 'Page not found',
                message: 'Recipe page not found',
                canRetry: false,
                suggestion: 'Check that the URL is correct and the page exists'
            });
            return;
        }
        if ((_p = error.message) === null || _p === void 0 ? void 0 : _p.includes('Request timed out')) {
            res.status(408).json({
                error: 'Timeout',
                message: 'Import timed out - the website may be slow',
                canRetry: true,
                suggestion: 'Try again in a few minutes'
            });
            return;
        }
        if ((_q = error.message) === null || _q === void 0 ? void 0 : _q.includes('No recipe data found')) {
            res.status(400).json({
                error: 'No recipe found',
                message: 'No recipe data found on this page',
                canRetry: false,
                allowManualEdit: true,
                suggestion: 'Make sure the URL points to a recipe page with ingredients and instructions. You can also enter the recipe manually.'
            });
            return;
        }
        // Generic server errors
        res.status(500).json({
            error: 'Import failed',
            message: 'Failed to import recipe',
            canRetry: true,
            allowManualEdit: true,
            suggestion: 'Please try again or enter the recipe manually. Contact support if the problem persists.'
        });
    }
});
// HTTP endpoint to save an imported recipe from the share extension
exports.saveImportedRecipeHttp = functions.https.onRequest(async (req, res) => {
    var _a;
    try {
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
        }
        if (req.method !== 'POST') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Missing or invalid authorization header' });
            return;
        }
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(token);
        const recipe = (_a = req.body) === null || _a === void 0 ? void 0 : _a.recipe;
        if (!recipe || typeof recipe !== 'object') {
            res.status(400).json({ error: 'Recipe data is required' });
            return;
        }
        let title = typeof recipe.title === 'string' ? recipe.title.trim() : '';
        const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
        const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
        const sourceUrl = recipe.sourceUrl || recipe.url;
        const importStatus = recipe.importStatus === 'needs_review' ? 'needs_review' : 'complete';
        const importIssues = Array.isArray(recipe.importIssues) ? recipe.importIssues : [];
        const importConfidence = typeof recipe.importConfidence === 'number' ? recipe.importConfidence : undefined;
        if (!title) {
            title = 'Untitled Recipe';
        }
        if (!ingredients.length && !instructions.length) {
            res.status(400).json({
                error: 'Invalid recipe data',
                message: 'Recipe must include a title and at least ingredients or instructions.'
            });
            return;
        }
        const parentProfiles = await admin.firestore()
            .collection('parentProfiles')
            .where('userId', '==', decodedToken.uid)
            .limit(1)
            .get();
        if (parentProfiles.empty) {
            res.status(400).json({
                error: 'Parent profile missing',
                message: 'Please complete your parent profile before saving recipes.'
            });
            return;
        }
        const parentProfileId = parentProfiles.docs[0].id;
        const now = admin.firestore.Timestamp.now();
        const recipeData = {
            title,
            description: recipe.description || '',
            image: recipe.image || '',
            servings: recipe.servings || 0,
            prepTime: recipe.prepTime || '',
            cookTime: recipe.cookTime || '',
            totalTime: recipe.totalTime || '',
            difficulty: recipe.difficulty || '',
            cuisine: recipe.cuisine || '',
            mealType: recipe.mealType || '',
            ingredients,
            instructions,
            url: sourceUrl || '',
            tags: Array.isArray(recipe.tags) ? recipe.tags : [],
            importStatus,
            importIssues,
            importConfidence,
            userId: decodedToken.uid,
            parentId: parentProfileId,
            createdAt: now,
            updatedAt: now,
        };
        const docRef = await admin.firestore().collection('recipes').add(recipeData);
        res.json({
            success: true,
            recipeId: docRef.id
        });
    }
    catch (error) {
        console.error('Error in saveImportedRecipeHttp:', {
            message: error.message,
            code: error.code,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });
        if (error.code === 'auth/id-token-expired' || error.code === 'auth/id-token-revoked') {
            res.status(401).json({
                error: 'Authentication expired',
                message: 'Please log in again to continue',
            });
            return;
        }
        res.status(500).json({
            error: 'Save failed',
            message: 'Failed to save recipe'
        });
    }
});
// Cloud Function to import recipes securely
exports.importRecipeSecure = functions.https.onCall(async (data, context) => {
    var _a, _b, _c;
    try {
        console.log('importRecipeSecure called with context:', {
            authExists: !!context.auth,
            uid: (_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid,
            email: (_c = (_b = context.auth) === null || _b === void 0 ? void 0 : _b.token) === null || _c === void 0 ? void 0 : _c.email,
        });
        // Authentication check
        if (!context.auth) {
            console.error('No auth context provided');
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { url } = data;
        if (!url) {
            throw new functions.https.HttpsError('invalid-argument', 'URL is required');
        }
        if (!isValidUrl(url)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid URL format');
        }
        // No rate limit for imports; only AI conversions are limited.
        // Check global recipe cache first
        const cachedRecipe = await getRecipeFromCache(url);
        let recipe;
        if (cachedRecipe) {
            console.log('Recipe found in cache:', url);
            recipe = cachedRecipe;
        }
        else {
            console.log('Recipe not in cache, scraping:', url);
            // Extract recipe and cache it
            recipe = await extractRecipeFromUrl(url);
            await saveRecipeToCache(url, recipe);
        }
        // Server-side validation
        await validateRecipeData(recipe);
        // Rate limit counter already updated by checkRateLimit transaction
        // Return recipe data without saving to user collection
        // The client (ImportContext) will handle saving to user's personal collection
        return {
            success: true,
            recipe: recipe
        };
    }
    catch (error) {
        console.error('Error importing recipe:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Failed to import recipe');
    }
});
// Legacy Helper functions (commented out - replaced by rolling window rate limiting)
/* async function checkConversionRateLimit(userId: string): Promise<void> {
  const rateLimitDoc = await admin.firestore().collection('rateLimits').doc(userId).get();
  const rateLimitData = rateLimitDoc.data() as RateLimitInfo | undefined;

  const now = new Date();
  const today = now.toDateString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  if (!rateLimitData) {
    // First time user, create rate limit doc
    await admin.firestore().collection('rateLimits').doc(userId).set({
      userId,
      dailyImports: 0,
      dailyConversions: 0,
      lastResetDate: today,
    } as RateLimitInfo);
    return;
  }

  // Reset daily counters if new day
  if (rateLimitData.lastResetDate !== today) {
    await admin.firestore().collection('rateLimits').doc(userId).update({
      dailyImports: 0,
      dailyConversions: 0,
      lastResetDate: today,
    });
    return;
  }

  // Check daily limit
  if (rateLimitData.dailyConversions >= MAX_DAILY_CONVERSIONS) {
    throw new functions.https.HttpsError('resource-exhausted',
      `Daily conversion limit reached (${MAX_DAILY_CONVERSIONS}/day). Please try again tomorrow.`
    );
  }

  // Check hourly limit
  if (rateLimitData.lastConversionTimestamp) {
    const lastConversion = rateLimitData.lastConversionTimestamp.toDate();
    if (lastConversion > oneHourAgo) {
      // Count conversions in last hour
      try {
        const conversionsInLastHour = await countRecentConversions(userId, oneHourAgo);
        if (conversionsInLastHour >= MAX_CONVERSIONS_PER_HOUR) {
          throw new functions.https.HttpsError('resource-exhausted',
            `Hourly conversion limit reached (${MAX_CONVERSIONS_PER_HOUR}/hour). Please wait before converting more recipes.`
          );
        }
      } catch (error: any) {
        if (error?.code === 9) {
          console.warn('Conversion rate limit check skipped due to missing index:', error?.message);
        } else {
          throw error;
        }
      }
    }
  }
}

async function checkImportRateLimit(userId: string): Promise<void> {
  const rateLimitDoc = await admin.firestore().collection('rateLimits').doc(userId).get();
  const rateLimitData = rateLimitDoc.data() as RateLimitInfo | undefined;

  const now = new Date();
  const today = now.toDateString();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  if (!rateLimitData) {
    await admin.firestore().collection('rateLimits').doc(userId).set({
      userId,
      dailyImports: 0,
      dailyConversions: 0,
      lastResetDate: today,
    } as RateLimitInfo);
    return;
  }

  if (rateLimitData.lastResetDate !== today) {
    await admin.firestore().collection('rateLimits').doc(userId).update({
      dailyImports: 0,
      dailyConversions: 0,
      lastResetDate: today,
    });
    return;
  }

  if (rateLimitData.dailyImports >= MAX_DAILY_IMPORTS) {
    throw new functions.https.HttpsError('resource-exhausted',
      `Daily import limit reached (${MAX_DAILY_IMPORTS}/day). Please try again tomorrow.`
    );
  }

  if (rateLimitData.lastImportTimestamp) {
    const lastImport = rateLimitData.lastImportTimestamp.toDate();
    if (lastImport > oneHourAgo) {
      try {
        const importsInLastHour = await countRecentImports(userId, oneHourAgo);
        if (importsInLastHour >= MAX_IMPORTS_PER_HOUR) {
          throw new functions.https.HttpsError('resource-exhausted',
            `Hourly import limit reached (${MAX_IMPORTS_PER_HOUR}/hour). Please wait before importing more recipes.`
          );
        }
      } catch (error: any) {
        if (error?.code === 9) {
          console.warn('Rate limit check skipped due to missing index:', error?.message);
        } else {
          throw error;
        }
      }
    }
  }
}

async function updateConversionCount(userId: string): Promise<void> {
  await admin.firestore().collection('rateLimits').doc(userId).update({
    dailyConversions: admin.firestore.FieldValue.increment(1),
    lastConversionTimestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function updateImportCount(userId: string): Promise<void> {
  await admin.firestore().collection('rateLimits').doc(userId).update({
    dailyImports: admin.firestore.FieldValue.increment(1),
    lastImportTimestamp: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function countRecentConversions(userId: string, since: Date): Promise<number> {
  const query = await admin.firestore()
    .collection('kidRecipes')
    .where('userId', '==', userId)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(since))
    .get();

  return query.size;
}

async function countRecentImports(userId: string, since: Date): Promise<number> {
  const query = await admin.firestore()
    .collection('recipes')
    .where('userId', '==', userId)
    .where('createdAt', '>', admin.firestore.Timestamp.fromDate(since))
    .get();

  return query.size;
} */
async function isUserOwnerOfParentProfile(userId, parentId) {
    var _a;
    const parentDoc = await admin.firestore().collection('parentProfiles').doc(parentId).get();
    return parentDoc.exists && ((_a = parentDoc.data()) === null || _a === void 0 ? void 0 : _a.userId) === userId;
}
async function getUserParentProfile(userId) {
    const query = await admin.firestore()
        .collection('parentProfiles')
        .where('userId', '==', userId)
        .limit(1)
        .get();
    return query.empty ? null : Object.assign({ id: query.docs[0].id }, query.docs[0].data());
}
async function createParentProfile(userId, email) {
    console.log('Creating parent profile for user:', userId, email);
    const parentProfileData = {
        userId,
        email,
        name: email.split('@')[0],
        pin: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const docRef = await admin.firestore().collection('parentProfiles').add(parentProfileData);
    console.log('Parent profile created with ID:', docRef.id);
    return Object.assign({ id: docRef.id }, parentProfileData);
}
// Cloud Function to create and manage kid profiles
exports.createKidProfile = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        // Authentication check
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { name, age, readingLevel, allergies, experience = 'beginner' } = data;
        // Input validation
        if (!name || !age || !readingLevel) {
            throw new functions.https.HttpsError('invalid-argument', 'Name, age, and reading level are required');
        }
        if (age < 3 || age > 18) {
            throw new functions.https.HttpsError('invalid-argument', 'Kid age must be between 3 and 18');
        }
        if (!['beginner', 'intermediate', 'advanced'].includes(readingLevel)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid reading level');
        }
        // Get or create parent profile
        let parentProfile = await getUserParentProfile(context.auth.uid);
        if (!parentProfile) {
            parentProfile = await createParentProfile(context.auth.uid, ((_a = context.auth.token) === null || _a === void 0 ? void 0 : _a.email) || `user_${context.auth.uid}`);
        }
        // Create kid profile
        const kidProfileData = {
            name: name.trim(),
            age,
            readingLevel,
            allergies: allergies || [],
            experience,
            favoriteRecipes: [],
            parentId: parentProfile.id,
            userId: context.auth.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            isActive: true,
        };
        const docRef = await admin.firestore().collection('kidProfiles').add(kidProfileData);
        console.log('Kid profile created with ID:', docRef.id);
        return {
            success: true,
            kidProfileId: docRef.id,
            profile: Object.assign({ id: docRef.id }, kidProfileData)
        };
    }
    catch (error) {
        console.error('Error creating kid profile:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Failed to create kid profile');
    }
});
// Cloud Function to get kid profile by ID
exports.getKidProfileById = functions.https.onCall(async (data, context) => {
    try {
        // Authentication check
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { kidProfileId } = data;
        if (!kidProfileId) {
            throw new functions.https.HttpsError('invalid-argument', 'Kid profile ID is required');
        }
        const profile = await getKidProfile(kidProfileId);
        if (!profile) {
            throw new functions.https.HttpsError('not-found', 'Kid profile not found');
        }
        // Verify user owns this profile
        if (profile.userId !== context.auth.uid) {
            throw new functions.https.HttpsError('permission-denied', 'You do not have permission to access this profile');
        }
        return {
            success: true,
            profile
        };
    }
    catch (error) {
        console.error('Error getting kid profile:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Failed to get kid profile');
    }
});
// Helper function to get kid profile by ID
async function getKidProfile(kidProfileId) {
    const doc = await admin.firestore().collection('kidProfiles').doc(kidProfileId).get();
    if (!doc.exists)
        return null;
    const data = doc.data();
    return data ? Object.assign({ id: doc.id }, data) : null;
}
// Cloud Function to rate and provide feedback on kid recipes
exports.rateKidRecipe = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        // Authentication check
        if (!context.auth) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const { kidRecipeId, rating, feedback } = data;
        // Validation
        if (!kidRecipeId || rating == null) {
            throw new functions.https.HttpsError('invalid-argument', 'Kid recipe ID and rating are required');
        }
        if (rating < 1 || rating > 5) {
            throw new functions.https.HttpsError('invalid-argument', 'Rating must be between 1 and 5');
        }
        // Get the kid recipe
        const kidRecipeDoc = await admin.firestore().collection('kidRecipes').doc(kidRecipeId).get();
        if (!kidRecipeDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Kid recipe not found');
        }
        const kidRecipe = kidRecipeDoc.data();
        if (!kidRecipe) {
            throw new functions.https.HttpsError('internal', 'Kid recipe data is invalid');
        }
        // Verify user owns this recipe
        if (kidRecipe.userId !== context.auth.uid) {
            throw new functions.https.HttpsError('permission-denied', 'You do not have permission to rate this recipe');
        }
        // Update the kid recipe with rating and feedback
        const updatedMetadata = Object.assign(Object.assign({}, kidRecipe.aiMetadata), { qualityScore: rating, parentFeedback: {
                rating,
                feedback: feedback || null,
                submittedAt: admin.firestore.FieldValue.serverTimestamp(),
                userId: context.auth.uid
            }, lastUpdated: admin.firestore.FieldValue.serverTimestamp() });
        await admin.firestore().collection('kidRecipes').doc(kidRecipeId).update({
            aiMetadata: updatedMetadata,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Check if this is a low rating that needs refinement
        const needsRefinement = rating < 3.5;
        let refinementTriggered = false;
        if (needsRefinement && ((_a = kidRecipe.aiMetadata) === null || _a === void 0 ? void 0 : _a.regenerationCount) < 2) {
            try {
                await triggerRecipeRefinement(kidRecipeId, kidRecipe, feedback);
                refinementTriggered = true;
            }
            catch (error) {
                console.error('Failed to trigger refinement:', error);
                // Don't fail the rating if refinement fails
            }
        }
        console.log(`Recipe ${kidRecipeId} rated ${rating}/5 by user ${context.auth.uid}`);
        return {
            success: true,
            rating,
            needsRefinement,
            refinementTriggered,
            message: needsRefinement
                ? 'Thank you for your feedback! We\'ll work on improving this recipe.'
                : 'Thank you for your rating!'
        };
    }
    catch (error) {
        console.error('Error rating kid recipe:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', error instanceof Error ? error.message : 'Failed to rate recipe');
    }
});
// Function to trigger recipe refinement for low-rated recipes
async function triggerRecipeRefinement(kidRecipeId, kidRecipe, feedback) {
    var _a, _b;
    try {
        // Get the original recipe
        const originalRecipeDoc = await admin.firestore().collection('recipes').doc(kidRecipe.originalRecipeId).get();
        if (!originalRecipeDoc.exists) {
            throw new Error('Original recipe not found');
        }
        const originalRecipe = originalRecipeDoc.data();
        if (!originalRecipe) {
            throw new Error('Original recipe data is invalid');
        }
        // Create refined prompt based on feedback
        const refinementPrompt = createRefinementPrompt(originalRecipe, kidRecipe, feedback);
        // Call AI for refinement
        const refinedConversion = await refineRecipeWithAI(originalRecipe, kidRecipe.kidAge, kidRecipe.targetReadingLevel, refinementPrompt, ((_a = kidRecipe.aiMetadata) === null || _a === void 0 ? void 0 : _a.regenerationCount) || 0);
        // Update the kid recipe with refined content
        const updatedMetadata = Object.assign(Object.assign({}, kidRecipe.aiMetadata), { regenerationCount: (((_b = kidRecipe.aiMetadata) === null || _b === void 0 ? void 0 : _b.regenerationCount) || 0) + 1, lastRefinement: admin.firestore.FieldValue.serverTimestamp(), refinementReason: 'low_rating', parentFeedbackUsed: feedback || null });
        await admin.firestore().collection('kidRecipes').doc(kidRecipeId).update({
            simplifiedIngredients: refinedConversion.simplifiedIngredients,
            simplifiedSteps: refinedConversion.simplifiedSteps,
            safetyNotes: refinedConversion.safetyNotes,
            estimatedDuration: refinedConversion.estimatedDuration,
            skillsRequired: refinedConversion.skillsRequired,
            aiMetadata: updatedMetadata,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Recipe ${kidRecipeId} refined due to low rating`);
    }
    catch (error) {
        console.error('Error in triggerRecipeRefinement:', error);
        throw error;
    }
}
// Create a refinement prompt based on parent feedback
function createRefinementPrompt(originalRecipe, kidRecipe, feedback) {
    let refinementInstructions = `The parent rated this conversion poorly (below 3.5/5). Please improve it based on the following feedback:\n\n`;
    if ((feedback === null || feedback === void 0 ? void 0 : feedback.unclearSteps) && feedback.unclearSteps.length > 0) {
        refinementInstructions += `UNCLEAR STEPS (need simplification): Steps ${feedback.unclearSteps.join(', ')}\n`;
    }
    if (feedback === null || feedback === void 0 ? void 0 : feedback.suggestions) {
        refinementInstructions += `PARENT SUGGESTIONS: ${feedback.suggestions}\n`;
    }
    if (feedback === null || feedback === void 0 ? void 0 : feedback.safetyNotes) {
        refinementInstructions += `SAFETY CONCERNS: ${feedback.safetyNotes}\n`;
    }
    if (feedback === null || feedback === void 0 ? void 0 : feedback.overallComments) {
        refinementInstructions += `GENERAL FEEDBACK: ${feedback.overallComments}\n`;
    }
    refinementInstructions += `\nPlease focus on making the instructions clearer, more age-appropriate, and safer. Make sure each step is simple and easy to understand for a ${kidRecipe.kidAge}-year-old.`;
    return refinementInstructions;
}
// JSON sanitization function to handle OpenAI's occasionally malformed JSON
function sanitizeJsonString(jsonString) {
    let sanitized = jsonString.trim();
    // Remove trailing commas before closing brackets/braces
    sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');
    // Fix unescaped quotes in string values
    sanitized = sanitized.replace(/"([^"]*?)"([^":,\]}\s])/g, '"$1\\"$2');
    // Fix missing quotes around property names
    sanitized = sanitized.replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":');
    // Remove any remaining trailing commas after the fixes
    sanitized = sanitized.replace(/,\s*([}\]])/g, '$1');
    // Fix double commas
    sanitized = sanitized.replace(/,,/g, ',');
    // Remove comments that might have been missed
    sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, ''); // Multi-line comments
    sanitized = sanitized.replace(/\/\/.*$/gm, ''); // Single-line comments
    // Remove any null bytes
    sanitized = sanitized.replace(/\0/g, '');
    return sanitized.trim();
}
// Safe JSON parsing with multiple fallback strategies
function safeJsonParse(jsonString, context = 'OpenAI') {
    const attempts = [
        // Attempt 1: Parse as-is
        () => JSON.parse(jsonString),
        // Attempt 2: Basic sanitization
        () => JSON.parse(sanitizeJsonString(jsonString)),
        // Attempt 3: Extract JSON from curly braces and sanitize
        () => {
            const start = jsonString.indexOf('{');
            const end = jsonString.lastIndexOf('}') + 1;
            if (start !== -1 && end > start) {
                const extracted = jsonString.substring(start, end);
                return JSON.parse(sanitizeJsonString(extracted));
            }
            throw new Error('No JSON object found');
        },
        // Attempt 4: More aggressive cleaning
        () => {
            let cleaned = jsonString
                .replace(/```json\s*/gi, '')
                .replace(/```\s*/g, '')
                .replace(/^[^{]*/, '') // Remove everything before first {
                .replace(/[^}]*$/, '') // Remove everything after last }
                .trim();
            // Find the JSON object boundaries more carefully
            let braceCount = 0;
            let startIdx = -1;
            let endIdx = -1;
            for (let i = 0; i < cleaned.length; i++) {
                if (cleaned[i] === '{') {
                    if (startIdx === -1)
                        startIdx = i;
                    braceCount++;
                }
                else if (cleaned[i] === '}') {
                    braceCount--;
                    if (braceCount === 0 && startIdx !== -1) {
                        endIdx = i + 1;
                        break;
                    }
                }
            }
            if (startIdx !== -1 && endIdx !== -1) {
                cleaned = cleaned.substring(startIdx, endIdx);
            }
            return JSON.parse(sanitizeJsonString(cleaned));
        }
    ];
    let lastError = null;
    for (let i = 0; i < attempts.length; i++) {
        try {
            const result = attempts[i]();
            if (i > 0) {
                console.log(`✅ ${context} JSON parsed successfully on attempt ${i + 1}`);
            }
            return result;
        }
        catch (error) {
            lastError = error;
            if (i < attempts.length - 1) {
                console.warn(`⚠️ ${context} JSON parse attempt ${i + 1} failed:`, error.message);
            }
        }
    }
    // If all attempts fail, log details and throw
    console.error(`❌ ${context} JSON parsing failed after ${attempts.length} attempts`);
    console.error('Original content:', jsonString.substring(0, 500));
    console.error('Last error:', lastError === null || lastError === void 0 ? void 0 : lastError.message);
    throw new Error(`Invalid JSON response from ${context}: ${(lastError === null || lastError === void 0 ? void 0 : lastError.message) || 'Unknown parsing error'}`);
}
// AI refinement function with enhanced prompting
async function refineRecipeWithAI(recipe, kidAge, readingLevel, refinementInstructions, regenerationCount) {
    var _a, _b, _c, _d, _e;
    try {
        const apiKey = ((_a = functions.config().openai) === null || _a === void 0 ? void 0 : _a.api_key) || process.env.OPENAI_API_KEY;
        if (!apiKey || !openai) {
            console.warn('⚠️ OpenAI not available - returning original recipe without refinement');
            return recipe; // Return original recipe without AI refinement
        }
        const prompt = `RECIPE REFINEMENT REQUEST (Attempt ${regenerationCount + 1})

${refinementInstructions}

Original Recipe:
Title: ${recipe.title}
Ingredients: ${((_b = recipe.ingredients) === null || _b === void 0 ? void 0 : _b.join(', ')) || 'Not specified'}
Instructions: ${((_c = recipe.instructions) === null || _c === void 0 ? void 0 : _c.join(' ')) || 'Not specified'}

Please convert this recipe to be kid-friendly for a ${kidAge}-year-old with ${readingLevel} reading level, incorporating the feedback above.

Return a JSON object with:
{
  "simplifiedIngredients": ["array of simple ingredient descriptions"],
  "simplifiedSteps": [
    {
      "step": "Clear, simple instruction",
      "icon": "🔥 or 🥄 or ⏰ etc",
      "time": "estimated time in minutes",
      "difficulty": "easy/medium/hard",
      "safetyTip": "any safety note for this step",
      "order": 1
    }
  ],
  "safetyNotes": ["Important safety reminders for kids"],
  "estimatedDuration": "total time estimate",
  "skillsRequired": ["basic skills needed"]
}`;
        const response = await Promise.race([
            openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a culinary instructor specializing in kid-safe cooking. You excel at creating clear, age-appropriate instructions and incorporating parent feedback to improve recipe clarity and safety.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.4,
                max_tokens: 4000,
            }),
            // Timeout after 90 seconds
            new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout after 90 seconds')), 90000))
        ]);
        const rawContent = (_e = (_d = response.choices[0]) === null || _d === void 0 ? void 0 : _d.message) === null || _e === void 0 ? void 0 : _e.content;
        if (!rawContent) {
            throw new Error('No response from OpenAI refinement');
        }
        // Clean up the response content - remove any markdown formatting and comments
        let cleanContent = rawContent
            .replace(/```json\s*/g, '') // Remove ```json
            .replace(/```\s*/g, '') // Remove ending ```
            .replace(/\/\/.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .trim();
        // Replace common Unicode fractions with decimal numbers
        const fractionReplacements = {
            '½': '0.5',
            '⅓': '0.33',
            '⅔': '0.67',
            '¼': '0.25',
            '¾': '0.75',
            '⅕': '0.2',
            '⅖': '0.4',
            '⅗': '0.6',
            '⅘': '0.8',
            '⅙': '0.17',
            '⅚': '0.83',
            '⅛': '0.125',
            '⅜': '0.375',
            '⅝': '0.625',
            '⅞': '0.875'
        };
        for (const [fraction, decimal] of Object.entries(fractionReplacements)) {
            cleanContent = cleanContent.replace(new RegExp(fraction, 'g'), decimal);
        }
        // Find JSON content if it's wrapped in text
        const jsonStart = cleanContent.indexOf('{');
        const jsonEnd = cleanContent.lastIndexOf('}') + 1;
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
            cleanContent = cleanContent.substring(jsonStart, jsonEnd);
        }
        // Parse and validate refined response using safe parser
        const parsed = safeJsonParse(cleanContent, 'OpenAI refinement');
        return validateAIResponse(parsed);
    }
    catch (error) {
        console.error('OpenAI refinement error:', error);
        throw new Error('Failed to refine recipe with AI: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}
// Common allergens database for detection
const COMMON_ALLERGENS = {
    'nuts': [
        'almond', 'almonds', 'walnut', 'walnuts', 'pecan', 'pecans', 'cashew', 'cashews',
        'pistachio', 'pistachios', 'hazelnut', 'hazelnuts', 'macadamia', 'brazil nut',
        'pine nut', 'pine nuts', 'chestnut', 'chestnuts', 'nut', 'nuts', 'tree nut',
        'peanut', 'peanuts', 'peanut butter', 'nutella'
    ],
    'dairy': [
        'milk', 'butter', 'cheese', 'cream', 'yogurt', 'yoghurt', 'sour cream',
        'heavy cream', 'whipped cream', 'cottage cheese', 'cream cheese', 'mozzarella',
        'cheddar', 'parmesan', 'swiss cheese', 'goat cheese', 'feta', 'ricotta',
        'buttermilk', 'half and half', 'dairy', 'lactose', 'casein', 'whey'
    ],
    'eggs': [
        'egg', 'eggs', 'egg white', 'egg whites', 'egg yolk', 'egg yolks',
        'whole egg', 'beaten egg', 'scrambled egg', 'mayonnaise', 'mayo'
    ],
    'shellfish': [
        'shrimp', 'crab', 'lobster', 'crawfish', 'crayfish', 'prawn', 'prawns',
        'scallop', 'scallops', 'clam', 'clams', 'oyster', 'oysters', 'mussel', 'mussels',
        'shellfish', 'seafood'
    ],
    'fish': [
        'salmon', 'tuna', 'cod', 'halibut', 'trout', 'bass', 'mackerel', 'sardine',
        'sardines', 'anchovy', 'anchovies', 'fish', 'fish sauce', 'worcestershire'
    ],
    'soy': [
        'soy', 'soy sauce', 'soy milk', 'tofu', 'tempeh', 'miso', 'edamame',
        'soybean', 'soybeans', 'soy protein', 'soy lecithin'
    ],
    'wheat': [
        'wheat', 'flour', 'bread', 'pasta', 'noodles', 'crackers', 'cereal',
        'wheat flour', 'all-purpose flour', 'whole wheat', 'breadcrumbs', 'gluten',
        'semolina', 'durum', 'bulgur', 'couscous'
    ],
    'sesame': [
        'sesame', 'sesame seed', 'sesame seeds', 'sesame oil', 'tahini',
        'sesame paste', 'sesame butter'
    ]
};
// Function to detect allergens in ingredients
function detectAllergensInIngredients(ingredients, allergies) {
    const detected = [];
    const warnings = [];
    // Check each allergy against all ingredients
    for (const allergy of allergies) {
        const allergenName = allergy.allergen.toLowerCase();
        const allergenKeywords = COMMON_ALLERGENS[allergenName] || [allergenName];
        const foundInIngredients = [];
        for (const ingredient of ingredients) {
            const ingredientLower = ingredient.toLowerCase();
            // Check for exact matches and partial matches
            for (const keyword of allergenKeywords) {
                if (ingredientLower.includes(keyword)) {
                    foundInIngredients.push(ingredient);
                    break; // Don't add same ingredient multiple times
                }
            }
        }
        if (foundInIngredients.length > 0) {
            detected.push({
                allergen: allergy.allergen,
                severity: allergy.severity,
                foundIn: foundInIngredients,
                confidence: 'high' // For now, assume high confidence for direct matches
            });
            // Generate warning messages based on severity
            const ingredientList = foundInIngredients.join(', ');
            switch (allergy.severity) {
                case 'severe':
                    warnings.push(`⚠️ SEVERE ALLERGY WARNING: Contains ${allergy.allergen} in: ${ingredientList}`);
                    break;
                case 'moderate':
                    warnings.push(`⚠️ ALLERGY ALERT: Contains ${allergy.allergen} in: ${ingredientList}`);
                    break;
                case 'mild':
                    warnings.push(`⚠️ Contains ${allergy.allergen} in: ${ingredientList}`);
                    break;
            }
        }
    }
    return {
        hasAllergens: detected.length > 0,
        detectedAllergens: detected,
        warnings
    };
}
function generateCacheKey(url, readingLevel, ageRange, allergyProfile = [], experience = 'beginner') {
    // Normalize URL - remove trailing slashes, query params, and fragments for better cache hits
    const normalizedUrl = url.toLowerCase().trim()
        .replace(/\/+$/, '') // Remove trailing slashes
        .split('?')[0] // Remove query parameters
        .split('#')[0]; // Remove fragments
    const sortedAllergies = [...allergyProfile].sort().join(',');
    const cacheInput = `${normalizedUrl}|${readingLevel}|${ageRange}|${sortedAllergies}|${experience}`;
    console.log('🔑 Generating cache key:', {
        originalUrl: url,
        normalizedUrl: normalizedUrl,
        readingLevel: readingLevel,
        ageRange: ageRange,
        allergyProfile: allergyProfile,
        experience: experience,
        cacheInput: cacheInput
    });
    // Generate SHA256 hash
    const hash = crypto.createHash('sha256').update(cacheInput).digest('hex');
    const cacheKey = `recipe_${hash.substring(0, 16)}`;
    console.log('🔑 Generated cache key:', cacheKey);
    return cacheKey;
}
function getAgeRange(age) {
    // Use broader, more practical age ranges for recipe caching
    if (age <= 8)
        return '6-8'; // Beginner level
    if (age <= 12)
        return '9-12'; // Intermediate level
    return '13+'; // Advanced level
}
async function checkConversionCache(cacheKey) {
    var _a, _b, _c;
    try {
        console.log('🔍 Checking cache for key:', cacheKey);
        const cacheDoc = await admin.firestore().collection('kidRecipeCache').doc(cacheKey).get();
        if (!cacheDoc.exists) {
            console.log('❌ Cache document does not exist');
            return null;
        }
        const data = cacheDoc.data();
        console.log('📄 Cache document found:', {
            docId: cacheDoc.id,
            hasData: !!data,
            dataKeys: data ? Object.keys(data) : [],
            createdAt: ((_b = (_a = data === null || data === void 0 ? void 0 : data.createdAt) === null || _a === void 0 ? void 0 : _a.toDate) === null || _b === void 0 ? void 0 : _b.call(_a)) || (data === null || data === void 0 ? void 0 : data.createdAt)
        });
        // Check if cache is still fresh (30 days)
        const createdAt = (_c = data === null || data === void 0 ? void 0 : data.createdAt) === null || _c === void 0 ? void 0 : _c.toDate();
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        if (!createdAt || createdAt < thirtyDaysAgo) {
            console.log('⏰ Cache expired:', {
                createdAt: createdAt === null || createdAt === void 0 ? void 0 : createdAt.toISOString(),
                thirtyDaysAgo: thirtyDaysAgo.toISOString(),
                isExpired: !createdAt || createdAt < thirtyDaysAgo
            });
            return null; // Cache expired
        }
        console.log('✅ Valid cache found, age:', Math.round((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)), 'days');
        return data;
    }
    catch (error) {
        console.error('❌ Error checking cache:', error);
        return null;
    }
}
async function storeConversionInCache(cacheKey, conversion, sourceUrl) {
    var _a, _b, _c;
    try {
        console.log('💾 Storing conversion in cache:', {
            cacheKey: cacheKey,
            sourceUrl: sourceUrl,
            hasIngredients: !!((_a = conversion.simplifiedIngredients) === null || _a === void 0 ? void 0 : _a.length),
            hasSteps: !!((_b = conversion.simplifiedSteps) === null || _b === void 0 ? void 0 : _b.length),
            hasSafetyNotes: !!((_c = conversion.safetyNotes) === null || _c === void 0 ? void 0 : _c.length)
        });
        const cacheData = {
            sourceUrl,
            simplifiedIngredients: conversion.simplifiedIngredients,
            simplifiedSteps: conversion.simplifiedSteps,
            safetyNotes: conversion.safetyNotes,
            estimatedDuration: conversion.estimatedDuration,
            skillsRequired: conversion.skillsRequired,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            // AI Conversion Metadata for cache
            aiMetadata: {
                version: '1.0',
                provider: 'openai',
                model: 'gpt-4o-mini',
                qualityScore: 5.0,
                generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                regenerationCount: 0
            }
        };
        await admin.firestore().collection('kidRecipeCache').doc(cacheKey).set(cacheData);
        console.log('✅ Successfully stored conversion in cache');
    }
    catch (error) {
        console.error('❌ Error storing conversion in cache:', error);
        throw error;
    }
}
async function createKidRecipeFromCache(recipeId, kidAge, readingLevel, cached, userId, kidId, parentId) {
    var _a, _b, _c, _d, _e;
    const kidRecipeData = {
        originalRecipeId: recipeId,
        userId,
        kidId: kidId || null,
        parentId: parentId || null,
        kidAge,
        targetReadingLevel: readingLevel,
        simplifiedIngredients: cached.simplifiedIngredients,
        simplifiedSteps: cached.simplifiedSteps,
        safetyNotes: cached.safetyNotes,
        estimatedDuration: cached.estimatedDuration,
        skillsRequired: cached.skillsRequired,
        conversionCount: 1,
        approvalStatus: 'pending',
        approvalRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvalReviewedAt: null,
        approvalNotes: null,
        isActive: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        // Allergy information (if available)
        allergyInfo: cached.allergyInfo || null,
        // AI Conversion Metadata (from cache)
        aiMetadata: {
            version: ((_a = cached.aiMetadata) === null || _a === void 0 ? void 0 : _a.version) || '1.0',
            provider: ((_b = cached.aiMetadata) === null || _b === void 0 ? void 0 : _b.provider) || 'openai',
            model: ((_c = cached.aiMetadata) === null || _c === void 0 ? void 0 : _c.model) || 'gpt-4o-mini',
            qualityScore: ((_d = cached.aiMetadata) === null || _d === void 0 ? void 0 : _d.qualityScore) || 5.0,
            generatedAt: ((_e = cached.aiMetadata) === null || _e === void 0 ? void 0 : _e.generatedAt) || cached.createdAt,
            parentFeedback: null,
            regenerationCount: 0,
            cacheSource: 'cached',
            originalCacheTimestamp: cached.createdAt
        }
    };
    const doc = await admin.firestore().collection('kidRecipes').add(kidRecipeData);
    return doc.id;
}
async function convertRecipeWithAI(recipe, kidAge, readingLevel, allergyFlags) {
    var _a, _b;
    if (!openai) {
        console.warn('⚠️ OpenAI not available - cannot convert recipe to kid-friendly version');
        throw new Error('AI conversion service not available - OpenAI API key not configured');
    }
    const prompt = `Convert this recipe to be kid-friendly for a ${kidAge}-year-old with ${readingLevel} reading level.

Original Recipe:
Title: ${recipe.title}
Ingredients: ${JSON.stringify(recipe.ingredients)}
Instructions: ${JSON.stringify(recipe.instructions || recipe.steps)}

${allergyFlags.length > 0 ? `IMPORTANT: This child has allergies to: ${allergyFlags.join(', ')}. Please flag or suggest substitutions for any ingredients that contain these allergens.` : ''}

SAFETY GUIDELINES:
- If ingredients include alcohol (wine, beer, etc.), clearly mark steps that involve alcohol as "Ask an adult to help" and explain the alcohol will cook out
- For sharp tools (knives, mandoline, etc.), mark as adult supervision required
- For high heat/dangerous techniques (deep frying, broiling, etc.), emphasize adult assistance
- For raw ingredients (raw eggs, undercooked meat), include proper handling safety notes
- Always prioritize safety while keeping the recipe engaging for kids

Please convert this to:
1. Kid-friendly ingredient names and measurements they can understand
2. Simple, clear step-by-step instructions appropriate for their reading level
3. Clear safety notes and "ask an adult" reminders for dangerous steps
4. Encouragement and positive language
5. Estimated time for each step if relevant
6. Adult supervision flags for unsafe elements

Return the response as JSON in this exact format:
{
  "simplifiedIngredients": [
    {
      "id": "1",
      "name": "original ingredient name",
      "kidFriendlyName": "kid-friendly name",
      "amount": 1,
      "unit": "cup",
      "description": "helpful description",
      "order": 1
    }
  ],
  "simplifiedSteps": [
    {
      "id": "1",
      "step": "original step",
      "kidFriendlyText": "simple kid-friendly instruction",
      "safetyNote": "safety warning if needed",
      "adultSupervision": true,
      "time": "5 minutes",
      "order": 1,
      "completed": false,
      "difficulty": "easy",
      "encouragement": "Great job!"
    }
  ],
  "safetyNotes": ["Important safety reminders"],
  "estimatedDuration": 30,
  "skillsRequired": ["mixing", "measuring"]
}`;
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                {
                    role: 'system',
                    content: 'You are a helpful cooking instructor who specializes in teaching children how to cook safely. Always prioritize safety and age-appropriate instructions.'
                },
                {
                    role: 'user',
                    content: prompt
                }
            ],
            response_format: { type: 'json_object' },
            temperature: 0.3,
            max_tokens: 4000,
        });
        const rawContent = (_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content;
        if (!rawContent) {
            throw new Error('No response from OpenAI');
        }
        // Clean up the response content - remove any markdown formatting and comments
        let cleanContent = rawContent
            .replace(/```json\s*/g, '') // Remove ```json
            .replace(/```\s*/g, '') // Remove ending ```
            .replace(/\/\/.*$/gm, '') // Remove single-line comments
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
            .trim();
        // Replace common Unicode fractions with decimal numbers
        const fractionReplacements = {
            '½': '0.5',
            '⅓': '0.33',
            '⅔': '0.67',
            '¼': '0.25',
            '¾': '0.75',
            '⅕': '0.2',
            '⅖': '0.4',
            '⅗': '0.6',
            '⅘': '0.8',
            '⅙': '0.17',
            '⅚': '0.83',
            '⅛': '0.125',
            '⅜': '0.375',
            '⅝': '0.625',
            '⅞': '0.875'
        };
        for (const [fraction, decimal] of Object.entries(fractionReplacements)) {
            cleanContent = cleanContent.replace(new RegExp(fraction, 'g'), decimal);
        }
        // Find JSON content if it's wrapped in text
        const jsonStart = cleanContent.indexOf('{');
        const jsonEnd = cleanContent.lastIndexOf('}') + 1;
        if (jsonStart !== -1 && jsonEnd > jsonStart) {
            cleanContent = cleanContent.substring(jsonStart, jsonEnd);
        }
        // Parse JSON response using safe parser
        const parsed = safeJsonParse(cleanContent, 'OpenAI conversion');
        return validateAIResponse(parsed);
    }
    catch (error) {
        console.error('OpenAI conversion error:', error);
        throw new Error('Failed to convert recipe with AI: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
}
async function createKidRecipe(recipeId, kidAge, readingLevel, conversion, userId, kidId, parentId) {
    const kidRecipeData = {
        originalRecipeId: recipeId,
        userId,
        kidId: kidId || null,
        parentId: parentId || null,
        kidAge,
        targetReadingLevel: readingLevel,
        simplifiedIngredients: conversion.simplifiedIngredients,
        simplifiedSteps: conversion.simplifiedSteps,
        safetyNotes: conversion.safetyNotes,
        estimatedDuration: conversion.estimatedDuration,
        skillsRequired: conversion.skillsRequired,
        conversionCount: 1,
        approvalStatus: 'pending',
        approvalRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
        approvalReviewedAt: null,
        approvalNotes: null,
        isActive: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        // Allergy information (if provided)
        allergyInfo: conversion.allergyInfo || null,
        // AI Conversion Metadata
        aiMetadata: {
            version: '1.0',
            provider: 'openai',
            model: 'gpt-4o-mini',
            qualityScore: 5.0,
            generatedAt: admin.firestore.FieldValue.serverTimestamp(),
            parentFeedback: null,
            regenerationCount: 0,
            cacheSource: 'fresh' // Indicates this was freshly generated, not from cache
        }
    };
    const doc = await admin.firestore().collection('kidRecipes').add(kidRecipeData);
    return doc.id;
}
async function validateRecipeData(recipe) {
    // Check required fields
    if (!recipe.title || recipe.title.trim().length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Recipe must have a title');
    }
    if (!recipe.ingredients || recipe.ingredients.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing ingredients from this recipe page');
    }
    if (!recipe.instructions || recipe.instructions.length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing instructions from this recipe page');
    }
    // Check size limits
    if (recipe.title.length > 200) {
        throw new functions.https.HttpsError('invalid-argument', 'Recipe title too long (max 200 characters)');
    }
    if (recipe.ingredients.length > 50) {
        throw new functions.https.HttpsError('invalid-argument', 'Too many ingredients (max 50)');
    }
    if (recipe.instructions.length > 50) {
        throw new functions.https.HttpsError('invalid-argument', 'Too many instructions (max 50)');
    }
    // Note: No content filtering at import - parents can import any recipe
    // Safety checks happen when sharing with kids, not at import
    // Sanitize strings to prevent XSS
    recipe.title = sanitizeString(recipe.title);
    recipe.ingredients = recipe.ingredients.map(sanitizeString);
    recipe.instructions = recipe.instructions.map(sanitizeString);
    if (recipe.description) {
        recipe.description = sanitizeString(recipe.description);
    }
}
function sanitizeString(str) {
    return str.replace(/[<>]/g, '').trim();
}
function validateAIResponse(response) {
    if (!response.simplifiedIngredients || !Array.isArray(response.simplifiedIngredients)) {
        throw new Error('Invalid AI response: missing or invalid simplifiedIngredients');
    }
    if (!response.simplifiedSteps || !Array.isArray(response.simplifiedSteps)) {
        throw new Error('Invalid AI response: missing or invalid simplifiedSteps');
    }
    if (!response.safetyNotes || !Array.isArray(response.safetyNotes)) {
        throw new Error('Invalid AI response: missing or invalid safetyNotes');
    }
    // Ensure required fields in ingredients
    response.simplifiedIngredients.forEach((ing, index) => {
        if (!ing.id || !ing.name || !ing.kidFriendlyName) {
            throw new Error(`Invalid ingredient at index ${index}: missing required fields`);
        }
        ing.order = ing.order || index + 1;
    });
    // Ensure required fields in steps
    response.simplifiedSteps.forEach((step, index) => {
        if (!step.id || !step.step || !step.kidFriendlyText) {
            throw new Error(`Invalid step at index ${index}: missing required fields`);
        }
        step.order = step.order || index + 1;
        step.completed = false; // Always start with incomplete steps
        step.difficulty = step.difficulty || 'easy';
    });
    return response;
}
exports.reportUnclearStep = functions.https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { kidRecipeId, stepIndex, kidId, issue, suggestion } = data;
    if (!kidRecipeId || stepIndex === undefined || !kidId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields: kidRecipeId, stepIndex, kidId');
    }
    try {
        const kidRecipeRef = admin.firestore().collection('kidRecipes').doc(kidRecipeId);
        const kidRecipeDoc = await kidRecipeRef.get();
        if (!kidRecipeDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Kid recipe not found');
        }
        const kidRecipe = kidRecipeDoc.data();
        if (!kidRecipe) {
            throw new functions.https.HttpsError('internal', 'Failed to load recipe data');
        }
        // Verify the step exists
        if (!kidRecipe.simplifiedSteps || stepIndex >= kidRecipe.simplifiedSteps.length) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid step index');
        }
        // Create step report document
        const reportData = {
            kidRecipeId,
            originalRecipeId: kidRecipe.originalRecipeId,
            stepIndex,
            stepText: ((_b = kidRecipe.simplifiedSteps[stepIndex]) === null || _b === void 0 ? void 0 : _b.kidFriendlyText) || '',
            originalStepText: ((_c = kidRecipe.simplifiedSteps[stepIndex]) === null || _c === void 0 ? void 0 : _c.step) || '',
            kidId,
            parentId: context.auth.uid,
            issue: issue || 'unclear',
            suggestion: suggestion || '',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            status: 'pending',
            reportType: 'unclear_step'
        };
        // Save the report
        const reportRef = await admin.firestore().collection('stepReports').add(reportData);
        // Update recipe metadata to track reports
        const currentReports = kidRecipe.reportedSteps || [];
        if (!currentReports.includes(stepIndex)) {
            await kidRecipeRef.update({
                reportedSteps: admin.firestore.FieldValue.arrayUnion(stepIndex),
                lastReportedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }
        // Check if this step has been reported multiple times (could trigger refinement)
        const reportsForThisStep = await admin.firestore()
            .collection('stepReports')
            .where('kidRecipeId', '==', kidRecipeId)
            .where('stepIndex', '==', stepIndex)
            .get();
        let shouldTriggerRefinement = false;
        if (reportsForThisStep.size >= 2) { // Multiple reports for same step
            shouldTriggerRefinement = true;
        }
        // If this step has been reported multiple times, trigger automatic refinement
        if (shouldTriggerRefinement) {
            try {
                console.log(`Step ${stepIndex} has ${reportsForThisStep.size} reports, triggering refinement...`);
                // Collect all feedback for this step
                const stepFeedback = reportsForThisStep.docs.map((doc) => {
                    const data = doc.data();
                    return {
                        issue: data.issue,
                        suggestion: data.suggestion,
                        timestamp: data.timestamp
                    };
                });
                await triggerStepRefinement(kidRecipeId, stepIndex, stepFeedback);
            }
            catch (refinementError) {
                console.error('Failed to trigger step refinement:', refinementError);
                // Don't fail the report if refinement fails
            }
        }
        return {
            success: true,
            reportId: reportRef.id,
            message: 'Thank you for letting us know! We\'ll work on making this step clearer.',
            refinementTriggered: shouldTriggerRefinement
        };
    }
    catch (error) {
        console.error('Error reporting unclear step:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to report step issue');
    }
});
async function triggerStepRefinement(kidRecipeId, stepIndex, feedback) {
    var _a, _b, _c, _d;
    try {
        const kidRecipeRef = admin.firestore().collection('kidRecipes').doc(kidRecipeId);
        const kidRecipeDoc = await kidRecipeRef.get();
        if (!kidRecipeDoc.exists) {
            throw new Error('Kid recipe not found');
        }
        const kidRecipe = kidRecipeDoc.data();
        if (!kidRecipe) {
            throw new Error('Failed to load kid recipe data');
        }
        const step = kidRecipe.simplifiedSteps[stepIndex];
        if (!step) {
            throw new Error('Step not found');
        }
        // Prepare feedback summary for AI
        const feedbackSummary = feedback.map(f => `Issue: ${f.issue || 'unclear'}, Suggestion: ${f.suggestion || 'none'}`).join('\n');
        const refinementPrompt = `
Please improve this cooking step for children based on the reported issues:

Current step: "${step.kidFriendlyText}"
Original step: "${step.step}"
Age group: ${kidRecipe.targetAge || 8}-12 years
Reading level: ${kidRecipe.readingLevel || 'beginner'}

Reported issues:
${feedbackSummary}

Requirements:
- Make the language even simpler and clearer
- Break down complex actions into smaller parts
- Add specific details that might be missing
- Ensure safety is clearly communicated
- Keep it encouraging and fun
- Use kid-friendly vocabulary

Respond with only the improved step text, nothing else.
    `.trim();
        const apiKey = ((_a = functions.config().openai) === null || _a === void 0 ? void 0 : _a.api_key) || process.env.OPENAI_API_KEY;
        if (!apiKey || !openai) {
            console.warn('⚠️ OpenAI not available - returning original step without refinement');
            // Return original step without refinement
            return step.kidFriendlyText || step.step;
        }
        const completion = await Promise.race([
            openai.chat.completions.create({
                model: 'gpt-4',
                messages: [{ role: 'user', content: refinementPrompt }],
                max_tokens: 200,
                temperature: 0.7
            }),
            // Timeout after 60 seconds for this shorter operation
            new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI API timeout after 60 seconds')), 60000))
        ]);
        const improvedStepText = (_d = (_c = (_b = completion.choices[0]) === null || _b === void 0 ? void 0 : _b.message) === null || _c === void 0 ? void 0 : _c.content) === null || _d === void 0 ? void 0 : _d.trim();
        if (!improvedStepText) {
            throw new Error('Failed to generate improved step text');
        }
        // Update the step with improved text
        const updatedSteps = [...kidRecipe.simplifiedSteps];
        updatedSteps[stepIndex] = Object.assign(Object.assign({}, step), { kidFriendlyText: improvedStepText, lastRefinedAt: admin.firestore.FieldValue.serverTimestamp(), refinementCount: (step.refinementCount || 0) + 1 });
        await kidRecipeRef.update({
            simplifiedSteps: updatedSteps,
            lastStepRefinedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        // Mark all reports for this step as resolved
        const reportsBatch = admin.firestore().batch();
        const reportsQuery = await admin.firestore()
            .collection('stepReports')
            .where('kidRecipeId', '==', kidRecipeId)
            .where('stepIndex', '==', stepIndex)
            .where('status', '==', 'pending')
            .get();
        reportsQuery.docs.forEach((doc) => {
            reportsBatch.update(doc.ref, {
                status: 'resolved',
                resolvedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        });
        await reportsBatch.commit();
        console.log(`Successfully refined step ${stepIndex} for recipe ${kidRecipeId}`);
    }
    catch (error) {
        console.error('Error in triggerStepRefinement:', error);
        throw error;
    }
}
exports.getQualityAnalytics = functions.https.onCall(async (data, context) => {
    var _a;
    if (!((_a = context.auth) === null || _a === void 0 ? void 0 : _a.uid)) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    const { parentId, timeRange = 'month' } = data;
    const userId = parentId || context.auth.uid;
    try {
        // Calculate time boundaries
        const now = new Date();
        let startDate;
        switch (timeRange) {
            case 'week':
                startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
                break;
            case 'month':
                startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
                break;
            case 'quarter':
                startDate = new Date(now.getTime() - (90 * 24 * 60 * 60 * 1000));
                break;
            case 'year':
                startDate = new Date(now.getTime() - (365 * 24 * 60 * 60 * 1000));
                break;
            default:
                startDate = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        }
        // Get all kid recipes for this parent
        const kidRecipesQuery = await admin.firestore()
            .collection('kidRecipes')
            .where('parentId', '==', userId)
            .get();
        const kidRecipeIds = kidRecipesQuery.docs.map(doc => doc.id);
        if (kidRecipeIds.length === 0) {
            return {
                success: true,
                analytics: {
                    totalRecipes: 0,
                    averageRating: 0,
                    totalRatings: 0,
                    totalStepReports: 0,
                    improvementRate: 0,
                    qualityTrends: [],
                    topIssues: [],
                    recipeQualityBreakdown: []
                }
            };
        }
        // Get ratings within time range
        const ratingsQuery = await admin.firestore()
            .collection('kidRecipeRatings')
            .where('kidRecipeId', 'in', kidRecipeIds.slice(0, 10)) // Firestore limit
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .get();
        // Get step reports within time range
        const reportsQuery = await admin.firestore()
            .collection('stepReports')
            .where('kidRecipeId', 'in', kidRecipeIds.slice(0, 10))
            .where('timestamp', '>=', admin.firestore.Timestamp.fromDate(startDate))
            .get();
        // Calculate metrics
        const ratings = ratingsQuery.docs.map(doc => doc.data());
        const reports = reportsQuery.docs.map(doc => doc.data());
        const totalRecipes = kidRecipeIds.length;
        const totalRatings = ratings.length;
        const averageRating = totalRatings > 0
            ? ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings
            : 0;
        const totalStepReports = reports.length;
        const resolvedReports = reports.filter(r => r.status === 'resolved').length;
        const improvementRate = totalStepReports > 0 ? (resolvedReports / totalStepReports) * 100 : 0;
        // Group issues by type
        const issueCount = {};
        reports.forEach(report => {
            const issue = report.issue || 'unclear';
            issueCount[issue] = (issueCount[issue] || 0) + 1;
        });
        const topIssues = Object.entries(issueCount)
            .map(([issue, count]) => ({ issue, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        // Calculate quality trends (weekly buckets)
        const weeklyData = {};
        const addToWeekly = (date, type, value) => {
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay()); // Start of week
            const weekKey = weekStart.toISOString().split('T')[0];
            if (!weeklyData[weekKey]) {
                weeklyData[weekKey] = { ratings: [], reports: 0 };
            }
            if (type === 'rating' && value !== undefined) {
                weeklyData[weekKey].ratings.push(value);
            }
            else if (type === 'report') {
                weeklyData[weekKey].reports++;
            }
        };
        ratings.forEach(rating => {
            if (rating.timestamp) {
                addToWeekly(rating.timestamp.toDate(), 'rating', rating.rating);
            }
        });
        reports.forEach(report => {
            if (report.timestamp) {
                addToWeekly(report.timestamp.toDate(), 'report');
            }
        });
        const qualityTrends = Object.entries(weeklyData)
            .map(([week, data]) => ({
            week,
            averageRating: data.ratings.length > 0
                ? data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length
                : 0,
            ratingsCount: data.ratings.length,
            reportsCount: data.reports
        }))
            .sort((a, b) => a.week.localeCompare(b.week));
        // Recipe quality breakdown
        const recipeQuality = {};
        kidRecipesQuery.docs.forEach(doc => {
            const recipe = doc.data();
            recipeQuality[doc.id] = {
                name: recipe.originalTitle || 'Unknown Recipe',
                ratings: [],
                reports: 0
            };
        });
        ratings.forEach(rating => {
            if (recipeQuality[rating.kidRecipeId]) {
                recipeQuality[rating.kidRecipeId].ratings.push(rating.rating);
            }
        });
        reports.forEach(report => {
            if (recipeQuality[report.kidRecipeId]) {
                recipeQuality[report.kidRecipeId].reports++;
            }
        });
        const recipeQualityBreakdown = Object.entries(recipeQuality)
            .map(([id, data]) => ({
            recipeId: id,
            recipeName: data.name,
            averageRating: data.ratings.length > 0
                ? data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length
                : 0,
            totalRatings: data.ratings.length,
            totalReports: data.reports,
            needsAttention: (data.ratings.length > 0 &&
                data.ratings.reduce((sum, r) => sum + r, 0) / data.ratings.length < 3.5) || data.reports > 2
        }))
            .sort((a, b) => {
            if (a.needsAttention && !b.needsAttention)
                return -1;
            if (!a.needsAttention && b.needsAttention)
                return 1;
            return a.averageRating - b.averageRating;
        });
        return {
            success: true,
            analytics: {
                totalRecipes,
                averageRating: Math.round(averageRating * 100) / 100,
                totalRatings,
                totalStepReports,
                improvementRate: Math.round(improvementRate * 100) / 100,
                qualityTrends,
                topIssues,
                recipeQualityBreakdown: recipeQualityBreakdown.slice(0, 20) // Limit results
            }
        };
    }
    catch (error) {
        console.error('Error fetching quality analytics:', error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch quality analytics');
    }
});
exports.triggerQualityAutoRegeneration = functions.pubsub.schedule('0 2 * * *').onRun(async (context) => {
    var _a;
    console.log('Starting quality auto-regeneration check...');
    try {
        // Find recipes that need regeneration based on quality metrics
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 7); // Check recipes from last week
        // Find kid recipes with poor ratings (< 3.5 average) that have enough data
        const kidRecipesQuery = await admin.firestore()
            .collection('kidRecipes')
            .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(cutoffDate))
            .get();
        const recipesToCheck = [];
        for (const recipeDoc of kidRecipesQuery.docs) {
            const recipe = recipeDoc.data();
            const recipeId = recipeDoc.id;
            // Get ratings for this recipe
            const ratingsQuery = await admin.firestore()
                .collection('kidRecipeRatings')
                .where('kidRecipeId', '==', recipeId)
                .get();
            if (ratingsQuery.size >= 3) { // Only consider recipes with at least 3 ratings
                const ratings = ratingsQuery.docs.map(doc => doc.data().rating);
                const averageRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
                if (averageRating < 3.5) {
                    recipesToCheck.push({
                        id: recipeId,
                        averageRating,
                        ratingsCount: ratings.length,
                        lastRefinedAt: (_a = recipe.lastRefinedAt) === null || _a === void 0 ? void 0 : _a.toDate(),
                        aiMetadata: recipe.aiMetadata || {}
                    });
                }
            }
        }
        console.log(`Found ${recipesToCheck.length} recipes that may need regeneration`);
        let regeneratedCount = 0;
        for (const recipe of recipesToCheck) {
            // Check if recipe was already refined recently
            if (recipe.lastRefinedAt) {
                const daysSinceRefinement = (Date.now() - recipe.lastRefinedAt.getTime()) / (1000 * 60 * 60 * 24);
                if (daysSinceRefinement < 3) {
                    console.log(`Skipping ${recipe.id} - refined recently`);
                    continue;
                }
            }
            // Check regeneration count to prevent infinite loops
            const regenerationCount = recipe.aiMetadata.regenerationCount || 0;
            if (regenerationCount >= 3) {
                console.log(`Skipping ${recipe.id} - max regenerations reached`);
                continue;
            }
            try {
                // Get recent feedback for this recipe
                const feedbackQuery = await admin.firestore()
                    .collection('kidRecipeRatings')
                    .where('kidRecipeId', '==', recipe.id)
                    .where('rating', '<', 4)
                    .orderBy('timestamp', 'desc')
                    .limit(5)
                    .get();
                const feedback = feedbackQuery.docs.map(doc => {
                    const data = doc.data();
                    return {
                        rating: data.rating,
                        feedback: data.feedback || {}
                    };
                });
                // Trigger recipe refinement
                await triggerRecipeRefinement(recipe.id, recipe, feedback);
                regeneratedCount++;
                console.log(`Auto-regenerated recipe ${recipe.id}`);
                // Don't overwhelm the system - process max 5 recipes per run
                if (regeneratedCount >= 5) {
                    break;
                }
            }
            catch (error) {
                console.error(`Failed to regenerate recipe ${recipe.id}:`, error);
            }
        }
        console.log(`Auto-regeneration completed. Regenerated ${regeneratedCount} recipes.`);
    }
    catch (error) {
        console.error('Error in quality auto-regeneration:', error);
    }
});
// Delete a kid recipe and all associated data
exports.deleteKidRecipe = functions.https.onCall(async (data, context) => {
    var _a;
    try {
        // Check authentication
        if (!context.auth || !context.auth.uid) {
            throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
        }
        const userId = context.auth.uid;
        const { kidRecipeId } = data;
        if (!kidRecipeId) {
            throw new functions.https.HttpsError('invalid-argument', 'Kid recipe ID is required');
        }
        // Get the kid recipe
        const kidRecipeRef = admin.firestore().collection('kidRecipes').doc(kidRecipeId);
        const kidRecipeDoc = await kidRecipeRef.get();
        if (!kidRecipeDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Kid recipe not found');
        }
        const kidRecipeData = kidRecipeDoc.data();
        // Verify the user owns this recipe (through the kid profile)
        const kidProfileRef = admin.firestore().collection('kidProfiles').doc(kidRecipeData === null || kidRecipeData === void 0 ? void 0 : kidRecipeData.kidId);
        const kidProfileDoc = await kidProfileRef.get();
        if (!kidProfileDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Kid profile not found');
        }
        const kidProfileData = kidProfileDoc.data();
        // Check if user owns the parent profile associated with this kid
        const parentProfileRef = admin.firestore().collection('parentProfiles').doc(kidProfileData === null || kidProfileData === void 0 ? void 0 : kidProfileData.parentId);
        const parentProfileDoc = await parentProfileRef.get();
        if (!parentProfileDoc.exists || ((_a = parentProfileDoc.data()) === null || _a === void 0 ? void 0 : _a.userId) !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'You do not have permission to delete this recipe');
        }
        // Start a batch operation to delete all related data
        const batch = admin.firestore().batch();
        // 1. Delete the main kid recipe
        batch.delete(kidRecipeRef);
        // 2. Delete associated ratings
        const ratingsQuery = await admin.firestore()
            .collection('kidRecipeRatings')
            .where('kidRecipeId', '==', kidRecipeId)
            .get();
        ratingsQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        // 3. Delete associated step reports
        const stepReportsQuery = await admin.firestore()
            .collection('stepReports')
            .where('kidRecipeId', '==', kidRecipeId)
            .get();
        stepReportsQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        // 4. Delete shared recipe entries using originalRecipeId and kidId
        if ((kidRecipeData === null || kidRecipeData === void 0 ? void 0 : kidRecipeData.originalRecipeId) && (kidRecipeData === null || kidRecipeData === void 0 ? void 0 : kidRecipeData.kidId)) {
            const sharedRecipesQuery = await admin.firestore()
                .collection('sharedRecipes')
                .where('parentRecipeId', '==', kidRecipeData.originalRecipeId)
                .where('kidId', '==', kidRecipeData.kidId)
                .get();
            sharedRecipesQuery.docs.forEach(doc => {
                batch.delete(doc.ref);
            });
        }
        // Also delete any entries that might reference the kidRecipeId directly (fallback)
        const directSharedRecipesQuery = await admin.firestore()
            .collection('sharedRecipes')
            .where('kidRecipeId', '==', kidRecipeId)
            .get();
        directSharedRecipesQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        // 5. Delete cooking sessions
        const cookingSessionsQuery = await admin.firestore()
            .collection('cookingSessions')
            .where('kidRecipeId', '==', kidRecipeId)
            .get();
        cookingSessionsQuery.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        // Execute the batch operation
        await batch.commit();
        console.log(`Successfully deleted kid recipe ${kidRecipeId} and all associated data`);
        return {
            success: true,
            message: 'Recipe successfully deleted'
        };
    }
    catch (error) {
        console.error('Error deleting kid recipe:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to delete recipe: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
});
// Global recipe cache functions
async function getRecipeFromCache(url) {
    try {
        const normalizedUrl = normalizeUrlForCache(url);
        const urlHash = hashString(normalizedUrl);
        const cacheRef = admin.firestore().collection('recipeCache').doc(urlHash);
        const doc = await cacheRef.get();
        if (doc.exists) {
            const data = doc.data();
            // Return cached recipe if it's less than 30 days old
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const createdAt = data.createdAt.toDate();
            if (createdAt > thirtyDaysAgo) {
                console.log('Using cached recipe from:', createdAt.toISOString());
                return {
                    title: data.title,
                    description: data.description,
                    image: data.image,
                    prepTime: data.prepTime,
                    cookTime: data.cookTime,
                    totalTime: data.totalTime,
                    servings: data.servings,
                    difficulty: data.difficulty,
                    ingredients: data.ingredients,
                    instructions: data.instructions,
                    sourceUrl: url,
                    tags: data.tags,
                };
            }
            else {
                console.log('Cached recipe is stale, will re-scrape');
            }
        }
        return null;
    }
    catch (error) {
        console.error('Error getting recipe from cache:', error);
        return null; // Fall back to scraping if cache fails
    }
}
async function saveRecipeToCache(url, recipe) {
    try {
        const normalizedUrl = normalizeUrlForCache(url);
        const urlHash = hashString(normalizedUrl);
        const cacheRef = admin.firestore().collection('recipeCache').doc(urlHash);
        const cacheEntry = {
            sourceUrl: url,
            normalizedUrl,
            title: recipe.title,
            description: recipe.description,
            image: recipe.image,
            prepTime: recipe.prepTime,
            cookTime: recipe.cookTime,
            totalTime: recipe.totalTime,
            servings: recipe.servings,
            difficulty: recipe.difficulty,
            ingredients: recipe.ingredients,
            instructions: recipe.instructions,
            tags: recipe.tags,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            provider: 'scrape',
        };
        await cacheRef.set(cacheEntry);
        console.log('Saved recipe to cache:', normalizedUrl);
    }
    catch (error) {
        console.error('Error saving recipe to cache:', error);
        // Don't throw error - cache failure shouldn't fail the import
    }
}
// Error reporting Cloud Function
exports.reportError = functions.https.onCall(async (data, context) => {
    var _a, _b, _c;
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
    }
    try {
        const { message, stack, severity = 'medium', screen, action, tags = [], deviceInfo, context: errorContext, customData } = data;
        if (!message || typeof message !== 'string') {
            throw new functions.https.HttpsError('invalid-argument', 'Error message is required');
        }
        const validSeverities = ['low', 'medium', 'high', 'critical'];
        if (!validSeverities.includes(severity)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid severity level');
        }
        const errorId = `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const errorReport = {
            userId: context.auth.uid,
            userEmail: context.auth.token.email || undefined,
            message: message.substring(0, 1000),
            stack: stack ? stack.substring(0, 5000) : undefined,
            severity,
            screen,
            action,
            tags: tags.slice(0, 10),
            deviceInfo: deviceInfo ? {
                platform: ((_a = deviceInfo.platform) === null || _a === void 0 ? void 0 : _a.substring(0, 50)) || 'unknown',
                appVersion: ((_b = deviceInfo.appVersion) === null || _b === void 0 ? void 0 : _b.substring(0, 20)) || 'unknown',
                osVersion: (_c = deviceInfo.osVersion) === null || _c === void 0 ? void 0 : _c.substring(0, 50)
            } : undefined,
            context: errorContext ? JSON.parse(JSON.stringify(errorContext)) : undefined,
            customData: customData ? JSON.parse(JSON.stringify(customData)) : undefined,
            createdAt: admin.firestore.Timestamp.now(),
            status: 'new'
        };
        // Remove any undefined values to prevent Firestore validation errors
        const cleanErrorReport = Object.fromEntries(Object.entries(errorReport).filter(([_, value]) => value !== undefined));
        await admin.firestore().collection('errorReports').doc(errorId).set(cleanErrorReport);
        console.log(`Error report saved: ${errorId}`, {
            userId: context.auth.uid,
            severity,
            screen,
            action,
            message: message.substring(0, 100)
        });
        // For high/critical errors, could add additional alerting here
        if (severity === 'critical') {
            console.warn(`CRITICAL ERROR REPORTED by ${context.auth.uid}:`, message);
        }
        return {
            success: true,
            errorId,
            message: 'Error report submitted successfully'
        };
    }
    catch (error) {
        console.error('Error submitting error report:', error);
        if (error instanceof functions.https.HttpsError) {
            throw error;
        }
        throw new functions.https.HttpsError('internal', 'Failed to submit error report');
    }
});
// Analytics Cloud Functions for Beta Testing
// Track user sessions for behavior analytics
exports.trackUserSession = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const { sessionId, startTime, endTime, screenViews, actions, deviceInfo, performance } = data;
        const sessionData = {
            userId: context.auth.uid,
            sessionId: sessionId || `session_${Date.now()}_${context.auth.uid}`,
            startTime: startTime ? admin.firestore.Timestamp.fromDate(new Date(startTime)) : admin.firestore.Timestamp.now(),
            endTime: endTime ? admin.firestore.Timestamp.fromDate(new Date(endTime)) : null,
            duration: endTime && startTime ? endTime - startTime : null,
            screenViews: screenViews || [],
            actions: actions || [],
            deviceInfo: deviceInfo || {},
            performance: performance || {},
            createdAt: admin.firestore.Timestamp.now(),
            status: 'active'
        };
        const sessionRef = await admin.firestore().collection('userSessions').add(sessionData);
        return {
            success: true,
            sessionId: sessionRef.id,
            message: 'Session tracked successfully'
        };
    }
    catch (error) {
        console.error('Error tracking user session:', error);
        throw new functions.https.HttpsError('internal', 'Failed to track user session');
    }
});
// Track performance metrics
exports.trackPerformanceMetrics = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const { metricType, value, screen, action, timestamp, deviceInfo, additionalData } = data;
        const performanceMetric = {
            userId: context.auth.uid,
            metricType: metricType,
            value: value,
            screen: screen || 'unknown',
            action: action || 'unknown',
            timestamp: timestamp ? admin.firestore.Timestamp.fromDate(new Date(timestamp)) : admin.firestore.Timestamp.now(),
            deviceInfo: deviceInfo || {},
            additionalData: additionalData || {},
            createdAt: admin.firestore.Timestamp.now()
        };
        const metricRef = await admin.firestore().collection('performanceMetrics').add(performanceMetric);
        return {
            success: true,
            metricId: metricRef.id,
            message: 'Performance metric tracked successfully'
        };
    }
    catch (error) {
        console.error('Error tracking performance metric:', error);
        throw new functions.https.HttpsError('internal', 'Failed to track performance metric');
    }
});
// Track feature usage
exports.trackFeatureUsage = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const { featureName, action, screen, timestamp, sessionId, metadata } = data;
        const featureUsage = {
            userId: context.auth.uid,
            featureName: featureName,
            action: action,
            screen: screen || 'unknown',
            timestamp: timestamp ? admin.firestore.Timestamp.fromDate(new Date(timestamp)) : admin.firestore.Timestamp.now(),
            sessionId: sessionId || 'unknown',
            metadata: metadata || {},
            createdAt: admin.firestore.Timestamp.now()
        };
        const usageRef = await admin.firestore().collection('featureUsage').add(featureUsage);
        return {
            success: true,
            usageId: usageRef.id,
            message: 'Feature usage tracked successfully'
        };
    }
    catch (error) {
        console.error('Error tracking feature usage:', error);
        throw new functions.https.HttpsError('internal', 'Failed to track feature usage');
    }
});
// Generic analytics event tracking
exports.trackAnalyticsEvent = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    try {
        const { eventType, eventName, properties, timestamp, sessionId, screen } = data;
        const analyticsEvent = {
            userId: context.auth.uid,
            eventType: eventType,
            eventName: eventName,
            properties: properties || {},
            timestamp: timestamp ? admin.firestore.Timestamp.fromDate(new Date(timestamp)) : admin.firestore.Timestamp.now(),
            sessionId: sessionId || 'unknown',
            screen: screen || 'unknown',
            createdAt: admin.firestore.Timestamp.now()
        };
        const eventRef = await admin.firestore().collection('analyticsEvents').add(analyticsEvent);
        return {
            success: true,
            eventId: eventRef.id,
            message: 'Analytics event tracked successfully'
        };
    }
    catch (error) {
        console.error('Error tracking analytics event:', error);
        throw new functions.https.HttpsError('internal', 'Failed to track analytics event');
    }
});
// Import the test harness
const scraperTestHarness_1 = require("./test/scraperTestHarness");
// Scraper test harness for bulk testing (admin only)
exports.testScraperHarness = functions.runWith({
    timeoutSeconds: 540,
    memory: '1GB'
}).https.onRequest(async (req, res) => {
    try {
        // This is an admin/development endpoint - add authentication check in production
        if (req.method !== 'GET') {
            res.status(405).json({ error: 'Method not allowed' });
            return;
        }
        console.log('Starting scraper test harness...');
        const testResults = await (0, scraperTestHarness_1.runScraperTests)();
        // Set proper headers for JSON response
        res.set('Content-Type', 'application/json');
        res.set('Cache-Control', 'no-cache');
        // Include timestamp in response
        const response = {
            timestamp: new Date().toISOString(),
            summary: testResults,
            recommendations: generateRecommendations(testResults)
        };
        res.status(200).json(response);
    }
    catch (error) {
        console.error('Error running scraper tests:', error);
        res.status(500).json({
            error: 'Test harness failed',
            message: error instanceof Error ? error.message : String(error)
        });
    }
});
// Generate recommendations based on test results
function generateRecommendations(results) {
    const recommendations = [];
    const successRate = (results.successfulExtractions / results.totalTests) * 100;
    if (successRate < 70) {
        recommendations.push('🔴 Success rate below 70% - consider adding more site-specific scrapers');
    }
    else if (successRate < 85) {
        recommendations.push('🟡 Success rate could be improved - review failed URLs and add targeted scrapers');
    }
    else {
        recommendations.push('✅ Good success rate - system performing well');
    }
    if (results.averageConfidence < 0.7) {
        recommendations.push('🔴 Low average confidence - improve validation and data quality checks');
    }
    else if (results.averageConfidence < 0.8) {
        recommendations.push('🟡 Moderate confidence - fine-tune confidence scoring algorithm');
    }
    if (results.averageProcessingTime > 5000) {
        recommendations.push('🟡 High processing time - consider optimizing extraction algorithms');
    }
    // Method-specific recommendations
    const jsonLdUsage = results.methodBreakdown['json-ld'] || 0;
    const totalTests = results.totalTests;
    if (jsonLdUsage / totalTests < 0.4) {
        recommendations.push('💡 Low JSON-LD usage - many sites may benefit from custom scrapers');
    }
    // Issue-specific recommendations
    const commonIssues = Object.keys(results.commonIssues || {});
    if (commonIssues.includes('Missing ingredients')) {
        recommendations.push('🔧 Ingredient extraction needs improvement - review CSS selectors');
    }
    if (commonIssues.includes('Missing instructions')) {
        recommendations.push('🔧 Instruction extraction needs improvement - enhance parsing logic');
    }
    if (recommendations.length === 0) {
        recommendations.push('🎉 System performing optimally - no major improvements needed');
    }
    return recommendations;
}
//# sourceMappingURL=index.js.map