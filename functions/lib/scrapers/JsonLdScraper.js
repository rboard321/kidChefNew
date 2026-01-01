"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonLdScraper = void 0;
const BaseScraper_1 = require("./BaseScraper");
const jsonLdNormalizer_1 = require("../services/jsonLdNormalizer");
class JsonLdScraper extends BaseScraper_1.BaseScraper {
    canHandle(hostname) {
        // This is a generic scraper that can handle any site with JSON-LD
        return true;
    }
    async scrape($, html) {
        try {
            const recipe = this.extractFromJsonLd($);
            if (!recipe) {
                return {
                    confidence: 0,
                    method: 'json-ld',
                    issues: ['No JSON-LD Recipe schema found']
                };
            }
            const issues = this.validateRecipe(recipe);
            const confidence = this.calculateConfidence(recipe, 'json-ld');
            // Add sourceUrl
            if (recipe) {
                recipe.sourceUrl = this.url;
            }
            return {
                recipe,
                confidence,
                method: 'json-ld',
                issues
            };
        }
        catch (error) {
            return {
                confidence: 0,
                method: 'json-ld',
                issues: [`JSON-LD parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`]
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
                    const recipe = this.findRecipeInJsonLd(data);
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
    findRecipeInJsonLd(data) {
        // Handle different JSON-LD structures
        if (Array.isArray(data)) {
            for (const item of data) {
                const recipe = this.findRecipeInJsonLd(item);
                if (recipe)
                    return recipe;
            }
            return null;
        }
        if (data['@type'] === 'Recipe') {
            // Apply site-specific normalizations before parsing
            const hostname = new URL(this.url).hostname.toLowerCase();
            const normalizationResult = jsonLdNormalizer_1.JsonLdNormalizer.normalize(data, hostname);
            if (normalizationResult.improved) {
                console.log(`JSON-LD: Applied normalizations for ${hostname}:`, normalizationResult.issues);
            }
            return this.parseJsonLdRecipe(normalizationResult.recipe);
        }
        // Handle nested structures
        if (data['@graph']) {
            return this.findRecipeInJsonLd(data['@graph']);
        }
        // Check if there's a Recipe inside other objects
        if (typeof data === 'object' && data !== null) {
            for (const key in data) {
                if (typeof data[key] === 'object') {
                    const recipe = this.findRecipeInJsonLd(data[key]);
                    if (recipe)
                        return recipe;
                }
            }
        }
        return null;
    }
    parseJsonLdRecipe(recipe) {
        // Enhanced error recovery - if parsing fails partially, still return what we can
        const safeExtract = (extractorFn, fallback, errorMsg) => {
            try {
                return extractorFn();
            }
            catch (error) {
                console.warn(`JSON-LD ${errorMsg}:`, error instanceof Error ? error.message : String(error));
                return fallback;
            }
        };
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
        const extractIngredients = (recipe) => {
            var _a, _b;
            // Try multiple common paths for ingredients
            const ingredientSources = [
                recipe.recipeIngredient,
                recipe.ingredients,
                recipe.recipeIngredients,
                recipe.ingredient,
                (_a = recipe.nutrition) === null || _a === void 0 ? void 0 : _a.ingredients,
                (_b = recipe.nutritionInfo) === null || _b === void 0 ? void 0 : _b.ingredients,
                recipe.recipeMaterial, // Some sites use this
            ];
            for (const source of ingredientSources) {
                if (source) {
                    const ingredients = extractArray(source);
                    if (ingredients.length > 0) {
                        console.log(`Found ${ingredients.length} ingredients using path: ${JSON.stringify(source).substring(0, 50)}`);
                        return ingredients;
                    }
                }
            }
            // If no ingredients found, try looking in nested objects
            if (typeof recipe === 'object' && recipe !== null) {
                for (const [key, value] of Object.entries(recipe)) {
                    if (key.toLowerCase().includes('ingredient') && value) {
                        const ingredients = extractArray(value);
                        if (ingredients.length > 0) {
                            console.log(`Found ${ingredients.length} ingredients in nested property: ${key}`);
                            return ingredients;
                        }
                    }
                }
            }
            console.warn('No ingredients found in any standard paths');
            return [];
        };
        const extractInstructions = (instructions) => {
            if (!instructions)
                return [];
            // Recursive function to extract text from ANY instruction format
            const processInstruction = (instruction) => {
                // Handle null/undefined
                if (!instruction)
                    return [];
                // Handle plain strings
                if (typeof instruction === 'string') {
                    return [this.cleanInstruction(instruction)];
                }
                // Handle arrays - flatten and process each item
                if (Array.isArray(instruction)) {
                    return instruction.flatMap(item => processInstruction(item));
                }
                // Handle objects
                if (typeof instruction === 'object' && instruction !== null) {
                    // Handle HowToStep objects (most common)
                    if (instruction['@type'] === 'HowToStep') {
                        const text = instruction.text || instruction.name || instruction.description || '';
                        if (text)
                            return [this.cleanInstruction(text)];
                    }
                    // Handle HowToSection with nested itemListElement
                    if (instruction['@type'] === 'HowToSection') {
                        if (instruction.itemListElement) {
                            return processInstruction(instruction.itemListElement);
                        }
                        if (instruction.hasStep) {
                            return processInstruction(instruction.hasStep);
                        }
                    }
                    // Handle ItemList structures
                    if (instruction['@type'] === 'ItemList' && instruction.itemListElement) {
                        return processInstruction(instruction.itemListElement);
                    }
                    // Handle direct itemListElement arrays (common in Food Network)
                    if (instruction.itemListElement) {
                        return processInstruction(instruction.itemListElement);
                    }
                    // Handle hasStep arrays (some sites)
                    if (instruction.hasStep) {
                        return processInstruction(instruction.hasStep);
                    }
                    // Handle position-based objects (some sites number their steps)
                    if (instruction.position && (instruction.text || instruction.name || instruction.description)) {
                        const text = instruction.text || instruction.name || instruction.description || '';
                        return [this.cleanInstruction(text)];
                    }
                    // Extract any text-containing properties as fallback
                    const textFields = ['text', 'name', 'description', 'instruction', 'step'];
                    for (const field of textFields) {
                        if (instruction[field] && typeof instruction[field] === 'string') {
                            return [this.cleanInstruction(instruction[field])];
                        }
                    }
                    // If it's an object with string values, try to extract them
                    if (Object.keys(instruction).length > 0) {
                        const textValues = Object.values(instruction)
                            .filter(value => typeof value === 'string' && value.length > 10)
                            .map(value => this.cleanInstruction(value));
                        if (textValues.length > 0)
                            return textValues;
                    }
                }
                return [];
            };
            // Start processing - handle both single instructions and arrays
            let result = processInstruction(instructions);
            // Clean up and validate results
            result = result
                .filter(step => step && step.length > 5) // Filter out very short steps
                .map(step => this.cleanInstruction(step))
                .filter(Boolean);
            // If we got nothing, try alternate paths in the instruction object
            if (result.length === 0 && typeof instructions === 'object') {
                // Try common alternate property names
                const alternateFields = ['steps', 'method', 'directions', 'preparation'];
                for (const field of alternateFields) {
                    if (instructions[field]) {
                        const alternate = processInstruction(instructions[field]);
                        if (alternate.length > 0) {
                            result = alternate;
                            break;
                        }
                    }
                }
            }
            return result;
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
                        return `${hours}h ${minutes}m`;
                    if (hours)
                        return `${hours}h`;
                    if (minutes)
                        return `${minutes}m`;
                }
                return this.extractTime(duration) || duration;
            }
            return extractText(duration);
        };
        const extractServings = (value) => {
            const text = extractText(value);
            return this.extractNumber(text);
        };
        // Use safe extraction with fallbacks to maximize data recovery
        return {
            title: safeExtract(() => extractText(recipe.name), '', 'title extraction failed'),
            description: safeExtract(() => extractText(recipe.description), undefined, 'description extraction failed'),
            image: safeExtract(() => { var _a; return extractText(((_a = recipe.image) === null || _a === void 0 ? void 0 : _a.url) || recipe.image); }, undefined, 'image extraction failed'),
            prepTime: safeExtract(() => extractTime(recipe.prepTime), undefined, 'prepTime extraction failed'),
            cookTime: safeExtract(() => extractTime(recipe.cookTime), undefined, 'cookTime extraction failed'),
            totalTime: safeExtract(() => extractTime(recipe.totalTime), undefined, 'totalTime extraction failed'),
            servings: safeExtract(() => extractServings(recipe.recipeYield || recipe.yield), undefined, 'servings extraction failed'),
            ingredients: safeExtract(() => extractIngredients(recipe), [], 'ingredients extraction failed'),
            instructions: safeExtract(() => extractInstructions(recipe.recipeInstructions), [], 'instructions extraction failed'),
            tags: safeExtract(() => extractArray(recipe.recipeCategory).concat(extractArray(recipe.recipeCuisine)), [], 'tags extraction failed'),
        };
    }
}
exports.JsonLdScraper = JsonLdScraper;
//# sourceMappingURL=JsonLdScraper.js.map