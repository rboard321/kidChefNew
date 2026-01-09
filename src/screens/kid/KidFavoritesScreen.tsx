import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { recipeFavoritesService } from '../../services/recipeFavorites';
import { useKidRecipes } from '../../hooks/useKidRecipes';
import type { KidRecipe } from '../../types';

type KidRecipeDisplay = KidRecipe & {
  title: string;
  image?: string;
};

export default function KidFavoritesScreen() {
  const { currentKid, parentProfile } = useAuth();
  const navigation = useNavigation();
  const [favorites, setFavorites] = useState<KidRecipeDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: kidRecipesData = [], isLoading: kidRecipesLoading } = useKidRecipes(currentKid?.id || '');

  useEffect(() => {
    loadFavorites();
  }, [currentKid, parentProfile, kidRecipesData]);

  const loadFavorites = async () => {
    if (!currentKid || !parentProfile || kidRecipesLoading) return;

    setLoading(true);
    try {
      // Get favorite recipe IDs for this kid (these are original recipe IDs)
      const favoriteRecipeIds = await recipeFavoritesService.getFavoriteRecipes(
        parentProfile.id,
        currentKid.id
      );

      // Filter kid recipes to only those that are favorited
      const favoritedKidRecipes = kidRecipesData
        .filter(kidRecipe => favoriteRecipeIds.includes(kidRecipe.originalRecipeId))
        .map(kidRecipe => ({
          ...kidRecipe,
          title: kidRecipe.originalRecipeTitle,
          image: kidRecipe.originalRecipeImage,
        }));

      setFavorites(favoritedKidRecipes);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRecipePress = (recipe: KidRecipeDisplay) => {
    if (!currentKid) return;
    // Navigate to RecipeView with kidRecipeId (matching how KidHomeScreen navigates)
    navigation.navigate('RecipeView' as never, {
      kidRecipeId: recipe.id,
      kidId: currentKid.id,
    } as never);
  };

  const renderRecipeCard = ({ item }: { item: KidRecipeDisplay }) => (
    <TouchableOpacity
      style={styles.recipeCard}
      onPress={() => handleRecipePress(item)}
    >
      {item.image ? (
        <Image source={{ uri: item.image }} style={styles.recipeImage} />
      ) : (
        <View style={styles.recipeImagePlaceholder}>
          <Text style={styles.recipeImageEmoji}>🍳</Text>
        </View>
      )}
      <View style={styles.recipeInfo}>
        <Text style={styles.recipeTitle}>{item.title}</Text>
        <Text style={styles.favoriteIcon}>💖</Text>
      </View>
    </TouchableOpacity>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyEmoji}>🤍</Text>
      <Text style={styles.emptyTitle}>No favorites yet!</Text>
      <Text style={styles.emptyText}>
        Tap the heart on any recipe to save it here
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Loading your favorites...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>💖 My Favorites</Text>
        <Text style={styles.headerSubtitle}>
          {favorites.length} {favorites.length === 1 ? 'recipe' : 'recipes'}
        </Text>
      </View>

      <FlatList
        data={favorites}
        renderItem={renderRecipeCard}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.listContent}
        columnWrapperStyle={styles.columnWrapper}
        ListEmptyComponent={renderEmpty}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f9ff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748b',
  },
  listContent: {
    padding: 12,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  recipeCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  recipeImage: {
    width: '100%',
    height: 120,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  recipeImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: '#e0f2fe',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  recipeImageEmoji: {
    fontSize: 48,
  },
  recipeInfo: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  recipeTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    flex: 1,
  },
  favoriteIcon: {
    fontSize: 20,
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 80,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e293b',
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
