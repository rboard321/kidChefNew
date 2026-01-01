import { Recipe, KidProfile } from '../types';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // Time to live in milliseconds
}

interface CacheStorage {
  recipes: Map<string, CacheEntry<Recipe[]>>;
  recipeDetail: Map<string, CacheEntry<Recipe>>;
  kidProfiles: Map<string, CacheEntry<KidProfile[]>>;
}

class CacheService {
  private cache: CacheStorage = {
    recipes: new Map(),
    recipeDetail: new Map(),
    kidProfiles: new Map(),
  };

  private defaultTTL = 5 * 60 * 1000; // 5 minutes
  private shortTTL = 2 * 60 * 1000; // 2 minutes for frequently changing data

  private isExpired<T>(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private set<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    data: T,
    ttl = this.defaultTTL
  ): void {
    cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl,
    });
  }

  private get<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    if (this.isExpired(entry)) {
      cache.delete(key);
      return null;
    }

    return entry.data;
  }

  // Recipe caching
  setRecipes(userId: string, recipes: Recipe[]): void {
    this.set(this.cache.recipes, userId, recipes, this.shortTTL);
  }

  getRecipes(userId: string): Recipe[] | null {
    return this.get(this.cache.recipes, userId);
  }

  setRecipeDetail(recipeId: string, recipe: Recipe): void {
    this.set(this.cache.recipeDetail, recipeId, recipe);
  }

  getRecipeDetail(recipeId: string): Recipe | null {
    return this.get(this.cache.recipeDetail, recipeId);
  }

  // Kid profiles caching
  setKidProfiles(userId: string, profiles: KidProfile[]): void {
    this.set(this.cache.kidProfiles, userId, profiles);
  }

  getKidProfiles(userId: string): KidProfile[] | null {
    return this.get(this.cache.kidProfiles, userId);
  }

  // Cache invalidation
  invalidateRecipes(userId: string): void {
    this.cache.recipes.delete(userId);
  }

  invalidateRecipeDetail(recipeId: string): void {
    this.cache.recipeDetail.delete(recipeId);
  }

  invalidateKidProfiles(userId: string): void {
    this.cache.kidProfiles.delete(userId);
  }

  // Clear all caches
  clearAll(): void {
    this.cache.recipes.clear();
    this.cache.recipeDetail.clear();
    this.cache.kidProfiles.clear();
  }

  // Cleanup expired entries (call periodically)
  cleanup(): void {
    const now = Date.now();

    // Cleanup recipes
    for (const [key, entry] of this.cache.recipes.entries()) {
      if (this.isExpired(entry)) {
        this.cache.recipes.delete(key);
      }
    }

    // Cleanup recipe details
    for (const [key, entry] of this.cache.recipeDetail.entries()) {
      if (this.isExpired(entry)) {
        this.cache.recipeDetail.delete(key);
      }
    }

    // Cleanup kid profiles
    for (const [key, entry] of this.cache.kidProfiles.entries()) {
      if (this.isExpired(entry)) {
        this.cache.kidProfiles.delete(key);
      }
    }
  }

  // Get cache stats for debugging
  getStats(): {
    recipes: number;
    recipeDetail: number;
    kidProfiles: number;
  } {
    return {
      recipes: this.cache.recipes.size,
      recipeDetail: this.cache.recipeDetail.size,
      kidProfiles: this.cache.kidProfiles.size,
    };
  }
}

export const cacheService = new CacheService();

// Setup periodic cleanup (every 10 minutes)
setInterval(() => {
  cacheService.cleanup();
}, 10 * 60 * 1000);