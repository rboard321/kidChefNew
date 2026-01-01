import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { recipeSharingService } from '../../services/recipeSharing';
import { kidProgressService, AVAILABLE_BADGES } from '../../services/kidProgressService';
import { recipeRecommendationsService } from '../../services/recipeRecommendations';
import PinInput from '../../components/PinInput';
import { SearchBar } from '../../components/SearchBar';
import { searchRecipesKidMode, filterRecipes, SearchFilters } from '../../utils/searchUtils';
import FilterChips, { FilterOption } from '../../components/FilterChips';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import type { Recipe, KidBadge } from '../../types';
import type { KidProgress } from '../../services/kidProgressService';

export default function KidHomeScreen() {
  const navigation = useNavigation();
  const { currentKid, setDeviceModeWithPin, selectKid, parentProfile } = useAuth();
  const [sharedRecipes, setSharedRecipes] = useState<Recipe[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<Recipe[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPinInput, setShowPinInput] = useState(false);
  const [progress, setProgress] = useState<KidProgress | null>(null);
  const [recentBadges, setRecentBadges] = useState<KidBadge[]>([]);
  const [recommendations, setRecommendations] = useState<Recipe[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  // If no kid is selected, redirect to selector
  if (!currentKid) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>👶</Text>
          <Text style={styles.errorTitle}>No Kid Selected</Text>
          <Text style={styles.errorText}>
            Please select which kid profile to use!
          </Text>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={() => selectKid(null)}
          >
            <Text style={styles.logoutButtonText}>Choose Kid</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  useEffect(() => {
    if (currentKid) {
      loadRecipes();
    }
  }, [currentKid]);

  useFocusEffect(
    React.useCallback(() => {
      if (currentKid) {
        loadRecipes();
      }
    }, [currentKid])
  );

  const loadRecipes = async () => {
    if (!currentKid) return;

    try {
      setLoading(true);
      // Load recipes shared with this kid
      const shared = await recipeSharingService.getSharedRecipesForKid(currentKid.id);
      setSharedRecipes(shared);
      setFilteredRecipes(shared);

      // Load kid progress
      const kidProgress = await kidProgressService.getProgress(currentKid.id);
      setProgress(kidProgress);

      // Get recent badges (last 3)
      const sortedBadges = kidProgress.badges
        .sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime())
        .slice(0, 3);
      setRecentBadges(sortedBadges);

      // Load recommendations in background
      loadRecommendations();
    } catch (error) {
      console.error('Error loading kid recipes:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadRecommendations = async () => {
    if (!currentKid) return;

    try {
      setLoadingRecommendations(true);
      const recs = await recipeRecommendationsService.getRecommendationsForKid(currentKid.id, 3);
      setRecommendations(recs);
    } catch (error) {
      console.error('Error loading recommendations:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // Handle search and filter combination for kids
  useEffect(() => {
    let filtered = sharedRecipes;

    // Apply search first
    if (searchQuery.trim() !== '') {
      filtered = searchRecipesKidMode(filtered, searchQuery);
    }

    // Apply active filters
    if (activeFilters.length > 0) {
      const searchFilters: SearchFilters = {};

      activeFilters.forEach(filterId => {
        const filterOption = kidFilterOptions.find(opt => opt.id === filterId);
        if (filterOption && filterOption.value) {
          Object.assign(searchFilters, filterOption.value);
        }
      });

      filtered = filterRecipes(filtered, searchFilters);
    }

    setFilteredRecipes(filtered);
  }, [searchQuery, sharedRecipes, activeFilters]);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  // Define filter options for kid mode
  const kidFilterOptions: FilterOption[] = [
    { id: 'quick', label: 'Quick & Easy', emoji: '⚡', value: { maxCookTime: 30 } },
    { id: 'fun', label: 'Fun to Make', emoji: '🎉', value: { difficulty: 'easy' } },
    { id: 'dessert', label: 'Sweet Treats', emoji: '🍪', value: { mealType: 'dessert' } },
    { id: 'snack', label: 'Yummy Snacks', emoji: '🍎', value: { mealType: 'snack' } },
  ];

  const handleFilterPress = (filterId: string) => {
    setActiveFilters(prev =>
      prev.includes(filterId)
        ? prev.filter(id => id !== filterId)
        : [...prev, filterId]
    );
  };

  const handleRecipePress = (recipe: Recipe) => {
    if (!currentKid) return;
    navigation.navigate('RecipeView' as never, { recipeId: recipe.id, kidId: currentKid.id } as never);
  };

  const handleExitKidMode = () => {
    const hasPinProtection = parentProfile?.kidModePin;

    if (hasPinProtection) {
      setShowPinInput(true);
    } else {
      // No PIN set, ask if they want to set one
      Alert.alert(
        'Exit Kid Mode',
        'Would you like to set a PIN to protect kid mode in the future?',
        [
          {
            text: 'No, Just Exit',
            onPress: async () => {
              await setDeviceModeWithPin('parent');
            }
          },
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Got It',
            onPress: async () => {
              await setDeviceModeWithPin('parent');
            }
          }
        ]
      );
    }
  };

  const handlePinSuccess = async (pin?: string) => {
    setShowPinInput(false);
    await setDeviceModeWithPin('parent', pin);
  };


  const renderSharedRecipe = ({ item }: { item: Recipe }) => (
    <TouchableOpacity style={[styles.recipeCard, styles.kidRecipeCard]} onPress={() => handleRecipePress(item)}>
      {item.image && item.image.startsWith('http') ? (
        <Image
          source={{ uri: item.image }}
          style={styles.recipeImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <Text style={styles.recipeEmoji}>{item.image || '🍽️'}</Text>
      )}
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle}>{item.title}</Text>
        <Text style={styles.recipeSubtitle}>Shared by your parent!</Text>
        <View style={styles.recipeDetails}>
          <View style={[styles.difficultyBadge, { backgroundColor: '#10b981' }]}>
            <Text style={styles.difficultyText}>{currentKid?.readingLevel}</Text>
          </View>
          <Text style={styles.timeText}>{item.totalTime || item.cookTime || 30}m</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderRecommendationCard = ({ item }: { item: Recipe }) => (
    <TouchableOpacity style={[styles.recipeCard, styles.recommendationCard]} onPress={() => handleRecipePress(item)}>
      {item.image && item.image.startsWith('http') ? (
        <Image
          source={{ uri: item.image }}
          style={styles.recommendationImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <Text style={styles.recommendationEmoji}>{item.image || '🍽️'}</Text>
      )}
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle}>{item.title}</Text>
        <Text style={styles.recommendationSubtitle}>⭐ Recommended for you!</Text>
        <View style={styles.recipeDetails}>
          <View style={[styles.difficultyBadge, { backgroundColor: '#f59e0b' }]}>
            <Text style={styles.difficultyText}>{item.difficulty || 'easy'}</Text>
          </View>
          <Text style={styles.timeText}>{item.totalTime || item.cookTime || '30min'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );


  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Loading your recipes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const totalRecipes = sharedRecipes.length;
  const displayedRecipes = filteredRecipes.length;

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.greeting}>
            Hi {currentKid?.name}! 👨‍🍳
          </Text>
          <Text style={styles.subtitle}>
            {searchQuery || activeFilters.length > 0
              ? `Found ${displayedRecipes} of ${totalRecipes} recipes!`
              : totalRecipes > 0
                ? 'Pick a fun recipe to make!'
                : 'Ask your parent to share some recipes!'}
          </Text>
          <TouchableOpacity style={styles.logoutButton} onPress={handleExitKidMode}>
            <Text style={styles.logoutButtonText}>👋 Exit Kid Mode</Text>
          </TouchableOpacity>
        </View>

        {/* Progress Section */}
        {progress && (
          <View style={styles.progressSection}>
            <View style={styles.progressHeader}>
              <Text style={styles.progressTitle}>🏆 Your Cooking Journey</Text>
              <TouchableOpacity
                style={styles.viewAllButton}
                onPress={() => navigation.navigate('BadgeCollection' as never)}
              >
                <Text style={styles.viewAllText}>View All</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.progressCards}>
              <View style={styles.progressCard}>
                <Text style={styles.progressCardEmoji}>🏅</Text>
                <Text style={styles.progressCardNumber}>{progress.badges.length}</Text>
                <Text style={styles.progressCardLabel}>Badges Earned</Text>
              </View>

              <View style={styles.progressCard}>
                <Text style={styles.progressCardEmoji}>🍳</Text>
                <Text style={styles.progressCardNumber}>{progress.recipesCompleted}</Text>
                <Text style={styles.progressCardLabel}>Recipes Made</Text>
              </View>

              <View style={styles.progressCard}>
                <Text style={styles.progressCardEmoji}>🌟</Text>
                <Text style={styles.progressCardNumber}>{Math.round(progress.safetyScore)}</Text>
                <Text style={styles.progressCardLabel}>Safety Score</Text>
              </View>
            </View>

            {recentBadges.length > 0 && (
              <View style={styles.recentBadges}>
                <Text style={styles.recentBadgesTitle}>Recent Badges:</Text>
                <View style={styles.badgesList}>
                  {recentBadges.map((badge) => (
                    <View key={badge.id} style={styles.recentBadge}>
                      <Text style={styles.recentBadgeEmoji}>{badge.emoji}</Text>
                      <Text style={styles.recentBadgeName}>{badge.name}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Recommendations Section */}
        {recommendations.length > 0 && !searchQuery && (
          <View style={styles.recommendationsSection}>
            <View style={styles.recommendationsHeader}>
              <Text style={styles.recommendationsTitle}>🌟 Perfect for You!</Text>
              <Text style={styles.recommendationsSubtitle}>Recipes picked just for {currentKid?.name}</Text>
            </View>

            {loadingRecommendations ? (
              <View style={styles.recommendationsLoading}>
                <ActivityIndicator size="small" color="#f59e0b" />
                <Text style={styles.recommendationsLoadingText}>Finding great recipes...</Text>
              </View>
            ) : (
              <FlatList
                horizontal
                data={recommendations}
                renderItem={renderRecommendationCard}
                keyExtractor={(item) => `rec_${item.id}`}
                contentContainerStyle={styles.recommendationsList}
                showsHorizontalScrollIndicator={false}
              />
            )}
          </View>
        )}

        {totalRecipes > 0 && (
          <View>
            <View style={styles.searchContainer}>
              <SearchBar
                placeholder="🔍 Find a yummy recipe to cook!"
                value={searchQuery}
                onChangeText={handleSearch}
                kidMode={true}
              />
            </View>
            <FilterChips
              filters={kidFilterOptions}
              activeFilters={activeFilters}
              onFilterPress={handleFilterPress}
              kidMode={true}
            />
          </View>
        )}

        {totalRecipes === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🍽️</Text>
            <Text style={styles.emptyTitle}>No recipes yet!</Text>
            <Text style={styles.emptyText}>
              Ask your parent to share some recipes with you. Once shared, you can convert them to kid-friendly versions!
            </Text>
          </View>
        ) : displayedRecipes === 0 && searchQuery ? (
          <View style={styles.emptySearchState}>
            <Text style={styles.emptySearchEmoji}>🔍</Text>
            <Text style={styles.emptySearchTitle}>No recipes found!</Text>
            <Text style={styles.emptySearchText}>
              Try a different word or ask your parent for more recipes!
            </Text>
          </View>
        ) : (
          <View style={styles.content}>
            {/* Shared Kid-Friendly Recipes Section */}
            {filteredRecipes.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  🎉 Your Cooking Recipes ({displayedRecipes})
                </Text>
                <Text style={styles.sectionSubtitle}>
                  {searchQuery
                    ? `Found these yummy recipes for "${searchQuery}"!`
                    : 'Recipes shared by your parent just for you!'}
                </Text>
                {/* Replace FlatList with map for better ScrollView compatibility */}
                <View style={styles.sectionList}>
                  {filteredRecipes.map((recipe) => (
                    <View key={recipe.id}>
                      {renderSharedRecipe({ item: recipe })}
                    </View>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      <PinInput
        visible={showPinInput}
        onClose={() => setShowPinInput(false)}
        onSuccess={handlePinSuccess}
        title="Parent PIN Required"
        subtitle="Enter your PIN to exit Kid Mode"
        correctPin={parentProfile?.kidModePin || ''}
      />
    </SafeAreaView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f9ff',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 18,
    color: '#1e40af',
    fontWeight: '500',
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af',
    marginHorizontal: 20,
    marginBottom: 5,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#1e40af',
    marginHorizontal: 20,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  sectionList: {
    paddingHorizontal: 20,
  },
  kidSelectionContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  kidSelectionCard: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  kidEmoji: {
    fontSize: 48,
    marginRight: 20,
  },
  kidSelectionInfo: {
    flex: 1,
  },
  kidSelectionName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 4,
  },
  kidSelectionAge: {
    fontSize: 14,
    color: '#6b7280',
  },
  kidRecipeCard: {
    borderWidth: 2,
    borderColor: '#10b981',
    backgroundColor: '#f0fdf4',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#1e40af',
  },
  recipeCard: {
    backgroundColor: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  recipeEmoji: {
    fontSize: 48,
    marginRight: 20,
  },
  recipeImage: {
    width: 60,
    height: 60,
    borderRadius: 12,
    marginRight: 20,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  recipeSubtitle: {
    fontSize: 14,
    color: '#10b981',
    marginBottom: 8,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  recipeDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  difficultyBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 10,
  },
  difficultyText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  timeText: {
    fontSize: 14,
    color: '#6b7280',
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
    color: '#1e40af',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#1e40af',
    textAlign: 'center',
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  errorTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ef4444',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  logoutButton: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginLeft: 10,
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  progressSection: {
    backgroundColor: 'white',
    margin: 15,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#10b981',
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  progressTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e40af',
  },
  viewAllButton: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  viewAllText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  progressCards: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  progressCard: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    padding: 15,
    borderRadius: 12,
    marginHorizontal: 3,
  },
  progressCardEmoji: {
    fontSize: 24,
    marginBottom: 5,
  },
  progressCardNumber: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 2,
  },
  progressCardLabel: {
    fontSize: 11,
    color: '#1e40af',
    textAlign: 'center',
    fontWeight: '500',
  },
  recentBadges: {
    borderTopWidth: 1,
    borderTopColor: '#e0f2fe',
    paddingTop: 15,
  },
  recentBadgesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 10,
  },
  badgesList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  recentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#10b981',
  },
  recentBadgeEmoji: {
    fontSize: 16,
    marginRight: 5,
  },
  recentBadgeName: {
    fontSize: 12,
    color: '#1e40af',
    fontWeight: '500',
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingBottom: 15,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 10,
  },
  emptySearchText: {
    fontSize: 16,
    color: '#1e40af',
    textAlign: 'center',
    lineHeight: 24,
  },
  recommendationsSection: {
    backgroundColor: 'white',
    marginHorizontal: 15,
    marginBottom: 20,
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  recommendationsHeader: {
    marginBottom: 15,
  },
  recommendationsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 5,
  },
  recommendationsSubtitle: {
    fontSize: 14,
    color: '#f59e0b',
    fontWeight: '500',
  },
  recommendationsLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  recommendationsLoadingText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#f59e0b',
  },
  recommendationsList: {
    paddingRight: 20,
  },
  recommendationCard: {
    borderWidth: 2,
    borderColor: '#fbbf24',
    backgroundColor: '#fefbf3',
    width: 280,
    marginRight: 15,
  },
  recommendationImage: {
    width: 50,
    height: 50,
    borderRadius: 10,
    marginRight: 15,
  },
  recommendationEmoji: {
    fontSize: 40,
    marginRight: 15,
  },
  recommendationSubtitle: {
    fontSize: 13,
    color: '#f59e0b',
    marginBottom: 8,
    fontStyle: 'italic',
    fontWeight: '600',
  },
});
