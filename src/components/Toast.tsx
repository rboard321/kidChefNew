import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, TouchableOpacity } from 'react-native';

export interface ToastProps {
  message: string;
  type?: 'success' | 'info' | 'warning' | 'error';
  visible: boolean;
  onDismiss: () => void;
  duration?: number;
  actionText?: string;
  onAction?: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  message,
  type = 'info',
  visible,
  onDismiss,
  duration = 4000,
  actionText,
  onAction,
}) => {
  const slideAnim = useRef(new Animated.Value(-100)).current;
  const timeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (visible) {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Slide in
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();

      // Auto-dismiss after duration
      timeoutRef.current = setTimeout(() => {
        handleDismiss();
      }, duration);
    } else {
      handleDismiss();
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [visible, duration]);

  const handleDismiss = () => {
    Animated.spring(slideAnim, {
      toValue: -100,
      useNativeDriver: true,
      tension: 100,
      friction: 8,
    }).start(() => {
      onDismiss();
    });
  };

  if (!visible) return null;

  const getBackgroundColor = () => {
    switch (type) {
      case 'success': return '#10b981';
      case 'warning': return '#f59e0b';
      case 'error': return '#ef4444';
      default: return '#2563eb';
    }
  };

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: getBackgroundColor(), transform: [{ translateY: slideAnim }] }
      ]}
    >
      <TouchableOpacity
        style={styles.content}
        onPress={onAction || handleDismiss}
        activeOpacity={onAction ? 0.8 : 1}
      >
        <Text style={styles.message}>{message}</Text>
        {actionText && (
          <Text style={styles.actionText}>{actionText}</Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60,
    left: 16,
    right: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    zIndex: 1000,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  message: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
  },
  actionText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
    textDecorationLine: 'underline',
  },
});