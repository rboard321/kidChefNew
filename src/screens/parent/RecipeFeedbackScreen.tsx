import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';

export default function RecipeFeedbackScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { kidRecipeId, recipeName } = route.params as { kidRecipeId: string; recipeName: string };

  const [loading, setLoading] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [unclearSteps, setUnclearSteps] = useState<number[]>([]);
  const [feedback, setFeedback] = useState({
    suggestions: '',
    safetyNotes: '',
    overallComments: ''
  });

  const handleRatingPress = (newRating: number) => {
    setRating(newRating);
  };

  const toggleUnclearStep = (stepNumber: number) => {
    setUnclearSteps(prev =>
      prev.includes(stepNumber)
        ? prev.filter(n => n !== stepNumber)
        : [...prev, stepNumber]
    );
  };

  const handleSubmit = async () => {
    if (rating === null) {
      Alert.alert('Missing Rating', 'Please provide a star rating before submitting.');
      return;
    }

    setLoading(true);

    try {
      const rateKidRecipe = httpsCallable(functions, 'rateKidRecipe');

      const feedbackData = {
        kidRecipeId,
        rating,
        feedback: {
          unclearSteps: unclearSteps.length > 0 ? unclearSteps : undefined,
          suggestions: feedback.suggestions.trim() || undefined,
          safetyNotes: feedback.safetyNotes.trim() || undefined,
          overallComments: feedback.overallComments.trim() || undefined
        }
      };

      const result = await rateKidRecipe(feedbackData);

      Alert.alert(
        'Feedback Submitted! 🙏',
        result.data.message + (result.data.refinementTriggered
          ? ' We\'ve automatically started improving this recipe based on your feedback.'
          : ''),
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );

    } catch (error: any) {
      console.error('Error submitting feedback:', error);
      Alert.alert(
        'Submission Failed',
        error.message || 'Failed to submit feedback. Please try again.',
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const renderStars = () => {
    return (
      <View style={styles.starContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            onPress={() => handleRatingPress(star)}
            style={styles.starButton}
          >
            <Text style={[
              styles.star,
              rating && star <= rating ? styles.starFilled : styles.starEmpty
            ]}>
              ★
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const renderStepSelector = () => {
    // Generate step buttons for steps 1-10 (most recipes won't have more)
    return (
      <View style={styles.stepGrid}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((stepNumber) => (
          <TouchableOpacity
            key={stepNumber}
            style={[
              styles.stepButton,
              unclearSteps.includes(stepNumber) && styles.stepButtonSelected
            ]}
            onPress={() => toggleUnclearStep(stepNumber)}
          >
            <Text style={[
              styles.stepButtonText,
              unclearSteps.includes(stepNumber) && styles.stepButtonTextSelected
            ]}>
              {stepNumber}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Recipe Feedback</Text>
          <Text style={styles.recipeName}>{recipeName}</Text>
          <Text style={styles.subtitle}>
            Help us improve this recipe for families like yours
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>⭐ Overall Rating</Text>
          <Text style={styles.sectionSubtitle}>
            How would you rate this kid-friendly recipe conversion?
          </Text>
          {renderStars()}

          {rating && (
            <View style={styles.ratingFeedback}>
              <Text style={styles.ratingText}>
                {rating === 5 && "Excellent! Perfect for kids 🎉"}
                {rating === 4 && "Good! Just a few tweaks needed 👍"}
                {rating === 3 && "Okay, but could be clearer 📝"}
                {rating === 2 && "Needs significant improvement ⚠️"}
                {rating === 1 && "Poor - too complicated for kids 😕"}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔍 Unclear Steps</Text>
          <Text style={styles.sectionSubtitle}>
            Select any step numbers that were confusing or too complicated
          </Text>
          {renderStepSelector()}

          {unclearSteps.length > 0 && (
            <View style={styles.selectedStepsContainer}>
              <Text style={styles.selectedStepsText}>
                Selected steps: {unclearSteps.join(', ')}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>💡 Suggestions</Text>
          <Text style={styles.sectionSubtitle}>
            How could we make this recipe clearer or easier for kids?
          </Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={feedback.suggestions}
            onChangeText={(text) => setFeedback(prev => ({ ...prev, suggestions: text }))}
            placeholder="e.g., 'Step 3 should explain what 'simmer' means' or 'Add more specific measurements'"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🛡️ Safety Concerns</Text>
          <Text style={styles.sectionSubtitle}>
            Any safety issues or additional precautions needed?
          </Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={feedback.safetyNotes}
            onChangeText={(text) => setFeedback(prev => ({ ...prev, safetyNotes: text }))}
            placeholder="e.g., 'Needs warning about hot surfaces' or 'Should mention adult supervision'"
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Additional Comments</Text>
          <Text style={styles.sectionSubtitle}>
            Any other feedback about this recipe?
          </Text>
          <TextInput
            style={[styles.textInput, styles.multilineInput]}
            value={feedback.overallComments}
            onChangeText={(text) => setFeedback(prev => ({ ...prev, overallComments: text }))}
            placeholder="Share your overall thoughts or suggestions..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={4}
          />
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, loading && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="white" size="small" />
            ) : (
              <Text style={styles.submitButtonText}>Submit Feedback</Text>
            )}
          </TouchableOpacity>
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
    marginBottom: 5,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2563eb',
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
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 15,
    lineHeight: 20,
  },
  starContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 10,
  },
  starButton: {
    padding: 5,
  },
  star: {
    fontSize: 40,
    color: '#e5e7eb',
  },
  starFilled: {
    color: '#fbbf24',
  },
  starEmpty: {
    color: '#e5e7eb',
  },
  ratingFeedback: {
    backgroundColor: '#f0f9ff',
    padding: 15,
    borderRadius: 12,
    marginTop: 15,
    borderLeftWidth: 4,
    borderLeftColor: '#2563eb',
  },
  ratingText: {
    fontSize: 16,
    color: '#1e40af',
    fontWeight: '500',
    textAlign: 'center',
  },
  stepGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginVertical: 10,
  },
  stepButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#e5e7eb',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepButtonSelected: {
    backgroundColor: '#dc2626',
    borderColor: '#dc2626',
  },
  stepButtonText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6b7280',
  },
  stepButtonTextSelected: {
    color: 'white',
  },
  selectedStepsContainer: {
    backgroundColor: '#fef2f2',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  selectedStepsText: {
    fontSize: 14,
    color: '#dc2626',
    fontWeight: '500',
  },
  textInput: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    color: '#1f2937',
  },
  multilineInput: {
    height: 100,
    textAlignVertical: 'top',
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
  submitButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});