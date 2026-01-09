import React, { useState, useEffect } from 'react';
import { logger } from '../../utils/logger';
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
import { useNavigation } from '@react-navigation/native';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { kidProgressService, AVAILABLE_BADGES } from '../../services/kidProgressService';
import PinInput from '../../components/PinInput';
import { SearchBar } from '../../components/SearchBar';
import FilterChips, { FilterOption } from '../../components/FilterChips';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { useKidRecipes } from '../../hooks/useKidRecipes';
import type { Recipe, KidBadge, KidRecipe } from '../../types';
import type { KidProgress } from '../../services/kidProgressService';

export default function KidHomeScreen() {
  const navigation = useNavigation<any>();
  const { currentKid, setDeviceModeWithPin, selectKid, parentProfile } = useAuth();
  type KidRecipeDisplay = KidRecipe & {
    title: string;
    image?: string;
    totalTime?: number | string;
    cookTime?: number | string;
    cuisine?: string;
    mealType?: string;
    difficulty?: string;
  };

  const [sharedRecipes, setSharedRecipes] = useState<KidRecipeDisplay[]>([]);
  const [filteredRecipes, setFilteredRecipes] = useState<KidRecipeDisplay[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [showPinInput, setShowPinInput] = useState(false);
  const [progress, setProgress] = useState<KidProgress | null>(null);
  const [recentBadges, setRecentBadges] = useState<KidBadge[]>([]);
  const { data: kidRecipesData = [], isLoading: kidRecipesLoading } = useKidRecipes(currentKid?.id || '');

  // If no kid is selected, redirect to selector
  if (!currentKid) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorEmoji}>👶</Text>
          <Text style={styles.errorTitle}>No Kid Selected</Text>
          <Text style={styles.errorText}>
            Please select which kid profile to use!
          </Text>
          <TouchableOpacity
            style={styles.chooseKidButton}
            onPress={() => selectKid(null)}
          >
            <Text style={styles.chooseKidButtonText}>Choose Kid</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  useEffect(() => {
    if (!currentKid) return;

    logger.debug(`📚 Loaded ${kidRecipesData.length} recipes for kid: ${currentKid.name}`);

    if (kidRecipesData.length > 0) {
      const displayRecipes: KidRecipeDisplay[] = kidRecipesData.map((kidRecipe) => ({
        ...kidRecipe,
        title: kidRecipe.originalRecipeTitle,
        image: kidRecipe.originalRecipeImage,
        totalTime: kidRecipe.estimatedDuration,
        cookTime: kidRecipe.estimatedDuration,
      }));
      setSharedRecipes(displayRecipes);
      setFilteredRecipes(displayRecipes);
    } else {
      logger.debug('ℹ️ No recipes found for this kid');
      setSharedRecipes([]);
      setFilteredRecipes([]);
    }
  }, [kidRecipesData, currentKid]);

  useEffect(() => {
    if (!currentKid) return;

    const progressRef = doc(db, 'kidProgress', currentKid.id);
    const unsubscribe = onSnapshot(progressRef, async (snapshot) => {
      try {
        if (!snapshot.exists()) {
          const created = await kidProgressService.getProgress(currentKid.id);
          setProgress(created);
          setRecentBadges(created.badges.slice(0, 3));
          return;
        }

        const data = snapshot.data() as KidProgress;
        const normalizeDate = (value: any) => (value?.toDate ? value.toDate() : value);
        const normalized: KidProgress = {
          ...data,
          createdAt: normalizeDate(data.createdAt),
          updatedAt: normalizeDate(data.updatedAt),
          badges: (data.badges || []).map((badge) => ({
            ...badge,
            earnedAt: normalizeDate(badge.earnedAt),
          })),
        };

        setProgress(normalized);

        const sortedBadges = normalized.badges
          .sort((a, b) => a.earnedAt.getTime() < b.earnedAt.getTime() ? 1 : -1)
          .slice(0, 3);
        setRecentBadges(sortedBadges);
      } catch (error) {
        console.error('❌ Error loading kid progress:', error);
      }
    });

    return () => unsubscribe();
  }, [currentKid]);

  // Handle search and filter combination for kids
  useEffect(() => {
    let filtered = sharedRecipes;
    const normalizedQuery = searchQuery.trim().toLowerCase();

    // Apply search first (kid recipes only)
    if (normalizedQuery !== '') {
      const words = normalizedQuery.split(/\s+/).filter(Boolean);
      filtered = filtered.filter((recipe) =>
        words.some((word) => recipe.title.toLowerCase().includes(word))
      );
    }

    // Apply active filters with kid-recipe fields
    if (activeFilters.length > 0) {
      filtered = filtered.filter((recipe) =>
        activeFilters.every((filterId) => {
          switch (filterId) {
            case 'quick':
              return (recipe.estimatedDuration ?? 0) <= 30;
            case 'fun':
              return (recipe.difficulty ?? 'easy') === 'easy';
            case 'dessert':
              return recipe.mealType === 'dessert';
            case 'snack':
              return recipe.mealType === 'snack';
            default:
              return true;
          }
        })
      );
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

  const handleRecipePress = (recipe: any) => {
    if (!currentKid) return;
    // Pass kidRecipeId since we're in kid mode and recipe.id is the kid recipe ID
    navigation.navigate('RecipeView', { kidRecipeId: recipe.id, kidId: currentKid.id });
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
    const success = await setDeviceModeWithPin('parent', pin);
    if (success) {
      setShowPinInput(false);
      return;
    }

    setShowPinInput(false);
    Alert.alert('Incorrect PIN', 'That PIN is not correct. Please try again.');
    setTimeout(() => setShowPinInput(true), 100);
  };


  const renderSharedRecipe = ({ item }: { item: KidRecipeDisplay }) => (
    <TouchableOpacity style={[styles.recipeCard, styles.kidRecipeCard]} onPress={() => handleRecipePress(item)}>
      {item.originalRecipeImage && item.originalRecipeImage.startsWith('http') ? (
        <Image
          source={{ uri: item.originalRecipeImage }}
          style={styles.recipeImage}
          contentFit="cover"
          cachePolicy="memory-disk"
        />
      ) : (
        <Text style={styles.recipeEmoji}>🍽️</Text>
      )}
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle}>{item.originalRecipeTitle}</Text>
        <Text style={styles.recipeSubtitle}>Shared by your parent!</Text>
        <View style={styles.recipeDetails}>
          <View style={[styles.difficultyBadge, { backgroundColor: '#10b981' }]}>
            <Text style={styles.difficultyText}>{currentKid?.readingLevel}</Text>
          </View>
          <Text style={styles.timeText}>{item.estimatedDuration || 30}m</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (kidRecipesLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
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
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View style={styles.headerLeft}>
              <Text style={styles.greeting}>
                Hi {currentKid?.name}! 👨‍🍳
              </Text>
            </View>
            <TouchableOpacity style={styles.exitButton} onPress={handleExitKidMode}>
              <Text style={styles.exitButtonText}>Exit</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.subtitle}>
            {searchQuery || activeFilters.length > 0
              ? `Found ${displayedRecipes} of ${totalRecipes} recipes!`
              : totalRecipes > 0
                ? 'Pick a fun recipe to make!'
                : 'Ask your parent to share some recipes!'}
          </Text>
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

        {totalRecipes > 0 && (
          <View>
            <View style={styles.searchContainer}>
              <SearchBar
                placeholder="Find a yummy recipe to cook!"
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
        mode="input"
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e40af',
  },
  subtitle: {
    fontSize: 18,
    color: '#1e40af',
    fontWeight: '500',
  },
  exitButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  exitButtonText: {
    color: '#64748b',
    fontSize: 14,
    fontWeight: '600',
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
  chooseKidButton: {
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cbd5e1',
  },
  chooseKidButtonText: {
    color: '#64748b',
    fontSize: 16,
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
});
