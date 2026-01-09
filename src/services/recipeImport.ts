import { httpsCallable } from 'firebase/functions';
import { functions, auth } from './firebase';
import type { Recipe } from '../types';
import { validateString, sanitizeHtml, ValidationError } from '../utils/validation';
import { errorReportingService } from './errorReporting';
import { logger } from '../utils/logger';

export interface RecipeImportService {
  importFromUrl: (url: string, options?: ImportOptions) => Promise<ImportResult>;
  validateUrl: (url: string) => boolean;
}

export interface ImportOptions {
  maxRetries?: number;
  onProgress?: (status: ImportStatus) => void;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface ImportResult {
  success: boolean;
  recipe?: Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;
  error?: ImportError;
  partialSuccess?: PartialRecipeData;
  needsReview?: boolean;
  confidence?: number;
  extractionMethod?: string;
}

export interface PartialRecipeData {
  title?: string;
  description?: string;
  image?: string;
  prepTime?: string;
  cookTime?: string;
  totalTime?: string;
  servings?: number;
  difficulty?: string;
  ingredients?: string[];
  instructions?: string[];
  sourceUrl: string;
  tags?: string[];
  missingFields: ('title' | 'ingredients' | 'instructions' | 'description' | 'image')[];
  extractionIssues: string[];
  confidence: number;
}

export interface ImportError {
  code: string;
  message: string;
  suggestion?: string;
  canRetry: boolean;
  allowManualEdit?: boolean;
  retryAfter?: number; // seconds to wait before retry
  severity: 'low' | 'medium' | 'high' | 'critical';
  recoveryActions?: RecoveryAction[];
}

export interface RecoveryAction {
  label: string;
  action: 'retry' | 'manual-entry' | 'try-different-url' | 'contact-support';
  description?: string;
}

export enum ImportStatus {
  VALIDATING = 'validating',
  FETCHING = 'fetching',
  PARSING = 'parsing',
  VALIDATING_CONTENT = 'validating_content',
  COMPLETE = 'complete',
  NEEDS_REVIEW = 'needs_review',
  ERROR = 'error'
}

interface ScrapedRecipe {
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

export const recipeImportService: RecipeImportService = {
  validateUrl(url: string): boolean {
    try {
      // Basic validation first
      const validatedUrl = validateString(url, 'URL', {
        required: true,
        maxLength: 2048, // Standard max URL length
        allowEmpty: false
      });

      const urlObj = new URL(validatedUrl);

      // Only allow HTTP/HTTPS protocols
      if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
        return false;
      }

      // Basic domain validation
      if (!urlObj.hostname || urlObj.hostname.length === 0) {
        return false;
      }

      // Prevent localhost and private IP addresses for security
      const hostname = urlObj.hostname.toLowerCase();
      if (hostname === 'localhost' ||
          hostname.startsWith('127.') ||
          hostname.startsWith('10.') ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('172.')) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  },

  async importFromUrl(url: string, options: ImportOptions = {}): Promise<ImportResult> {
    const { maxRetries = 3, onProgress, onRetry } = options;

    // Validate URL first
    onProgress?.(ImportStatus.VALIDATING);

    if (!this.validateUrl(url)) {
      return {
        success: false,
        error: {
          code: 'INVALID_URL',
          message: 'Please enter a valid recipe URL starting with http:// or https://',
          suggestion: 'Make sure the URL is complete and points to a recipe page',
          canRetry: false,
          allowManualEdit: true,
          severity: 'low'
        }
      };
    }

    // Try secure import with retry logic
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        onProgress?.(ImportStatus.FETCHING);

        if (__DEV__) {
          logger.debug('Calling importRecipeSecure with URL:', url);
          logger.debug('Current auth user:', auth.currentUser ? { uid: auth.currentUser.uid } : 'null');
        }

        // Check if user is authenticated
        if (!auth.currentUser) {
          throw new Error('User not authenticated');
        }

        // Get fresh auth token to ensure we're authenticated
        const token = await auth.currentUser.getIdToken(true); // Force refresh
        if (__DEV__) {
          logger.debug('Got auth token:', token ? 'present' : 'null');
        }

        // Environment-aware Cloud Function URL selection
        const environment = process.env.EXPO_PUBLIC_ENVIRONMENT || 'development';
        const projectId = process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID;
        if (!projectId) {
          throw new Error('Missing EXPO_PUBLIC_FIREBASE_PROJECT_ID for recipe import');
        }

        // Use environment-specific Cloud Functions
        const functionUrl = `https://us-central1-${projectId}.cloudfunctions.net/importRecipeHttp`;

        if (__DEV__) {
          logger.debug(`Calling importRecipeHttp via HTTP for ${environment} environment...`);
          logger.debug('Function URL:', functionUrl);
        }

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        };

        if (__DEV__) {
          logger.debug('Request headers:', {
            'Content-Type': headers['Content-Type'],
            'Authorization': headers.Authorization ? headers.Authorization.substring(0, 20) + '...' : 'null'
          });
        }

        const response = await fetch(functionUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ url })
        });

        if (__DEV__) {
          logger.debug('HTTP response status:', response.status);
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          if (__DEV__) {
            logger.debug('HTTP error response:', errorData);
          }

          // Handle 404 - Cloud Function not deployed to this environment
          if (response.status === 404) {
            console.error(`Cloud Function not found. Please ensure functions are deployed to the current environment.`);
          }

          const message = errorData.message || errorData.error || `HTTP ${response.status}`;
          const httpError = new Error(message) as Error & { code?: string };
          if (errorData.code) {
            httpError.code = errorData.code;
          }
          throw httpError;
        }

        const result = await response.json();
        if (__DEV__) {
          logger.debug('HTTP result:', result);
        }

        if (result.status === 'complete') {
          onProgress?.(ImportStatus.COMPLETE);

          return {
            success: true,
            recipe: result.recipe,
            confidence: result.confidence,
            extractionMethod: result.method
          };
        } else if (result.status === 'needs_review' && result.recipe) {
          // Handle partial success - enough data for review
          onProgress?.(ImportStatus.COMPLETE);

          const missingFields: ('title' | 'ingredients' | 'instructions' | 'description' | 'image')[] = [];
          if (!result.recipe?.title) missingFields.push('title');
          if (!result.recipe?.ingredients || result.recipe.ingredients.length === 0) missingFields.push('ingredients');
          if (!result.recipe?.instructions || result.recipe.instructions.length === 0) missingFields.push('instructions');
          if (!result.recipe?.description) missingFields.push('description');
          if (!result.recipe?.image) missingFields.push('image');

          return {
            success: false,
            needsReview: true,
            partialSuccess: {
              ...result.recipe,
              sourceUrl: url,
              missingFields,
              extractionIssues: result.issues || [],
              confidence: result.confidence
            },
            error: {
              code: 'PARTIAL_EXTRACTION',
              message: 'Recipe partially extracted - review required',
              suggestion: 'Please review and complete the missing information',
              canRetry: false,
              allowManualEdit: true,
              severity: 'low' as const,
              recoveryActions: [
                {
                  label: 'Review & Complete',
                  action: 'manual-entry',
                  description: 'Complete the missing recipe information'
                },
                {
                  label: 'Try Different URL',
                  action: 'try-different-url',
                  description: 'Find a different URL for this recipe'
                }
              ]
            },
            confidence: result.confidence,
            extractionMethod: result.method
          };
        } else if (result.success) {
          onProgress?.(ImportStatus.COMPLETE);

          return {
            success: true,
            recipe: result.recipe,
            confidence: result.confidence,
            extractionMethod: result.method
          };
        } else {
          throw new Error(result.error || 'Import failed');
        }

      } catch (error: any) {
        console.error(`Import attempt ${attempt} failed:`, error);

        const importError = this.parseError(error);

        // Don't retry for certain error types
        if (!importError.canRetry || attempt === maxRetries) {
          onProgress?.(ImportStatus.ERROR);

          // Report critical import failures
          if (importError.severity === 'critical' || importError.severity === 'high') {
            errorReportingService.reportImportError(error, url, auth.currentUser?.uid);
          }

          return {
            success: false,
            error: importError
          };
        }

        // Wait before retrying (exponential backoff or error-specified delay)
        if (attempt < maxRetries) {
          const exponentialDelay = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          const errorDelay = importError.retryAfter ? importError.retryAfter * 1000 : 0;
          const delay = Math.max(exponentialDelay, errorDelay);

          onRetry?.(attempt, error);
          if (__DEV__) {
            logger.debug(`⏱️  Waiting ${delay}ms before retry ${attempt + 1}/${maxRetries}`);
          }
          await this.delay(delay);
        }
      }
    }

    // This should never be reached, but just in case
    return {
      success: false,
      error: {
        code: 'MAX_RETRIES_EXCEEDED',
        message: 'Failed to import recipe after multiple attempts',
        suggestion: 'Please try again later or use manual entry',
        canRetry: true,
        allowManualEdit: true,
        severity: 'high'
      }
    };
  },

  delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  },

  parseError(error: any): ImportError {
    const message = error?.message || error?.toString() || 'Unknown error';

    // Parse Firebase Functions errors
    if (error?.code) {
      switch (error.code) {
        case 'unauthenticated':
          return {
            code: 'UNAUTHENTICATED',
            message: 'Please log in to import recipes',
            canRetry: false,
            severity: 'high',
            recoveryActions: [
              {
                label: 'Sign In',
                action: 'contact-support',
                description: 'Go to settings to sign in'
              }
            ]
          };

        case 'resource-exhausted':
          return {
            code: 'RATE_LIMITED',
            message: 'You\'ve reached your daily import limit',
            suggestion: 'Try again tomorrow or upgrade to premium',
            canRetry: false,
            retryAfter: 3600, // 1 hour
            severity: 'medium',
            recoveryActions: [
              {
                label: 'Try Again Later',
                action: 'retry',
                description: 'Wait an hour and try again'
              },
              {
                label: 'Enter Manually',
                action: 'manual-entry',
                description: 'Add the recipe by typing it in'
              }
            ]
          };

        case 'invalid-argument':
          if (message.includes('No recipe data found')) {
            return {
              code: 'NO_RECIPE_FOUND',
              message: 'No recipe found on this page',
              suggestion: 'Make sure the URL points to a recipe page, not a blog post or search results',
              canRetry: false,
              allowManualEdit: true,
              severity: 'medium',
              recoveryActions: [
                {
                  label: 'Try Different URL',
                  action: 'try-different-url',
                  description: 'Look for the actual recipe page on this site'
                },
                {
                  label: 'Enter Manually',
                  action: 'manual-entry',
                  description: 'Type the recipe details yourself'
                }
              ]
            };
          }

          if (message.includes('Missing instructions')) {
            return {
              code: 'MISSING_INSTRUCTIONS',
              message: 'This website did not provide recipe steps',
              suggestion: 'Try a different recipe URL or enter the recipe manually',
              canRetry: false,
              allowManualEdit: true,
              severity: 'medium'
            };
          }

          if (message.includes('Missing ingredients')) {
            return {
              code: 'MISSING_INGREDIENTS',
              message: 'This website did not provide ingredients',
              suggestion: 'Try a different recipe URL or enter the recipe manually',
              canRetry: false,
              allowManualEdit: true,
              severity: 'medium'
            };
          }


          return {
            code: 'INVALID_RECIPE',
            message: message,
            canRetry: false,
            allowManualEdit: true,
            severity: 'medium'
          };

        case 'not-found':
          return {
            code: 'PAGE_NOT_FOUND',
            message: 'Recipe page not found',
            suggestion: 'Check that the URL is correct and the page exists',
            canRetry: false,
            severity: 'low'
          };

        case 'deadline-exceeded':
          return {
            code: 'TIMEOUT',
            message: 'Import timed out - the website may be slow',
            suggestion: 'Try again in a few minutes',
            canRetry: true,
            retryAfter: 60, // 1 minute
            severity: 'low',
            recoveryActions: [
              {
                label: 'Retry Import',
                action: 'retry',
                description: 'The website might be responding now'
              },
              {
                label: 'Try Later',
                action: 'retry',
                description: 'Wait a few minutes and try again'
              }
            ]
          };

        default:
          return {
            code: 'UNKNOWN_ERROR',
            message: message,
            canRetry: true,
            allowManualEdit: true,
            severity: 'medium'
          };
      }
    }

    // Parse network errors
    if (message.includes('Network Error') || message.includes('ENOTFOUND')) {
      return {
        code: 'NETWORK_ERROR',
        message: 'Network error - check your internet connection',
        suggestion: 'Make sure you\'re connected to the internet and try again',
        canRetry: true,
        retryAfter: 30, // 30 seconds
        severity: 'medium',
        recoveryActions: [
          {
            label: 'Check Connection',
            action: 'retry',
            description: 'Make sure you have internet and try again'
          },
          {
            label: 'Try Later',
            action: 'retry',
            description: 'Network might be temporarily down'
          }
        ]
      };
    }

    // Default error
    return {
      code: 'IMPORT_FAILED',
      message: 'Failed to import recipe',
      suggestion: 'Please try again or enter the recipe manually',
      canRetry: true,
      allowManualEdit: true,
      severity: 'medium',
      recoveryActions: [
        {
          label: 'Try Again',
          action: 'retry',
          description: 'Sometimes imports work on the second try'
        },
        {
          label: 'Enter Manually',
          action: 'manual-entry',
          description: 'Type the recipe details yourself'
        },
        {
          label: 'Contact Support',
          action: 'contact-support',
          description: 'Report this issue to our team'
        }
      ]
    };
  },

  convertScrapedRecipe(scraped: ScrapedRecipe): Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'> {
    const tags = scraped.tags || this.extractTagsFromTitle(scraped.title);
    const mealType = this.inferMealType(scraped.title, tags);

    return {
      title: scraped.title,
      description: scraped.description || '',
      image: scraped.image || this.getEmojiForRecipe(scraped.title),
      prepTime: scraped.prepTime || '',
      cookTime: scraped.cookTime || '',
      totalTime: scraped.totalTime || '',
      servings: scraped.servings || 4,
      difficulty: scraped.difficulty || this.inferDifficulty(scraped),
      ingredients: scraped.ingredients,
      instructions: scraped.instructions,
      sourceUrl: scraped.sourceUrl,
      tags: tags,
      mealType: mealType,
      kidVersionId: null,
    };
  },

  getEmojiForRecipe(title: string): string {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('cookie')) return '🍪';
    if (lowerTitle.includes('cake') || lowerTitle.includes('cupcake')) return '🧁';
    if (lowerTitle.includes('pancake')) return '🥞';
    if (lowerTitle.includes('pasta') || lowerTitle.includes('spaghetti')) return '🍝';
    if (lowerTitle.includes('pizza')) return '🍕';
    if (lowerTitle.includes('burger')) return '🍔';
    if (lowerTitle.includes('salad')) return '🥗';
    if (lowerTitle.includes('soup')) return '🍲';
    if (lowerTitle.includes('chicken')) return '🍗';
    if (lowerTitle.includes('fish')) return '🐟';
    if (lowerTitle.includes('bread')) return '🍞';
    if (lowerTitle.includes('curry')) return '🍛';
    return '🍽️'; // Default
  },

  inferDifficulty(recipe: ScrapedRecipe): string {
    const instructionCount = recipe.instructions.length;
    const ingredientCount = recipe.ingredients.length;

    // Simple heuristic based on complexity indicators
    if (instructionCount <= 5 && ingredientCount <= 8) return 'Easy';
    if (instructionCount <= 10 && ingredientCount <= 15) return 'Medium';
    return 'Hard';
  },

  extractTagsFromTitle(title: string): string[] {
    const tags: string[] = [];

    // Extract common recipe types
    const lowerTitle = title.toLowerCase();

    if (lowerTitle.includes('cookie') || lowerTitle.includes('biscuit')) {
      tags.push('cookies', 'dessert', 'baking');
    }
    if (lowerTitle.includes('cake') || lowerTitle.includes('cupcake')) {
      tags.push('cake', 'dessert', 'baking');
    }
    if (lowerTitle.includes('pancake') || lowerTitle.includes('waffle')) {
      tags.push('breakfast', 'pancakes');
    }
    if (lowerTitle.includes('pasta') || lowerTitle.includes('spaghetti')) {
      tags.push('pasta', 'dinner', 'italian');
    }
    if (lowerTitle.includes('chicken')) {
      tags.push('chicken', 'protein', 'dinner');
    }
    if (lowerTitle.includes('salad')) {
      tags.push('salad', 'healthy', 'lunch');
    }
    if (lowerTitle.includes('soup')) {
      tags.push('soup', 'comfort food', 'dinner');
    }
    if (lowerTitle.includes('easy') || lowerTitle.includes('simple')) {
      tags.push('easy', 'quick');
    }
    if (lowerTitle.includes('curry')) {
      tags.push('curry', 'spicy', 'dinner', 'asian');
    }

    return [...new Set(tags)]; // Remove duplicates
  },

  inferMealType(title: string, tags: string[]): string {
    const lowerTitle = title.toLowerCase();
    const allTags = tags.map(tag => tag.toLowerCase());

    // Check for dessert keywords
    if (allTags.includes('dessert') || allTags.includes('baking') ||
        lowerTitle.includes('cookie') || lowerTitle.includes('cake') ||
        lowerTitle.includes('cupcake') || lowerTitle.includes('pie') ||
        lowerTitle.includes('ice cream') || lowerTitle.includes('chocolate') ||
        lowerTitle.includes('candy') || lowerTitle.includes('brownie')) {
      return 'Dessert';
    }

    // Check for breakfast keywords
    if (allTags.includes('breakfast') ||
        lowerTitle.includes('pancake') || lowerTitle.includes('waffle') ||
        lowerTitle.includes('cereal') || lowerTitle.includes('toast') ||
        lowerTitle.includes('muffin') || lowerTitle.includes('oatmeal')) {
      return 'Breakfast';
    }

    // Check for lunch keywords
    if (allTags.includes('lunch') ||
        lowerTitle.includes('sandwich') || lowerTitle.includes('wrap') ||
        lowerTitle.includes('salad')) {
      return 'Lunch';
    }

    // Check for dinner keywords (most common, so check last)
    if (allTags.includes('dinner') || allTags.includes('protein') ||
        lowerTitle.includes('chicken') || lowerTitle.includes('beef') ||
        lowerTitle.includes('pork') || lowerTitle.includes('fish') ||
        lowerTitle.includes('pasta') || lowerTitle.includes('curry') ||
        lowerTitle.includes('soup') || lowerTitle.includes('stew')) {
      return 'Dinner';
    }

    // Default to main dish if no specific meal type detected
    return 'Main Dish';
  }
};
