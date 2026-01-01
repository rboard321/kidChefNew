"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EpicuriousScraper = void 0;
const BaseScraper_1 = require("./BaseScraper");
const jsonLdNormalizer_1 = require("../services/jsonLdNormalizer");
class EpicuriousScraper extends BaseScraper_1.BaseScraper {
    canHandle(hostname) {
        return hostname.includes('epicurious.com');
    }
    async scrape($, html) {
        try {
            // First try JSON-LD (Epicurious usually has this)
            let recipe = this.extractFromJsonLd($);
            let method = 'json-ld';
            // If JSON-LD fails, use site-specific selectors
            if (!recipe || !recipe.title) {
                recipe = this.extractFromSelectors($);
                method = 'site-specific';
            }
            if (!recipe) {
                return {
                    confidence: 0,
                    method,
                    issues: ['No recipe found using Epicurious extractors']
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
        }
        catch (error) {
            return {
                confidence: 0,
                method: 'site-specific',
                issues: [`Epicurious parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
            };
        }
    }
    extractFromJsonLd($) {
        try {
            const jsonLdScripts = $('script[type="application/ld+json"]');
            for (let i = 0; i < jsonLdScripts.length; i++) {
                const scriptContent = $(jsonLdScripts[i]).html();
                if (!scriptContent)
                    continue;
                try {
                    const data = JSON.parse(scriptContent);
                    // Handle arrays first
                    let recipeData = data;
                    if (Array.isArray(data)) {
                        recipeData = data.find(item => item['@type'] === 'Recipe');
                        if (!recipeData)
                            continue;
                    }
                    if (recipeData['@type'] === 'Recipe') {
                        // Apply Epicurious specific normalizations before parsing
                        const hostname = new URL(this.url).hostname.toLowerCase();
                        const normalizationResult = jsonLdNormalizer_1.JsonLdNormalizer.normalize(recipeData, hostname);
                        if (normalizationResult.improved) {
                            console.log(`Epicurious: Applied normalizations:`, normalizationResult.issues);
                        }
                        return this.parseJsonLdRecipe(normalizationResult.recipe);
                    }
                }
                catch (parseError) {
                    continue;
                }
            }
            return null;
        }
        catch (error) {
            return null;
        }
    }
    extractFromSelectors($) {
        try {
            // Epicurious specific CSS selectors (2024-2025)
            const title = this.extractText($('h1[data-testid="ContentHeaderHed"], ' +
                'h1.recipe-hed, ' +
                'h1.content-hed, ' +
                '.recipe-header h1, ' +
                'h1').first());
            if (!title) {
                console.log('Epicurious: No title found with any selector');
                return null;
            }
            console.log(`Epicurious: Found title: ${title.substring(0, 50)}...`);
            const description = this.extractText($('[data-testid="ContentHeaderDek"], ' +
                '.recipe-summary, ' +
                '.content-dek, ' +
                '.recipe-description').first());
            // Enhanced image extraction for Epicurious
            const imageElement = $('[data-testid="ContentHeaderLeadAsset"] img, ' +
                '.recipe-lead-image img, ' +
                '.content-header-image img, ' +
                '.lead-image img, ' +
                '.recipe-image img').first();
            const image = imageElement.attr('src') ||
                imageElement.attr('data-src') ||
                imageElement.attr('data-lazy-src');
            // Enhanced ingredient extraction for Epicurious
            const ingredientElements = $('[data-testid="IngredientList"] li, ' +
                '.recipe-ingredients li, ' +
                '.ingredients li, ' +
                '.ingredient-list li, ' +
                '.recipe-ingredient');
            const ingredients = this.extractArray(ingredientElements);
            console.log(`Epicurious: Found ${ingredients.length} ingredients`);
            // Extract instructions - Epicurious specific structures
            const instructionElements = $('[data-testid="InstructionsWrapper"] li, ' +
                '[data-testid="InstructionWrapper"] p, ' +
                '.recipe-instructions li, ' +
                '.recipe-method li, ' +
                '.instructions li, ' +
                '.preparation-list li');
            const instructions = this.extractArray(instructionElements)
                .map(instruction => this.cleanInstruction(instruction));
            console.log(`Epicurious: Found ${instructions.length} instructions`);
            // Extract metadata
            const prepTimeElement = $('.prep-time, .recipe-prep-time, [data-testid="PrepTime"]');
            const cookTimeElement = $('.cook-time, .recipe-cook-time, [data-testid="CookTime"]');
            const totalTimeElement = $('.total-time, .recipe-total-time, [data-testid="TotalTime"]');
            const prepTime = this.extractTime(this.extractText(prepTimeElement)) || undefined;
            const cookTime = this.extractTime(this.extractText(cookTimeElement)) || undefined;
            const totalTime = this.extractTime(this.extractText(totalTimeElement)) || undefined;
            // Extract servings/yield
            const servingsElement = $('.servings, .recipe-serves, .yield, [data-testid="Servings"]');
            const servings = this.extractNumber(this.extractText(servingsElement));
            // Extract tags from category elements
            const tagElements = $('.recipe-tags a, .tags a, .categories a');
            const tags = this.extractArray(tagElements);
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
                tags: tags.length > 0 ? tags : ['Epicurious']
            };
        }
        catch (error) {
            console.error('Error in Epicurious selector extraction:', error);
            return null;
        }
    }
    parseJsonLdRecipe(data) {
        var _a;
        try {
            let recipe = data;
            // Handle arrays
            if (Array.isArray(data)) {
                recipe = data.find(item => item['@type'] === 'Recipe');
                if (!recipe)
                    return null;
            }
            if (recipe['@type'] !== 'Recipe')
                return null;
            const extractText = (value) => {
                if (typeof value === 'string')
                    return value;
                if (value && typeof value === 'object') {
                    return value.text || value.name || value['@value'] || String(value);
                }
                return String(value || '');
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
                    if (typeof instruction === 'string') {
                        return this.cleanInstruction(instruction);
                    }
                    if (typeof instruction === 'object' && instruction !== null) {
                        // Handle HowToStep objects
                        if (instruction['@type'] === 'HowToStep') {
                            return this.cleanInstruction(instruction.text || instruction.name || instruction.description || '');
                        }
                        // Extract text from any text-containing property
                        const textValue = instruction.text || instruction.name || instruction.description || '';
                        return this.cleanInstruction(extractText(textValue));
                    }
                    return '';
                };
                if (Array.isArray(instructions)) {
                    return instructions.map(processInstruction).filter(Boolean);
                }
                else {
                    const processed = processInstruction(instructions);
                    return processed ? [processed] : [];
                }
            };
            return {
                title: extractText(recipe.name),
                description: extractText(recipe.description),
                image: extractText(((_a = recipe.image) === null || _a === void 0 ? void 0 : _a.url) || recipe.image),
                prepTime: extractText(recipe.prepTime),
                cookTime: extractText(recipe.cookTime),
                totalTime: extractText(recipe.totalTime),
                servings: this.extractNumber(extractText(recipe.recipeYield || recipe.yield)),
                ingredients: extractArray(recipe.recipeIngredient),
                instructions: extractInstructions(recipe.recipeInstructions),
                tags: extractArray(recipe.recipeCategory).concat(extractArray(recipe.recipeCuisine))
            };
        }
        catch (error) {
            console.error('Error parsing Epicurious JSON-LD:', error);
            return null;
        }
    }
}
exports.EpicuriousScraper = EpicuriousScraper;
//# sourceMappingURL=EpicuriousScraper.js.map