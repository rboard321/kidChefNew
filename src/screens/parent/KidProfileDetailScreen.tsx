import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation, type RouteProp } from '@react-navigation/native';
import { kidRecipeManagerService } from '../../services/kidRecipeManager';
import { recipeService } from '../../services/recipes';
import type { KidProfile, KidRecipe, Recipe, RootStackParamList, ReadingLevel } from '../../types';

type KidProfileDetailRouteProp = RouteProp<RootStackParamList, 'KidProfileDetail'>;

interface RecipeWithDetails extends KidRecipe {
  recipeTitle: string;
}

export default function KidProfileDetailScreen() {
  const route = useRoute<KidProfileDetailRouteProp>();
  const navigation = useNavigation();
  const { kid } = route.params;

  const [recipes, setRecipes] = useState<RecipeWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingRecipes, setDeletingRecipes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadRecipes();
  }, [kid.id]);

  const loadRecipes = async () => {
    try {
      console.log('Loading recipes for kid:', kid.id);

      // Fetch kid recipes for this kid
      const kidRecipes = await kidRecipeManagerService.getKidRecipes(kid.id);
      console.log(`Found ${kidRecipes.length} kid recipes`);

      // Fetch original recipe details for each kid recipe to get the title
      const recipesWithDetails: RecipeWithDetails[] = [];

      for (const kidRecipe of kidRecipes) {
        try {
          const originalRecipe = await recipeService.getRecipe(kidRecipe.originalRecipeId);
          recipesWithDetails.push({
            ...kidRecipe,
            recipeTitle: originalRecipe?.title || 'Untitled Recipe',
          });
        } catch (error) {
          console.error('Error fetching original recipe:', error);
          recipesWithDetails.push({
            ...kidRecipe,
            recipeTitle: 'Untitled Recipe',
          });
        }
      }

      setRecipes(recipesWithDetails);
    } catch (error) {
      console.error('Error loading recipes:', error);
      Alert.alert('Error', 'Failed to load recipes. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadRecipes();
  };

  const handleDeleteRecipe = (recipe: RecipeWithDetails) => {
    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to remove "${recipe.recipeTitle}" from ${kid.name}'s recipes?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRecipe(recipe.id);
          },
        },
      ]
    );
  };

  const deleteRecipe = async (kidRecipeId: string) => {
    try {
      setDeletingRecipes(prev => new Set(prev).add(kidRecipeId));

      await kidRecipeManagerService.deleteKidRecipe(kidRecipeId);

      // Remove from local state
      setRecipes(prev => prev.filter(r => r.id !== kidRecipeId));

      Alert.alert('Success', 'Recipe removed successfully');
    } catch (error) {
      console.error('Error deleting recipe:', error);
      Alert.alert('Error', 'Failed to delete recipe. Please try again.');
    } finally {
      setDeletingRecipes(prev => {
        const next = new Set(prev);
        next.delete(kidRecipeId);
        return next;
      });
    }
  };

  const getReadingLevelColor = (level: ReadingLevel): string => {
    switch (level) {
      case 'beginner': return '#10b981';
      case 'intermediate': return '#f59e0b';
      case 'advanced': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const formatDate = (date: any): string => {
    if (!date) return '';

    try {
      let jsDate: Date;

      if (date instanceof Date) {
        jsDate = date;
      } else if (typeof date.toDate === 'function') {
        jsDate = date.toDate();
      } else if (typeof date.toMillis === 'function') {
        jsDate = new Date(date.toMillis());
      } else if (typeof date.seconds === 'number') {
        jsDate = new Date(date.seconds * 1000);
      } else {
        return '';
      }

      return jsDate.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return '';
    }
  };

  const renderRecipeItem = ({ item }: { item: RecipeWithDetails }) => {
    const isDeleting = deletingRecipes.has(item.id);

    return (
      <View style={styles.recipeCard}>
        <View style={styles.recipeContent}>
          <Text style={styles.recipeTitle}>{item.recipeTitle}</Text>
          <View style={styles.recipeMetadata}>
            <View style={[styles.readingBadge, { backgroundColor: getReadingLevelColor(item.targetReadingLevel) }]}>
              <Text style={styles.readingText}>{item.targetReadingLevel}</Text>
            </View>
            <Text style={styles.recipeDateText}>Added {formatDate(item.createdAt)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
          onPress={() => handleDeleteRecipe(item)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="#ef4444" />
          ) : (
            <Text style={styles.deleteButtonText}>🗑️</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Text style={styles.emptyEmoji}>🍽️</Text>
      <Text style={styles.emptyTitle}>No Recipes Yet</Text>
      <Text style={styles.emptyText}>
        No recipes have been shared with {kid.name} yet.{'\n'}
        Share recipes from your recipe library!
      </Text>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Kid Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarEmoji}>{kid.avatarEmoji || '👶'}</Text>
        </View>
        <Text style={styles.kidName}>{kid.name}</Text>
        <View style={styles.detailsRow}>
          <Text style={styles.detailText}>Age {kid.age}</Text>
          <Text style={styles.detailDivider}>•</Text>
          <View style={[styles.readingBadge, { backgroundColor: getReadingLevelColor(kid.readingLevel) }]}>
            <Text style={styles.readingText}>{kid.readingLevel}</Text>
          </View>
        </View>

        {kid.allergyFlags && kid.allergyFlags.length > 0 && (
          <View style={styles.allergyContainer}>
            <Text style={styles.allergyLabel}>Allergies:</Text>
            <Text style={styles.allergyText}>{kid.allergyFlags.join(', ')}</Text>
          </View>
        )}
      </View>

      {/* Recipes Section */}
      <View style={styles.recipesSection}>
        <Text style={styles.sectionTitle}>{kid.name}'s Recipes</Text>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Loading recipes...</Text>
          </View>
        ) : (
          <FlatList
            data={recipes}
            renderItem={renderRecipeItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.recipesList}
            ListEmptyComponent={renderEmptyState}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor="#2563eb"
              />
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  avatarEmoji: {
    fontSize: 60,
  },
  kidName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 16,
    color: '#6b7280',
  },
  detailDivider: {
    fontSize: 16,
    color: '#d1d5db',
  },
  allergyContainer: {
    flexDirection: 'row',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  allergyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
    marginRight: 8,
  },
  allergyText: {
    fontSize: 14,
    color: '#ef4444',
    flex: 1,
  },
  recipesSection: {
    flex: 1,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
  },
  recipesList: {
    paddingBottom: 20,
  },
  recipeCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  recipeContent: {
    flex: 1,
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  recipeMetadata: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readingBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  readingText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  recipeDateText: {
    fontSize: 13,
    color: '#9ca3af',
  },
  deleteButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  deleteButtonDisabled: {
    opacity: 0.5,
  },
  deleteButtonText: {
    fontSize: 18,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
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
});
