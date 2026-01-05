import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRoute, useNavigation } from '@react-navigation/native';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../services/firebase';
import { kidRecipeManagerService } from '../../services/kidRecipeManager';
import { recipeService } from '../../services/recipes';
import { kidProfileService } from '../../services/kidProfile';
import type { KidRecipe, Recipe, KidProfile } from '../../types';

type KidRecipePreviewParams = { kidRecipeId: string };

export default function KidRecipePreviewScreen() {
  const route = useRoute();
  const navigation = useNavigation();
  const { kidRecipeId } = (route.params || {}) as KidRecipePreviewParams;

  const [kidRecipe, setKidRecipe] = useState<KidRecipe | null>(null);
  const [originalRecipe, setOriginalRecipe] = useState<Recipe | null>(null);
  const [kidProfile, setKidProfile] = useState<KidProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  const formatKidIngredient = (ingredient: { amount?: number; unit?: string; kidFriendlyName: string }) => {
    if (!ingredient.amount) {
      return ingredient.kidFriendlyName;
    }
    const hasNumbersInName = /\d/.test(ingredient.kidFriendlyName);
    if (hasNumbersInName) {
      return ingredient.kidFriendlyName;
    }
    const amount = ingredient.amount;
    let displayAmount: string;
    if (amount === 0.5) displayAmount = '½';
    else if (amount === 0.25) displayAmount = '¼';
    else if (amount === 0.75) displayAmount = '¾';
    else if (amount === 1.5) displayAmount = '1½';
    else if (amount === 2.5) displayAmount = '2½';
    else if (amount === 1/3) displayAmount = '⅓';
    else if (amount === 2/3) displayAmount = '⅔';
    else if (amount < 1 && amount > 0) displayAmount = amount.toFixed(2).replace(/\.?0+$/, '');
    else displayAmount = amount.toString();
    const unit = ingredient.unit || '';
    return `${displayAmount} ${unit} ${ingredient.kidFriendlyName}`.trim();
  };

  useEffect(() => {
    loadRecipeData();
  }, [kidRecipeId]);

  const loadRecipeData = async () => {
    try {
      setLoading(true);

      // Fetch kid recipe
      const kidRecipeData = await kidRecipeManagerService.getKidRecipeById(kidRecipeId);
      if (!kidRecipeData) {
        Alert.alert('Error', 'Recipe not found.');
        navigation.goBack();
        return;
      }
      setKidRecipe(kidRecipeData);

      // Fetch original recipe
      const originalRecipeData = await recipeService.getRecipe(kidRecipeData.originalRecipeId);
      setOriginalRecipe(originalRecipeData);

      // Fetch kid profile
      const kidProfileData = await kidProfileService.getKidProfile(kidRecipeData.kidId);
      setKidProfile(kidProfileData);
    } catch (error) {
      console.error('Error loading recipe data:', error);
      Alert.alert('Error', 'Failed to load recipe. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!kidRecipeId || !kidProfile) return;

    try {
      setApproving(true);

      await updateDoc(doc(db, 'kidRecipes', kidRecipeId), {
        approvalStatus: 'approved',
        approvalReviewedAt: new Date(),
        isActive: true,
      });

      Alert.alert(
        'Approved! ✅',
        `This recipe is now available for ${kidProfile.name}.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error) {
      console.error('Error approving recipe:', error);
      Alert.alert('Error', 'Failed to approve recipe. Please try again.');
      setApproving(false);
    }
  };

  const handleReject = async () => {
    if (!kidRecipeId) return;

    Alert.alert(
      'Reject Recipe?',
      'This recipe will not be shared with your kid. You can always re-convert it later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            try {
              setApproving(true);

              await updateDoc(doc(db, 'kidRecipes', kidRecipeId), {
                approvalStatus: 'rejected',
                approvalReviewedAt: new Date(),
                isActive: false,
              });

              navigation.goBack();
            } catch (error) {
              console.error('Error rejecting recipe:', error);
              Alert.alert('Error', 'Failed to reject recipe. Please try again.');
              setApproving(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading preview...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!kidRecipe || !originalRecipe) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>Recipe not found</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Preview Info Banner */}
        <View style={styles.previewBanner}>
          <Text style={styles.previewBannerIcon}>👀</Text>
          <View style={styles.previewBannerText}>
            <Text style={styles.previewBannerTitle}>
              Preview: How {kidProfile?.name || 'your kid'} will see this recipe
            </Text>
            {kidProfile && (
              <Text style={styles.previewBannerSubtitle}>
                🧒 {kidProfile.name} • Age {kidProfile.age} • {formatReadingLevel(kidRecipe.targetReadingLevel)}
              </Text>
            )}
          </View>
        </View>

        {/* Kid-Friendly Recipe Preview */}
        <View style={styles.recipePreview}>
          {/* Recipe Image */}
          {originalRecipe.image && (
            <Image
              source={{ uri: originalRecipe.image }}
              style={styles.recipeImage}
              contentFit="cover"
            />
          )}

          {/* Recipe Title */}
          <Text style={styles.recipeTitle}>{originalRecipe.title}</Text>

          {/* Safety Notes */}
          {kidRecipe.safetyNotes && kidRecipe.safetyNotes.length > 0 && (
            <View style={styles.safetySection}>
              <Text style={styles.safetySectionTitle}>🛡️ Safety First!</Text>
              {kidRecipe.safetyNotes.map((note, index) => (
                <View key={index} style={styles.safetyNote}>
                  <Text style={styles.safetyNoteIcon}>⚠️</Text>
                  <Text style={styles.safetyNoteText}>{note}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Ingredients */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>🥕 What You Need</Text>
            {kidRecipe.simplifiedIngredients.map((ingredient, index) => (
              <View key={index} style={styles.ingredientItem}>
                <Text style={styles.ingredientNumber}>{index + 1}</Text>
                <Text style={styles.ingredientText}>{formatKidIngredient(ingredient)}</Text>
              </View>
            ))}
          </View>

          {/* Steps */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>👨‍🍳 Let's Cook!</Text>
            {kidRecipe.simplifiedSteps.map((step, index) => (
              <View key={index} style={styles.stepItem}>
                <View style={styles.stepHeader}>
                  <View style={styles.stepNumber}>
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  </View>
                  {step.icon && <Text style={styles.stepIcon}>{step.icon}</Text>}
                </View>
                <Text style={styles.stepText}>
                  {step.kidFriendlyText || step.step}
                </Text>
                {step.safetyNote && (
                  <View style={styles.stepSafetyNote}>
                    <Text style={styles.stepSafetyNoteIcon}>🛡️</Text>
                    <Text style={styles.stepSafetyNoteText}>{step.safetyNote}</Text>
                  </View>
                )}
                {step.encouragement && (
                  <Text style={styles.stepEncouragement}>💪 {step.encouragement}</Text>
                )}
              </View>
            ))}
          </View>

          {/* Skills */}
          {kidRecipe.skillsRequired && kidRecipe.skillsRequired.length > 0 && (
            <View style={styles.skillsSection}>
              <Text style={styles.skillsSectionTitle}>🌟 Skills You'll Practice</Text>
              <View style={styles.skillsList}>
                {kidRecipe.skillsRequired.map((skill, index) => (
                  <View key={index} style={styles.skillBadge}>
                    <Text style={styles.skillBadgeText}>{skill}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.approveButton, approving && styles.buttonDisabled]}
            onPress={handleApprove}
            disabled={approving}
          >
            <Text style={styles.approveButtonText}>
              {approving ? 'Approving...' : `✅ Approve for ${kidProfile?.name || 'Kid'}`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.rejectButton, approving && styles.buttonDisabled]}
            onPress={handleReject}
            disabled={approving}
          >
            <Text style={styles.rejectButtonText}>
              ❌ Reject (Don't Share)
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatReadingLevel(level: string): string {
  return level.charAt(0).toUpperCase() + level.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
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
  errorText: {
    fontSize: 16,
    color: '#ef4444',
  },
  previewBanner: {
    flexDirection: 'row',
    backgroundColor: '#dbeafe',
    padding: 16,
    margin: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93c5fd',
    alignItems: 'center',
  },
  previewBannerIcon: {
    fontSize: 32,
    marginRight: 12,
  },
  previewBannerText: {
    flex: 1,
  },
  previewBannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1e40af',
    marginBottom: 4,
  },
  previewBannerSubtitle: {
    fontSize: 14,
    color: '#3b82f6',
  },
  recipePreview: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 20,
  },
  recipeImage: {
    width: '100%',
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
  },
  recipeTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  safetySection: {
    backgroundColor: '#fef3c7',
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#fbbf24',
  },
  safetySectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#92400e',
    marginBottom: 12,
  },
  safetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  safetyNoteIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  safetyNoteText: {
    flex: 1,
    fontSize: 15,
    color: '#78350f',
    lineHeight: 22,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 12,
  },
  ingredientItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  ingredientNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2563eb',
    marginRight: 12,
    minWidth: 24,
  },
  ingredientText: {
    flex: 1,
    fontSize: 16,
    color: '#1f2937',
  },
  stepItem: {
    backgroundColor: '#f9fafb',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  stepNumber: {
    width: 32,
    height: 32,
    backgroundColor: '#10b981',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: 'white',
  },
  stepIcon: {
    fontSize: 24,
  },
  stepText: {
    fontSize: 16,
    color: '#1f2937',
    lineHeight: 24,
    marginBottom: 8,
  },
  stepSafetyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fef3c7',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#fbbf24',
  },
  stepSafetyNoteIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  stepSafetyNoteText: {
    flex: 1,
    fontSize: 14,
    color: '#78350f',
    fontWeight: '500',
  },
  stepEncouragement: {
    fontSize: 14,
    color: '#10b981',
    fontWeight: '600',
    marginTop: 8,
    fontStyle: 'italic',
  },
  skillsSection: {
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 12,
    marginTop: 8,
  },
  skillsSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#166534',
    marginBottom: 12,
  },
  skillsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  skillBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  skillBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
  },
  actionButtons: {
    padding: 16,
    paddingBottom: 32,
  },
  approveButton: {
    backgroundColor: '#10b981',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  approveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  rejectButton: {
    backgroundColor: 'white',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  rejectButtonText: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
