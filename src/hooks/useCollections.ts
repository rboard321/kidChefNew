import { useQuery } from '@tanstack/react-query';
import { collectionService } from '../services/collections';
import { queryKeys } from '../services/queryClient';

export const useCollections = (parentId: string) => {
  return useQuery({
    queryKey: queryKeys.collections(parentId),
    queryFn: () => collectionService.getCollections(parentId),
    enabled: !!parentId,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    networkMode: 'offlineFirst',
  });
};

export const useCollection = (collectionId: string) => {
  return useQuery({
    queryKey: queryKeys.collection(collectionId),
    queryFn: () => collectionService.getCollection(collectionId),
    enabled: !!collectionId,
    staleTime: 5 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    networkMode: 'offlineFirst',
  });
};
