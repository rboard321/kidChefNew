import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { recipeFavoritesService } from '../../services/recipeFavorites';
import { recipeService } from '../../services/recipes';
import { useAuth } from '../../contexts/AuthContext';
import type { Recipe } from '../../types';

export default function FavoritesScreen() {
  const navigation = useNavigation();
  const { parentProfile, kidProfiles } = useAuth();
  const [favoriteRecipes, setFavoriteRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'parent' | string>('parent'); // 'parent' or kidId

  useEffect(() => {
    if (parentProfile) {
      loadFavorites();
    }
  }, [parentProfile, selectedTab]);

  useFocusEffect(
    React.useCallback(() => {
      if (parentProfile) {
        loadFavorites();
      }
    }, [parentProfile, selectedTab])
  );

  const loadFavorites = async () => {
    if (!parentProfile) return;

    try {
      setLoading(true);
      const kidId = selectedTab === 'parent' ? undefined : selectedTab;
      const favoriteRecipeIds = await recipeFavoritesService.getFavoriteRecipes(parentProfile.id, kidId);

      // Load full recipe details
      const recipes = await Promise.all(
        favoriteRecipeIds.map(async (recipeId) => {
          try {
            return await recipeService.getRecipe(recipeId);
          } catch (error) {
            console.error('Error loading favorite recipe:', error);
            return null;
          }
        })
      );

      const validRecipes = recipes.filter((recipe): recipe is Recipe => recipe !== null);
      setFavoriteRecipes(validRecipes);
    } catch (error) {
      console.error('Error loading favorites:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadFavorites();
  };

  const handleRecipePress = (recipe: Recipe) => {
    navigation.navigate('RecipeDetail' as never, { recipeId: recipe.id } as never);
  };

  const renderRecipeCard = ({ item }: { item: Recipe }) => {
    const hasImage = item.image && item.image.startsWith('http');

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

  const renderTabButton = (id: string, label: string) => {
    const isSelected = selectedTab === id;
    return (
      <TouchableOpacity
        style={[styles.tabButton, isSelected && styles.tabButtonActive]}
        onPress={() => setSelectedTab(id)}
      >
        <Text style={[styles.tabText, isSelected && styles.tabTextActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  if (!parentProfile) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Please log in to view favorites</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>❤️ Favorite Recipes</Text>
        <Text style={styles.subtitle}>
          {favoriteRecipes.length} favorite{favoriteRecipes.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Tabs for parent vs kids */}
      {kidProfiles.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabsScrollView}
          contentContainerStyle={styles.tabsContainer}
        >
          {renderTabButton('parent', 'Your Favorites')}
          {kidProfiles.map((kid) => (
            <React.Fragment key={kid.id}>
              {renderTabButton(kid.id, `${kid.name}'s Favorites`)}
            </React.Fragment>
          ))}
        </ScrollView>
      )}

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading favorites...</Text>
        </View>
      ) : favoriteRecipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>💔</Text>
          <Text style={styles.emptyTitle}>No favorites yet!</Text>
          <Text style={styles.emptyText}>
            {selectedTab === 'parent'
              ? "Start favoriting recipes by tapping the heart icon on recipe details."
              : `${kidProfiles.find(k => k.id === selectedTab)?.name || 'This kid'} hasn't favorited any recipes yet.`
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={favoriteRecipes}
          renderItem={renderRecipeCard}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2563eb']}
              tintColor="#2563eb"
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
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
  tabsScrollView: {
    maxHeight: 60,
    paddingBottom: 15,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
  },
  tabButton: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  tabButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  tabTextActive: {
    color: 'white',
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
    color: '#6b7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyEmoji: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
  },
  listContainer: {
    padding: 15,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  recipeCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    width: '48%',
  },
  recipeImageContainer: {
    position: 'relative',
    height: 150,
  },
  recipeImageBackground: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  recipeContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 12,
  },
  recipeTitleWithImage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  recipeDetails: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipeDetailText: {
    fontSize: 12,
    color: 'white',
    opacity: 0.9,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  recipeCardNoImage: {
    padding: 16,
    alignItems: 'center',
    minHeight: 120,
    justifyContent: 'center',
  },
  recipeEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  recipeDetailsNoImage: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  recipeDetailNoImage: {
    fontSize: 12,
    color: '#6b7280',
  },
});