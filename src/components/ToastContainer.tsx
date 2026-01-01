import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Toast } from './Toast';
import { useToast, ToastMessage } from '../hooks/useToast';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({
  toasts,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <View style={styles.container}>
      {toasts.map((toast, index) => (
        <View
          key={toast.id}
          style={[styles.toastWrapper, { zIndex: 1000 + index }]}
        >
          <Toast
            message={toast.message}
            type={toast.type}
            visible={true}
            onDismiss={() => onDismiss(toast.id)}
            duration={toast.duration}
            actionText={toast.actionText}
            onAction={toast.onAction}
          />
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    pointerEvents: 'box-none', // Allow touches to pass through to content below
  },
  toastWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
});