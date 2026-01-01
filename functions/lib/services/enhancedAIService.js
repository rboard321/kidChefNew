"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EnhancedAIService = void 0;
const openai_1 = require("openai");
const cheerio = require("cheerio");
const admin = require("firebase-admin");
const functions = require("firebase-functions");
class EnhancedAIService {
    constructor() {
        var _a;
        const apiKey = ((_a = functions.config().openai) === null || _a === void 0 ? void 0 : _a.api_key) || process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }
        this.openai = new openai_1.default({ apiKey });
    }
    async extractRecipeWithAI(url, html, options = {}) {
        const startTime = Date.now();
        // Check if we have cached AI result for this URL
        const cachedResult = await this.getAIResultFromCache(url);
        if (cachedResult) {
            return Object.assign(Object.assign({}, cachedResult), { processingTime: Date.now() - startTime });
        }
        // Progressive fallback strategy
        const fallbackLevel = options.fallbackLevel || 'detailed';
        let result;
        try {
            if (fallbackLevel === 'fast') {
                result = await this.fastAIExtraction(url, html, options);
            }
            else if (fallbackLevel === 'aggressive') {
                result = await this.aggressiveAIExtraction(url, html, options);
            }
            else {
                result = await this.detailedAIExtraction(url, html, options);
            }
            // Cache successful AI results
            if (result.confidence > 0.6) {
                await this.saveAIResultToCache(url, result);
            }
            result.processingTime = Date.now() - startTime;
            return result;
        }
        catch (error) {
            console.error('AI extraction failed:', error);
            // If all else fails, try a basic extraction
            if (fallbackLevel !== 'fast') {
                try {
                    const basicResult = await this.fastAIExtraction(url, html, options);
                    basicResult.processingTime = Date.now() - startTime;
                    return basicResult;
                }
                catch (basicError) {
                    console.error('Basic AI extraction also failed:', basicError);
                }
            }
            throw new Error(`AI extraction failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    async fastAIExtraction(url, html, options) {
        var _a;
        const $ = cheerio.load(html);
        // Extract just the essential content quickly
        const title = $('h1, .recipe-title, .entry-title').first().text().trim();
        const ingredientElements = $('.ingredient, .recipe-ingredient, .ingredients li').slice(0, 10);
        const instructionElements = $('.instruction, .recipe-instruction, .directions li, .instructions li').slice(0, 8);
        const ingredients = ingredientElements.map((_, el) => $(el).text().trim()).get().filter(Boolean);
        const instructions = instructionElements.map((_, el) => $(el).text().trim()).get().filter(Boolean);
        if (ingredients.length === 0 || instructions.length === 0) {
            // Use minimal AI extraction with focused prompt
            return await this.minimalAIExtraction(url, html, options);
        }
        return {
            recipe: {
                title: title || ((_a = options.hints) === null || _a === void 0 ? void 0 : _a.title) || 'Unknown Recipe',
                ingredients,
                instructions,
                sourceUrl: url
            },
            confidence: this.calculateQuickConfidence(title, ingredients, instructions),
            method: 'fast-extraction',
            processingTime: 0,
            tokensUsed: 0
        };
    }
    async detailedAIExtraction(url, html, options) {
        var _a;
        const $ = cheerio.load(html);
        // Smart content extraction
        const relevantText = this.extractRelevantContent($);
        const prompt = this.buildDetailedPrompt(url, relevantText, options.hints);
        const response = await this.callOpenAI(prompt, 'gpt-4o-mini', 3000);
        const parsed = this.parseAIResponse(response.content);
        return {
            recipe: Object.assign(Object.assign({}, parsed), { sourceUrl: url }),
            confidence: this.calculateAIConfidence(parsed, options),
            method: 'ai-detailed',
            processingTime: 0,
            tokensUsed: ((_a = response.usage) === null || _a === void 0 ? void 0 : _a.total_tokens) || 0
        };
    }
    async aggressiveAIExtraction(url, html, options) {
        var _a;
        const $ = cheerio.load(html);
        // Extract maximum content for complex pages
        const allText = $('body').text()
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 20000); // Larger content window
        const enhancedPrompt = this.buildAggressivePrompt(url, allText, options.hints);
        // Use GPT-4 for better understanding
        const response = await this.callOpenAI(enhancedPrompt, 'gpt-4o-mini', 4000);
        const parsed = this.parseAIResponse(response.content);
        // Try to enhance with additional content extraction
        const enhanced = await this.enhanceWithContentAnalysis($, parsed);
        return {
            recipe: Object.assign(Object.assign({}, enhanced), { sourceUrl: url }),
            confidence: this.calculateAIConfidence(enhanced, options),
            method: 'ai-aggressive',
            processingTime: 0,
            tokensUsed: ((_a = response.usage) === null || _a === void 0 ? void 0 : _a.total_tokens) || 0
        };
    }
    async minimalAIExtraction(url, html, options) {
        var _a, _b;
        const $ = cheerio.load(html);
        const title = $('title').text() || $('h1').first().text();
        const bodyText = $('body').text().replace(/\s+/g, ' ').slice(0, 5000);
        const prompt = `Extract a recipe from this text. Return JSON only:
{
  "title": "string",
  "ingredients": ["string array"],
  "instructions": ["string array"]
}

URL: ${url}
Title hint: ${((_a = options.hints) === null || _a === void 0 ? void 0 : _a.title) || title}
Content: ${bodyText}`;
        const response = await this.callOpenAI(prompt, 'gpt-4o-mini', 1500);
        const parsed = this.parseAIResponse(response.content);
        return {
            recipe: Object.assign(Object.assign({}, parsed), { sourceUrl: url }),
            confidence: 0.5,
            method: 'ai-minimal',
            processingTime: 0,
            tokensUsed: ((_b = response.usage) === null || _b === void 0 ? void 0 : _b.total_tokens) || 0
        };
    }
    extractRelevantContent($) {
        // Priority content extraction
        const contentSelectors = [
            'article',
            '.recipe',
            '.recipe-content',
            '.entry-content',
            '.post-content',
            'main',
            '.content'
        ];
        for (const selector of contentSelectors) {
            const element = $(selector);
            if (element.length > 0) {
                const text = element.text().replace(/\s+/g, ' ').trim();
                if (text.length > 500) {
                    return text.slice(0, 12000);
                }
            }
        }
        // Fallback to body content
        return $('body').text().replace(/\s+/g, ' ').trim().slice(0, 12000);
    }
    buildDetailedPrompt(url, content, hints) {
        return `You are an expert recipe extraction AI. Extract a complete recipe from this webpage content.

IMPORTANT: Return ONLY valid JSON in this exact format:
{
  "title": "string",
  "description": "string (optional)",
  "image": "string URL (optional)",
  "prepTime": "string like '15m' (optional)",
  "cookTime": "string like '30m' (optional)",
  "servings": number_or_null,
  "difficulty": "string (optional)",
  "ingredients": ["exact ingredient strings with measurements"],
  "instructions": ["clear step-by-step instructions"],
  "tags": ["cuisine type", "meal type", etc]
}

Guidelines:
- Extract ingredients with exact measurements (e.g., "2 cups flour", "1 tsp salt")
- Instructions should be clear, actionable steps
- Include preparation and cooking times if mentioned
- Extract serving size if specified
- Include relevant tags (cuisine, meal type, dietary restrictions)
- If information is missing, use empty string or null

URL: ${url}
${(hints === null || hints === void 0 ? void 0 : hints.title) ? `Title hint: ${hints.title}` : ''}

WEBPAGE CONTENT:
${content}`;
    }
    buildAggressivePrompt(url, content, hints) {
        return `You are analyzing a complex webpage to extract recipe information. This page may have ads, comments, and other non-recipe content mixed in.

Your task: Extract ONLY the recipe data from the noise.

CRITICAL: Return ONLY valid JSON in this format:
{
  "title": "string",
  "description": "string",
  "image": "string",
  "prepTime": "string",
  "cookTime": "string",
  "totalTime": "string",
  "servings": number,
  "difficulty": "string",
  "ingredients": ["string with measurements"],
  "instructions": ["detailed step strings"],
  "tags": ["string array"]
}

EXTRACTION RULES:
1. Ingredients must include measurements (cups, tsp, lbs, etc.)
2. Instructions must be actionable steps in cooking order
3. Ignore advertisements, user comments, nutritional facts
4. Focus only on the main recipe content
5. If multiple recipes exist, extract the primary/featured one
6. Time formats: "15m", "1h 30m", "2 hours", etc.

URL: ${url}
${(hints === null || hints === void 0 ? void 0 : hints.title) ? `Expected title: ${hints.title}` : ''}

FULL PAGE CONTENT:
${content}`;
    }
    async callOpenAI(prompt, model, maxTokens) {
        var _a, _b;
        const response = await Promise.race([
            this.openai.chat.completions.create({
                model,
                messages: [
                    { role: 'system', content: 'You are a recipe extraction expert. Return only valid JSON.' },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: maxTokens,
                response_format: { type: 'json_object' } // Ensure JSON response
            }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('OpenAI timeout')), 90000))
        ]);
        return {
            content: ((_b = (_a = response.choices[0]) === null || _a === void 0 ? void 0 : _a.message) === null || _b === void 0 ? void 0 : _b.content) || '',
            usage: response.usage
        };
    }
    parseAIResponse(content) {
        try {
            const cleaned = content.replace(/```json\n?/g, '').replace(/\n?```/g, '').trim();
            return JSON.parse(cleaned);
        }
        catch (error) {
            console.error('Failed to parse AI response:', content);
            throw new Error('Invalid JSON response from AI');
        }
    }
    async enhanceWithContentAnalysis($, baseRecipe) {
        // Try to find missing image
        if (!baseRecipe.image) {
            const ogImage = $('meta[property="og:image"]').attr('content');
            const twitterImage = $('meta[name="twitter:image"]').attr('content');
            const recipeImage = $('.recipe-image img, .featured-image img').first().attr('src');
            baseRecipe.image = ogImage || twitterImage || recipeImage || null;
        }
        // Try to find missing metadata
        if (!baseRecipe.prepTime) {
            const prepTimeText = $('.prep-time, .recipe-prep-time, [class*="prep"]').text();
            const prepMatch = prepTimeText.match(/(\d+)\s*(?:min|minute|hour|hr)/i);
            if (prepMatch) {
                baseRecipe.prepTime = prepMatch[0];
            }
        }
        return baseRecipe;
    }
    calculateQuickConfidence(title, ingredients, instructions) {
        let confidence = 0.4; // Base for quick extraction
        if (title && title.length > 5)
            confidence += 0.2;
        if (ingredients.length > 3)
            confidence += 0.2;
        if (instructions.length > 2)
            confidence += 0.2;
        return Math.min(confidence, 0.85); // Cap quick extraction confidence
    }
    calculateAIConfidence(recipe, options) {
        let confidence = 0.7; // Base AI confidence
        if (recipe.title && recipe.title.length > 5)
            confidence += 0.1;
        if (recipe.ingredients && recipe.ingredients.length > 0)
            confidence += 0.1;
        if (recipe.instructions && recipe.instructions.length > 0)
            confidence += 0.1;
        if (recipe.image)
            confidence += 0.05;
        if (recipe.prepTime || recipe.cookTime)
            confidence += 0.03;
        if (recipe.servings)
            confidence += 0.02;
        return Math.min(confidence, 0.95);
    }
    async getAIResultFromCache(url) {
        try {
            const urlHash = this.hashString(url);
            const cacheRef = admin.firestore().collection('aiExtractionCache').doc(urlHash);
            const doc = await cacheRef.get();
            if (doc.exists) {
                const data = doc.data();
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
                const createdAt = data.createdAt.toDate();
                if (createdAt > sevenDaysAgo) {
                    return data;
                }
            }
            return null;
        }
        catch (error) {
            console.error('Error getting AI result from cache:', error);
            return null;
        }
    }
    async saveAIResultToCache(url, result) {
        try {
            const urlHash = this.hashString(url);
            const cacheRef = admin.firestore().collection('aiExtractionCache').doc(urlHash);
            await cacheRef.set(Object.assign(Object.assign({}, result), { url, createdAt: admin.firestore.Timestamp.now() }));
        }
        catch (error) {
            console.error('Error saving AI result to cache:', error);
        }
    }
    hashString(input) {
        let hash = 0;
        for (let i = 0; i < input.length; i += 1) {
            hash = ((hash << 5) + hash) + input.charCodeAt(i);
            hash >>>= 0;
        }
        return hash.toString(36);
    }
}
exports.EnhancedAIService = EnhancedAIService;
//# sourceMappingURL=enhancedAIService.js.map