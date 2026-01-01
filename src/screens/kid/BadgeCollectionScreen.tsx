import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { kidProgressService, AVAILABLE_BADGES } from '../../services/kidProgressService';
import type { KidBadge, KidProgress } from '../../services/kidProgressService';

interface BadgeDisplayItem extends Omit<KidBadge, 'earnedAt'> {
  earned: boolean;
  earnedAt?: Date;
  progress?: number; // 0-100 for progress toward earning
  requirement?: string; // Description of what's needed to earn it
}

export default function BadgeCollectionScreen() {
  const navigation = useNavigation();
  const { currentKid } = useAuth();
  const [badges, setBadges] = useState<BadgeDisplayItem[]>([]);
  const [progress, setProgress] = useState<KidProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadBadges();
  }, [currentKid]);

  const loadBadges = async () => {
    if (!currentKid) return;

    try {
      setLoading(true);
      const kidProgress = await kidProgressService.getProgress(currentKid.id);
      setProgress(kidProgress);

      const earnedBadgeIds = new Set(kidProgress.badges.map(b => b.id));
      const displayBadges: BadgeDisplayItem[] = AVAILABLE_BADGES.map(badge => {
        const earned = earnedBadgeIds.has(badge.id);
        const earnedBadge = kidProgress.badges.find(b => b.id === badge.id);

        return {
          ...badge,
          earned,
          earnedAt: earnedBadge?.earnedAt,
          progress: earned ? 100 : calculateProgress(badge.id, kidProgress),
          requirement: getRequirement(badge.id, kidProgress),
        };
      });

      setBadges(displayBadges);
    } catch (error) {
      console.error('Error loading badges:', error);
      Alert.alert('Error', 'Failed to load badges. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = (badgeId: string, progress: KidProgress): number => {
    switch (badgeId) {
      case 'first_recipe':
        return Math.min(100, (progress.recipesCompleted / 1) * 100);
      case 'recipe_5':
        return Math.min(100, (progress.recipesCompleted / 5) * 100);
      case 'recipe_10':
        return Math.min(100, (progress.recipesCompleted / 10) * 100);
      case 'recipe_20':
        return Math.min(100, (progress.recipesCompleted / 20) * 100);
      case 'veggie_lover':
        return Math.min(100, (progress.categoryProgress.vegetables / 3) * 100);
      case 'fruit_fan':
        return Math.min(100, (progress.categoryProgress.fruits / 3) * 100);
      case 'breakfast_master':
        return Math.min(100, (progress.categoryProgress.breakfast / 5) * 100);
      case 'dessert_artist':
        return Math.min(100, (progress.categoryProgress.desserts / 3) * 100);
      case 'careful_chef':
        return progress.recipesCompleted >= 5 ? Math.min(100, progress.safetyScore) : 0;
      case 'safety_star':
        return Math.min(100, progress.safetyScore);
      default:
        return 0;
    }
  };

  const getRequirement = (badgeId: string, progress: KidProgress): string => {
    switch (badgeId) {
      case 'first_recipe':
        return progress.recipesCompleted >= 1 ? 'Completed!' : 'Complete your first recipe';
      case 'recipe_5':
        return progress.recipesCompleted >= 5 ? 'Completed!' : `Complete ${5 - progress.recipesCompleted} more recipes`;
      case 'recipe_10':
        return progress.recipesCompleted >= 10 ? 'Completed!' : `Complete ${10 - progress.recipesCompleted} more recipes`;
      case 'recipe_20':
        return progress.recipesCompleted >= 20 ? 'Completed!' : `Complete ${20 - progress.recipesCompleted} more recipes`;
      case 'veggie_lover':
        return progress.categoryProgress.vegetables >= 3 ? 'Completed!' : `Try ${3 - progress.categoryProgress.vegetables} more veggie recipes`;
      case 'fruit_fan':
        return progress.categoryProgress.fruits >= 3 ? 'Completed!' : `Try ${3 - progress.categoryProgress.fruits} more fruit recipes`;
      case 'breakfast_master':
        return progress.categoryProgress.breakfast >= 5 ? 'Completed!' : `Make ${5 - progress.categoryProgress.breakfast} more breakfast recipes`;
      case 'dessert_artist':
        return progress.categoryProgress.desserts >= 3 ? 'Completed!' : `Make ${3 - progress.categoryProgress.desserts} more dessert recipes`;
      case 'safety_star':
        return progress.safetyScore >= 95 ? 'Completed!' : 'Follow all safety notes perfectly!';
      case 'careful_chef':
        if (progress.recipesCompleted < 5) return `Complete ${5 - progress.recipesCompleted} more recipes with good safety`;
        return progress.safetyScore >= 90 ? 'Completed!' : 'Keep following safety notes!';
      case 'balanced_chef':
        const categories = progress.categoryProgress;
        if (categories.vegetables > 0 && categories.fruits > 0 && categories.desserts > 0 &&
            categories.breakfast > 0 && categories.dinner > 0) {
          return 'Completed!';
        }
        return 'Cook recipes from all food groups!';
      default:
        return 'Keep cooking to unlock!';
    }
  };

  const categories = [
    { id: 'all', name: 'All Badges', icon: '🏆' },
    { id: 'cooking', name: 'Cooking', icon: '🍳' },
    { id: 'safety', name: 'Safety', icon: '🛡️' },
    { id: 'healthy', name: 'Healthy', icon: '🥗' },
    { id: 'creativity', name: 'Creative', icon: '🎨' },
    { id: 'special', name: 'Special', icon: '⭐' },
  ];

  const filteredBadges = selectedCategory === 'all'
    ? badges
    : badges.filter(badge => badge.category === selectedCategory);

  const earnedCount = badges.filter(b => b.earned).length;
  const totalCount = badges.length;

  const renderBadge = ({ item }: { item: BadgeDisplayItem }) => (
    <TouchableOpacity
      style={[
        styles.badgeCard,
        item.earned ? styles.earnedBadge : styles.unearnedBadge
      ]}
      onPress={() => {
        if (item.earned && item.earnedAt) {
          Alert.alert(
            `${item.emoji} ${item.name}`,
            `${item.description}\n\nEarned on ${item.earnedAt.toLocaleDateString()}`,
            [{ text: 'Awesome!' }]
          );
        } else {
          Alert.alert(
            `${item.emoji} ${item.name}`,
            `${item.description}\n\n${item.requirement}`,
            [{ text: 'Got it!' }]
          );
        }
      }}
      activeOpacity={0.8}
    >
      <Text style={[styles.badgeEmoji, !item.earned && styles.unearnedEmoji]}>
        {item.emoji}
      </Text>
      <Text style={[styles.badgeName, !item.earned && styles.unearnedText]}>
        {item.name}
      </Text>

      {!item.earned && item.progress !== undefined && item.progress > 0 && (
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View
              style={[styles.progressFill, { width: `${item.progress}%` }]}
            />
          </View>
          <Text style={styles.progressText}>{Math.round(item.progress)}%</Text>
        </View>
      )}

      {item.earned && (
        <View style={styles.earnedBadge}>
          <Text style={styles.earnedText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const renderCategoryFilter = ({ item }: { item: typeof categories[0] }) => (
    <TouchableOpacity
      style={[
        styles.categoryButton,
        selectedCategory === item.id && styles.selectedCategory
      ]}
      onPress={() => setSelectedCategory(item.id)}
    >
      <Text style={styles.categoryIcon}>{item.icon}</Text>
      <Text style={[
        styles.categoryText,
        selectedCategory === item.id && styles.selectedCategoryText
      ]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#10b981" />
          <Text style={styles.loadingText}>Loading your badges...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <View style={styles.headerContent}>
          <Text style={styles.title}>🏆 My Badges</Text>
          <Text style={styles.subtitle}>
            {earnedCount} of {totalCount} badges earned
          </Text>

          <View style={styles.overallProgress}>
            <View style={styles.overallProgressBar}>
              <View
                style={[
                  styles.overallProgressFill,
                  { width: `${(earnedCount / totalCount) * 100}%` }
                ]}
              />
            </View>
            <Text style={styles.overallProgressText}>
              {Math.round((earnedCount / totalCount) * 100)}% Complete
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.categoryContainer}>
        <FlatList
          data={categories}
          renderItem={renderCategoryFilter}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoryList}
        />
      </View>

      <FlatList
        data={filteredBadges}
        renderItem={renderBadge}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.badgeList}
        columnWrapperStyle={styles.badgeRow}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f9ff',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#10b981',
  },
  header: {
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 16,
    color: '#10b981',
    fontWeight: '600',
  },
  headerContent: {
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1e40af',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#1e40af',
    marginBottom: 15,
  },
  overallProgress: {
    width: '100%',
    alignItems: 'center',
  },
  overallProgressBar: {
    width: '80%',
    height: 8,
    backgroundColor: '#e0f2fe',
    borderRadius: 4,
    marginBottom: 5,
  },
  overallProgressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 4,
  },
  overallProgressText: {
    fontSize: 14,
    color: '#1e40af',
    fontWeight: '500',
  },
  categoryContainer: {
    paddingVertical: 10,
  },
  categoryList: {
    paddingHorizontal: 20,
  },
  categoryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 8,
    marginRight: 10,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 2,
    borderColor: '#e0f2fe',
  },
  selectedCategory: {
    backgroundColor: '#10b981',
    borderColor: '#10b981',
  },
  categoryIcon: {
    fontSize: 16,
    marginRight: 5,
  },
  categoryText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1e40af',
  },
  selectedCategoryText: {
    color: 'white',
  },
  badgeList: {
    padding: 20,
  },
  badgeRow: {
    justifyContent: 'space-between',
  },
  badgeCard: {
    width: '47%',
    aspectRatio: 0.8,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
    borderWidth: 2,
    borderColor: '#10b981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  earnedBadge: {
    backgroundColor: '#f0fdf4',
    borderColor: '#10b981',
  },
  unearnedBadge: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  badgeEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  unearnedEmoji: {
    opacity: 0.3,
  },
  badgeName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    textAlign: 'center',
    marginBottom: 8,
  },
  unearnedText: {
    color: '#94a3b8',
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: '#e2e8f0',
    borderRadius: 2,
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10b981',
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  earnedText: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#10b981',
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    width: 24,
    height: 24,
    borderRadius: 12,
    textAlign: 'center',
    lineHeight: 24,
  },
});