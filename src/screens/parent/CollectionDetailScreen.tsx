import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { recipeService } from '../../services/recipes';
import { collectionService } from '../../services/collections';
import { useAuth } from '../../contexts/AuthContext';
import { useCollection } from '../../hooks/useCollections';
import type { Collection, Recipe } from '../../types';

type RouteParams = { collectionId: string };

export default function CollectionDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation<any>();
  const { parentProfile } = useAuth();
  const { collectionId } = (route.params || {}) as RouteParams;
  const { data: collection } = useCollection(collectionId);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!parentProfile?.id || !collection) return;
      try {
        setLoading(true);
        const parentRecipes = await recipeService.getUserRecipes(parentProfile.id);
        const collectionRecipes = parentRecipes.filter((recipe) =>
          collection.recipeIds?.includes(recipe.id)
        );
        setRecipes(collectionRecipes);
      } catch (error) {
        console.error('Failed to load collection recipes:', error);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [parentProfile?.id, collection]);

  const handleRemove = async (recipeId: string) => {
    Alert.alert('Remove Recipe', 'Remove this recipe from the collection?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await collectionService.removeRecipeFromCollection(collectionId, recipeId);
            setRecipes((prev) => prev.filter((recipe) => recipe.id !== recipeId));
          } catch (error) {
            console.error('Failed to remove recipe from collection:', error);
            Alert.alert('Error', 'Unable to remove recipe. Please try again.');
          }
        },
      },
    ]);
  };

  const handleDeleteCollection = () => {
    Alert.alert('Delete Collection', 'Delete this collection? Recipes will stay in your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await collectionService.deleteCollection(collectionId);
            navigation.goBack();
          } catch (error) {
            console.error('Failed to delete collection:', error);
            Alert.alert('Error', 'Unable to delete collection. Please try again.');
          }
        },
      },
    ]);
  };

  const renderRecipe = ({ item }: { item: Recipe }) => {
    const hasImage = item.image && item.image.startsWith('http');
    return (
      <View style={styles.recipeCard}>
        {hasImage ? (
          <Image source={{ uri: item.image }} style={styles.recipeImage} />
        ) : (
          <View style={styles.recipeImageFallback}>
            <Text style={styles.recipeImageEmoji}>🍽️</Text>
          </View>
        )}
        <View style={styles.recipeInfo}>
          <Text style={styles.recipeTitle}>{item.title}</Text>
          <TouchableOpacity onPress={() => handleRemove(item.id)}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>{collection?.name || 'Collection'}</Text>
        <Text style={styles.subtitle}>{collection?.description || 'No description'}</Text>
        <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteCollection}>
          <Text style={styles.deleteButtonText}>Delete Collection</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <Text style={styles.loadingText}>Loading recipes...</Text>
      ) : recipes.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📂</Text>
          <Text style={styles.emptyTitle}>No recipes here yet</Text>
          <Text style={styles.emptyText}>Add recipes from the recipe detail screen.</Text>
        </View>
      ) : (
        <FlatList
          data={recipes}
          keyExtractor={(item) => item.id}
          renderItem={renderRecipe}
          contentContainerStyle={styles.list}
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
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1f2937',
  },
  subtitle: {
    color: '#6b7280',
    marginTop: 4,
  },
  deleteButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#fee2e2',
  },
  deleteButtonText: {
    color: '#b91c1c',
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  recipeCard: {
    backgroundColor: 'white',
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  recipeImage: {
    width: 90,
    height: 90,
  },
  recipeImageFallback: {
    width: 90,
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e5e7eb',
  },
  recipeImageEmoji: {
    fontSize: 24,
  },
  recipeInfo: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  removeText: {
    color: '#ef4444',
    fontWeight: '600',
    marginTop: 6,
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
    color: '#1f2937',
  },
  emptyText: {
    color: '#6b7280',
    marginTop: 6,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#6b7280',
  },
});
