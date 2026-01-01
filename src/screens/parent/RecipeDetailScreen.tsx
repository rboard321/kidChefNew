import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { recipeService } from '../../services/recipes';
import { recipeSharingService } from '../../services/recipeSharing';
import { kidRecipeManagerService } from '../../services/kidRecipeManager';
import { recipeFavoritesService } from '../../services/recipeFavorites';
import { useAuth } from '../../contexts/AuthContext';
import { SkeletonRecipeDetail } from '../../components/SkeletonLoader';
import { checkRecipeSafety, generateSafetyWarningText } from '../../utils/recipeSafety';
import type { Recipe, KidProfile } from '../../types';

export default function RecipeDetailScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { recipeId } = route.params as { recipeId: string };
  const { kidProfiles, user, parentProfile } = useAuth();

  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [servings, setServings] = useState(4);
  const [scaleMultiplier, setScaleMultiplier] = useState(1);
  const [sharedKids, setSharedKids] = useState<string[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);

  useEffect(() => {
    loadRecipe();
  }, [recipeId]);

  const loadRecipe = async () => {
    try {
      setLoading(true);
      const recipeData = await recipeService.getRecipe(recipeId);
      if (recipeData) {
        setRecipe(recipeData);
        setServings(recipeData.servings || 4);
        setScaleMultiplier(1);
        await loadSharedKids();
        await loadFavoriteStatus();
      } else {
        Alert.alert('Error', 'Recipe not found');
      }
    } catch (error) {
      console.error('Error loading recipe:', error);
      Alert.alert('Error', 'Failed to load recipe');
    } finally {
      setLoading(false);
    }
  };

  const loadFavoriteStatus = async () => {
    if (!parentProfile) return;

    try {
      const favoriteStatus = await recipeFavoritesService.isFavorite(recipeId, parentProfile.id);
      setIsFavorite(favoriteStatus);
    } catch (error) {
      console.error('Error loading favorite status:', error);
    }
  };

  const loadSharedKids = async () => {
    try {
      if (recipe) {
        const sharedRecipes = await recipeSharingService.getSharedRecipesByParent(user!.uid);
        const thisRecipeShares = sharedRecipes.filter(share => share.parentRecipeId === recipe.id);
        const sharedKidIds = thisRecipeShares.map(share => share.kidId);
        setSharedKids(sharedKidIds);
      }
    } catch (error) {
      console.error('Error loading shared kids:', error);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading recipe...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!recipe) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Recipe not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  const scaleIngredient = (ingredient: string, scale: number) => {
    // Handle fractions like 1/2, 3/4, 1 1/2, etc.
    const fractionMatch = ingredient.match(/^(\d+\s+)?(\d+)\/(\d+)\s+(.+)/);
    if (fractionMatch) {
      const wholeNumber = fractionMatch[1] ? parseInt(fractionMatch[1].trim()) : 0;
      const numerator = parseInt(fractionMatch[2]);
      const denominator = parseInt(fractionMatch[3]);
      const rest = fractionMatch[4];

      const decimalValue = wholeNumber + (numerator / denominator);
      const scaledValue = decimalValue * scale;

      return `${formatScaledAmount(scaledValue)} ${rest}`;
    }

    // Handle decimal numbers
    const decimalMatch = ingredient.match(/^([\d\.]+)\s+(.+)/);
    if (decimalMatch) {
      const amount = parseFloat(decimalMatch[1]);
      const rest = decimalMatch[2];
      const scaledAmount = amount * scale;
      return `${formatScaledAmount(scaledAmount)} ${rest}`;
    }

    // Handle ranges like "2-3 cups"
    const rangeMatch = ingredient.match(/^(\d+)-(\d+)\s+(.+)/);
    if (rangeMatch) {
      const min = parseInt(rangeMatch[1]) * scale;
      const max = parseInt(rangeMatch[2]) * scale;
      const rest = rangeMatch[3];
      return `${formatScaledAmount(min)}-${formatScaledAmount(max)} ${rest}`;
    }

    // If no number found, return original
    return ingredient;
  };

  const formatScaledAmount = (amount: number): string => {
    // Convert decimals to fractions when appropriate
    if (amount === 0.25) return '¼';
    if (amount === 0.5) return '½';
    if (amount === 0.75) return '¾';
    if (amount === 1/3) return '⅓';
    if (amount === 2/3) return '⅔';

    // Handle mixed numbers
    const wholeNumber = Math.floor(amount);
    const decimal = amount - wholeNumber;

    if (decimal === 0) return wholeNumber.toString();

    if (decimal === 0.25) return wholeNumber > 0 ? `${wholeNumber}¼` : '¼';
    if (decimal === 0.5) return wholeNumber > 0 ? `${wholeNumber}½` : '½';
    if (decimal === 0.75) return wholeNumber > 0 ? `${wholeNumber}¾` : '¾';
    if (Math.abs(decimal - 1/3) < 0.01) return wholeNumber > 0 ? `${wholeNumber}⅓` : '⅓';
    if (Math.abs(decimal - 2/3) < 0.01) return wholeNumber > 0 ? `${wholeNumber}⅔` : '⅔';

    // For other decimals, round to 1 decimal place
    return amount % 1 === 0 ? amount.toString() : amount.toFixed(1);
  };

  const handleShareWithKids = () => {
    if (kidProfiles.length === 0) {
      Alert.alert(
        'No Kid Profiles',
        'You need to create kid profiles before you can share recipes. Go to the Kids tab to create your first kid profile.',
        [{ text: 'OK' }]
      );
      return;
    }

    const options = [
      { text: 'Cancel', style: 'cancel' as const },
      { text: 'Share with All Kids', onPress: () => shareWithAllKids() },
    ];

    // Add individual kid options
    kidProfiles.forEach(kid => {
      const isShared = sharedKids.includes(kid.id);
      options.splice(-1, 0, {
        text: `${isShared ? 'Already shared with' : 'Share with'} ${kid.name}`,
        onPress: isShared ? () => Alert.alert('Already Shared', `Recipe is already shared with ${kid.name}`) : async () => await shareWithKid(kid),
      });
    });

    Alert.alert(
      'Share Recipe',
      'Choose who to share this recipe with. It will be available in their kid mode interface!',
      options
    );
  };

  const shareWithAllKids = async () => {
    if (!user || !recipe) return;

    const availableKids = kidProfiles.filter(kid =>
      !sharedKids.includes(kid.id)
    );

    if (availableKids.length === 0) {
      Alert.alert(
        'Already Shared',
        'This recipe is already shared with all your kids!'
      );
      return;
    }

    // Check recipe safety before sharing with all kids
    const safetyCheck = checkRecipeSafety(recipe);

    if (!safetyCheck.isCompletelyKidSafe) {
      const warningText = generateSafetyWarningText(safetyCheck.flags);

      Alert.alert(
        '⚠️ Safety Notice',
        `${warningText}\n\nShare this recipe with all kids anyway? You can supervise them during cooking.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Share with All',
            style: 'default',
            onPress: () => proceedWithSharingAll(availableKids)
          }
        ]
      );
      return;
    }

    // If completely safe, proceed directly
    proceedWithSharingAll(availableKids);
  };

  const proceedWithSharingAll = async (availableKids: KidProfile[]) => {
    if (!user || !recipe) return;

    try {
      setSharing(true);

      Alert.alert(
        'Sharing with All Kids... 🎉',
        `Sharing "${recipe.title}" with ${availableKids.length} kids. They'll be able to see it in kid mode!`,
        [{ text: 'OK' }]
      );

<<<<<<< HEAD
      // Convert and share with each kid
      for (const kid of availableKids) {
        await kidRecipeManagerService.convertAndSaveRecipe(
          recipe,
          kid.id,
          kid.readingLevel,
          kid.age
        );
        await recipeSharingService.shareRecipeWithKid(recipe.id, kid.id, user.uid);
=======
    try {
      console.log(`🚀 Starting bulk share for ${availableKids.length} kids:`, availableKids.map(k => k.name));

      // Convert and share with each kid
      for (const kid of availableKids) {
        try {
          console.log(`📝 Starting conversion for kid ${kid.name} (${kid.id})`);
          await kidRecipeManagerService.convertAndSaveRecipe(
            recipe,
            kid.id,
            kid.readingLevel,
            kid.age
          );
          console.log(`✅ Conversion successful for kid ${kid.name}, now sharing...`);

          // Add a small delay to prevent potential race conditions
          await new Promise(resolve => setTimeout(resolve, 100));

          await recipeSharingService.shareRecipeWithKid(recipe.id, kid.id, parentProfile.id);
          console.log(`🔗 Successfully shared with kid ${kid.name}`);
          successfulShares.push(kid.name);

          // Add another small delay between kids
          await new Promise(resolve => setTimeout(resolve, 200));
        } catch (kidError) {
          console.error(`❌ Error sharing with kid ${kid.name}:`, {
            error: kidError.message || kidError,
            code: kidError.code || 'unknown',
            kidId: kid.id,
            recipeId: recipe.id,
            parentProfileId: parentProfile.id,
            errorStack: kidError.stack
          });
          failedShares.push(kid.name);
        }
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
      }

      await loadSharedKids();
      Alert.alert(
        'Recipe Shared with Everyone! 🎉',
        `"${recipe.title}" has been shared with all ${availableKids.length} kids!`,
        [{ text: 'Great!' }]
      );
    } catch (error) {
      console.error('Error sharing recipe with all kids:', error);
      Alert.alert('Error', 'Failed to share recipe with all kids. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const shareWithKid = async (kid: KidProfile) => {
    if (!user || !recipe) return;

    // Check recipe safety before sharing
    const safetyCheck = checkRecipeSafety(recipe);

    if (!safetyCheck.isCompletelyKidSafe) {
      const warningText = generateSafetyWarningText(safetyCheck.flags);

      Alert.alert(
        '⚠️ Safety Notice',
        `${warningText}\n\nShare this recipe with ${kid.name} anyway? You can supervise them during cooking.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Share Anyway',
            style: 'default',
            onPress: () => proceedWithSharing(kid)
          }
        ]
      );
      return;
    }

    // If completely safe, proceed directly
    proceedWithSharing(kid);
  };

  const proceedWithSharing = async (kid: KidProfile) => {
    if (!user || !recipe) return;

    try {
      setSharing(true);

      // Immediate feedback - sharing starts right away
      Alert.alert(
        'Sharing Recipe! 🎉',
        `"${recipe.title}" is being prepared for ${kid.name}. The kid-friendly version will be ready shortly!`,
        [{ text: 'Great!' }]
      );

      // Share the basic recipe immediately (optimistic update)
      await recipeSharingService.shareRecipeWithKid(recipe.id, kid.id, user.uid);
      await loadSharedKids();

      // Start the AI conversion in the background (don't wait for it)
      startBackgroundConversion(recipe, kid);

    } catch (error) {
      console.error('Error sharing recipe:', error);
      Alert.alert('Error', 'Failed to share recipe. Please try again.');
    } finally {
      setSharing(false);
    }
  };

  const startBackgroundConversion = async (recipe: Recipe, kid: KidProfile) => {
    try {
      console.log(`Starting background AI conversion for ${kid.name}...`);

      // This runs in background while user continues using the app
      await kidRecipeManagerService.convertAndSaveRecipe(
        recipe,
        kid.id,
        kid.readingLevel,
        kid.age
      );

      console.log(`Background conversion completed for ${kid.name}`);
      // Note: Could add an in-app notification here when conversion is complete
    } catch (error) {
      console.error('Background conversion failed:', error);
      // Could show a notification about conversion failure
    }
  };

  const handleToggleFavorite = async () => {
    console.log('handleToggleFavorite called', { recipeId, parentProfile: !!parentProfile });
    if (!parentProfile) {
      console.log('No parent profile available');
      return;
    }

    try {
      setFavoriteLoading(true);
      console.log('Calling toggleFavorite service...');
      const newFavoriteStatus = await recipeFavoritesService.toggleFavorite(recipeId, parentProfile.id);
      console.log('Toggle favorite result:', newFavoriteStatus);
      setIsFavorite(newFavoriteStatus);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Error', 'Failed to update favorite status. Please try again.');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const handleShare = () => {
    console.log('Sharing recipe...');
  };

  const handleEdit = () => {
    console.log('Edit recipe...');
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
            setDeleting(true);
            try {
              await recipeService.deleteRecipe(recipeId);
              Alert.alert(
                'Recipe Deleted',
                'The recipe has been successfully deleted.',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.goBack()
                  }
                ]
              );
            } catch (error) {
              console.error('Error deleting recipe:', error);
              Alert.alert(
                'Error',
                'Failed to delete the recipe. Please try again.',
                [{ text: 'OK' }]
              );
            } finally {
              setDeleting(false);
            }
          }
        },
      ]
    );
  };

  if (loading || !recipe) {
    return (
      <SafeAreaView style={styles.container}>
        <SkeletonRecipeDetail />
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.favoriteButton}
              onPress={() => {
                console.log('Favorite button touched!');
                handleToggleFavorite();
              }}
              disabled={favoriteLoading}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              {favoriteLoading ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Text style={[
                  styles.favoriteIcon,
                  isFavorite && styles.favoriteIconActive
                ]}>
                  {isFavorite ? '❤️' : '🤍'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {recipe.image && recipe.image.startsWith('http') ? (
            <Image
              source={{ uri: recipe.image }}
              style={styles.recipeImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <Text style={styles.emoji}>{recipe.image || '🍽️'}</Text>
          )}
          <Text style={styles.title}>{recipe.title}</Text>
          <Text style={styles.description}>{recipe.description}</Text>

          <View style={styles.infoGrid}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Servings</Text>
              <Text style={styles.infoValue}>{Math.round(servings * scaleMultiplier)}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Prep Time</Text>
              <Text style={styles.infoValue}>{recipe.prepTime}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Cook Time</Text>
              <Text style={styles.infoValue}>{recipe.cookTime}</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Total Time</Text>
              <Text style={styles.infoValue}>{recipe.totalTime}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recipe Scale</Text>
          <Text style={styles.scaleDescription}>
            Scale the recipe to make more or less. Ingredients will adjust automatically.
          </Text>
          <View style={styles.scaleOptions}>
            {[0.5, 1, 2, 3].map((multiplier) => (
              <TouchableOpacity
                key={multiplier}
                style={[
                  styles.scaleButton,
                  scaleMultiplier === multiplier && styles.scaleButtonActive
                ]}
                onPress={() => setScaleMultiplier(multiplier)}
              >
                <Text style={[
                  styles.scaleButtonText,
                  scaleMultiplier === multiplier && styles.scaleButtonTextActive
                ]}>
                  {multiplier === 0.5 ? '½x' : `${multiplier}x`}
                </Text>
                <Text style={[
                  styles.scaleButtonSubtext,
                  scaleMultiplier === multiplier && styles.scaleButtonSubtextActive
                ]}>
                  {Math.round(servings * multiplier)} servings
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {scaleMultiplier !== 1 && (
            <View style={styles.scaleIndicator}>
              <Text style={styles.scaleIndicatorText}>
                🍴 Making {scaleMultiplier === 0.5 ? 'half' : `${scaleMultiplier}x`} the original recipe
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {recipe.ingredients.map((ingredient, index) => {
            const ingredientText = typeof ingredient === 'string' ? ingredient : `${ingredient.amount || ''} ${ingredient.unit || ''} ${ingredient.name}`.trim();
            return (
              <View key={index} style={styles.ingredientItem}>
                <Text style={styles.ingredientText}>
                  {scaleMultiplier !== 1 ? scaleIngredient(ingredientText, scaleMultiplier) : ingredientText}
                </Text>
              </View>
            );
          })}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          {(recipe.instructions || recipe.steps?.map(s => s.step) || []).map((instruction, index) => (
            <View key={index} style={styles.instructionItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.instructionText}>{instruction}</Text>
            </View>
          ))}
        </View>

        {/* Shared Status */}
        {sharedKids.length > 0 && (
          <View style={styles.sharedStatus}>
            <Text style={styles.sharedTitle}>👨‍👩‍👧‍👦 Shared with:</Text>
            <View style={styles.sharedKidsContainer}>
              {sharedKids.map(kidId => {
                const kid = kidProfiles.find(k => k.id === kidId);
                if (!kid) return null;
                return (
                  <View key={kid.id} style={styles.sharedKidBadge}>
                    <Text style={styles.sharedKidEmoji}>{kid.avatarEmoji || '👶'}</Text>
                    <Text style={styles.sharedKidName}>{kid.name}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.actions}>
          <TouchableOpacity
            style={[
              styles.primaryButton,
              sharing && styles.sharingButton
            ]}
            onPress={handleShareWithKids}
            disabled={sharing}
          >
            {sharing ? (
              <View style={styles.buttonContent}>
                <ActivityIndicator size="small" color="white" style={styles.loadingIndicator} />
                <Text style={styles.primaryButtonText}>Sharing...</Text>
              </View>
            ) : (
              <Text style={styles.primaryButtonText}>👨‍👩‍👧‍👦 Share with Kids</Text>
            )}
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleShare}>
              <Text style={styles.secondaryButtonText}>📤 Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleEdit}>
              <Text style={styles.secondaryButtonText}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.secondaryButton,
                styles.deleteButton,
                deleting && styles.deletingButton
              ]}
              onPress={handleDelete}
              disabled={deleting}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Text style={[styles.secondaryButtonText, styles.deleteButtonText]}>🗑️ Delete</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
  },
  header: {
    backgroundColor: 'white',
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  headerTop: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 1,
  },
  favoriteButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 2,
  },
  favoriteIcon: {
    fontSize: 24,
  },
  favoriteIconActive: {
    transform: [{ scale: 1.1 }],
  },
  emoji: {
    fontSize: 60,
    marginBottom: 15,
  },
  recipeImage: {
    width: 120,
    height: 120,
    borderRadius: 12,
    marginBottom: 15,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 10,
    paddingTop: 10,
    paddingHorizontal: 50,
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
  scaleDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 15,
    lineHeight: 20,
  },
  scaleOptions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 15,
  },
  scaleButton: {
    flex: 1,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  scaleButtonActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  scaleButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6b7280',
    marginBottom: 4,
  },
  scaleButtonTextActive: {
    color: '#2563eb',
  },
  scaleButtonSubtext: {
    fontSize: 12,
    color: '#9ca3af',
    fontWeight: '500',
  },
  scaleButtonSubtextActive: {
    color: '#1d4ed8',
  },
  scaleIndicator: {
    backgroundColor: '#fef3c7',
    borderColor: '#fbbf24',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  scaleIndicatorText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '600',
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
  sharingButton: {
    opacity: 0.7,
  },
  sharedStatus: {
    backgroundColor: 'white',
    margin: 15,
    padding: 20,
    borderRadius: 12,
  },
  sharedTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 12,
  },
  sharedKidsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  sharedKidBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#93c5fd',
  },
  sharedKidEmoji: {
    fontSize: 16,
    marginRight: 6,
  },
  sharedKidName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2563eb',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingIndicator: {
    marginRight: 8,
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
  deletingButton: {
    opacity: 0.6,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  deleteButtonText: {
    color: '#ef4444',
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
  errorText: {
    fontSize: 18,
    color: '#ef4444',
    textAlign: 'center',
  },
});
