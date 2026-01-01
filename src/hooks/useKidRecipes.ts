import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { kidRecipeManagerService } from '../services/kidRecipeManager';
import { conversionStatusService, ConversionStatus } from '../services/conversionStatus';
import { queryKeys } from '../services/queryClient';
import type { Recipe, KidRecipe, ReadingLevel } from '../types';

// Hook for getting kid recipes with offline support
export const useKidRecipes = (kidId: string) => {
  return useQuery({
    queryKey: queryKeys.kidRecipes(kidId),
    queryFn: () => kidRecipeManagerService.getKidRecipes(kidId),
    enabled: !!kidId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 60 * 60 * 1000, // 1 hour
    // Enable offline-first behavior
    networkMode: 'offlineFirst',
  });
};

// Hook for getting a specific kid recipe
export const useKidRecipe = (kidRecipeId: string) => {
  return useQuery({
    queryKey: queryKeys.kidRecipe(kidRecipeId),
    queryFn: () => kidRecipeManagerService.getKidRecipe(kidRecipeId),
    enabled: !!kidRecipeId,
    staleTime: 10 * 60 * 1000, // 10 minutes
    networkMode: 'offlineFirst',
  });
};

// Hook for checking if a recipe is already converted
export const useIsRecipeConverted = (originalRecipeId: string, kidId: string) => {
  return useQuery({
    queryKey: ['recipeConverted', originalRecipeId, kidId],
    queryFn: () => kidRecipeManagerService.isRecipeAlreadyConverted(originalRecipeId, kidId),
    enabled: !!(originalRecipeId && kidId),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
};

// Hook for converting recipes with status tracking
export const useConvertRecipe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      recipeId,
      kidId,
      kidAge,
      readingLevel,
      allergyFlags = []
    }: {
      recipeId: string;
      kidId: string;
      kidAge: number;
      readingLevel: ReadingLevel;
      allergyFlags?: string[];
    }) => {
      // Queue the conversion with status tracking
      return conversionStatusService.queueConversion(
        recipeId,
        kidId,
        kidAge,
        readingLevel,
        allergyFlags
      );
    },
    onSuccess: (taskId, variables) => {
      // Invalidate and refetch kid recipes
      queryClient.invalidateQueries({
        queryKey: queryKeys.kidRecipes(variables.kidId)
      });

      // Invalidate recipe converted status
      queryClient.invalidateQueries({
        queryKey: ['recipeConverted', variables.recipeId, variables.kidId]
      });

      // Start polling for conversion status
      const pollStatus = async () => {
        const task = await conversionStatusService.getConversionStatus(taskId);
        if (task?.status === ConversionStatus.READY) {
          // Conversion complete, invalidate cached data
          queryClient.invalidateQueries({
            queryKey: queryKeys.kidRecipes(variables.kidId)
          });
        } else if (task?.status === ConversionStatus.CONVERTING) {
          // Still converting, poll again
          setTimeout(pollStatus, 2000);
        }
      };

      setTimeout(pollStatus, 1000);
    },
    // Enable offline support - queue mutations when offline
    networkMode: 'offlineFirst',
  });
};

// Hook for getting conversion task status
export const useConversionStatus = (taskId: string) => {
  return useQuery({
    queryKey: queryKeys.conversionTask(taskId),
    queryFn: () => conversionStatusService.getConversionStatus(taskId),
    enabled: !!taskId,
    refetchInterval: (data) => {
      // Poll more frequently for active conversions
      if (data?.status === ConversionStatus.QUEUED || data?.status === ConversionStatus.CONVERTING) {
        return 2000; // 2 seconds
      }
      return false; // Stop polling for completed/failed tasks
    },
    staleTime: 1000, // Always fresh for active tasks
  });
};

// Hook for getting user's conversion tasks
export const useUserConversions = (userId: string) => {
  return useQuery({
    queryKey: queryKeys.conversionTasks(userId),
    queryFn: () => conversionStatusService.getUserConversions(userId),
    enabled: !!userId,
    staleTime: 30 * 1000, // 30 seconds
  });
};

// Hook for retrying failed conversions
export const useRetryConversion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => conversionStatusService.retryConversion(taskId),
    onSuccess: (_, taskId) => {
      // Invalidate the specific task to refetch its status
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversionTask(taskId)
      });
    },
  });
};

// Hook for cancelling conversions
export const useCancelConversion = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (taskId: string) => conversionStatusService.cancelConversion(taskId),
    onSuccess: (_, taskId) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.conversionTask(taskId)
      });
    },
  });
};

// Hook for reconverting recipes
export const useReconvertRecipe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      originalRecipe,
      kidId,
      readingLevel,
      kidAge
    }: {
      originalRecipe: Recipe;
      kidId: string;
      readingLevel: ReadingLevel;
      kidAge?: number;
    }) => {
      return kidRecipeManagerService.reconvertRecipe(originalRecipe, kidId, readingLevel, kidAge);
    },
    onSuccess: (_, variables) => {
      // Invalidate kid recipes cache
      queryClient.invalidateQueries({
        queryKey: queryKeys.kidRecipes(variables.kidId)
      });
    },
    networkMode: 'offlineFirst',
  });
};

// Hook for deleting kid recipes
export const useDeleteKidRecipe = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (kidRecipeId: string) => kidRecipeManagerService.deleteKidRecipe(kidRecipeId),
    onMutate: async (kidRecipeId) => {
      // Optimistically update the cache
      const kidRecipe = queryClient.getQueryData<KidRecipe>(
        queryKeys.kidRecipe(kidRecipeId)
      );

      if (kidRecipe) {
        // Cancel any outgoing refetches
        await queryClient.cancelQueries({
          queryKey: queryKeys.kidRecipes(kidRecipe.kidId!)
        });

        // Snapshot the previous value
        const previousKidRecipes = queryClient.getQueryData(
          queryKeys.kidRecipes(kidRecipe.kidId!)
        );

        // Optimistically remove from the list
        queryClient.setQueryData(
          queryKeys.kidRecipes(kidRecipe.kidId!),
          (old: KidRecipe[] = []) => old.filter(recipe => recipe.id !== kidRecipeId)
        );

        return { previousKidRecipes, kidRecipe };
      }
    },
    onError: (err, kidRecipeId, context) => {
      // Rollback on error
      if (context?.kidRecipe && context.previousKidRecipes) {
        queryClient.setQueryData(
          queryKeys.kidRecipes(context.kidRecipe.kidId!),
          context.previousKidRecipes
        );
      }
    },
    onSettled: (_, __, kidRecipeId, context) => {
      // Always refetch after delete attempt
      if (context?.kidRecipe) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.kidRecipes(context.kidRecipe.kidId!)
        });
      }
    },
    networkMode: 'offlineFirst',
  });
};

// Hook for prefetching kid recipes (useful for navigation)
export const usePrefetchKidRecipes = () => {
  const queryClient = useQueryClient();

  return (kidId: string) => {
    queryClient.prefetchQuery({
      queryKey: queryKeys.kidRecipes(kidId),
      queryFn: () => kidRecipeManagerService.getKidRecipes(kidId),
      staleTime: 5 * 60 * 1000,
    });
  };
};