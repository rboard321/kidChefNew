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
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { functions, db } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import type { KidProfile } from '../../types';

interface KidRecipe {
  id: string;
  title: string;
  kidId: string;
  kidName: string;
  readingLevel: string;
  createdAt: any;
  isActive: boolean;
}

export default function RecipeManagementScreen() {
  const { user, kidProfiles } = useAuth();
  const [kidRecipes, setKidRecipes] = useState<KidRecipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingRecipes, setDeletingRecipes] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadKidRecipes();
  }, [kidProfiles]);

  const loadKidRecipes = async () => {
    if (!kidProfiles || kidProfiles.length === 0) {
      setLoading(false);
      return;
    }

    try {
      const allRecipes: KidRecipe[] = [];

      // Fetch recipes for each kid
      for (const kid of kidProfiles) {
        const q = query(
          collection(db, 'kidRecipes'),
          where('kidId', '==', kid.id),
          where('isActive', '==', true),
          orderBy('createdAt', 'desc')
        );

        const querySnapshot = await getDocs(q);

        querySnapshot.docs.forEach(doc => {
          const data = doc.data();
          allRecipes.push({
            id: doc.id,
            title: data.title,
            kidId: kid.id,
            kidName: kid.name,
            readingLevel: data.readingLevel,
            createdAt: data.createdAt,
            isActive: data.isActive
          });
        });
      }

      // Sort all recipes by creation date (newest first)
      allRecipes.sort((a, b) => {
        // Handle missing or invalid timestamps
        const getTimestamp = (timestamp: any) => {
          if (!timestamp) return 0;
          if (typeof timestamp.toMillis === 'function') return timestamp.toMillis();
          if (typeof timestamp.seconds === 'number') return timestamp.seconds * 1000;
          if (timestamp instanceof Date) return timestamp.getTime();
          return 0;
        };

        const timestampA = getTimestamp(a.createdAt);
        const timestampB = getTimestamp(b.createdAt);

        return timestampB - timestampA; // newest first
      });

      setKidRecipes(allRecipes);
    } catch (error) {
      console.error('Error loading kid recipes:', error);
      Alert.alert('Error', 'Failed to load recipes. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadKidRecipes();
  };

  const handleDeleteRecipe = (recipe: KidRecipe) => {
    Alert.alert(
      'Delete Recipe',
      `Are you sure you want to delete "${recipe.title}" from ${recipe.kidName}'s recipes? This action cannot be undone.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteRecipe(recipe),
        },
      ]
    );
  };

  const deleteRecipe = async (recipe: KidRecipe) => {
    if (deletingRecipes.has(recipe.id)) return;

    setDeletingRecipes(prev => new Set(prev.add(recipe.id)));

    try {
      const deleteKidRecipe = httpsCallable(functions, 'deleteKidRecipe');

      const result = await deleteKidRecipe({
        kidRecipeId: recipe.id
      });

      if (result.data.success) {
        // Remove the recipe from the local state
        setKidRecipes(prev => prev.filter(r => r.id !== recipe.id));
        Alert.alert('Success', 'Recipe deleted successfully');
      } else {
        Alert.alert('Error', 'Failed to delete recipe. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting recipe:', error);
      Alert.alert('Error', 'Failed to delete recipe. Please try again.');
    } finally {
      setDeletingRecipes(prev => {
        const newSet = new Set(prev);
        newSet.delete(recipe.id);
        return newSet;
      });
    }
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';

    try {
      let date: Date;

      // Handle Firebase Timestamp
      if (typeof timestamp.toDate === 'function') {
        date = timestamp.toDate();
      }
      // Handle Firestore timestamp object with seconds
      else if (typeof timestamp.seconds === 'number') {
        date = new Date(timestamp.seconds * 1000);
      }
      // Handle regular Date object
      else if (timestamp instanceof Date) {
        date = timestamp;
      }
      // Handle timestamp as number (milliseconds)
      else if (typeof timestamp === 'number') {
        date = new Date(timestamp);
      }
      else {
        return '';
      }

      return date.toLocaleDateString();
    } catch {
      return '';
    }
  };

  const getReadingLevelDisplay = (level: string) => {
    switch (level) {
      case 'beginner': return '📚 Beginner (6-8)';
      case 'intermediate': return '📖 Intermediate (9-12)';
      case 'advanced': return '📑 Advanced (12+)';
      default: return '📖 Intermediate';
    }
  };

  const renderRecipeItem = ({ item }: { item: KidRecipe }) => {
    const isDeleting = deletingRecipes.has(item.id);

    return (
      <View style={styles.recipeCard}>
        <View style={styles.recipeInfo}>
          <Text style={styles.recipeTitle}>{item.title}</Text>
          <Text style={styles.kidName}>👶 {item.kidName}</Text>
          <Text style={styles.readingLevel}>{getReadingLevelDisplay(item.readingLevel)}</Text>
          <Text style={styles.date}>Created: {formatDate(item.createdAt)}</Text>
        </View>

        <TouchableOpacity
          style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
          onPress={() => handleDeleteRecipe(item)}
          disabled={isDeleting}
        >
          {isDeleting ? (
            <ActivityIndicator size="small" color="white" />
          ) : (
            <Text style={styles.deleteButtonText}>🗑️ Delete</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  };

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading recipes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Recipe Management</Text>
        <Text style={styles.subtitle}>
          Manage recipes shared with your kids
        </Text>
      </View>

      {kidRecipes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No Recipes Found</Text>
          <Text style={styles.emptyText}>
            No recipes have been shared with your kids yet. Import some recipes and share them to see them here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={kidRecipes}
          renderItem={renderRecipeItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
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
    backgroundColor: 'white',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 24,
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
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  listContent: {
    padding: 15,
  },
  recipeCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 15,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  recipeInfo: {
    flex: 1,
    marginRight: 15,
  },
  recipeTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 6,
  },
  kidName: {
    fontSize: 14,
    color: '#059669',
    marginBottom: 4,
    fontWeight: '500',
  },
  readingLevel: {
    fontSize: 12,
    color: '#6366f1',
    marginBottom: 4,
  },
  date: {
    fontSize: 12,
    color: '#9ca3af',
  },
  deleteButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  deleteButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});