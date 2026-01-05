import React, { useState, useEffect, useContext } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { collection, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { recipeService } from '../../services/recipes';
import { useAuth } from '../../contexts/AuthContext';
import { useImport } from '../../contexts/ImportContext';
import { SkeletonRecipeList } from '../../components/SkeletonLoader';
import { Toast } from '../../components/Toast';
import { importProgressService } from '../../services/importProgressService';
import { SearchBar } from '../../components/SearchBar';
import { searchRecipes, filterRecipes, SearchFilters } from '../../utils/searchUtils';
import FilterChips, { FilterOption } from '../../components/FilterChips';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import type { KidRecipe, Recipe } from '../../types';

export default function ParentHomeScreen() {
  const navigation = useNavigation();
  const { user, parentProfile, kidProfiles, setDeviceMode } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<{ visible: boolean; message: string; type?: 'success' | 'info'; actionText?: string; onAction?: () => void }>({
    visible: false,
    message: '',
  });
  const [pendingRecipes, setPendingRecipes] = useState<KidRecipe[]>([]);

  useEffect(() => {
    loadRecipes();
  }, [user]);

  // Refresh recipes when screen comes into focus (e.g., after importing a recipe)
  // Use silent refresh to avoid showing notifications every time user navigates back
  useFocusEffect(
    React.useCallback(() => {
      if (user?.uid) {
        loadRecipes(); // Silent load without notifications
      }
    }, [user?.uid])
  );

  // Listen for import completions globally
  useEffect(() => {
    const unsubscribe = importProgressService.subscribeGlobal({
      onProgress: (event) => {
        if (event.type === 'complete' && event.recipe) {
          // Auto-refresh recipes when a new one is imported
          loadRecipes(false); // Silent refresh, no loading state

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
  useEffect(() => {
    let filtered = recipes;

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
  }, [searchQuery, recipes, activeFilters]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
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


  const loadRecipes = async (isRefresh = false, showNotification = true) => {
    if (!user?.uid || !parentProfile?.id) return;

    try {
      if (isRefresh) {
        setRefreshing(true);
      } else if (showNotification) {
        setLoading(true);
      }

      const previousRecipeCount = recipes.length;
      const userRecipes = await recipeService.getUserRecipes(parentProfile.id, isRefresh);

      // Check if new recipes were added during a refresh (not initial load)
      if (isRefresh && showNotification && userRecipes.length > previousRecipeCount) {
        const newRecipeCount = userRecipes.length - previousRecipeCount;
        setToast({
          visible: true,
          message: `${newRecipeCount} new recipe${newRecipeCount > 1 ? 's' : ''} ready! 🎉`,
          type: 'success',
        });
      }

      setRecipes(userRecipes);
      setFilteredRecipes(userRecipes);
    } catch (error) {
      console.error('Error loading recipes:', error);
    } finally {
      if (isRefresh) {
        setRefreshing(false);
      } else if (showNotification) {
        setLoading(false);
      }
    }
  };

  const onRefresh = () => {
    loadRecipes(true);
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
      <SafeAreaView style={styles.container}>
      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast({ ...toast, visible: false })}
        actionText={toast.actionText}
        onAction={toast.onAction}
      />
      <View style={styles.header}>
        <View style={styles.titleSection}>
          <Text style={styles.title}>My Recipes</Text>
          <Text style={styles.subtitle}>
            {searchQuery || activeFilters.length > 0
              ? `${filteredRecipes.length} of ${recipes.length} recipes`
              : 'Your family recipe collection'}
          </Text>
          {!loading && !refreshing && !searchQuery && (
            <Text style={styles.pullToRefreshHint}>Pull down to refresh</Text>
          )}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.favoritesButton}
            onPress={() => navigation.navigate('Favorites' as never)}
          >
            <Text style={styles.favoritesButtonText}>❤️ Favorites</Text>
          </TouchableOpacity>
          {kidProfiles.length > 0 && (
            <TouchableOpacity
              style={styles.kidModeButton}
              onPress={() => setDeviceMode('kid')}
            >
              <Text style={styles.kidModeButtonText}>👶 Kid Mode</Text>
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

      {!loading && recipes.length > 0 && (
        <View>
          <View style={styles.searchContainer}>
            <SearchBar
              placeholder="Search recipes, cuisine, ingredients..."
              value={searchQuery}
              onChangeText={handleSearch}
            />
          </View>
          <FilterChips
            filters={filterOptions}
            activeFilters={activeFilters}
            onFilterPress={handleFilterPress}
            kidMode={false}
          />
        </View>
      )}

      {loading ? (
        <SkeletonRecipeList count={4} />
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
      )}
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
  titleSection: {
    alignItems: 'center',
    marginBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  pullToRefreshHint: {
    fontSize: 14,
    color: '#9ca3af',
    fontStyle: 'italic',
    marginTop: 4,
  },
  headerButtons: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 10,
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
  favoritesButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  favoritesButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  kidModeButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  kidModeButtonText: {
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
