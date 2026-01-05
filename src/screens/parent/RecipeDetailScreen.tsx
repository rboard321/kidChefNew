import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Image } from 'expo-image';
import { recipeService } from '../../services/recipes';
import { recipeSharingService } from '../../services/recipeSharing';
import { kidRecipeManagerService } from '../../services/kidRecipeManager';
import { useAuth } from '../../contexts/AuthContext';
import RecipeSourceLink from '../../components/RecipeSourceLink';
import type { Ingredient, Recipe } from '../../types';

type RouteParams = { recipeId: string };

export default function RecipeDetailScreen() {
  const route = useRoute();
  const { recipeId } = (route.params || {}) as RouteParams;
  const navigation = useNavigation();
  const { kidProfiles, parentProfile } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [servings, setServings] = useState(1);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [selectedKidIds, setSelectedKidIds] = useState<string[]>([]);
  const [shareSaving, setShareSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadRecipe = async () => {
      if (!recipeId) {
        setLoading(false);
        return;
      }

      try {
        const fetched = await recipeService.getRecipe(recipeId);
        if (isMounted) {
          setRecipe(fetched);
          setServings(1);
        }
      } catch (error) {
        console.error('Failed to load recipe:', error);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadRecipe();
    return () => {
      isMounted = false;
    };
  }, [recipeId]);

  const scaleIngredient = (ingredient: string, scale: number) => {
    const match = ingredient.match(/^([\d\.\s\/]+)\s+(.+)/);
    if (match) {
      const amount = match[1];
      const rest = match[2];
      const scaledAmount = parseFloat(amount) * scale;
      return `${scaledAmount} ${rest}`;
    }
    return ingredient;
  };

  const handleShareWithKids = () => {
    if (!parentProfile?.id) {
      Alert.alert('Unable to Share', 'Please sign in again to share recipes.');
      return;
    }
    if (!kidProfiles.length) {
      Alert.alert('No Kids Yet', 'Create a kid profile to share recipes.');
      return;
    }
    setSelectedKidIds([]);
    setShareModalVisible(true);
  };

  const toggleKidSelection = (kidId: string) => {
    setSelectedKidIds((prev) =>
      prev.includes(kidId) ? prev.filter((id) => id !== kidId) : [...prev, kidId]
    );
  };

  const handleShareAllKids = async () => {
    if (!recipeId || !parentProfile?.id || !recipe) return;
    try {
      setShareSaving(true);

      // Step 1: Create sharedRecipes entries (fast, keep awaiting)
      await recipeSharingService.shareRecipeWithAllKids(recipeId, parentProfile.id);

      // Step 2: Trigger conversions WITHOUT awaiting (non-blocking)
      kidProfiles.forEach((kid) => {
        kidRecipeManagerService.convertAndSaveRecipe(
          recipe, kid.id, kid.readingLevel, kid.age
        ).catch(error => {
          console.error(`Conversion failed for kid ${kid.id}:`, error);
        });
      });

      // Step 3: Close modal immediately and show success message
      setShareModalVisible(false);
      setShareSaving(false);
      Alert.alert(
        'Recipe Shared! 🎉',
        'Your recipe is being converted for your kids. You\'ll see it in "Pending Approvals" when ready.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to share recipe with all kids:', error);
      Alert.alert('Share Failed', 'Unable to share recipe. Please try again.');
      setShareSaving(false);
    }
  };

  const handleShareSelectedKids = async () => {
    if (!recipeId || !parentProfile?.id || !selectedKidIds.length || !recipe) return;
    try {
      setShareSaving(true);

      // Step 1: Create sharedRecipes entries (fast, keep awaiting)
      await Promise.all(
        selectedKidIds.map((kidId) =>
          recipeSharingService.shareRecipeWithKid(recipeId, kidId, parentProfile.id)
        )
      );

      // Step 2: Trigger conversions WITHOUT awaiting (non-blocking)
      selectedKidIds.forEach((kidId) => {
        const kid = kidProfiles.find((profile) => profile.id === kidId);
        if (kid) {
          kidRecipeManagerService.convertAndSaveRecipe(
            recipe, kid.id, kid.readingLevel, kid.age
          ).catch(error => {
            console.error(`Conversion failed for kid ${kidId}:`, error);
          });
        }
      });

      // Step 3: Close modal immediately and show success message
      setShareModalVisible(false);
      setShareSaving(false);
      Alert.alert(
        'Recipe Shared! 🎉',
        'Your recipe is being converted for your kids. You\'ll see it in "Pending Approvals" when ready.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to share recipe with selected kids:', error);
      Alert.alert('Share Failed', 'Unable to share recipe. Please try again.');
      setShareSaving(false);
    }
  };

  const handleEdit = () => {
    if (!recipeId) return;
    navigation.navigate('RecipeEdit' as never, { recipeId } as never);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Recipe',
      'Are you sure you want to delete this recipe? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!recipeId) return;
            try {
              setDeleting(true);
              await recipeService.deleteRecipe(recipeId);
              navigation.goBack();
            } catch (error) {
              console.error('Failed to delete recipe:', error);
              Alert.alert('Delete Failed', 'Unable to delete this recipe right now.');
              setDeleting(false);
            }
          }
        },
      ]
    );
  };

  const displayIngredients = useMemo(() => {
    if (!recipe?.ingredients) return [];
    return recipe.ingredients.map((ingredient) => {
      if (typeof ingredient === 'string') return ingredient;
      return formatIngredient(ingredient);
    });
  }, [recipe?.ingredients]);

  const displaySteps = useMemo(() => {
    if (recipe?.instructions?.length) return recipe.instructions;
    if (recipe?.steps?.length) return recipe.steps.map((step) => step.step);
    return [];
  }, [recipe?.instructions, recipe?.steps]);

  const scale = servings;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      {loading || deleting ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#3b82f6" />
          <Text style={styles.loadingText}>{deleting ? 'Deleting recipe...' : 'Loading recipe...'}</Text>
        </View>
      ) : !recipe ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Recipe not found.</Text>
        </View>
      ) : (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            {recipe.image?.startsWith('http') ? (
              <Image source={{ uri: recipe.image }} style={styles.recipeImage} contentFit="cover" />
            ) : (
              <Text style={styles.emoji}>{recipe.image || '🍽️'}</Text>
            )}
            <Text style={styles.title}>{recipe.title}</Text>
            {!!recipe.description && (
              <Text style={styles.description}>{recipe.description}</Text>
            )}

            <View style={styles.infoGrid}>
              {recipe.prepTime ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Prep Time</Text>
                  <Text style={styles.infoValue}>{formatTime(recipe.prepTime)}</Text>
                </View>
              ) : null}
              {recipe.cookTime ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Cook Time</Text>
                  <Text style={styles.infoValue}>{formatTime(recipe.cookTime)}</Text>
                </View>
              ) : null}
              {recipe.totalTime ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Total Time</Text>
                  <Text style={styles.infoValue}>{formatTime(recipe.totalTime)}</Text>
                </View>
              ) : null}
              {recipe.difficulty ? (
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>Difficulty</Text>
                  <Text style={styles.infoValue}>{formatDifficulty(recipe.difficulty)}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Original Recipe Link */}
          <RecipeSourceLink recipe={recipe} />

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Scale</Text>
              <View style={styles.servingAdjuster}>
                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={() => setServings(Math.max(1, servings - 1))}
                >
                  <Text style={styles.adjustButtonText}>-</Text>
                </TouchableOpacity>
                <Text style={styles.servingsText}>x{servings}</Text>
                <TouchableOpacity
                  style={styles.adjustButton}
                  onPress={() => setServings(servings + 1)}
                >
                  <Text style={styles.adjustButtonText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            {displayIngredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientItem}>
                <Text style={styles.ingredientText}>
                  {scale !== 1 ? scaleIngredient(ingredient, scale) : ingredient}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Instructions</Text>
            {displaySteps.map((instruction, index) => (
              <View key={index} style={styles.instructionItem}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.instructionText}>{instruction}</Text>
              </View>
            ))}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity style={styles.primaryButton} onPress={handleShareWithKids}>
              <Text style={styles.primaryButtonText}>👨‍👩‍👧‍👦 Share with Kids</Text>
            </TouchableOpacity>

            <View style={styles.secondaryActions}>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleEdit}>
                <Text style={styles.secondaryButtonText}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.secondaryButton, styles.deleteButton]} onPress={handleDelete}>
                <Text style={[styles.secondaryButtonText, styles.deleteButtonText]}>🗑️ Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
          <Modal
            visible={shareModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setShareModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Share with Kids</Text>
                <TouchableOpacity
                  style={styles.modalPrimaryButton}
                  onPress={handleShareAllKids}
                  disabled={shareSaving}
                >
                  <Text style={styles.modalPrimaryButtonText}>Share with All</Text>
                </TouchableOpacity>
                {shareSaving ? (
                  <View style={styles.shareStatus}>
                    <ActivityIndicator size="small" color="#2563eb" />
                    <Text style={styles.shareStatusText}>Sharing with kids...</Text>
                  </View>
                ) : null}
                <Text style={styles.modalSubTitle}>Or select kids</Text>
                <ScrollView style={styles.kidList}>
                  {kidProfiles.map((kid) => {
                    const selected = selectedKidIds.includes(kid.id);
                    return (
                      <TouchableOpacity
                        key={kid.id}
                        style={styles.kidRow}
                        onPress={() => toggleKidSelection(kid.id)}
                        disabled={shareSaving}
                      >
                        <View style={[styles.checkCircle, selected && styles.checkCircleSelected]}>
                          {selected ? <Text style={styles.checkMark}>✓</Text> : null}
                        </View>
                        <Text style={styles.kidName}>{kid.name}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalSecondaryButton}
                    onPress={() => setShareModalVisible(false)}
                    disabled={shareSaving}
                  >
                    <Text style={styles.modalSecondaryButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalPrimaryButton,
                      !selectedKidIds.length && styles.modalPrimaryButtonDisabled,
                    ]}
                    onPress={handleShareSelectedKids}
                    disabled={shareSaving || !selectedKidIds.length}
                  >
                    <Text style={styles.modalPrimaryButtonText}>Share Selected</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const formatDifficulty = (difficulty: Recipe['difficulty']) => {
  if (!difficulty) return '';
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
};

const formatTime = (value: Recipe['prepTime']) => {
  if (typeof value === 'number') return `${value} min`;
  return value;
};

const formatIngredient = (ingredient: Ingredient) => {
  const parts = [
    ingredient.amount ? String(ingredient.amount) : '',
    ingredient.unit || '',
    ingredient.name || '',
    ingredient.notes ? `(${ingredient.notes})` : ''
  ].filter(Boolean);
  return parts.join(' ');
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#6b7280',
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  recipeImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 16,
  },
  emoji: {
    fontSize: 60,
    marginBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 20,
  },
  infoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 15,
  },
  infoItem: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    minWidth: 70,
  },
  infoLabel: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '500',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '600',
  },
  section: {
    backgroundColor: 'white',
    margin: 15,
    padding: 20,
    borderRadius: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 15,
  },
  servingAdjuster: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    padding: 4,
  },
  adjustButton: {
    width: 32,
    height: 32,
    backgroundColor: 'white',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adjustButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2563eb',
  },
  servingsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginHorizontal: 15,
    minWidth: 20,
    textAlign: 'center',
  },
  ingredientItem: {
    backgroundColor: '#f8fafc',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  ingredientText: {
    fontSize: 16,
    color: '#1f2937',
  },
  instructionItem: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  stepNumber: {
    width: 28,
    height: 28,
    backgroundColor: '#2563eb',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    marginTop: 2,
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: 'white',
  },
  instructionText: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
    lineHeight: 24,
  },
  actions: {
    padding: 20,
    paddingBottom: 40,
  },
  primaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 15,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: 'white',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  deleteButton: {
    borderColor: '#ef4444',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  deleteButtonText: {
    color: '#ef4444',
  },
  modalOverlay: {
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
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalSubTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
    marginTop: 12,
    marginBottom: 8,
  },
  modalPrimaryButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  modalPrimaryButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  modalPrimaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  kidList: {
    maxHeight: 220,
  },
  kidRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  kidName: {
    fontSize: 16,
    color: '#111827',
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#cbd5f5',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleSelected: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  checkMark: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  shareStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  shareStatusText: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
  modalSecondaryButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  modalSecondaryButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#6b7280',
  },
});
