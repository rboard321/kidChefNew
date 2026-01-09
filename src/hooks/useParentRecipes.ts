import { useQuery } from '@tanstack/react-query';
import { recipeService } from '../services/recipes';
import { queryKeys } from '../services/queryClient';

export const useParentRecipes = (parentId: string) => {
  return useQuery({
    queryKey: queryKeys.recipes(parentId),
    queryFn: () => recipeService.getUserRecipes(parentId),
    enabled: !!parentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    networkMode: 'offlineFirst',
  });
};
