import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import { useImport } from '../../contexts/ImportContext';
import { Toast } from '../../components/Toast';

type ReviewParams = {
  RecipeReview: {
    jobId: string;
  };
};

type RecipeReviewRouteProp = RouteProp<ReviewParams, 'RecipeReview'>;

export const RecipeReviewScreen: React.FC = () => {
  const route = useRoute<RecipeReviewRouteProp>();
  const navigation = useNavigation();
  const { getImportStatus, completeReview } = useImport();
  const { jobId } = route.params;

  const [isLoading, setIsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [instructions, setInstructions] = useState<string[]>([]);
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [servings, setServings] = useState('');

  const [missingFields, setMissingFields] = useState<string[]>([]);
  const [sourceUrl, setSourceUrl] = useState('');

  useEffect(() => {
    // Load the partial recipe data
    const job = getImportStatus(jobId);
    if (job?.partialData) {
      const data = job.partialData;
      setTitle(data.title || '');
      setDescription(data.description || '');
      setIngredients(data.ingredients || ['']);
      setInstructions(data.instructions || ['']);
      setPrepTime(data.prepTime || '');
      setCookTime(data.cookTime || '');
      setServings(data.servings?.toString() || '');
      setMissingFields(data.missingFields || []);
      setSourceUrl(data.sourceUrl || '');
    } else {
      // No partial data found
      Alert.alert('Error', 'Could not load recipe data for review');
      navigation.goBack();
    }
  }, [jobId]);

  const addIngredient = () => {
    setIngredients([...ingredients, '']);
  };

  const removeIngredient = (index: number) => {
    const newIngredients = ingredients.filter((_, i) => i !== index);
    setIngredients(newIngredients.length > 0 ? newIngredients : ['']);
  };

  const updateIngredient = (index: number, value: string) => {
    const newIngredients = [...ingredients];
    newIngredients[index] = value;
    setIngredients(newIngredients);
  };

  const addInstruction = () => {
    setInstructions([...instructions, '']);
  };

  const removeInstruction = (index: number) => {
    const newInstructions = instructions.filter((_, i) => i !== index);
    setInstructions(newInstructions.length > 0 ? newInstructions : ['']);
  };

  const updateInstruction = (index: number, value: string) => {
    const newInstructions = [...instructions];
    newInstructions[index] = value;
    setInstructions(newInstructions);
  };

  const validateAndSave = async () => {
    // Basic validation
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      Alert.alert('Missing Title', 'Please add a recipe title');
      return;
    }

    const validIngredients = ingredients.filter(ing => ing.trim().length > 0);
    if (validIngredients.length === 0) {
      Alert.alert('Missing Ingredients', 'Please add at least one ingredient');
      return;
    }

    const validInstructions = instructions.filter(inst => inst.trim().length > 0);
    if (validInstructions.length === 0) {
      Alert.alert('Missing Instructions', 'Please add at least one instruction');
      return;
    }

    setIsLoading(true);
    try {
      const finalRecipe = {
        title: trimmedTitle,
        description: description.trim() || undefined,
        ingredients: validIngredients,
        instructions: validInstructions,
        prepTime: prepTime.trim() || undefined,
        cookTime: cookTime.trim() || undefined,
        servings: servings.trim() ? parseInt(servings.trim()) || undefined : undefined,
        sourceUrl,
        tags: ['imported', 'reviewed'],
      };

      await completeReview(jobId, finalRecipe);

      Toast.show({
        type: 'success',
        text1: 'Recipe Saved!',
        text2: 'Your recipe has been added to the library',
      });

      navigation.navigate('Home' as never);
    } catch (error) {
      console.error('Error saving recipe:', error);
      Alert.alert('Save Error', 'Failed to save recipe. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const isMissingField = (field: string) => missingFields.includes(field);

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Review Recipe</Text>
          <View style={styles.placeholder} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              ✏️ We partially imported this recipe. Please review and complete the missing information below.
            </Text>
          </View>

          {/* Title */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, isMissingField('title') && styles.missingLabel]}>
              Recipe Title {isMissingField('title') && '(Required)'}
            </Text>
            <TextInput
              style={[styles.textInput, isMissingField('title') && styles.missingInput]}
              value={title}
              onChangeText={setTitle}
              placeholder="Enter recipe title..."
              multiline={false}
            />
          </View>

          {/* Description */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, isMissingField('description') && styles.missingLabel]}>
              Description {isMissingField('description') && '(Missing)'}
            </Text>
            <TextInput
              style={[styles.textArea, isMissingField('description') && styles.missingInput]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add a description (optional)..."
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Ingredients */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, isMissingField('ingredients') && styles.missingLabel]}>
              Ingredients {isMissingField('ingredients') && '(Required)'}
            </Text>
            {ingredients.map((ingredient, index) => (
              <View key={index} style={styles.listItemContainer}>
                <TextInput
                  style={[styles.listInput, isMissingField('ingredients') && styles.missingInput]}
                  value={ingredient}
                  onChangeText={(value) => updateIngredient(index, value)}
                  placeholder={`Ingredient ${index + 1}`}
                  multiline
                />
                {ingredients.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeIngredient(index)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity onPress={addIngredient} style={styles.addButton}>
              <Text style={styles.addButtonText}>+ Add Ingredient</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={styles.fieldContainer}>
            <Text style={[styles.fieldLabel, isMissingField('instructions') && styles.missingLabel]}>
              Instructions {isMissingField('instructions') && '(Required)'}
            </Text>
            {instructions.map((instruction, index) => (
              <View key={index} style={styles.listItemContainer}>
                <Text style={styles.stepNumber}>{index + 1}.</Text>
                <TextInput
                  style={[styles.listInput, styles.stepInput, isMissingField('instructions') && styles.missingInput]}
                  value={instruction}
                  onChangeText={(value) => updateInstruction(index, value)}
                  placeholder={`Step ${index + 1}`}
                  multiline
                />
                {instructions.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeInstruction(index)}
                    style={styles.removeButton}
                  >
                    <Text style={styles.removeButtonText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
            <TouchableOpacity onPress={addInstruction} style={styles.addButton}>
              <Text style={styles.addButtonText}>+ Add Step</Text>
            </TouchableOpacity>
          </View>

          {/* Timing and Servings */}
          <View style={styles.metadataContainer}>
            <View style={styles.metadataField}>
              <Text style={styles.fieldLabel}>Prep Time</Text>
              <TextInput
                style={styles.textInput}
                value={prepTime}
                onChangeText={setPrepTime}
                placeholder="15 mins"
              />
            </View>

            <View style={styles.metadataField}>
              <Text style={styles.fieldLabel}>Cook Time</Text>
              <TextInput
                style={styles.textInput}
                value={cookTime}
                onChangeText={setCookTime}
                placeholder="30 mins"
              />
            </View>

            <View style={styles.metadataField}>
              <Text style={styles.fieldLabel}>Servings</Text>
              <TextInput
                style={styles.textInput}
                value={servings}
                onChangeText={setServings}
                placeholder="4"
                keyboardType="numeric"
              />
            </View>
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.saveButton, isLoading && styles.saveButtonDisabled]}
            onPress={validateAndSave}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Complete & Save Recipe</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
  },
  backButton: {
    padding: 5,
  },
  backButtonText: {
    fontSize: 16,
    color: '#007AFF',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  placeholder: {
    width: 50,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  infoBox: {
    backgroundColor: '#fff3cd',
    padding: 15,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#ffc107',
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#664d03',
    lineHeight: 20,
  },
  fieldContainer: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  missingLabel: {
    color: '#dc3545',
  },
  textInput: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 44,
  },
  missingInput: {
    borderColor: '#dc3545',
    borderWidth: 2,
  },
  textArea: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  listItemContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  listInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 44,
  },
  stepNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: '#666',
    marginRight: 10,
    marginTop: 12,
    minWidth: 20,
  },
  stepInput: {
    marginLeft: 0,
  },
  removeButton: {
    marginLeft: 10,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButtonText: {
    fontSize: 18,
    color: '#dc3545',
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#007AFF',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 5,
  },
  addButtonText: {
    fontSize: 16,
    color: '#007AFF',
    fontWeight: '500',
  },
  metadataContainer: {
    flexDirection: 'row',
    gap: 15,
  },
  metadataField: {
    flex: 1,
  },
  footer: {
    padding: 20,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e1e1e1',
  },
  saveButton: {
    backgroundColor: '#28a745',
    borderRadius: 8,
    padding: 15,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: '#6c757d',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
});