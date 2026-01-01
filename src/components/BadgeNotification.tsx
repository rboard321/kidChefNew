import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import type { KidBadge } from '../types';

const { width: screenWidth } = Dimensions.get('window');

export interface BadgeNotificationProps {
  badge: KidBadge | null;
  visible: boolean;
  onDismiss: () => void;
}

export const BadgeNotification: React.FC<BadgeNotificationProps> = ({
  badge,
  visible,
  onDismiss,
}) => {
  const slideAnim = useRef(new Animated.Value(-200)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const confettiAnim = useRef(new Animated.Value(0)).current;

  const confettiPositions = useRef(
    Array.from({ length: 12 }, () => ({
      x: new Animated.Value(screenWidth / 2),
      y: new Animated.Value(100),
      rotate: new Animated.Value(0),
    }))
  ).current;

  useEffect(() => {
    if (visible && badge) {
      // Start entrance animation
      Animated.parallel([
        // Slide down
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 8,
        }),
        // Scale badge emoji
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.2,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.spring(scaleAnim, {
            toValue: 1,
            useNativeDriver: true,
          }),
        ]),
        // Rotate badge
        Animated.loop(
          Animated.timing(rotateAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          { iterations: 2 }
        ),
      ]).start();

      // Start confetti animation
      const confettiAnimations = confettiPositions.map((pos, index) => {
        const angle = (index / confettiPositions.length) * 2 * Math.PI;
        const distance = 150;

        return Animated.parallel([
          Animated.timing(pos.x, {
            toValue: screenWidth / 2 + Math.cos(angle) * distance,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(pos.y, {
            toValue: 100 + Math.sin(angle) * distance + Math.random() * 200,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.loop(
            Animated.timing(pos.rotate, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            })
          ),
        ]);
      });

      Animated.stagger(100, confettiAnimations).start();

      // Auto dismiss after 4 seconds
      const timeoutId = setTimeout(() => {
        handleDismiss();
      }, 4000);

      return () => clearTimeout(timeoutId);
    }
  }, [visible, badge]);

  const handleDismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -200,
        duration: 300,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start(() => {
      onDismiss();
      // Reset animations
      slideAnim.setValue(-200);
      scaleAnim.setValue(0);
      rotateAnim.setValue(0);
      confettiPositions.forEach(pos => {
        pos.x.setValue(screenWidth / 2);
        pos.y.setValue(100);
        pos.rotate.setValue(0);
      });
    });
  };

  if (!visible || !badge) return null;

  const rotateInterpolate = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getBackgroundColor = () => {
    switch (badge.category) {
      case 'cooking': return '#10b981';
      case 'safety': return '#f59e0b';
      case 'healthy': return '#22c55e';
      case 'creativity': return '#8b5cf6';
      case 'special': return '#ef4444';
      default: return '#2563eb';
    }
  };

  return (
    <View style={styles.overlay}>
      {/* Confetti */}
      {confettiPositions.map((pos, index) => (
        <Animated.View
          key={index}
          style={[
            styles.confetti,
            {
              backgroundColor: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#6c5ce7'][index % 5],
              transform: [
                { translateX: pos.x },
                { translateY: pos.y },
                {
                  rotate: pos.rotate.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        />
      ))}

      {/* Main notification */}
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: getBackgroundColor(),
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <TouchableOpacity
          style={styles.content}
          onPress={handleDismiss}
          activeOpacity={0.9}
        >
          <View style={styles.header}>
            <Text style={styles.congratsText}>🎉 Congratulations! 🎉</Text>
          </View>

          <View style={styles.badgeContainer}>
            <Animated.Text
              style={[
                styles.badgeEmoji,
                {
                  transform: [
                    { scale: scaleAnim },
                    { rotate: rotateInterpolate },
                  ],
                },
              ]}
            >
              {badge.emoji}
            </Animated.Text>
          </View>

          <Text style={styles.badgeName}>{badge.name}</Text>
          <Text style={styles.badgeDescription}>{badge.description}</Text>

          <View style={styles.footer}>
            <Text style={styles.tapText}>Tap to continue</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    zIndex: 1000,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 80,
  },
  confetti: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  container: {
    width: screenWidth * 0.9,
    maxWidth: 350,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 12,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  header: {
    marginBottom: 16,
  },
  congratsText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
  },
  badgeContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  badgeEmoji: {
    fontSize: 48,
    textAlign: 'center',
  },
  badgeName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
    textAlign: 'center',
    marginBottom: 8,
  },
  badgeDescription: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.3)',
    paddingTop: 16,
    width: '100%',
  },
  tapText: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    fontStyle: 'italic',
  },
});