import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Create persister function for AsyncStorage
const createAsyncStoragePersister = (config: any) => ({
  persistClient: async (client: any) => {
    try {
      await AsyncStorage.setItem(config.key, config.serialize(client));
    } catch (error) {
      console.error('Error persisting query client:', error);
    }
  },
  restoreClient: async () => {
    try {
      const data = await AsyncStorage.getItem(config.key);
      return data ? config.deserialize(data) : undefined;
    } catch (error) {
      console.error('Error restoring query client:', error);
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      await AsyncStorage.removeItem(config.key);
    } catch (error) {
      console.error('Error removing persisted client:', error);
    }
  },
});

// Create the query client with optimized settings for mobile
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Keep data fresh for 5 minutes
      staleTime: 5 * 60 * 1000,
      // Keep data in cache for 24 hours
      gcTime: 24 * 60 * 60 * 1000,
      // Retry failed queries with exponential backoff
      retry: (failureCount, error: any) => {
        // Don't retry auth errors or client errors (4xx)
        if (error?.code === 'unauthenticated' || error?.code === 'permission-denied') {
          return false;
        }
        // Retry up to 3 times for other errors
        return failureCount < 3;
      },
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Enable background refetch when app becomes active
      refetchOnWindowFocus: true,
      // Don't refetch on mount if data is fresh
      refetchOnMount: 'stale',
      // Enable offline support
      networkMode: 'offlineFirst',
    },
    mutations: {
      // Retry failed mutations
      retry: 2,
      networkMode: 'offlineFirst',
    },
  },
});

// Create persister for offline storage
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'KIDCHEF_CACHE',
  // Serialize custom types
  serialize: JSON.stringify,
  deserialize: JSON.parse,
});

// Persist the query client
export const initializeQueryClient = async () => {
  try {
    await persistQueryClient({
      queryClient,
      persister,
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      // Only persist specific query types to avoid storage bloat
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => {
          // Persist kid recipes, recipes, and kid profiles
          return query.queryKey[0] === 'kidRecipes' ||
                 query.queryKey[0] === 'recipes' ||
                 query.queryKey[0] === 'kidProfiles' ||
                 query.queryKey[0] === 'parentProfile';
        },
      },
    });
    console.log('Query client initialized with persistence');
  } catch (error) {
    console.error('Failed to initialize query client persistence:', error);
  }
};

// Query keys for consistent caching
export const queryKeys = {
  recipes: (userId: string) => ['recipes', userId],
  recipe: (recipeId: string) => ['recipes', recipeId],
  kidRecipes: (kidId: string) => ['kidRecipes', kidId],
  kidRecipe: (kidRecipeId: string) => ['kidRecipes', kidRecipeId],
  kidProfiles: (parentId: string) => ['kidProfiles', parentId],
  kidProfile: (kidId: string) => ['kidProfiles', kidId],
  parentProfile: (userId: string) => ['parentProfile', userId],
  sharedRecipes: (kidId: string) => ['sharedRecipes', kidId],
  conversionTasks: (userId: string) => ['conversionTasks', userId],
  conversionTask: (taskId: string) => ['conversionTasks', taskId],
} as const;

// Helper to clear all cached data (useful for logout)
export const clearQueryCache = async () => {
  try {
    await queryClient.clear();
    await AsyncStorage.removeItem('KIDCHEF_CACHE');
    console.log('Query cache cleared');
  } catch (error) {
    console.error('Failed to clear query cache:', error);
  }
};

// Helper to prefetch commonly needed data
export const prefetchCommonData = async (userId: string, parentId?: string) => {
  try {
    const promises = [
      queryClient.prefetchQuery({
        queryKey: queryKeys.recipes(userId),
        staleTime: 10 * 60 * 1000, // 10 minutes
      }),
    ];

    if (parentId) {
      promises.push(
        queryClient.prefetchQuery({
          queryKey: queryKeys.kidProfiles(parentId),
          staleTime: 10 * 60 * 1000,
        })
      );
    }

    await Promise.all(promises);
    console.log('Common data prefetched');
  } catch (error) {
    console.error('Failed to prefetch common data:', error);
  }
};