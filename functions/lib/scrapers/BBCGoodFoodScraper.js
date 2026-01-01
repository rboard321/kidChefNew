"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BBCGoodFoodScraper = void 0;
const BaseScraper_1 = require("./BaseScraper");
class BBCGoodFoodScraper extends BaseScraper_1.BaseScraper {
    canHandle(hostname) {
        return hostname.includes('bbcgoodfood.com');
    }
    async scrape($, html) {
        try {
            // BBC Good Food typically has good JSON-LD, try that first
            let recipe = this.extractFromJsonLd($);
            let method = 'json-ld';
            // If JSON-LD fails, use BBC-specific selectors
            if (!recipe || !recipe.title) {
                recipe = this.extractFromSelectors($);
                method = 'site-specific';
            }
            if (!recipe) {
                return {
                    confidence: 0,
                    method,
                    issues: ['No recipe found using BBC Good Food extractors']
                };
            }
            const issues = this.validateRecipe(recipe);
            const confidence = this.calculateConfidence(recipe, method);
            if (recipe) {
                recipe.sourceUrl = this.url;
                if (!recipe.tags)
                    recipe.tags = [];
                recipe.tags.push('BBC Good Food');
            }
            return {
                recipe,
                confidence: Math.min(confidence + 0.03, 1.0),
                method,
                issues
            };
        }
        catch (error) {
            return {
                confidence: 0,
                method: 'site-specific',
                issues: [`BBC Good Food parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
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
                    const recipe = this.findRecipeInData(data);
                    if (recipe)
                        return this.parseJsonLdRecipe(recipe);
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
    findRecipeInData(data) {
        if (!data)
            return null;
        if (data['@type'] === 'Recipe') {
            return data;
        }
        if (Array.isArray(data)) {
            for (const item of data) {
                const recipe = this.findRecipeInData(item);
                if (recipe)
                    return recipe;
            }
        }
        if (typeof data === 'object') {
            // BBC often nests recipes in webpage or other structures
            for (const key in data) {
                if (typeof data[key] === 'object') {
                    const recipe = this.findRecipeInData(data[key]);
                    if (recipe)
                        return recipe;
                }
            }
        }
        return null;
    }
    extractFromSelectors($) {
        try {
            // BBC Good Food specific selectors (updated for their current structure)
            const title = this.extractText($('h1.gel-trafalgar, ' +
                '.recipe-header__title, ' +
                '.post-header__title, ' +
                '.recipe-details__header h1, ' +
                '.recipe-title, ' +
                'h1').first());
            if (!title)
                return null;
            const description = this.extractText($('.recipe-header__description, ' +
                '.post-header__description, ' +
                '.recipe-details__summary, ' +
                '.recipe-summary, ' +
                '.gel-pica').first());
            // BBC Good Food image extraction
            const imageElement = $('.recipe-media__image img, ' +
                '.post-header__image img, ' +
                '.recipe-details__image img, ' +
                '.lead-image img, ' +
                '.recipe-image img').first();
            const image = imageElement.attr('src') || imageElement.attr('data-src') || imageElement.attr('data-lazy-src');
            // BBC ingredients - they use specific list structures
            const ingredientElements = $('.recipe-ingredients__list li, ' +
                '.ingredients-list li, ' +
                '.recipe-details__ingredients li, ' +
                '.ingredients li, ' +
                'section[data-tracking-name="ingredients"] li, ' +
                '.recipe-ingredients li');
            const ingredients = this.extractArray(ingredientElements);
            // BBC instructions - often in numbered sections
            const instructionElements = $('.recipe-method__list li, ' +
                '.method-list li, ' +
                '.recipe-details__method li, ' +
                '.method li, ' +
                'section[data-tracking-name="method"] li, ' +
                '.recipe-method li, ' +
                '.recipe-instructions li');
            const instructions = this.extractArray(instructionElements)
                .map(instruction => this.cleanInstruction(instruction));
            // BBC timing information
            const prepTimeText = this.extractText($('.recipe-details__cooking-time-prep, ' +
                '.recipe-cooking-time .prep-time, ' +
                '.recipe-details__item:contains("Prep"), ' +
                '.recipe-time--prep').first());
            const cookTimeText = this.extractText($('.recipe-details__cooking-time-cook, ' +
                '.recipe-cooking-time .cook-time, ' +
                '.recipe-details__item:contains("Cook"), ' +
                '.recipe-time--cook').first());
            const totalTimeText = this.extractText($('.recipe-details__cooking-time-total, ' +
                '.recipe-cooking-time .total-time, ' +
                '.recipe-details__item:contains("Total"), ' +
                '.recipe-time--total').first());
            const prepTime = this.extractTime(prepTimeText) || undefined;
            const cookTime = this.extractTime(cookTimeText) || undefined;
            const totalTime = this.extractTime(totalTimeText) || undefined;
            // Servings information
            const servingsText = this.extractText($('.recipe-details__serves, ' +
                '.recipe-serves, ' +
                '.recipe-details__item:contains("Serves"), ' +
                '.serves, ' +
                '.recipe-yield').first());
            const servings = this.extractNumber(servingsText);
            // Difficulty if available
            const difficultyText = this.extractText($('.recipe-details__skill-level, ' +
                '.recipe-difficulty, ' +
                '.recipe-details__item:contains("Difficulty"), ' +
                '.skill-level').first());
            return {
                title,
                description: description || undefined,
                image: image || undefined,
                prepTime,
                cookTime,
                totalTime,
                servings,
                difficulty: difficultyText || undefined,
                ingredients,
                instructions,
                tags: ['BBC Good Food']
            };
        }
        catch (error) {
            console.error('Error in BBC Good Food selector extraction:', error);
            return null;
        }
    }
    parseJsonLdRecipe(recipe) {
        var _a;
        try {
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
                        if (instruction['@type'] === 'HowToStep') {
                            return this.cleanInstruction(instruction.text || instruction.name || instruction.description || '');
                        }
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
            console.error('Error parsing BBC Good Food JSON-LD:', error);
            return null;
        }
    }
}
exports.BBCGoodFoodScraper = BBCGoodFoodScraper;
//# sourceMappingURL=BBCGoodFoodScraper.js.map