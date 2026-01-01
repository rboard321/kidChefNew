import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { recipeRatingsService, RATING_OPTIONS } from '../services/recipeRatings';
import { useAuth } from '../contexts/AuthContext';
import type { RecipeRating } from '../types';

interface RecipeRatingProps {
  recipeId: string;
  recipeName: string;
  visible: boolean;
  onClose: () => void;
  onRatingSubmitted?: (rating: RecipeRating) => void;
  kidMode?: boolean;
}

export const RecipeRatingComponent: React.FC<RecipeRatingProps> = ({
  recipeId,
  recipeName,
  visible,
  onClose,
  onRatingSubmitted,
  kidMode = false,
}) => {
  const { currentKid, parentProfile } = useAuth();
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);
  const [existingRating, setExistingRating] = useState<RecipeRating | null>(null);

  useEffect(() => {
    if (visible && currentKid) {
      loadExistingRating();
    }
  }, [visible, currentKid, recipeId]);

  const loadExistingRating = async () => {
    if (!currentKid) return;

    try {
      const rating = await recipeRatingsService.getKidRating(recipeId, currentKid.id);
      if (rating) {
        setExistingRating(rating);
        setSelectedRating(rating.rating);
        setComment(rating.comment || '');
      }
    } catch (error) {
      console.error('Error loading existing rating:', error);
    }
  };

  const handleRatingSubmit = async () => {
    if (!selectedRating || !currentKid || !parentProfile) {
      Alert.alert('Oops!', 'Please select a rating first!');
      return;
    }

    setLoading(true);

    try {
      await recipeRatingsService.rateRecipe(
        recipeId,
        currentKid.id,
        parentProfile.id,
        selectedRating as 1 | 2 | 3 | 4 | 5,
        comment.trim() || undefined
      );

      // Get the updated rating for callback
      const newRating = await recipeRatingsService.getKidRating(recipeId, currentKid.id);

      if (newRating && onRatingSubmitted) {
        onRatingSubmitted(newRating);
      }

      Alert.alert(
        '🎉 Thanks!',
        existingRating
          ? 'Your rating has been updated!'
          : 'Your rating helps other young chefs find great recipes!',
        [{ text: 'Awesome!', onPress: handleClose }]
      );

    } catch (error) {
      console.error('Error submitting rating:', error);
      Alert.alert(
        'Oops!',
        "We couldn't save your rating right now. Please try again!",
        [{ text: 'OK' }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setSelectedRating(null);
    setComment('');
    setExistingRating(null);
    onClose();
  };

  const getRatingOption = (value: number) => {
    return RATING_OPTIONS.find(option => option.value === value);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={kidMode ? styles.kidModal : styles.modal}>
          <View style={styles.header}>
            <Text style={kidMode ? styles.kidTitle : styles.title}>
              {existingRating ? '✏️ Update Your Rating' : '⭐ Rate This Recipe'}
            </Text>
            <Text style={kidMode ? styles.kidSubtitle : styles.subtitle}>
              How did you like "{recipeName}"?
            </Text>
          </View>

          <View style={styles.ratingSection}>
            <Text style={kidMode ? styles.kidRatingLabel : styles.ratingLabel}>
              Tap to rate:
            </Text>

            <View style={styles.ratingOptions}>
              {RATING_OPTIONS.map((option) => {
                const isSelected = selectedRating === option.value;

                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      kidMode ? styles.kidRatingOption : styles.ratingOption,
                      isSelected && (kidMode ? styles.kidRatingOptionSelected : styles.ratingOptionSelected),
                      { borderColor: option.color }
                    ]}
                    onPress={() => setSelectedRating(option.value)}
                  >
                    <Text style={[
                      kidMode ? styles.kidRatingEmoji : styles.ratingEmoji,
                      isSelected && { transform: [{ scale: 1.2 }] }
                    ]}>
                      {option.emoji}
                    </Text>
                    <Text style={[
                      kidMode ? styles.kidRatingText : styles.ratingText,
                      isSelected && { color: option.color, fontWeight: 'bold' }
                    ]}>
                      {option.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {selectedRating && (
            <View style={styles.commentSection}>
              <Text style={kidMode ? styles.kidCommentLabel : styles.commentLabel}>
                Want to say something about this recipe? (optional)
              </Text>
              <TextInput
                style={kidMode ? styles.kidCommentInput : styles.commentInput}
                value={comment}
                onChangeText={setComment}
                placeholder={kidMode ? "This was super yummy because..." : "Add a comment..."}
                placeholderTextColor={kidMode ? "#93c5fd" : "#9ca3af"}
                multiline
                maxLength={200}
                textAlignVertical="top"
              />
              <Text style={styles.commentCounter}>
                {comment.length}/200
              </Text>
            </View>
          )}

          <View style={styles.buttons}>
            <TouchableOpacity
              style={kidMode ? styles.kidCancelButton : styles.cancelButton}
              onPress={handleClose}
            >
              <Text style={kidMode ? styles.kidCancelButtonText : styles.cancelButtonText}>
                Cancel
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                kidMode ? styles.kidSubmitButton : styles.submitButton,
                (!selectedRating || loading) && styles.submitButtonDisabled
              ]}
              onPress={handleRatingSubmit}
              disabled={!selectedRating || loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={kidMode ? styles.kidSubmitButtonText : styles.submitButtonText}>
                  {existingRating ? 'Update Rating' : 'Submit Rating'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  kidModal: {
    backgroundColor: '#f0f9ff',
    borderRadius: 20,
    padding: 28,
    width: '100%',
    maxWidth: 450,
    borderWidth: 3,
    borderColor: '#2563eb',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 8,
    textAlign: 'center',
  },
  kidTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  kidSubtitle: {
    fontSize: 18,
    color: '#3b82f6',
    textAlign: 'center',
    fontWeight: '500',
  },
  ratingSection: {
    marginBottom: 20,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  kidRatingLabel: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 20,
    textAlign: 'center',
  },
  ratingOptions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  ratingOption: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: 'white',
  },
  kidRatingOption: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: '#bae6fd',
    backgroundColor: 'white',
  },
  ratingOptionSelected: {
    backgroundColor: '#f3f4f6',
    transform: [{ scale: 1.05 }],
  },
  kidRatingOptionSelected: {
    backgroundColor: '#dbeafe',
    transform: [{ scale: 1.1 }],
  },
  ratingEmoji: {
    fontSize: 24,
    marginBottom: 4,
  },
  kidRatingEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6b7280',
    textAlign: 'center',
  },
  kidRatingText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1e40af',
    textAlign: 'center',
  },
  commentSection: {
    marginBottom: 24,
  },
  commentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  kidCommentLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 12,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    backgroundColor: 'white',
    minHeight: 80,
  },
  kidCommentInput: {
    borderWidth: 2,
    borderColor: '#bae6fd',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    backgroundColor: 'white',
    minHeight: 90,
    color: '#1e40af',
  },
  commentCounter: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 4,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  kidCancelButton: {
    flex: 1,
    backgroundColor: '#e5e7eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#9ca3af',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6b7280',
  },
  kidCancelButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#6b7280',
  },
  submitButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  kidSubmitButton: {
    flex: 1,
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  submitButtonDisabled: {
    backgroundColor: '#9ca3af',
    shadowOpacity: 0,
    elevation: 0,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  kidSubmitButtonText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
});