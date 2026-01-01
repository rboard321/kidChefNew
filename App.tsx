import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { ImportProvider } from './src/contexts/ImportContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ImportProvider>
          <AppNavigator />
          <StatusBar style="auto" />
        </ImportProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}