import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  Modal,
  TextInput,
  Alert,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { recipeService } from '../../services/recipes';
import { recipeFavoritesService } from '../../services/recipeFavorites';
import { useAuth } from '../../contexts/AuthContext';
import { SkeletonRecipeList } from '../../components/SkeletonLoader';
import { Toast } from '../../components/Toast';
import { importProgressService } from '../../services/importProgressService';
import { SearchBar } from '../../components/SearchBar';
import { searchRecipes, filterRecipes, SearchFilters } from '../../utils/searchUtils';
import FilterChips, { FilterOption } from '../../components/FilterChips';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useParentRecipes } from '../../hooks/useParentRecipes';
import { useCollections } from '../../hooks/useCollections';
import { collectionService } from '../../services/collections';
import { queryClient, queryKeys } from '../../services/queryClient';
import { SUBSCRIPTION_PLANS } from '../../config/plans';
import type { Collection, KidRecipe, Recipe } from '../../types';

export default function ParentHomeScreen() {
  const navigation = useNavigation();
  const { user, parentProfile, kidProfiles, setDeviceMode, effectivePlan, subscription } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [listView, setListView] = useState<'all' | 'favorites' | 'collections'>('all');
  const [favoriteRecipeIds, setFavoriteRecipeIds] = useState<string[]>([]);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [collectionSearch, setCollectionSearch] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [collectionName, setCollectionName] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [collectionSaving, setCollectionSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const [toast, setToast] = useState<{ visible: boolean; message: string; type?: 'success' | 'info'; actionText?: string; onAction?: () => void }>({
    visible: false,
    message: '',
  });
  const [pendingRecipes, setPendingRecipes] = useState<KidRecipe[]>([]);
  const parentId = parentProfile?.id ?? '';
  const {
    data: parentRecipesData = [],
    isLoading: recipesLoading,
  } = useParentRecipes(parentId);
  const { data: collections = [], isLoading: collectionsLoading } = useCollections(parentId);

  const maxCollections = useMemo(() => {
    if (subscription?.isBetaTester) return 'unlimited';
    return SUBSCRIPTION_PLANS[effectivePlan].limits.maxCollections;
  }, [effectivePlan, subscription?.isBetaTester]);

  const atCollectionLimit =
    maxCollections !== 'unlimited' && collections.length >= maxCollections;

  useEffect(() => {
    setRecipes((prev) => {
      if (prev.length === parentRecipesData.length && prev.every((item, index) => item.id === parentRecipesData[index]?.id)) {
        return prev;
      }
      return parentRecipesData;
    });
  }, [parentRecipesData]);

  useEffect(() => {
    if (listView !== 'favorites' || !parentId) return;
    let isActive = true;
    setFavoritesLoading(true);
    recipeFavoritesService
      .getFavoriteRecipes(parentId)
      .then((ids) => {
        if (isActive) setFavoriteRecipeIds(ids);
      })
      .catch((error) => {
        console.error('Error loading favorites:', error);
      })
      .finally(() => {
        if (isActive) setFavoritesLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [listView, parentId]);

  useEffect(() => {
    if (listView !== 'collections') {
      setSelectedCollectionId(null);
      setCollectionSearch('');
    }
  }, [listView]);

  useFocusEffect(
    React.useCallback(() => {
      if (!parentId) return;
      refreshRecipes(false, false);
    }, [parentId])
  );

  useEffect(() => {
    if (listView === 'favorites') {
      fadeAnim.setValue(1);
      return;
    }
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 140,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim, listView, selectedCollectionId]);

  // Listen for import completions globally
  useEffect(() => {
    const unsubscribe = importProgressService.subscribeGlobal({
      onProgress: (event) => {
        if (event.type === 'complete' && event.recipe) {
          // Auto-refresh recipes when a new one is imported
          refreshRecipes(false, false);

          // Show success notification
          setToast({
            visible: true,
            message: `✅ "${event.recipe.title}" added to your recipes!`,
            type: 'success',
            actionText: 'View Recipe',
            onAction: () => {
              navigation.navigate('RecipeDetail' as never, { recipeId: event.recipe!.id } as never);
            }
          });
        } else if (event.type === 'error' && event.error) {
          // Show error notification for failed imports
          setToast({
            visible: true,
            message: `❌ Import failed: ${event.error.message}`,
            type: 'info',
            actionText: 'Try Again',
            onAction: () => {
              navigation.navigate('ImportRecipe' as never, { importUrl: event.url } as never);
            }
          });
        }
      }
    });

    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    if (!parentProfile?.id) {
      setPendingRecipes([]);
      return;
    }

    const q = query(
      collection(db, 'kidRecipes'),
      where('parentId', '==', parentProfile.id),
      where('approvalStatus', '==', 'pending'),
      orderBy('approvalRequestedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const pending: KidRecipe[] = [];
      snapshot.forEach((doc) => {
        pending.push({ id: doc.id, ...(doc.data() as Omit<KidRecipe, 'id'>) });
      });
      setPendingRecipes(pending);
    });

    return () => unsubscribe();
  }, [parentProfile?.id]);

  // Handle search and filter combination
  const baseRecipes = useMemo(() => {
    let base = recipes;
    if (listView === 'favorites') {
      const favoriteSet = new Set(favoriteRecipeIds);
      base = recipes.filter((recipe) => favoriteSet.has(recipe.id));
    }
    if (listView === 'collections' && selectedCollectionId) {
      const collection = collections.find((item) => item.id === selectedCollectionId);
      if (collection?.recipeIds?.length) {
        const collectionSet = new Set(collection.recipeIds);
        base = recipes.filter((recipe) => collectionSet.has(recipe.id));
      } else {
        base = [];
      }
    }
    return base;
  }, [recipes, listView, favoriteRecipeIds, selectedCollectionId, collections]);

  useEffect(() => {
    let filtered = baseRecipes;

    // Apply search first
    if (searchQuery.trim() !== '') {
      filtered = searchRecipes(filtered, searchQuery);
    }

    // Apply active filters
    if (activeFilters.length > 0) {
      const searchFilters: SearchFilters = {};

      activeFilters.forEach(filterId => {
        const filterOption = filterOptions.find(opt => opt.id === filterId);
        if (filterOption && filterOption.value) {
          Object.assign(searchFilters, filterOption.value);
        }
      });

      filtered = filterRecipes(filtered, searchFilters);
    }

    setFilteredRecipes(filtered);
  }, [searchQuery, baseRecipes, activeFilters]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (query.trim().length > 0) {
      setShowFilters(true);
    }
  };

  // Define filter options for parent mode
  const filterOptions: FilterOption[] = [
    { id: 'quick', label: 'Quick (< 30min)', emoji: '⏰', value: { maxCookTime: 30 } },
    { id: 'under_hour', label: 'Under 1 Hour', emoji: '⏱️', value: { maxCookTime: 60 } },
    { id: 'breakfast', label: 'Breakfast', emoji: '🌅', value: { mealType: 'breakfast' } },
    { id: 'dessert', label: 'Desserts', emoji: '🍰', value: { mealType: 'dessert' } },
    { id: 'snack', label: 'Snacks', emoji: '🥨', value: { mealType: 'snack' } },
    { id: 'easy', label: 'Easy', emoji: '👍', value: { difficulty: 'easy' } },
  ];

  const handleFilterPress = (filterId: string) => {
    setActiveFilters(prev =>
      prev.includes(filterId)
        ? prev.filter(id => id !== filterId)
        : [...prev, filterId]
    );
  };

  const openCreateCollection = () => {
    if (atCollectionLimit) {
      Alert.alert(
        'Collection Limit Reached',
        'Free users can create up to 5 collections. Upgrade to KidChef Plus for unlimited collections.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'View Plans', onPress: () => navigation.navigate('Pricing' as never) },
        ]
      );
      return;
    }
    setCollectionName('');
    setCollectionDescription('');
    setCreateVisible(true);
  };

  const handleCreateCollection = async () => {
    if (!parentId) return;
    const trimmed = collectionName.trim();
    if (!trimmed) {
      Alert.alert('Missing Name', 'Please name your collection.');
      return;
    }
    try {
      setCollectionSaving(true);
      await collectionService.createCollection(parentId, trimmed, collectionDescription);
      queryClient.invalidateQueries({ queryKey: queryKeys.collections(parentId) });
      setCreateVisible(false);
    } catch (error) {
      console.error('Failed to create collection:', error);
      Alert.alert('Error', 'Unable to create collection. Please try again.');
    } finally {
      setCollectionSaving(false);
    }
  };

  const selectedCollection = useMemo(() => {
    if (!selectedCollectionId) return null;
    return collections.find((item) => item.id === selectedCollectionId) || null;
  }, [collections, selectedCollectionId]);

  const filteredCollections = useMemo(() => {
    if (!collectionSearch.trim()) return collections;
    const query = collectionSearch.trim().toLowerCase();
    return collections.filter((item) => item.name.toLowerCase().includes(query));
  }, [collections, collectionSearch]);


  const refreshRecipes = async (isRefresh = false, showNotification = true) => {
    if (!user?.uid || !parentId) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      }

      const previousRecipeCount = recipes.length;
      const userRecipes = await recipeService.getUserRecipes(parentId, true);
      queryClient.setQueryData(queryKeys.recipes(parentId), userRecipes);

      // Check if new recipes were added during a refresh (not initial load)
      if (isRefresh && showNotification && userRecipes.length > previousRecipeCount) {
        const newRecipeCount = userRecipes.length - previousRecipeCount;
        setToast({
          visible: true,
          message: `${newRecipeCount} new recipe${newRecipeCount > 1 ? 's' : ''} ready! 🎉`,
          type: 'success',
        });
      }

    } catch (error) {
      console.error('Error loading recipes:', error);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      }
    }
  };

  const onRefresh = () => {
    refreshRecipes(true);
  };

  const handleRecipePress = (recipe: Recipe) => {
    navigation.navigate('RecipeDetail' as never, { recipeId: recipe.id } as never);
  };

  const renderRecipe = ({ item }: { item: Recipe }) => {
    const hasImage = item.image && !item.image.includes('🍽️') && !item.image.includes('🥘') && item.image.startsWith('http');
    const needsReview = item.importStatus === 'needs_review' || (item.importIssues && item.importIssues.length > 0);

    return (
      <TouchableOpacity style={styles.recipeCard} onPress={() => handleRecipePress(item)}>
        {hasImage ? (
          <View style={styles.recipeImageContainer}>
            <Image
              source={{ uri: item.image }}
              style={styles.recipeImageBackground}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
            <View style={styles.imageOverlay} />
            {needsReview && (
              <View style={styles.reviewBadge}>
                <Text style={styles.reviewBadgeText}>Needs Review</Text>
              </View>
            )}
            <View style={styles.recipeContent}>
              <Text style={styles.recipeTitleWithImage} numberOfLines={2}>{item.title}</Text>
              <View style={styles.recipeDetails}>
                <Text style={styles.recipeDetailText}>
                  {item.servings} servings
                </Text>
                {item.totalTime && (
                  <Text style={styles.recipeDetailText}>
                    • {item.totalTime}
                  </Text>
                )}
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.recipeCardNoImage}>
            <Text style={styles.recipeEmoji}>{item.image || '🍽️'}</Text>
            <Text style={styles.recipeTitle} numberOfLines={2}>{item.title}</Text>
            {needsReview && (
              <View style={styles.reviewBadgeInline}>
                <Text style={styles.reviewBadgeInlineText}>Needs Review</Text>
              </View>
            )}
            <View style={styles.recipeDetailsNoImage}>
              <Text style={styles.recipeDetailNoImage}>
                {item.servings} servings
              </Text>
              {item.totalTime && (
                <Text style={styles.recipeDetailNoImage}>
                  • {item.totalTime}
                </Text>
              )}
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <ErrorBoundary>
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast({ ...toast, visible: false })}
        actionText={toast.actionText}
        onAction={toast.onAction}
      />
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>My Recipes</Text>
          {kidProfiles.length > 0 && (
            <TouchableOpacity
              style={styles.kidModeIconButton}
              onPress={() => setDeviceMode('kid')}
              accessibilityRole="button"
              accessibilityLabel="Switch to Kid Mode"
            >
              <Text style={styles.kidModeIcon}>👶</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {pendingRecipes.length > 0 && (
        <TouchableOpacity
          style={styles.pendingBanner}
          onPress={() =>
            navigation.navigate('KidRecipePreview' as never, { kidRecipeId: pendingRecipes[0].id } as never)
          }
        >
          <View style={styles.pendingBannerContent}>
            <Text style={styles.pendingBannerIcon}>🔔</Text>
            <View style={styles.pendingBannerText}>
              <Text style={styles.pendingBannerTitle}>
                {pendingRecipes.length} Recipe{pendingRecipes.length > 1 ? 's' : ''} Ready for Review
              </Text>
              <Text style={styles.pendingBannerSubtitle}>Tap to preview and approve</Text>
            </View>
            <Text style={styles.pendingBannerChevron}>›</Text>
          </View>
        </TouchableOpacity>
      )}

      {!recipesLoading && recipes.length > 0 && (
        <View>
          <View style={styles.searchContainer}>
            <View style={styles.searchBarWrap}>
              <SearchBar
                placeholder={
                  listView === 'favorites'
                    ? 'Search favorites...'
                    : listView === 'collections' && !selectedCollectionId
                      ? 'Search collections...'
                      : 'Search recipes, ingredients...'
                }
                value={listView === 'collections' && !selectedCollectionId ? collectionSearch : searchQuery}
                onChangeText={listView === 'collections' && !selectedCollectionId ? setCollectionSearch : handleSearch}
              />
            </View>
            {listView !== 'collections' || selectedCollectionId ? (
              <TouchableOpacity
                style={styles.filterToggle}
                onPress={() => setShowFilters((prev) => !prev)}
              >
                <Text style={styles.filterToggleText}>{showFilters ? 'Hide Filters' : 'Filters'}</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.filterSpacer} />
            )}
          </View>
          <View style={styles.segmentedRow}>
            <TouchableOpacity
              style={[styles.segmentButton, listView === 'all' && styles.segmentButtonActive]}
              onPress={() => setListView('all')}
            >
              <Text style={[styles.segmentText, listView === 'all' && styles.segmentTextActive]}>All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, listView === 'favorites' && styles.segmentButtonActive]}
              onPress={() => setListView('favorites')}
            >
              <Text style={[styles.segmentText, listView === 'favorites' && styles.segmentTextActive]}>❤️ Favorites</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segmentButton, listView === 'collections' && styles.segmentButtonActive]}
              onPress={() => setListView('collections')}
            >
              <Text style={[styles.segmentText, listView === 'collections' && styles.segmentTextActive]}>📁 Collections</Text>
            </TouchableOpacity>
          </View>
          {(listView !== 'collections' || selectedCollectionId) && (
            <>
              {(showFilters || activeFilters.length > 0 || searchQuery.trim().length > 0) && (
                <FilterChips
                  filters={filterOptions}
                  activeFilters={activeFilters}
                  onFilterPress={handleFilterPress}
                  kidMode={false}
                />
              )}
              {(activeFilters.length > 0 || searchQuery.trim().length > 0 || listView !== 'all') && (
                <View style={styles.activeFilterRow}>
                  <Text style={styles.activeFilterText}>
                    Showing: {listView === 'all' ? 'All' : listView === 'favorites' ? 'Favorites' : selectedCollection?.name || 'Collections'}
                    {searchQuery.trim().length > 0 ? ` · “${searchQuery.trim()}”` : ''}
                    {activeFilters.length > 0 ? ` · ${activeFilters.length} filters` : ''}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSearchQuery('');
                      setActiveFilters([]);
                      setShowFilters(false);
                      setListView('all');
                      setSelectedCollectionId(null);
                    }}
                  >
                    <Text style={styles.clearFilterText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>
      )}

      <Animated.View style={[styles.contentFade, { opacity: fadeAnim }]}>
        {recipesLoading ? (
          <SkeletonRecipeList count={4} />
        ) : listView === 'favorites' && favoritesLoading ? (
          <View style={styles.inlineLoading}>
            <ActivityIndicator size="small" color="#2563eb" />
            <Text style={styles.inlineLoadingText}>Loading favorites...</Text>
          </View>
        ) : listView === 'collections' && !selectedCollectionId ? (
          <View style={styles.collectionsWrapper}>
            <View style={styles.collectionsHeader}>
              <View />
              <TouchableOpacity style={styles.createCollectionButton} onPress={openCreateCollection}>
                <Text style={styles.createCollectionButtonText}>＋ New</Text>
              </TouchableOpacity>
            </View>
            {maxCollections !== 'unlimited' && (
              <Text style={styles.collectionLimitText}>
                {collections.length}/{maxCollections} collections used
              </Text>
            )}
            {collectionsLoading ? (
              <Text style={styles.inlineLoadingText}>Loading collections...</Text>
            ) : filteredCollections.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyEmoji}>📂</Text>
                <Text style={styles.emptyTitle}>
                  {collections.length === 0 ? 'No collections yet' : 'No matching collections'}
                </Text>
                <Text style={styles.emptyText}>
                  {collections.length === 0 ? 'Create one to start organizing recipes.' : 'Try a different search.'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={filteredCollections}
                keyExtractor={(item) => item.id}
                contentContainerStyle={styles.collectionList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.collectionCard}
                    onPress={() => setSelectedCollectionId(item.id)}
                  >
                    <View style={styles.collectionCardHeader}>
                      <Text style={styles.collectionName}>📁 {item.name}</Text>
                      <Text style={styles.collectionCount}>{item.recipeIds?.length || 0}</Text>
                    </View>
                    {item.description ? (
                      <Text style={styles.collectionDescription} numberOfLines={2}>
                        {item.description}
                      </Text>
                    ) : (
                      <Text style={styles.collectionDescriptionEmpty}>No description</Text>
                    )}
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        ) : listView === 'favorites' && filteredRecipes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>❤️</Text>
            <Text style={styles.emptyTitle}>No favorites yet</Text>
            <Text style={styles.emptyText}>Tap the heart on a recipe to save it here.</Text>
          </View>
        ) : listView === 'collections' && selectedCollectionId && filteredRecipes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📂</Text>
            <Text style={styles.emptyTitle}>No recipes in this collection</Text>
            <Text style={styles.emptyText}>Add recipes to see them here.</Text>
          </View>
        ) : recipes.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>📱</Text>
            <Text style={styles.emptyTitle}>No recipes yet!</Text>
            <Text style={styles.emptyText}>
              Tap the Import tab to add your first recipe from any website
            </Text>
          </View>
        ) : filteredRecipes.length === 0 && searchQuery ? (
          <View style={styles.emptySearchState}>
            <Text style={styles.emptySearchEmoji}>🔍</Text>
            <Text style={styles.emptySearchTitle}>No recipes found</Text>
            <Text style={styles.emptySearchText}>
              Try adjusting your search term or browse all recipes
            </Text>
          </View>
        ) : (
          <View style={styles.listWrapper}>
            {listView === 'collections' && selectedCollection ? (
              <View style={styles.collectionDetailHeader}>
                <TouchableOpacity onPress={() => setSelectedCollectionId(null)}>
                  <Text style={styles.collectionBackText}>‹ Collections</Text>
                </TouchableOpacity>
                <Text style={styles.collectionDetailTitle}>{selectedCollection.name}</Text>
              </View>
            ) : null}
            <FlatList
              data={filteredRecipes}
              renderItem={renderRecipe}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.row}
              contentContainerStyle={styles.list}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#2563eb']}
                  tintColor="#2563eb"
                  title="Pull to refresh recipes..."
                />
              }
            />
          </View>
        )}
      </Animated.View>

      <Modal visible={createVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Collection</Text>
            <TextInput
              style={styles.input}
              placeholder="Collection name"
              value={collectionName}
              onChangeText={setCollectionName}
              maxLength={40}
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Description (optional)"
              value={collectionDescription}
              onChangeText={setCollectionDescription}
              multiline
              maxLength={120}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setCreateVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={handleCreateCollection}
                disabled={collectionSaving}
              >
                <Text style={styles.saveButtonText}>{collectionSaving ? 'Saving...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kidModeIconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kidModeIcon: {
    fontSize: 18,
  },
  pendingBanner: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#eef2ff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#c7d2fe',
    padding: 12,
  },
  pendingBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pendingBannerIcon: {
    fontSize: 22,
    marginRight: 10,
  },
  pendingBannerText: {
    flex: 1,
  },
  pendingBannerTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e3a8a',
  },
  pendingBannerSubtitle: {
    fontSize: 12,
    color: '#4f46e5',
    marginTop: 2,
  },
  pendingBannerChevron: {
    fontSize: 22,
    color: '#4f46e5',
    marginLeft: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
    marginBottom: 6,
    gap: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  searchBarWrap: {
    flex: 1,
  },
  filterToggle: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
  },
  filterToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4b5563',
  },
  filterSpacer: {
    width: 76,
  },
  segmentedRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 6,
    gap: 8,
    backgroundColor: '#fff',
  },
  segmentButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  segmentButtonActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  segmentText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  segmentTextActive: {
    color: '#fff',
  },
  activeFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: '#fff',
  },
  activeFilterText: {
    fontSize: 12,
    color: '#6b7280',
  },
  clearFilterText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
  },
  contentFade: {
    flex: 1,
  },
  inlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  inlineLoadingText: {
    fontSize: 12,
    color: '#6b7280',
  },
  collectionsWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
    flex: 1,
  },
  collectionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  createCollectionButton: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  createCollectionButtonText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 12,
  },
  collectionLimitText: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 8,
  },
  collectionList: {
    paddingBottom: 20,
  },
  collectionCard: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  collectionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collectionName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1f2937',
  },
  collectionCount: {
    backgroundColor: '#f3f4f6',
    color: '#6b7280',
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  collectionDescription: {
    marginTop: 6,
    color: '#6b7280',
    fontSize: 13,
  },
  collectionDescriptionEmpty: {
    marginTop: 6,
    color: '#9ca3af',
    fontSize: 12,
  },
  listWrapper: {
    flex: 1,
  },
  collectionDetailHeader: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  collectionBackText: {
    color: '#2563eb',
    fontSize: 12,
    fontWeight: '600',
  },
  collectionDetailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginTop: 6,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
    color: '#111827',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    fontSize: 14,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cancelText: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    padding: 10,
  },
  row: {
    justifyContent: 'space-around',
  },
  recipeCard: {
    width: '45%',
    aspectRatio: 1.1,
    borderRadius: 16,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  recipeImageContainer: {
    flex: 1,
    position: 'relative',
  },
  recipeImageBackground: {
    flex: 1,
    borderRadius: 16,
  },
  recipeImage: {
    borderRadius: 16,
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 16,
  },
  reviewBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(251, 191, 36, 0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  reviewBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#1f2937',
  },
  recipeContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  recipeTitleWithImage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  recipeDetails: {
    flexDirection: 'row',
  },
  recipeDetailText: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '500',
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  recipeCardNoImage: {
    backgroundColor: 'white',
    flex: 1,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeEmoji: {
    fontSize: 40,
    marginBottom: 10,
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 20,
  },
  reviewBadgeInline: {
    backgroundColor: '#fef3c7',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginBottom: 8,
  },
  reviewBadgeInlineText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400e',
  },
  recipeDetailsNoImage: {
    alignItems: 'center',
  },
  recipeDetailNoImage: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  emptySearchState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptySearchEmoji: {
    fontSize: 60,
    marginBottom: 20,
  },
  emptySearchTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  emptySearchText: {
    fontSize: 14,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 20,
  },
});
