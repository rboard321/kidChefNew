import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

type ReadingLevel = 'beginner' | 'intermediate' | 'advanced';

interface LevelOption {
  id: ReadingLevel;
  title: string;
  ageRange: string;
  description: string;
  emoji: string;
}

const levelOptions: LevelOption[] = [
  {
    id: 'beginner',
    title: 'Beginner Chef',
    ageRange: 'Ages 6-8',
    description: 'Simple words, lots of help needed',
    emoji: '👶👨‍🍳',
  },
  {
    id: 'intermediate',
    title: 'Junior Chef',
    ageRange: 'Ages 9-12',
    description: 'Can read well, some independence',
    emoji: '🧒👩‍🍳',
  },
  {
    id: 'advanced',
    title: 'Teen Chef',
    ageRange: 'Ages 12+',
    description: 'Independent cooking with guidance',
    emoji: '🧑👨‍🍳',
  },
];

export default function KidLevelScreen() {
  const [selectedLevel, setSelectedLevel] = useState<ReadingLevel | null>(null);
  const [kidName, setKidName] = useState('');
  const [kidAge, setKidAge] = useState('');
  const navigation = useNavigation();

  const handleContinue = () => {
    if (selectedLevel && kidName.trim() && kidAge.trim()) {
      // Pass data to parent settings screen
      navigation.navigate('ParentSettings' as never, {
        kidData: {
          name: kidName.trim(),
          age: parseInt(kidAge),
          readingLevel: selectedLevel,
        }
      } as never);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Tell Us About Your Kid</Text>
        <Text style={styles.subtitle}>
          This helps us customize recipes and instructions for your child
        </Text>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Kid's Name</Text>
          <TextInput
            style={styles.input}
            value={kidName}
            onChangeText={setKidName}
            placeholder="Enter your kid's name"
            placeholderTextColor="#9ca3af"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              // Focus on age input - we'd need a ref for this, for now just dismiss
              Keyboard.dismiss();
            }}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.label}>Age</Text>
          <TextInput
            style={styles.input}
            value={kidAge}
            onChangeText={setKidAge}
            placeholder="Enter age (e.g., 8)"
            placeholderTextColor="#9ca3af"
            keyboardType="numeric"
            returnKeyType="done"
            onSubmitEditing={Keyboard.dismiss}
          />
        </View>

        <Text style={styles.sectionTitle}>Experience Level</Text>

        <View style={styles.optionsContainer}>
          {levelOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={[
                styles.option,
                selectedLevel === option.id && styles.selectedOption,
              ]}
              onPress={() => setSelectedLevel(option.id)}
            >
              <Text style={styles.optionEmoji}>{option.emoji}</Text>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionAge}>{option.ageRange}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              {selectedLevel === option.id && (
                <Text style={styles.checkmark}>✓</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, (!selectedLevel || !kidName.trim() || !kidAge.trim()) && styles.buttonDisabled]}
          onPress={handleContinue}
          disabled={!selectedLevel || !kidName.trim() || !kidAge.trim()}
        >
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
        </ScrollView>
      </TouchableWithoutFeedback>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 30,
    paddingHorizontal: 20,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 20,
    marginTop: 10,
  },
  optionsContainer: {
    marginBottom: 40,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 15,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
  },
  selectedOption: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  optionEmoji: {
    fontSize: 30,
    marginRight: 15,
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 2,
  },
  optionAge: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2563eb',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: 14,
    color: '#6b7280',
  },
  checkmark: {
    fontSize: 24,
    color: '#2563eb',
    fontWeight: 'bold',
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 20,
  },
  buttonDisabled: {
    backgroundColor: '#9ca3af',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});