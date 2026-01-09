import React, { useEffect, useState } from 'react';
import { logger } from '../../utils/logger';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Modal,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import { useAuth } from '../../contexts/AuthContext';
import { recipeService } from '../../services/recipes';
import { kidRecipeManagerService } from '../../services/kidRecipeManager';
import { kidProgressService } from '../../services/kidProgressService';
import { recipeFavoritesService } from '../../services/recipeFavorites';
import { getStepExplanation } from '../../services/stepExplanationService';
import { BadgeNotification } from '../../components/BadgeNotification';
import FeaturePaywall from '../../components/FeaturePaywall';
import PinInput from '../../components/PinInput';
import { verifyPin } from '../../utils/pinSecurity';
import type { KidRecipe, Recipe, KidBadge } from '../../types';

type RecipeViewParams = { recipeId?: string; kidRecipeId?: string; kidId?: string };

export default function RecipeViewScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { currentKid, parentProfile, canAccessFeatureHelper } = useAuth();
  const { recipeId, kidRecipeId, kidId } = (route.params || {}) as RecipeViewParams;
  const [currentStep, setCurrentStep] = useState(0);
  const [parentRecipe, setParentRecipe] = useState<Recipe | null>(null);
  const [kidRecipe, setKidRecipe] = useState<KidRecipe | null>(null);
  const [scaleMultiplier, setScaleMultiplier] = useState(1);
  const [loading, setLoading] = useState(true);
  const [reportingStep, setReportingStep] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [newBadge, setNewBadge] = useState<KidBadge | null>(null);
  const [showBadgeNotification, setShowBadgeNotification] = useState(false);
  const [completingRecipe, setCompletingRecipe] = useState(false);
  const [showParentVerification, setShowParentVerification] = useState(false);
  const [pendingCompletion, setPendingCompletion] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteLoading, setFavoriteLoading] = useState(false);
  const [explainVisible, setExplainVisible] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState('');
  const [showExplainPaywall, setShowExplainPaywall] = useState(false);

  const effectiveKidId = kidId || currentKid?.id;

  // Function to scale ingredient measurements for kids
  const scaleKidIngredient = (ingredient: { amount?: number; unit?: string; kidFriendlyName: string }, scale: number) => {
    if (!ingredient.amount) {
      return ingredient.kidFriendlyName;
    }

    const hasNumbersInName = /\d/.test(ingredient.kidFriendlyName);
    if (hasNumbersInName) {
      if (scale === 1) {
        return ingredient.kidFriendlyName;
      }
      return ingredient.kidFriendlyName.replace(/(\d+(?:\.\d+)?)/g, (match) => {
        const num = parseFloat(match);
        const scaled = num * scale;

        if (scaled === 0.5) return '½';
        if (scaled === 0.25) return '¼';
        if (scaled === 0.75) return '¾';
        if (scaled === 1.5) return '1½';
        if (scaled === 2.5) return '2½';
        if (scaled === 1/3) return '⅓';
        if (scaled === 2/3) return '⅔';
        if (scaled < 1 && scaled > 0) {
          return scaled.toFixed(2).replace(/\.?0+$/, '');
        }
        return scaled.toString();
      });
    }

    // Only if kidFriendlyName is just the ingredient name without amounts
    const scaledAmount = ingredient.amount * scale;

    // Convert decimals to kid-friendly fractions
    let displayAmount: string;
    if (scaledAmount === 0.5) {
      displayAmount = '½';
    } else if (scaledAmount === 0.25) {
      displayAmount = '¼';
    } else if (scaledAmount === 0.75) {
      displayAmount = '¾';
    } else if (scaledAmount === 1.5) {
      displayAmount = '1½';
    } else if (scaledAmount === 2.5) {
      displayAmount = '2½';
    } else if (scaledAmount < 1 && scaledAmount > 0) {
      // For other decimal amounts, try to convert to simple fractions
      if (scaledAmount === 1/3) {
        displayAmount = '⅓';
      } else if (scaledAmount === 2/3) {
        displayAmount = '⅔';
      } else {
        displayAmount = scaledAmount.toFixed(2).replace(/\.?0+$/, '');
      }
    } else {
      displayAmount = scaledAmount.toString();
    }

    const unit = ingredient.unit || '';
    const name = ingredient.kidFriendlyName;

    return `${displayAmount} ${unit} ${name}`.trim();
  };

  useEffect(() => {
    let isMounted = true;

    const loadRecipe = async () => {
      // Kid mode: kidRecipeId is provided, load kid recipe directly
      if (kidRecipeId && effectiveKidId) {
        try {
          setLoading(true);
          logger.debug('📚 Loading kid recipe in kid mode:', kidRecipeId);

          // Load the kid recipe directly
          const kidVersion = await kidRecipeManagerService.getKidRecipe(kidRecipeId);
          if (!isMounted) return;

          if (kidVersion) {
            setKidRecipe(kidVersion);
            setCurrentStep(0);

            // Try to load parent recipe for title/image, but don't fail if permission denied
            try {
              const recipe = await recipeService.getRecipe(kidVersion.originalRecipeId);
              if (isMounted && recipe) {
                setParentRecipe(recipe);
              }
            } catch (parentRecipeError) {
              logger.debug('ℹ️ Could not load parent recipe (expected in kid mode):', parentRecipeError?.code);
              // Create a minimal parent recipe object with just the data we need
              setParentRecipe({
                id: kidVersion.originalRecipeId,
                title: 'Recipe', // Will be overridden by kid recipe data in display
                sourceUrl: kidVersion.originalRecipeId,
              } as Recipe);
            }

            // Try to load favorite status, but don't fail if permission denied
            try {
              if (recipeId || kidVersion.originalRecipeId) {
                await loadFavoriteStatus(kidVersion.originalRecipeId, effectiveKidId);
              }
            } catch (favoriteError) {
              logger.debug('ℹ️ Could not load favorite status (expected in kid mode):', favoriteError?.code);
            }
          }
        } catch (error) {
          console.error('❌ Error loading kid recipe:', error);
          Alert.alert('Error', 'Failed to load recipe. Please try again.');
        } finally {
          if (isMounted) {
            setLoading(false);
          }
        }
        return;
      }

      // Parent mode: recipeId is provided, use original flow
      if (!recipeId || !effectiveKidId) {
        if (isMounted) {
          setLoading(false);
        }
        return;
      }

      try {
        setLoading(true);
        const recipe = await recipeService.getRecipe(recipeId);
        if (!isMounted) return;
        setParentRecipe(recipe);

        if (recipe && currentKid) {
          let kidVersion = await kidRecipeManagerService.getKidRecipeByOriginal(
            recipe.id,
            effectiveKidId
          );

          if (!kidVersion) {
            const { kidRecipeId } = await kidRecipeManagerService.convertAndSaveRecipe(
              recipe,
              effectiveKidId,
              currentKid.readingLevel,
              currentKid.age
            );
            kidVersion = await kidRecipeManagerService.getKidRecipe(kidRecipeId);
          }

          if (isMounted) {
            setKidRecipe(kidVersion);
            setCurrentStep(0);
            await loadFavoriteStatus(recipeId, effectiveKidId);
          }
        }
      } catch (error) {
        console.error('Error loading kid recipe:', error);
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
  }, [recipeId, effectiveKidId, currentKid]);

  const loadFavoriteStatus = async (recipeId: string, kidId: string) => {
    if (!parentProfile) return;

    try {
      const favoriteStatus = await recipeFavoritesService.isFavorite(recipeId, parentProfile.id, kidId);
      setIsFavorite(favoriteStatus);
    } catch (error) {
      console.error('Error loading favorite status:', error);
    }
  };

  const handleToggleFavorite = async () => {
    if (!parentProfile || !effectiveKidId) return;

    try {
      setFavoriteLoading(true);
      const targetRecipeId = recipeId || kidRecipe?.originalRecipeId || parentRecipe?.id;
      if (!targetRecipeId) {
        Alert.alert('Oops!', 'We could not find this recipe to favorite.');
        return;
      }
      const newFavoriteStatus = await recipeFavoritesService.toggleFavorite(targetRecipeId, parentProfile.id, effectiveKidId);
      setIsFavorite(newFavoriteStatus);
    } catch (error) {
      console.error('Error toggling favorite:', error);
      Alert.alert('Oops!', 'We couldn\'t save your favorite right now. Please try again!');
    } finally {
      setFavoriteLoading(false);
    }
  };

  const nextStep = () => {
    if (kidRecipe && currentStep < kidRecipe.simplifiedSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else if (kidRecipe && currentStep === kidRecipe.simplifiedSteps.length - 1 && !isCompleted) {
      // They've finished the last step - request recipe completion with parent verification
      requestRecipeCompletion();
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleReportUnclearStep = () => {
    if (!kidRecipe || !effectiveKidId) return;

    Alert.alert(
      "Need Help? 🤔",
      "Is this step confusing? Let us know so we can make it clearer!",
      [
        { text: "Never Mind", style: "cancel" },
        { text: "It's Confusing", onPress: () => reportStep('unclear') },
        { text: "I Don't Understand", onPress: () => reportStep('confusing') }
      ]
    );
  };

  const handleExplainStep = async () => {
    if (!kidRecipe) return;

    if (!canAccessFeatureHelper('explain_step_ai')) {
      setShowExplainPaywall(true);
      return;
    }

    setExplainVisible(true);
    setExplainLoading(true);
    setExplainText('');

    try {
      const explanation = await getStepExplanation(kidRecipe.id, currentStep);
      setExplainText(explanation);
    } catch (error) {
      console.error('Error explaining step:', error);
      setExplainText('Sorry, we could not explain this step right now. Please try again.');
    } finally {
      setExplainLoading(false);
    }
  };

  const reportStep = async (issue: string) => {
    if (!kidRecipe || !effectiveKidId) return;

    setReportingStep(true);

    try {
      const reportUnclearStep = httpsCallable(functions, 'reportUnclearStep');

      await reportUnclearStep({
        kidRecipeId: kidRecipe.id,
        stepIndex: currentStep,
        kidId: effectiveKidId,
        issue: issue
      });

      Alert.alert(
        "Thanks for Telling Us! 🙌",
        "We got your message and will make this step clearer. Great job cooking!",
        [{ text: "Keep Cooking!" }]
      );

    } catch (error) {
      console.error('Error reporting step:', error);
      Alert.alert(
        "Oops! 😅",
        "We couldn't send your message right now. Ask your grown-up for help!",
        [{ text: "OK" }]
      );
    } finally {
      setReportingStep(false);
    }
  };

  const requestRecipeCompletion = () => {
    if (!effectiveKidId || !parentRecipe || isCompleted) return;

    // Show congratulatory message and request parent verification
    Alert.alert(
      '🎉 Congratulations!',
      `Amazing work completing "${parentRecipe.title}"! Please have a grown-up verify that you really cooked this delicious meal to earn your badges and progress.`,
      [
        {
          text: 'Ask Parent to Verify',
          onPress: () => {
            const hasPinProtection = parentProfile?.kidModePin;
            if (hasPinProtection) {
              setShowParentVerification(true);
            } else {
              // No PIN set, ask if they want to proceed without verification
              Alert.alert(
                'No Parent PIN Set',
                'Your parent hasn\'t set up a verification PIN yet. You can still complete the recipe, but ask your parent to set up a PIN for better security!',
                [
                  {
                    text: 'Complete Anyway',
                    onPress: () => confirmedRecipeCompletion()
                  },
                  { text: 'Cancel', style: 'cancel' }
                ]
              );
            }
          }
        },
        { text: 'Not Yet', style: 'cancel' }
      ]
    );
  };

  const confirmedRecipeCompletion = async () => {
    if (!effectiveKidId || !parentRecipe || isCompleted) return;

    setCompletingRecipe(true);
    setIsCompleted(true);

    try {
      // Record the recipe completion and check for new badges
      const result = await kidProgressService.recordRecipeCompletion(
        effectiveKidId,
        parentRecipe,
        true // Assume safety was followed - could be enhanced later
      );

      // Show celebration message
      Alert.alert(
        '🎉 Recipe Verified Complete!',
        `Great job cooking ${parentRecipe.title}! You're becoming an amazing chef!`,
        [
          {
            text: 'Awesome!',
            onPress: () => {
              // If they earned a new badge, show the badge notification
              if (result.newBadges && result.newBadges.length > 0) {
                setNewBadge(result.newBadges[0]); // Show the first new badge
                setShowBadgeNotification(true);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error completing recipe:', error);
      Alert.alert(
        'Oops!',
        "We couldn't save your progress right now, but you still did great!",
        [{ text: 'OK' }]
      );
    } finally {
      setCompletingRecipe(false);
    }
  };

  const handleParentVerificationSuccess = async (pin?: string) => {
    const storedPin = parentProfile?.kidModePin;
    if (!storedPin || !pin) {
      setShowParentVerification(false);
      return;
    }

    const isValid = await verifyPin(pin, storedPin);
    if (!isValid) {
      setShowParentVerification(false);
      Alert.alert('Incorrect PIN', 'That PIN is not correct. Please try again.');
      setTimeout(() => setShowParentVerification(true), 100);
      return;
    }

    setShowParentVerification(false);
    confirmedRecipeCompletion();
  };

  const handleParentVerificationClose = () => {
    setShowParentVerification(false);
    // Reset completion state so they can try again
    setCompletingRecipe(false);
    setIsCompleted(false);
  };

  const handleBadgeDismiss = () => {
    setShowBadgeNotification(false);
    setNewBadge(null);
    // Navigate back to home or recipes
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1e40af" />
          <Text style={styles.loadingText}>Getting your recipe ready...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!effectiveKidId || !parentRecipe || !kidRecipe) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Oops!</Text>
          <Text style={styles.errorText}>
            We couldn't load this recipe yet. Ask your parent to try again.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const steps = kidRecipe.simplifiedSteps;
  const ingredients = kidRecipe.simplifiedIngredients;

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <TouchableOpacity
              style={styles.kidFavoriteButton}
              onPress={handleToggleFavorite}
              disabled={favoriteLoading}
            >
              {favoriteLoading ? (
                <ActivityIndicator size="small" color="#ef4444" />
              ) : (
                <Text style={styles.kidFavoriteIcon}>
                  {isFavorite ? '💖' : '🤍'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {parentRecipe.image && parentRecipe.image.startsWith('http') ? (
            <Image
              source={{ uri: parentRecipe.image }}
              style={styles.recipeImage}
              contentFit="cover"
              cachePolicy="memory-disk"
            />
          ) : (
            <Text style={styles.emoji}>{parentRecipe.image || '🍽️'}</Text>
          )}
          <Text style={styles.title}>{parentRecipe.title}</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoBadge}>
              <Text style={styles.infoText}>{Math.round(parentRecipe.servings * scaleMultiplier)} servings</Text>
            </View>
            <View style={styles.infoBadge}>
              <Text style={styles.infoText}>{parentRecipe.totalTime || '—'}</Text>
            </View>
            <View style={[styles.infoBadge, styles.difficultyBadge]}>
              <Text style={styles.infoText}>{parentRecipe.difficulty || 'easy'}</Text>
            </View>
          </View>

          {/* Kid-friendly scaling section */}
          <View style={styles.scaleSection}>
            <Text style={styles.scaleTitle}>🍴 How much do you want to make?</Text>
            <View style={styles.scaleButtons}>
              {[0.5, 1, 2, 3].map((multiplier) => (
                <TouchableOpacity
                  key={multiplier}
                  style={[
                    styles.kidScaleButton,
                    scaleMultiplier === multiplier && styles.kidScaleButtonActive
                  ]}
                  onPress={() => setScaleMultiplier(multiplier)}
                >
                  <Text style={[
                    styles.kidScaleButtonText,
                    scaleMultiplier === multiplier && styles.kidScaleButtonTextActive
                  ]}>
                    {multiplier === 0.5 ? '½' : `${multiplier}x`}
                  </Text>
                  <Text style={[
                    styles.kidScaleButtonSubtext,
                    scaleMultiplier === multiplier && styles.kidScaleButtonSubtextActive
                  ]}>
                    {multiplier === 0.5 ? 'Half recipe' : multiplier === 1 ? 'Original' : `${multiplier}x bigger!`}
                  </Text>
                  <Text style={[
                    styles.kidScaleButtonServings,
                    scaleMultiplier === multiplier && styles.kidScaleButtonServingsActive
                  ]}>
                    {Math.round(parentRecipe.servings * multiplier)} servings
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {scaleMultiplier !== 1 && (
              <View style={styles.kidScaleIndicator}>
                <Text style={styles.kidScaleIndicatorText}>
                  🎉 Making {scaleMultiplier === 0.5 ? 'half' : `${scaleMultiplier}x`} the original recipe!
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>What You Need 📝</Text>
          {ingredients.map((ingredient) => (
            <View key={ingredient.id} style={styles.ingredientItem}>
              <Text style={styles.ingredientText}>
                {scaleKidIngredient(ingredient, scaleMultiplier)}
              </Text>
              {ingredient.description ? (
                <Text style={styles.ingredientNote}>{ingredient.description}</Text>
              ) : null}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Let's Cook! 👨‍🍳</Text>
          {steps.length > 0 && currentStep < steps.length ? (
          <>
            <View style={styles.stepContainer}>
              <Text style={styles.stepCounter}>
                Step {currentStep + 1} of {steps.length}
              </Text>
              <View style={styles.stepCard}>
                <Text style={styles.stepText}>
                  {steps[currentStep]?.kidFriendlyText || steps[currentStep]?.step || 'Loading step...'}
                </Text>
                {steps[currentStep]?.safetyNote ? (
                  <Text style={styles.safetyText}>⚠️ {steps[currentStep].safetyNote}</Text>
                ) : null}
                {steps[currentStep]?.encouragement ? (
                  <Text style={styles.encouragementText}>{steps[currentStep].encouragement}</Text>
                ) : null}

                <View style={styles.stepActions}>
                  <TouchableOpacity
                    style={styles.explainButton}
                    onPress={handleExplainStep}
                    disabled={explainLoading}
                  >
                    {explainLoading ? (
                      <ActivityIndicator size="small" color="#2563eb" />
                    ) : (
                      <Text style={styles.explainButtonText}>🔍 Explain This Step</Text>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.helpButton}
                    onPress={handleReportUnclearStep}
                    disabled={reportingStep}
                  >
                    {reportingStep ? (
                      <ActivityIndicator size="small" color="#f59e0b" />
                    ) : (
                      <Text style={styles.helpButtonText}>🤔 Need Help?</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            <View style={styles.stepNavigation}>
            <TouchableOpacity
              style={[styles.navButton, currentStep === 0 && styles.navButtonDisabled]}
              onPress={prevStep}
              disabled={currentStep === 0}
            >
              <Text style={[styles.navButtonText, currentStep === 0 && styles.navButtonTextDisabled]}>
                ← Previous
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.navButton,
                styles.nextButton,
                currentStep === steps.length - 1 && styles.completeButton
              ]}
              onPress={nextStep}
              disabled={completingRecipe}
            >
              {completingRecipe ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Text style={[styles.navButtonText, styles.nextButtonText]}>
                  {currentStep === steps.length - 1 ? (isCompleted ? '✓ Complete!' : '✓ Finish Recipe!') : 'Next →'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
          </>
          ) : (
            <View style={styles.stepContainer}>
              <Text style={styles.errorText}>No cooking steps found. Please ask your parent to try importing this recipe again.</Text>
            </View>
          )}
        </View>

        <View style={styles.helpSection}>
          <Text style={styles.helpText}>
            🔔 Need help? Call your grown-up anytime!
          </Text>
        </View>
      </ScrollView>

      {/* Badge Notification */}
      <BadgeNotification
        badge={newBadge}
        visible={showBadgeNotification}
        onDismiss={handleBadgeDismiss}
      />

      {/* Parent Verification PIN Input */}
      <PinInput
        visible={showParentVerification}
        onClose={handleParentVerificationClose}
        onSuccess={handleParentVerificationSuccess}
        title="Parent Verification Required"
        subtitle="Enter your PIN to verify the recipe was completed"
        mode="input"
      />

      <Modal
        visible={explainVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setExplainVisible(false)}
      >
        <View style={styles.explainOverlay}>
          <View style={styles.explainContainer}>
            <View style={styles.explainHeader}>
              <Text style={styles.explainTitle}>Step Explanation</Text>
              <TouchableOpacity onPress={() => setExplainVisible(false)}>
                <Text style={styles.explainClose}>✕</Text>
              </TouchableOpacity>
            </View>
            {explainLoading ? (
              <View style={styles.explainLoading}>
                <ActivityIndicator size="large" color="#2563eb" />
                <Text style={styles.explainLoadingText}>Thinking...</Text>
              </View>
            ) : (
              <ScrollView style={styles.explainBody}>
                <Text style={styles.explainText}>{explainText}</Text>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <FeaturePaywall
        feature="explain_step_ai"
        featureName="Explain This Step"
        description="Get kid‑friendly explanations for tricky steps with KidChef Plus."
        visible={showExplainPaywall}
        onClose={() => setShowExplainPaywall(false)}
        onUpgrade={() => {
          setShowExplainPaywall(false);
          navigation.navigate('Pricing' as never);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f9ff',
  },
  content: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    marginBottom: 20,
    position: 'relative',
  },
  headerTop: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 1,
  },
  kidFavoriteButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#bae6fd',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  kidFavoriteIcon: {
    fontSize: 28,
  },
  emoji: {
    fontSize: 60,
    marginBottom: 10,
  },
  recipeImage: {
    width: 120,
    height: 120,
    borderRadius: 16,
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 15,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    gap: 10,
  },
  infoBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  difficultyBadge: {
    backgroundColor: '#dcfce7',
  },
  infoText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1e40af',
  },
  section: {
    backgroundColor: 'white',
    margin: 15,
    padding: 20,
    borderRadius: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 15,
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
    fontWeight: '600',
  },
  ingredientNote: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 4,
  },
  stepContainer: {
    marginBottom: 20,
  },
  stepCounter: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 10,
    textAlign: 'center',
  },
  stepCard: {
    backgroundColor: '#dbeafe',
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#2563eb',
  },
  stepActions: {
    gap: 10,
    marginTop: 12,
  },
  explainButton: {
    backgroundColor: '#eff6ff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2563eb',
    alignSelf: 'center',
  },
  explainButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e40af',
    textAlign: 'center',
  },
  stepText: {
    fontSize: 18,
    color: '#1e40af',
    lineHeight: 26,
    textAlign: 'center',
    fontWeight: '500',
  },
  safetyText: {
    fontSize: 14,
    color: '#b45309',
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '600',
  },
  encouragementText: {
    fontSize: 14,
    color: '#16a34a',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  stepNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  navButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
    borderWidth: 2,
    borderColor: '#cbd5e1',
  },
  navButtonDisabled: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  nextButton: {
    backgroundColor: '#dbeafe',
    borderColor: '#2563eb',
  },
  completeButton: {
    backgroundColor: '#dcfce7',
    borderColor: '#16a34a',
  },
  navButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#64748b',
    textAlign: 'center',
  },
  navButtonTextDisabled: {
    color: '#cbd5e1',
  },
  nextButtonText: {
    color: '#1e40af',
  },
  helpSection: {
    margin: 15,
    padding: 15,
    backgroundColor: '#fef3c7',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#f59e0b',
  },
  helpText: {
    fontSize: 16,
    color: '#92400e',
    textAlign: 'center',
    fontWeight: '500',
  },
  helpButton: {
    marginTop: 15,
    backgroundColor: '#fef3c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#f59e0b',
    alignSelf: 'center',
  },
  helpButtonText: {
    fontSize: 14,
    color: '#92400e',
    fontWeight: '600',
    textAlign: 'center',
  },
  explainOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  explainContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '70%',
  },
  explainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  explainTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1e40af',
  },
  explainClose: {
    fontSize: 20,
    color: '#64748b',
    padding: 6,
  },
  explainLoading: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  explainLoadingText: {
    marginTop: 8,
    color: '#475569',
  },
  explainBody: {
    maxHeight: 360,
  },
  explainText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#0f172a',
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
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#ef4444',
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    lineHeight: 22,
  },
  scaleSection: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: 2,
    borderTopColor: '#dbeafe',
  },
  scaleTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e40af',
    textAlign: 'center',
    marginBottom: 15,
  },
  scaleButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 8,
  },
  kidScaleButton: {
    flex: 1,
    backgroundColor: '#f0f9ff',
    paddingVertical: 16,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#bae6fd',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  kidScaleButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#1e40af',
    transform: [{ scale: 1.05 }],
  },
  kidScaleButtonText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 4,
  },
  kidScaleButtonTextActive: {
    color: 'white',
  },
  kidScaleButtonSubtext: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3b82f6',
    textAlign: 'center',
    marginBottom: 3,
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  kidScaleButtonSubtextActive: {
    color: '#bfdbfe',
  },
  kidScaleButtonServings: {
    fontSize: 9,
    fontWeight: '500',
    color: '#6b7280',
    textAlign: 'center',
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  kidScaleButtonServingsActive: {
    color: '#e5e7eb',
  },
  kidScaleIndicator: {
    backgroundColor: '#fef3c7',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    marginTop: 10,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  kidScaleIndicatorText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400e',
    textAlign: 'center',
  },
});
