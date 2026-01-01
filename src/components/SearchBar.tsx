import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Text,
  Animated,
} from 'react-native';

interface SearchBarProps {
  placeholder?: string;
  value: string;
  onChangeText: (text: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  autoFocus?: boolean;
  kidMode?: boolean;
  debounceMs?: number;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  placeholder = 'Search recipes...',
  value,
  onChangeText,
  onFocus,
  onBlur,
  autoFocus = false,
  kidMode = false,
  debounceMs = 300,
}) => {
  const [localValue, setLocalValue] = useState(value);
  const [isFocused, setIsFocused] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout>();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const inputRef = useRef<TextInput>(null);

  // Debounced search to optimize performance
  useEffect(() => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      onChangeText(localValue);
    }, debounceMs);

    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, [localValue, onChangeText, debounceMs]);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleFocus = () => {
    setIsFocused(true);
    onFocus?.();

    // Gentle scale animation for kid mode
    if (kidMode) {
      Animated.spring(scaleAnim, {
        toValue: 1.02,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    }
  };

  const handleBlur = () => {
    setIsFocused(false);
    onBlur?.();

    // Reset scale animation
    if (kidMode) {
      Animated.spring(scaleAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }).start();
    }
  };

  const handleClear = () => {
    setLocalValue('');
    inputRef.current?.focus();
  };

  const containerStyle = kidMode ? styles.kidContainer : styles.container;
  const inputStyle = [
    kidMode ? styles.kidInput : styles.input,
    isFocused && (kidMode ? styles.kidInputFocused : styles.inputFocused),
  ];

  return (
    <Animated.View
      style={[
        containerStyle,
        kidMode && { transform: [{ scale: scaleAnim }] }
      ]}
    >
      <View style={styles.searchIconContainer}>
        <Text style={kidMode ? styles.kidSearchIcon : styles.searchIcon}>🔍</Text>
      </View>

      <TextInput
        ref={inputRef}
        style={inputStyle}
        placeholder={placeholder}
        placeholderTextColor={kidMode ? '#93c5fd' : '#9ca3af'}
        value={localValue}
        onChangeText={setLocalValue}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoFocus={autoFocus}
        returnKeyType="search"
        clearButtonMode="never" // We'll use custom clear button
        autoCorrect={false}
        autoCapitalize="none"
      />

      {localValue.length > 0 && (
        <TouchableOpacity
          style={styles.clearButton}
          onPress={handleClear}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={kidMode ? styles.kidClearIcon : styles.clearIcon}>✕</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    paddingHorizontal: 4,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kidContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f9ff',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#93c5fd',
    paddingHorizontal: 6,
    marginBottom: 20,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIconContainer: {
    paddingLeft: 12,
    paddingRight: 8,
  },
  searchIcon: {
    fontSize: 18,
    color: '#6b7280',
  },
  kidSearchIcon: {
    fontSize: 24,
    color: '#2563eb',
  },
  input: {
    flex: 1,
    paddingVertical: 16,
    paddingHorizontal: 8,
    fontSize: 16,
    color: '#1f2937',
  },
  kidInput: {
    flex: 1,
    paddingVertical: 18,
    paddingHorizontal: 10,
    fontSize: 18,
    color: '#1e40af',
    fontWeight: '500',
  },
  inputFocused: {
    borderColor: '#2563eb',
  },
  kidInputFocused: {
    borderColor: '#1e40af',
    borderWidth: 3,
  },
  clearButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearIcon: {
    fontSize: 16,
    color: '#9ca3af',
    fontWeight: 'bold',
  },
  kidClearIcon: {
    fontSize: 20,
    color: '#2563eb',
    fontWeight: 'bold',
  },
});