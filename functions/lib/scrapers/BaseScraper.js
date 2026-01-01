"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseScraper = void 0;
const cheerio = require("cheerio");
class BaseScraper {
    constructor(url) {
        this.url = url;
        this.hostname = new URL(url).hostname.toLowerCase();
    }
    // Common utility methods for all scrapers
    extractText(element) {
        return element.text().trim().replace(/\s+/g, ' ');
    }
    extractArray(elements) {
        return elements.map((_, el) => this.extractText(cheerio.load(el)(el))).get().filter(Boolean);
    }
    cleanInstruction(instruction) {
        return instruction
            .replace(/^\d+\.\s*/, '') // Remove step numbers
            .replace(/^Step\s+\d+:?\s*/i, '') // Remove "Step X:"
            .trim();
    }
    extractNumber(text) {
        const match = text.match(/(\d+(?:\.\d+)?)/);
        return match ? parseFloat(match[1]) : undefined;
    }
    extractTime(timeString) {
        if (!timeString)
            return undefined;
        // Handle various time formats
        const hourMatch = timeString.match(/(\d+)\s*(?:hours?|hrs?|h)/i);
        const minMatch = timeString.match(/(\d+)\s*(?:minutes?|mins?|m)/i);
        const hours = hourMatch ? parseInt(hourMatch[1]) : 0;
        const minutes = minMatch ? parseInt(minMatch[1]) : 0;
        if (hours && minutes)
            return `${hours}h ${minutes}m`;
        if (hours)
            return `${hours}h`;
        if (minutes)
            return `${minutes}m`;
        return timeString;
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
        // More generous base confidence - focus on partial success
        switch (method) {
            case 'json-ld':
                confidence = 0.70;
                break; // Start lower, build up with data
            case 'site-specific':
                confidence = 0.65;
                break; // Still reward targeted scrapers
            case 'microdata':
                confidence = 0.60;
                break;
            case 'css-selectors':
                confidence = 0.50;
                break; // More generous for generic extraction
            default: confidence = 0.40; // Give any extraction a base chance
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
        if (recipe.image)
            confidence += 0.03;
        if (recipe.description && recipe.description.length > 20)
            confidence += 0.03;
        if (recipe.prepTime || recipe.cookTime || recipe.totalTime)
            confidence += 0.02;
        if (recipe.servings && recipe.servings > 0)
            confidence += 0.02;
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
exports.BaseScraper = BaseScraper;
//# sourceMappingURL=BaseScraper.js.map