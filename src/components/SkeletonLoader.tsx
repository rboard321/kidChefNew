import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';

interface SkeletonLoaderProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: any;
}

const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style
}) => {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();

    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        {
          width,
          height,
          borderRadius,
          opacity,
        },
        style,
      ]}
    />
  );
};

// Pre-built skeleton components for common UI elements
export const SkeletonRecipeCard: React.FC = () => (
  <View style={styles.recipeCardSkeleton}>
    <SkeletonLoader width="100%" height={120} borderRadius={8} />
    <View style={styles.cardContent}>
      <SkeletonLoader width="80%" height={18} />
      <SkeletonLoader width="60%" height={14} style={{ marginTop: 8 }} />
    </View>
  </View>
);

export const SkeletonRecipeList: React.FC<{ count?: number }> = ({ count = 6 }) => (
  <View style={styles.listContainer}>
    {Array.from({ length: count }, (_, index) => (
      <SkeletonRecipeCard key={index} />
    ))}
  </View>
);

export const SkeletonRecipeDetail: React.FC = () => (
  <View style={styles.detailContainer}>
    <SkeletonLoader width="100%" height={200} borderRadius={12} />
    <View style={styles.detailContent}>
      <SkeletonLoader width="90%" height={24} style={{ marginBottom: 12 }} />
      <SkeletonLoader width="70%" height={16} style={{ marginBottom: 8 }} />
      <SkeletonLoader width="50%" height={16} style={{ marginBottom: 20 }} />

      {/* Ingredients section */}
      <SkeletonLoader width="40%" height={18} style={{ marginBottom: 12 }} />
      {Array.from({ length: 5 }, (_, index) => (
        <SkeletonLoader
          key={index}
          width={`${Math.random() * 30 + 60}%`}
          height={14}
          style={{ marginBottom: 6 }}
        />
      ))}

      {/* Instructions section */}
      <SkeletonLoader width="40%" height={18} style={{ marginTop: 20, marginBottom: 12 }} />
      {Array.from({ length: 3 }, (_, index) => (
        <SkeletonLoader
          key={index}
          width={`${Math.random() * 20 + 80}%`}
          height={14}
          style={{ marginBottom: 6 }}
        />
      ))}
    </View>
  </View>
);

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: '#e1e5e9',
  },
  recipeCardSkeleton: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardContent: {
    padding: 12,
  },
  listContainer: {
    padding: 16,
  },
  detailContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  detailContent: {
    padding: 20,
    backgroundColor: 'white',
    margin: 16,
    borderRadius: 12,
  },
});

export default SkeletonLoader;