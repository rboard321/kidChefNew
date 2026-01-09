import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './src/contexts/AuthContext';
import { ImportProvider } from './src/contexts/ImportContext';
import AppNavigator from './src/navigation/AppNavigator';
import { queryClient, initializeQueryClient } from './src/services/queryClient';

export default function App() {
  useEffect(() => {
    initializeQueryClient();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ImportProvider>
            <AppNavigator />
            <StatusBar style="auto" />
          </ImportProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
