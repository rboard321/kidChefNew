import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';

export default function WelcomeScreen() {
  const navigation = useNavigation();

  const handleGetStarted = () => {
<<<<<<< HEAD
    navigation.navigate('KidLevel' as never);
=======
    navigation.reset({
      index: 0,
      routes: [{ name: 'ParentSettings' as never }],
    } as never);
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Logo/Icon Area */}
        <View style={styles.logoContainer}>
          <Text style={styles.logoEmoji}>👨‍🍳👩‍🍳</Text>
          <Text style={styles.appName}>KidChef</Text>
          <Text style={styles.tagline}>Cooking Made Simple & Safe</Text>
        </View>

        {/* Illustration */}
        <View style={styles.illustrationContainer}>
          <Text style={styles.illustration}>🍳✨</Text>
        </View>

        {/* Welcome Text */}
        <View style={styles.textContainer}>
          <Text style={styles.title}>Welcome to KidChef!</Text>
          <Text style={styles.subtitle}>
            Turn any recipe into kid-friendly cooking adventures.
            Parents import recipes, kids learn to cook safely!
          </Text>
        </View>

        {/* Get Started Button */}
        <TouchableOpacity style={styles.button} onPress={handleGetStarted}>
          <Text style={styles.buttonText}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  content: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  logoEmoji: {
    fontSize: 60,
    marginBottom: 10,
  },
  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  tagline: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
  },
  illustrationContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  illustration: {
    fontSize: 80,
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    textAlign: 'center',
    marginBottom: 15,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  button: {
    backgroundColor: '#2563eb',
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 12,
    width: '80%',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
});
