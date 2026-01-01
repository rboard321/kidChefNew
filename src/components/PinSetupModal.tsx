import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';

interface PinSetupModalProps {
  visible: boolean;
  onClose: () => void;
  onPinSet: (pin: string) => Promise<void>;
  title?: string;
  description?: string;
  isRequired?: boolean;
}

export const PinSetupModal: React.FC<PinSetupModalProps> = ({
  visible,
  onClose,
  onPinSet,
  title = "Set Up Kid Mode PIN",
  description = "Create a 4-digit PIN to secure your parent settings. You'll need this PIN to exit kid mode.",
  isRequired = false
}) => {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePinDigit = (digit: string) => {
    if (pin.length < 4) {
      setPin(pin + digit);
    }
  };

  const handleConfirmPinDigit = (digit: string) => {
    if (confirmPin.length < 4) {
      setConfirmPin(confirmPin + digit);
    }
  };

  const handleBackspace = (isConfirm = false) => {
    if (isConfirm) {
      setConfirmPin(confirmPin.slice(0, -1));
    } else {
      setPin(pin.slice(0, -1));
    }
  };

  const handleSubmit = async () => {
    if (pin.length !== 4) {
      Alert.alert('Invalid PIN', 'Please enter a 4-digit PIN.');
      return;
    }

    if (pin !== confirmPin) {
      Alert.alert('PIN Mismatch', 'PINs do not match. Please try again.');
      setConfirmPin('');
      return;
    }

    setLoading(true);
    try {
      await onPinSet(pin);
      setPin('');
      setConfirmPin('');
      onClose();
    } catch (error: any) {
      console.error('Error setting PIN:', error);

      // Provide specific error messages for common scenarios
      let errorTitle = 'PIN Setup Failed';
      let errorMessage = 'Failed to set PIN. Please try again.';

      if (error?.code === 'permission-denied') {
        errorTitle = 'Permission Error';
        errorMessage = 'You don\'t have permission to set a PIN. Please check your account settings.';
      } else if (error?.code === 'network-request-failed') {
        errorTitle = 'Connection Error';
        errorMessage = 'Please check your internet connection and try again.';
      } else if (error?.message?.includes('weak') || error?.message?.includes('simple')) {
        errorTitle = 'Weak PIN';
        errorMessage = 'Please choose a more secure PIN. Avoid simple patterns like 1234 or 1111.';
      } else if (error?.message?.includes('already exists')) {
        errorTitle = 'PIN Already Set';
        errorMessage = 'A PIN is already configured for this account.';
      } else if (error.message) {
        errorMessage = error.message;
      }

      Alert.alert(errorTitle, errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (isRequired) {
      // Don't allow canceling when required
      return;
    }
    setPin('');
    setConfirmPin('');
    onClose();
  };

  const renderKeypad = (isConfirm = false) => {
    const currentPin = isConfirm ? confirmPin : pin;
    const handleDigit = isConfirm ? handleConfirmPinDigit : handlePinDigit;

    return (
      <View style={styles.keypadContainer}>
        <View style={styles.pinDisplay}>
          {[0, 1, 2, 3].map((index) => (
            <View
              key={index}
              style={[
                styles.pinDot,
                index < currentPin.length && styles.pinDotFilled
              ]}
            />
          ))}
        </View>

        <View style={styles.keypad}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
            <TouchableOpacity
              key={number}
              style={styles.keypadButton}
              onPress={() => handleDigit(number.toString())}
              disabled={loading}
            >
              <Text style={styles.keypadButtonText}>{number}</Text>
            </TouchableOpacity>
          ))}
          <View style={styles.keypadButton} /> {/* Empty space */}
          <TouchableOpacity
            style={styles.keypadButton}
            onPress={() => handleDigit('0')}
            disabled={loading}
          >
            <Text style={styles.keypadButtonText}>0</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.keypadButton}
            onPress={() => handleBackspace(isConfirm)}
            disabled={loading}
          >
            <Text style={styles.keypadButtonText}>⌫</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={isRequired ? () => {} : handleCancel}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>
              {pin.length < 4 ? 'Enter your 4-digit PIN' : 'Confirm your PIN'}
            </Text>
            {pin.length < 4 ? renderKeypad(false) : renderKeypad(true)}
          </View>
        </View>

        <View style={styles.actions}>
          {!isRequired && (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancel}
              disabled={loading}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          )}

          {pin.length === 4 && confirmPin.length === 4 && (
            <TouchableOpacity
              style={[
                isRequired ? styles.submitButtonFull : styles.submitButton,
                loading && styles.submitButtonDisabled
              ]}
              onPress={handleSubmit}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" size="small" />
              ) : (
                <Text style={styles.submitButtonText}>Set PIN</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    padding: 20,
    paddingTop: 60,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  stepContainer: {
    alignItems: 'center',
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 30,
    textAlign: 'center',
  },
  keypadContainer: {
    alignItems: 'center',
  },
  pinDisplay: {
    flexDirection: 'row',
    marginBottom: 30,
    gap: 15,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    backgroundColor: 'transparent',
  },
  pinDotFilled: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    width: 240,
  },
  keypadButton: {
    width: 70,
    height: 70,
    margin: 5,
    borderRadius: 35,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  keypadButtonText: {
    fontSize: 24,
    fontWeight: '600',
    color: '#1f2937',
  },
  actions: {
    flexDirection: 'row',
    gap: 15,
    padding: 20,
    paddingBottom: 40,
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
  submitButtonFull: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    width: '100%',
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