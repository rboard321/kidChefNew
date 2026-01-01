import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RecipeDetailScreen() {
  const [servings, setServings] = useState(4);

  const recipe = {
    id: '1',
    title: 'Chocolate Chip Cookies',
    image: '🍪',
    description: 'Classic homemade chocolate chip cookies that are crispy on the outside and chewy on the inside.',
    prepTime: '15 min',
    cookTime: '12 min',
    totalTime: '27 min',
    difficulty: 'Easy',
    servings: 24,
    sourceUrl: 'https://example.com/chocolate-chip-cookies',
    ingredients: [
      '2¼ cups all-purpose flour',
      '1 tsp baking soda',
      '1 tsp salt',
      '1 cup butter, softened',
      '¾ cup granulated sugar',
      '¾ cup brown sugar',
      '2 large eggs',
      '2 tsp vanilla extract',
      '2 cups chocolate chips',
    ],
    instructions: [
      'Preheat oven to 375°F (190°C).',
      'Mix flour, baking soda, and salt in a bowl.',
      'In another bowl, cream butter and both sugars until fluffy.',
      'Beat in eggs and vanilla.',
      'Gradually add flour mixture.',
      'Stir in chocolate chips.',
      'Drop rounded tablespoons onto ungreased baking sheets.',
      'Bake 9-11 minutes until golden brown.',
      'Cool on baking sheet for 2 minutes, then transfer to wire rack.',
    ],
  };

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

  const handleConvertToKidFriendly = () => {
    Alert.alert(
      'Convert to Kid-Friendly',
      'This will create a simplified version of this recipe for kids to follow. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Convert', onPress: () => console.log('Converting recipe...') },
      ]
    );
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
        { text: 'Delete', style: 'destructive', onPress: () => console.log('Deleting recipe...') },
      ]
    );
  };

  const scale = servings / recipe.servings;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.emoji}>{recipe.image}</Text>
          <Text style={styles.title}>{recipe.title}</Text>
          <Text style={styles.description}>{recipe.description}</Text>

          <View style={styles.infoGrid}>
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
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Difficulty</Text>
              <Text style={styles.infoValue}>{recipe.difficulty}</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Servings</Text>
            <View style={styles.servingAdjuster}>
              <TouchableOpacity
                style={styles.adjustButton}
                onPress={() => setServings(Math.max(1, servings - 1))}
              >
                <Text style={styles.adjustButtonText}>-</Text>
              </TouchableOpacity>
              <Text style={styles.servingsText}>{servings}</Text>
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
          {recipe.ingredients.map((ingredient, index) => (
            <View key={index} style={styles.ingredientItem}>
              <Text style={styles.ingredientText}>
                {scale !== 1 ? scaleIngredient(ingredient, scale) : ingredient}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          {recipe.instructions.map((instruction, index) => (
            <View key={index} style={styles.instructionItem}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.instructionText}>{instruction}</Text>
            </View>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleConvertToKidFriendly}>
            <Text style={styles.primaryButtonText}>✨ Make Kid-Friendly</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleShare}>
              <Text style={styles.secondaryButtonText}>📤 Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={handleEdit}>
              <Text style={styles.secondaryButtonText}>✏️ Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, styles.deleteButton]} onPress={handleDelete}>
              <Text style={[styles.secondaryButtonText, styles.deleteButtonText]}>🗑️ Delete</Text>
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
});