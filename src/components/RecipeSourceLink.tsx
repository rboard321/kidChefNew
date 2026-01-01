import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Linking, Alert } from 'react-native';
import type { Recipe } from '../types';

interface RecipeSourceLinkProps {
  recipe: Recipe;
  style?: any;
}

export default function RecipeSourceLink({ recipe, style }: RecipeSourceLinkProps) {
  // Get source URL from recipe (supports both sourceUrl and url fields)
  const sourceUrl = (recipe as any).sourceUrl || recipe.url;

  if (!sourceUrl || typeof sourceUrl !== 'string') {
    return null;
  }

  // Extract domain name for display
  const getDomainName = (url: string): string => {
    try {
      const domain = new URL(url).hostname;
      return domain.replace('www.', '');
    } catch {
      return 'website';
    }
  };

  const handlePress = async () => {
    try {
      const canOpen = await Linking.canOpenURL(sourceUrl);
      if (canOpen) {
        await Linking.openURL(sourceUrl);
      } else {
        Alert.alert(
          'Cannot Open Link',
          'Unable to open the recipe source. Please check your browser settings.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error opening source URL:', error);
      Alert.alert(
        'Error',
        'An error occurred while trying to open the link.',
        [{ text: 'OK' }]
      );
    }
  };

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity style={styles.linkButton} onPress={handlePress}>
        <Text style={styles.linkIcon}>🔗</Text>
        <View style={styles.linkTextContainer}>
          <Text style={styles.linkTitle}>View Original Recipe</Text>
          <Text style={styles.linkSubtitle}>from {getDomainName(sourceUrl)}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  linkButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  linkTextContainer: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 2,
  },
  linkSubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
});