import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  ActivityIndicator,
} from 'react-native';

interface PinChangeModalProps {
  visible: boolean;
  onClose: () => void;
  onPinChanged: (newPin: string) => Promise<void>;
  currentPin?: string;
}

export const PinChangeModal: React.FC<PinChangeModalProps> = ({
  visible,
  onClose,
  onPinChanged,
  currentPin
}) => {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [enteredCurrentPin, setEnteredCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [loading, setLoading] = useState(false);

  const resetState = () => {
    setStep('current');
    setEnteredCurrentPin('');
    setNewPin('');
    setConfirmPin('');
    setLoading(false);
  };

  const handleDigit = (digit: string) => {
    switch (step) {
      case 'current':
        if (enteredCurrentPin.length < 4) {
          setEnteredCurrentPin(enteredCurrentPin + digit);
        }
        break;
      case 'new':
        if (newPin.length < 4) {
          setNewPin(newPin + digit);
        }
        break;
      case 'confirm':
        if (confirmPin.length < 4) {
          setConfirmPin(confirmPin + digit);
        }
        break;
    }
  };

  const handleBackspace = () => {
    switch (step) {
      case 'current':
        setEnteredCurrentPin(enteredCurrentPin.slice(0, -1));
        break;
      case 'new':
        setNewPin(newPin.slice(0, -1));
        break;
      case 'confirm':
        setConfirmPin(confirmPin.slice(0, -1));
        break;
    }
  };

  const handleStepComplete = () => {
    switch (step) {
      case 'current':
        if (enteredCurrentPin.length === 4) {
          if (!currentPin || enteredCurrentPin === currentPin) {
            setStep('new');
          } else {
            Alert.alert('Incorrect PIN', 'The current PIN you entered is incorrect.');
            setEnteredCurrentPin('');
          }
        }
        break;
      case 'new':
        if (newPin.length === 4) {
          setStep('confirm');
        }
        break;
      case 'confirm':
        if (confirmPin.length === 4) {
          if (newPin === confirmPin) {
            handleSubmit();
          } else {
            Alert.alert('PIN Mismatch', 'The new PINs do not match. Please try again.');
            setConfirmPin('');
          }
        }
        break;
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onPinChanged(newPin);
      resetState();
      onClose();
      Alert.alert('Success', 'Your PIN has been changed successfully!');
    } catch (error: any) {
      console.error('Error changing PIN:', error);
      Alert.alert('Error', error.message || 'Failed to change PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    resetState();
    onClose();
  };

  const getCurrentPin = () => {
    switch (step) {
      case 'current':
        return enteredCurrentPin;
      case 'new':
        return newPin;
      case 'confirm':
        return confirmPin;
      default:
        return '';
    }
  };

  const getStepTitle = () => {
    switch (step) {
      case 'current':
        return currentPin ? 'Enter your current PIN' : 'Enter any PIN to continue';
      case 'new':
        return 'Enter your new PIN';
      case 'confirm':
        return 'Confirm your new PIN';
      default:
        return '';
    }
  };

  React.useEffect(() => {
    if (step === 'current' && enteredCurrentPin.length === 4) {
      setTimeout(handleStepComplete, 100);
    } else if (step === 'new' && newPin.length === 4) {
      setTimeout(handleStepComplete, 100);
    } else if (step === 'confirm' && confirmPin.length === 4) {
      setTimeout(handleStepComplete, 100);
    }
  }, [enteredCurrentPin, newPin, confirmPin, step]);

  const renderKeypad = () => {
    const currentPin = getCurrentPin();

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
            onPress={handleBackspace}
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
      onRequestClose={handleCancel}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Change PIN</Text>
          <Text style={styles.description}>
            {step === 'current'
              ? 'First, verify your current PIN to continue'
              : step === 'new'
              ? 'Enter a new 4-digit PIN'
              : 'Confirm your new PIN to finish'
            }
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.stepIndicator}>
            {['current', 'new', 'confirm'].map((stepName, index) => (
              <View key={stepName} style={styles.stepIndicatorContainer}>
                <View
                  style={[
                    styles.stepDot,
                    step === stepName && styles.stepDotActive,
                    (step === 'new' && stepName === 'current') ||
                    (step === 'confirm' && (stepName === 'current' || stepName === 'new'))
                      ? styles.stepDotCompleted
                      : {}
                  ]}
                >
                  <Text
                    style={[
                      styles.stepDotText,
                      (step === stepName ||
                        (step === 'new' && stepName === 'current') ||
                        (step === 'confirm' && (stepName === 'current' || stepName === 'new'))) &&
                        styles.stepDotTextActive
                    ]}
                  >
                    {index + 1}
                  </Text>
                </View>
                {index < 2 && <View style={styles.stepConnector} />}
              </View>
            ))}
          </View>

          <View style={styles.stepContainer}>
            <Text style={styles.stepTitle}>{getStepTitle()}</Text>
            {renderKeypad()}
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancel}
            disabled={loading}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>

          {step !== 'current' && (
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (step === 'new') {
                  setStep('current');
                  setNewPin('');
                } else if (step === 'confirm') {
                  setStep('new');
                  setConfirmPin('');
                }
              }}
              disabled={loading}
            >
              <Text style={styles.backButtonText}>Back</Text>
            </TouchableOpacity>
          )}
        </View>

        {loading && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#2563eb" />
            <Text style={styles.loadingText}>Changing PIN...</Text>
          </View>
        )}
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
  stepIndicator: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 40,
  },
  stepIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotActive: {
    backgroundColor: '#2563eb',
  },
  stepDotCompleted: {
    backgroundColor: '#10b981',
  },
  stepDotText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  stepDotTextActive: {
    color: 'white',
  },
  stepConnector: {
    width: 30,
    height: 2,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 10,
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
  backButton: {
    flex: 1,
    backgroundColor: '#6b7280',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(248, 250, 252, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
});