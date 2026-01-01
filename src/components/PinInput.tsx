import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
  Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface PinInputProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (pin?: string) => void;
  title?: string;
  subtitle?: string;
  correctPin?: string;
  maxAttempts?: number;
  mode?: 'validate' | 'input'; // validate = check against correctPin, input = just collect PIN
}

export default function PinInput({
  visible,
  onClose,
  onSuccess,
  title = "Enter Parent PIN",
  subtitle = "Enter the 4-digit PIN to continue",
  correctPin = '',
  maxAttempts = 3,
  mode = 'validate'
}: PinInputProps) {
  const [pin, setPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isShaking, setIsShaking] = useState(false);

  useEffect(() => {
    if (visible) {
      setPin('');
      setAttempts(0);
      setIsShaking(false);
    }
  }, [visible]);

  const handleNumberPress = (number: string) => {
    if (pin.length < 4) {
      const newPin = pin + number;
      setPin(newPin);

      // Check pin when 4 digits are entered
      if (newPin.length === 4) {
        setTimeout(() => {
          if (mode === 'input') {
            // Just collect the PIN and return it
            onSuccess(newPin);
            setPin('');
          } else if (newPin === correctPin) {
            onSuccess(newPin);
            setPin('');
          } else {
            handleIncorrectPin();
          }
        }, 200);
      }
    }
  };

  const handleIncorrectPin = () => {
    const newAttempts = attempts + 1;
    setAttempts(newAttempts);
    setPin('');
    setIsShaking(true);
    Vibration.vibrate([0, 100, 50, 100]);

    setTimeout(() => setIsShaking(false), 500);

    if (newAttempts >= maxAttempts) {
      Alert.alert(
        "Too Many Attempts",
        "You've entered the wrong PIN too many times. Please try again later.",
        [{ text: "OK", onPress: onClose }]
      );
    } else {
      Alert.alert(
        "Incorrect PIN",
        `Wrong PIN. You have ${maxAttempts - newAttempts} attempts remaining.`,
        [{ text: "Try Again" }]
      );
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
  };

  const renderPinDots = () => {
    return (
      <View style={styles.pinDotsContainer}>
        {[0, 1, 2, 3].map((index) => (
          <View
            key={index}
            style={[
              styles.pinDot,
              pin.length > index && styles.pinDotFilled,
              isShaking && styles.pinDotShaking,
            ]}
          />
        ))}
      </View>
    );
  };

  const renderNumberPad = () => {
    const numbers = [
      ['1', '2', '3'],
      ['4', '5', '6'],
      ['7', '8', '9'],
      ['', '0', '⌫'],
    ];

    return (
      <View style={styles.numberPad}>
        {numbers.map((row, rowIndex) => (
          <View key={rowIndex} style={styles.numberRow}>
            {row.map((number, colIndex) => (
              <TouchableOpacity
                key={`${rowIndex}-${colIndex}`}
                style={[
                  styles.numberButton,
                  number === '' && styles.numberButtonEmpty,
                ]}
                onPress={() => {
                  if (number === '⌫') {
                    handleBackspace();
                  } else if (number !== '') {
                    handleNumberPress(number);
                  }
                }}
                disabled={number === '' || attempts >= maxAttempts}
              >
                <Text style={[
                  styles.numberText,
                  number === '⌫' && styles.backspaceText,
                ]}>
                  {number}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.closeButton} onPress={onClose}>
            <Text style={styles.closeButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {renderPinDots()}

          {attempts > 0 && attempts < maxAttempts && (
            <Text style={styles.attemptWarning}>
              {maxAttempts - attempts} attempts remaining
            </Text>
          )}

          {renderNumberPad()}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 20,
    paddingBottom: 10,
  },
  closeButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  closeButtonText: {
    fontSize: 16,
    color: '#6b7280',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    marginBottom: 40,
    textAlign: 'center',
  },
  pinDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 40,
  },
  pinDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#e5e7eb',
    marginHorizontal: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
  },
  pinDotFilled: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  pinDotShaking: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  attemptWarning: {
    fontSize: 14,
    color: '#ef4444',
    marginBottom: 20,
    textAlign: 'center',
    fontWeight: '500',
  },
  numberPad: {
    width: 300,
  },
  numberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  numberButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  numberButtonEmpty: {
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  numberText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#1f2937',
  },
  backspaceText: {
    fontSize: 24,
    color: '#6b7280',
  },
});