import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { recipeService } from '../../services/recipes';
import { useAuth } from '../../contexts/AuthContext';
import type { Recipe } from '../../types';

export default function ManualRecipeEntryScreen() {
  const navigation = useNavigation();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  const [recipeData, setRecipeData] = useState({
    title: '',
    description: '',
    prepTime: '',
    cookTime: '',
    servings: '4',
    difficulty: 'Medium',
    ingredients: [''],
    instructions: [''],
    tags: [],
  });

  const addIngredient = () => {
    setRecipeData(prev => ({
      ...prev,
      ingredients: [...prev.ingredients, '']
    }));
  };

  const updateIngredient = (index: number, value: string) => {
    setRecipeData(prev => ({
      ...prev,
      ingredients: prev.ingredients.map((ing, i) => i === index ? value : ing)
    }));
  };

  const removeIngredient = (index: number) => {
    if (recipeData.ingredients.length > 1) {
      setRecipeData(prev => ({
        ...prev,
        ingredients: prev.ingredients.filter((_, i) => i !== index)
      }));
    }
  };

  const addInstruction = () => {
    setRecipeData(prev => ({
      ...prev,
      instructions: [...prev.instructions, '']
    }));
  };

  const updateInstruction = (index: number, value: string) => {
    setRecipeData(prev => ({
      ...prev,
      instructions: prev.instructions.map((inst, i) => i === index ? value : inst)
    }));
  };

  const removeInstruction = (index: number) => {
    if (recipeData.instructions.length > 1) {
      setRecipeData(prev => ({
        ...prev,
        instructions: prev.instructions.filter((_, i) => i !== index)
      }));
    }
  };

  const handleSave = async () => {
    // Validate required fields
    if (!recipeData.title.trim()) {
      Alert.alert('Missing Information', 'Please enter a recipe title.');
      return;
    }

    const validIngredients = recipeData.ingredients.filter(ing => ing.trim() !== '');
    if (validIngredients.length === 0) {
      Alert.alert('Missing Information', 'Please enter at least one ingredient.');
      return;
    }

    const validInstructions = recipeData.instructions.filter(inst => inst.trim() !== '');
    if (validInstructions.length === 0) {
      Alert.alert('Missing Information', 'Please enter at least one instruction.');
      return;
    }

    if (!user?.uid) {
      Alert.alert('Error', 'You must be logged in to save recipes.');
      return;
    }

    setLoading(true);

    try {
      const newRecipe: Omit<Recipe, 'id' | 'userId' | 'createdAt' | 'updatedAt'> = {
        title: recipeData.title.trim(),
        description: recipeData.description.trim(),
        image: '🍽️', // Default emoji
        prepTime: recipeData.prepTime.trim(),
        cookTime: recipeData.cookTime.trim(),
        totalTime: '',
        servings: parseInt(recipeData.servings) || 4,
        difficulty: recipeData.difficulty,
        ingredients: validIngredients,
        instructions: validInstructions,
        sourceUrl: '',
        tags: recipeData.tags,
        kidVersionId: null,
      };

      await recipeService.createRecipe(newRecipe);

      Alert.alert(
        'Recipe Saved! 🎉',
        `"${newRecipe.title}" has been added to your recipe collection.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );

    } catch (error) {
      console.error('Error saving recipe:', error);
      Alert.alert(
        'Save Failed',
        'Failed to save the recipe. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>Add Recipe Manually</Text>
            <Text style={styles.subtitle}>
              Enter your recipe details below
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Basic Information</Text>

            <Text style={styles.label}>Recipe Title *</Text>
            <TextInput
              style={styles.input}
              value={recipeData.title}
              onChangeText={(text) => setRecipeData(prev => ({ ...prev, title: text }))}
              placeholder="Enter recipe name"
              placeholderTextColor="#9ca3af"
            />

            <Text style={styles.label}>Description (optional)</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={recipeData.description}
              onChangeText={(text) => setRecipeData(prev => ({ ...prev, description: text }))}
              placeholder="Brief description of the recipe"
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
            />

            <View style={styles.row}>
              <View style={styles.halfWidth}>
                <Text style={styles.label}>Prep Time</Text>
                <TextInput
                  style={styles.input}
                  value={recipeData.prepTime}
                  onChangeText={(text) => setRecipeData(prev => ({ ...prev, prepTime: text }))}
                  placeholder="15 min"
                  placeholderTextColor="#9ca3af"
                />
              </View>

              <View style={styles.halfWidth}>
                <Text style={styles.label}>Cook Time</Text>
                <TextInput
                  style={styles.input}
                  value={recipeData.cookTime}
                  onChangeText={(text) => setRecipeData(prev => ({ ...prev, cookTime: text }))}
                  placeholder="30 min"
                  placeholderTextColor="#9ca3af"
                />
              </View>
            </View>

            <View style={styles.row}>
              <View style={styles.halfWidth}>
                <Text style={styles.label}>Servings</Text>
                <TextInput
                  style={styles.input}
                  value={recipeData.servings}
                  onChangeText={(text) => setRecipeData(prev => ({ ...prev, servings: text }))}
                  placeholder="4"
                  placeholderTextColor="#9ca3af"
                  keyboardType="numeric"
                />
              </View>

              <View style={styles.halfWidth}>
                <Text style={styles.label}>Difficulty</Text>
                <View style={styles.difficultyContainer}>
                  {['Easy', 'Medium', 'Hard'].map((level) => (
                    <TouchableOpacity
                      key={level}
                      style={[
                        styles.difficultyButton,
                        recipeData.difficulty === level && styles.difficultyButtonActive
                      ]}
                      onPress={() => setRecipeData(prev => ({ ...prev, difficulty: level }))}
                    >
                      <Text style={[
                        styles.difficultyButtonText,
                        recipeData.difficulty === level && styles.difficultyButtonTextActive
                      ]}>
                        {level}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Ingredients *</Text>
              <TouchableOpacity style={styles.addButton} onPress={addIngredient}>
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {recipeData.ingredients.map((ingredient, index) => (
              <View key={index} style={styles.itemRow}>
                <TextInput
                  style={[styles.input, styles.itemInput]}
                  value={ingredient}
                  onChangeText={(text) => updateIngredient(index, text)}
                  placeholder={`Ingredient ${index + 1}`}
                  placeholderTextColor="#9ca3af"
                />
                {recipeData.ingredients.length > 1 && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeIngredient(index)}
                  >
                    <Text style={styles.removeButtonText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Instructions *</Text>
              <TouchableOpacity style={styles.addButton} onPress={addInstruction}>
                <Text style={styles.addButtonText}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {recipeData.instructions.map((instruction, index) => (
              <View key={index} style={styles.itemRow}>
                <View style={styles.stepNumberContainer}>
                  <Text style={styles.stepNumber}>{index + 1}</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.instructionInput]}
                  value={instruction}
                  onChangeText={(text) => updateInstruction(index, text)}
                  placeholder={`Step ${index + 1} instructions`}
                  placeholderTextColor="#9ca3af"
                  multiline
                />
                {recipeData.instructions.length > 1 && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removeInstruction(index)}
                  >
                    <Text style={styles.removeButtonText}>×</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, loading && styles.saveButtonDisabled]}
              onPress={handleSave}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.saveButtonText}>Save Recipe</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: 20,
  },
  header: {
    marginBottom: 30,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    lineHeight: 24,
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
    marginTop: 15,
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 15,
  },
  halfWidth: {
    flex: 1,
  },
  difficultyContainer: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  difficultyButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'white',
    alignItems: 'center',
  },
  difficultyButtonActive: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  difficultyButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  difficultyButtonTextActive: {
    color: 'white',
  },
  addButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    gap: 12,
  },
  itemInput: {
    flex: 1,
    marginBottom: 0,
  },
  stepNumberContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2563eb',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  stepNumber: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  instructionInput: {
    flex: 1,
    marginBottom: 0,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
  },
  removeButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 15,
    marginTop: 20,
    marginBottom: 40,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: 'white',
    borderColor: '#e5e7eb',
    borderWidth: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});