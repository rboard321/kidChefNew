"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JsonLdNormalizer = void 0;
class JsonLdNormalizer {
    /**
     * Normalize JSON-LD recipe data based on the source hostname
     */
    static normalize(jsonLdData, hostname) {
        const issues = [];
        let improved = false;
        let recipe = Object.assign({}, jsonLdData);
        console.log(`JSON-LD Normalizer: Processing ${hostname}`);
        try {
            // Apply site-specific normalizations
            if (hostname.includes('foodnetwork.com')) {
                const result = this.normalizeFoodNetwork(recipe);
                recipe = result.recipe;
                improved = result.improved;
                issues.push(...result.issues);
            }
            else if (hostname.includes('bbcgoodfood.com')) {
                const result = this.normalizeBBCGoodFood(recipe);
                recipe = result.recipe;
                improved = result.improved;
                issues.push(...result.issues);
            }
            else if (hostname.includes('simplyrecipes.com')) {
                const result = this.normalizeSimplyRecipes(recipe);
                recipe = result.recipe;
                improved = result.improved;
                issues.push(...result.issues);
            }
            else if (hostname.includes('food52.com')) {
                const result = this.normalizeFood52(recipe);
                recipe = result.recipe;
                improved = result.improved;
                issues.push(...result.issues);
            }
            // Apply generic normalizations that help all sites
            const genericResult = this.normalizeGeneric(recipe);
            if (genericResult.improved) {
                recipe = genericResult.recipe;
                improved = true;
                issues.push(...genericResult.issues);
            }
            if (improved) {
                console.log(`JSON-LD Normalizer: Applied improvements for ${hostname}`);
            }
            return { recipe, improved, issues };
        }
        catch (error) {
            console.error(`JSON-LD Normalizer error for ${hostname}:`, error);
            return {
                recipe: jsonLdData,
                improved: false,
                issues: [`Normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
            };
        }
    }
    /**
     * Food Network specific normalizations
     * Common issues: Instructions split across HowToSection objects
     */
    static normalizeFoodNetwork(recipe) {
        const issues = [];
        let improved = false;
        try {
            // Food Network often wraps instructions in HowToSection with itemListElement
            if (recipe.recipeInstructions && Array.isArray(recipe.recipeInstructions)) {
                const normalizedInstructions = [];
                for (const instruction of recipe.recipeInstructions) {
                    if (instruction['@type'] === 'HowToSection') {
                        // Extract steps from HowToSection
                        if (instruction.itemListElement) {
                            const steps = Array.isArray(instruction.itemListElement)
                                ? instruction.itemListElement
                                : [instruction.itemListElement];
                            for (const step of steps) {
                                if (step['@type'] === 'HowToStep') {
                                    normalizedInstructions.push(step);
                                    improved = true;
                                }
                            }
                        }
                        // Also check for hasStep property
                        else if (instruction.hasStep) {
                            const steps = Array.isArray(instruction.hasStep)
                                ? instruction.hasStep
                                : [instruction.hasStep];
                            normalizedInstructions.push(...steps);
                            improved = true;
                        }
                    }
                    else {
                        // Keep non-HowToSection instructions as-is
                        normalizedInstructions.push(instruction);
                    }
                }
                if (improved) {
                    recipe.recipeInstructions = normalizedInstructions;
                    issues.push('Normalized Food Network HowToSection instructions');
                }
            }
            // Food Network sometimes nests ingredients in complex structures
            if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
                const normalizedIngredients = recipe.recipeIngredient.map((ingredient) => {
                    if (typeof ingredient === 'object' && ingredient.text) {
                        improved = true;
                        return ingredient.text;
                    }
                    return ingredient;
                });
                if (improved) {
                    recipe.recipeIngredient = normalizedIngredients;
                    issues.push('Normalized Food Network ingredient objects');
                }
            }
        }
        catch (error) {
            issues.push(`Food Network normalization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return { recipe, improved, issues };
    }
    /**
     * BBC Good Food specific normalizations
     * Common issues: Nested itemListElement structures, UK formatting
     */
    static normalizeBBCGoodFood(recipe) {
        const issues = [];
        let improved = false;
        try {
            // BBC often uses deeply nested itemListElement structures
            if (recipe.recipeInstructions && typeof recipe.recipeInstructions === 'object') {
                if (recipe.recipeInstructions['@type'] === 'ItemList' && recipe.recipeInstructions.itemListElement) {
                    recipe.recipeInstructions = recipe.recipeInstructions.itemListElement;
                    improved = true;
                    issues.push('Flattened BBC Good Food ItemList instructions');
                }
            }
            // BBC sometimes has multiple ingredient lists
            if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
                const flattenedIngredients = [];
                for (const ingredient of recipe.recipeIngredient) {
                    if (typeof ingredient === 'object' && ingredient.itemListElement) {
                        // Flatten nested ingredient lists
                        const nestedIngredients = Array.isArray(ingredient.itemListElement)
                            ? ingredient.itemListElement
                            : [ingredient.itemListElement];
                        for (const nested of nestedIngredients) {
                            flattenedIngredients.push(typeof nested === 'string' ? nested : nested.text || nested.name || String(nested));
                        }
                        improved = true;
                    }
                    else {
                        flattenedIngredients.push(typeof ingredient === 'string' ? ingredient : ingredient.text || ingredient.name || String(ingredient));
                    }
                }
                if (improved) {
                    recipe.recipeIngredient = flattenedIngredients;
                    issues.push('Flattened BBC Good Food nested ingredients');
                }
            }
            // Normalize UK measurements and terminology
            if (recipe.recipeIngredient) {
                const ukNormalizations = {
                    'caster sugar': 'superfine sugar',
                    'plain flour': 'all-purpose flour',
                    'self-raising flour': 'self-rising flour',
                    'bicarbonate of soda': 'baking soda',
                    'cornflour': 'cornstarch'
                };
                recipe.recipeIngredient = recipe.recipeIngredient.map((ingredient) => {
                    let normalized = ingredient;
                    for (const [uk, us] of Object.entries(ukNormalizations)) {
                        if (normalized.toLowerCase().includes(uk)) {
                            normalized = normalized.replace(new RegExp(uk, 'gi'), us);
                            improved = true;
                        }
                    }
                    return normalized;
                });
                if (improved) {
                    issues.push('Normalized UK ingredients to US equivalents');
                }
            }
        }
        catch (error) {
            issues.push(`BBC Good Food normalization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return { recipe, improved, issues };
    }
    /**
     * Simply Recipes specific normalizations
     * Common issues: Extra "tips" mixed with instructions, verbose formatting
     */
    static normalizeSimplyRecipes(recipe) {
        const issues = [];
        let improved = false;
        try {
            // Simply Recipes often includes tips and notes mixed with instructions
            if (recipe.recipeInstructions && Array.isArray(recipe.recipeInstructions)) {
                const cleanedInstructions = recipe.recipeInstructions.filter((instruction) => {
                    const text = typeof instruction === 'string' ? instruction : instruction.text || instruction.name || '';
                    // Filter out common tip patterns
                    const tipPatterns = [
                        /^tip:/i,
                        /^note:/i,
                        /^chef's note:/i,
                        /^variation:/i,
                        /^storage:/i,
                        /^make ahead:/i
                    ];
                    const isTip = tipPatterns.some(pattern => pattern.test(text));
                    if (isTip) {
                        improved = true;
                        return false;
                    }
                    return true;
                });
                if (improved) {
                    recipe.recipeInstructions = cleanedInstructions;
                    issues.push('Removed Simply Recipes tips from instructions');
                }
            }
            // Clean up verbose ingredient descriptions
            if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
                const cleanedIngredients = recipe.recipeIngredient.map((ingredient) => {
                    // Remove common Simply Recipes verbosity
                    let cleaned = ingredient
                        .replace(/,\s*such as\s+[^,]+/gi, '') // Remove "such as" examples
                        .replace(/\s*\([^)]*see note[^)]*\)/gi, '') // Remove note references
                        .replace(/,\s*or to taste/gi, '') // Remove "or to taste"
                        .replace(/,\s*more as needed/gi, ''); // Remove "more as needed"
                    if (cleaned !== ingredient) {
                        improved = true;
                    }
                    return cleaned;
                });
                if (improved) {
                    recipe.recipeIngredient = cleanedIngredients;
                    issues.push('Cleaned Simply Recipes verbose ingredients');
                }
            }
        }
        catch (error) {
            issues.push(`Simply Recipes normalization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return { recipe, improved, issues };
    }
    /**
     * Food52 specific normalizations
     * Common issues: Community formatting variations, author notes
     */
    static normalizeFood52(recipe) {
        const issues = [];
        let improved = false;
        try {
            // Food52 community recipes often have personal notes mixed in
            if (recipe.recipeInstructions && Array.isArray(recipe.recipeInstructions)) {
                const cleanedInstructions = recipe.recipeInstructions.map((instruction) => {
                    let text = typeof instruction === 'string' ? instruction : instruction.text || instruction.name || '';
                    // Remove common Food52 community patterns
                    const cleanupPatterns = [
                        /\(this is what I do\)/gi,
                        /\(my preference\)/gi,
                        /\(optional, but recommended\)/gi,
                        /\(trust me on this\)/gi,
                        /\(learned this the hard way\)/gi
                    ];
                    const originalText = text;
                    cleanupPatterns.forEach(pattern => {
                        text = text.replace(pattern, '').trim();
                    });
                    if (text !== originalText) {
                        improved = true;
                    }
                    return typeof instruction === 'string' ? text : Object.assign(Object.assign({}, instruction), { text });
                });
                if (improved) {
                    recipe.recipeInstructions = cleanedInstructions;
                    issues.push('Cleaned Food52 community notes from instructions');
                }
            }
            // Food52 sometimes has inconsistent ingredient formatting
            if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
                const normalizedIngredients = recipe.recipeIngredient.map((ingredient) => {
                    // Normalize Food52 measurement inconsistencies
                    let normalized = ingredient
                        .replace(/\s+/g, ' ') // Multiple spaces to single space
                        .replace(/(\d+)\s*-\s*(\d+)/g, '$1-$2') // Normalize ranges
                        .trim();
                    if (normalized !== ingredient) {
                        improved = true;
                    }
                    return normalized;
                });
                if (improved) {
                    recipe.recipeIngredient = normalizedIngredients;
                    issues.push('Normalized Food52 ingredient formatting');
                }
            }
        }
        catch (error) {
            issues.push(`Food52 normalization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return { recipe, improved, issues };
    }
    /**
     * Generic normalizations that benefit all sites
     */
    static normalizeGeneric(recipe) {
        const issues = [];
        let improved = false;
        try {
            // Clean up empty or null instructions
            if (recipe.recipeInstructions && Array.isArray(recipe.recipeInstructions)) {
                const originalLength = recipe.recipeInstructions.length;
                recipe.recipeInstructions = recipe.recipeInstructions.filter((instruction) => {
                    const text = typeof instruction === 'string' ? instruction : instruction.text || instruction.name || '';
                    return text && text.trim().length > 0;
                });
                if (recipe.recipeInstructions.length < originalLength) {
                    improved = true;
                    issues.push('Removed empty instructions');
                }
            }
            // Clean up empty ingredients
            if (recipe.recipeIngredient && Array.isArray(recipe.recipeIngredient)) {
                const originalLength = recipe.recipeIngredient.length;
                recipe.recipeIngredient = recipe.recipeIngredient.filter((ingredient) => {
                    return ingredient && ingredient.trim().length > 0;
                });
                if (recipe.recipeIngredient.length < originalLength) {
                    improved = true;
                    issues.push('Removed empty ingredients');
                }
            }
            // Normalize common time formats
            ['prepTime', 'cookTime', 'totalTime'].forEach(timeField => {
                if (recipe[timeField] && typeof recipe[timeField] === 'string') {
                    const normalized = this.normalizeTimeString(recipe[timeField]);
                    if (normalized !== recipe[timeField]) {
                        recipe[timeField] = normalized;
                        improved = true;
                    }
                }
            });
        }
        catch (error) {
            issues.push(`Generic normalization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        return { recipe, improved, issues };
    }
    /**
     * Normalize time strings to consistent format
     */
    static normalizeTimeString(timeStr) {
        // Convert various time formats to ISO 8601 duration format
        const patterns = [
            { regex: /(\d+)\s*hours?\s*(\d+)\s*minutes?/i, format: (h, m) => `PT${h}H${m}M` },
            { regex: /(\d+)\s*hrs?\s*(\d+)\s*mins?/i, format: (h, m) => `PT${h}H${m}M` },
            { regex: /(\d+)\s*hours?/i, format: (h) => `PT${h}H` },
            { regex: /(\d+)\s*hrs?/i, format: (h) => `PT${h}H` },
            { regex: /(\d+)\s*minutes?/i, format: (m) => `PT${m}M` },
            { regex: /(\d+)\s*mins?/i, format: (m) => `PT${m}M` }
        ];
        for (const pattern of patterns) {
            const match = timeStr.match(pattern.regex);
            if (match) {
                return pattern.format.apply(null, match.slice(1));
            }
        }
        return timeStr; // Return original if no pattern matches
    }
}
exports.JsonLdNormalizer = JsonLdNormalizer;
//# sourceMappingURL=jsonLdNormalizer.js.map