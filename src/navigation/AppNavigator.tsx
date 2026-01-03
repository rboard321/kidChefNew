import React, { useEffect, useRef } from 'react';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { deepLinkService } from '../services/deepLinkService';
import { ErrorBoundary, AuthErrorBoundary } from '../components/ErrorBoundary';

// Auth screens
import AuthScreen from '../screens/auth/AuthScreen';
import PrivacyPolicyScreen from '../screens/auth/PrivacyPolicyScreen';
import TermsOfServiceScreen from '../screens/auth/TermsOfServiceScreen';

// Onboarding screens
import WelcomeScreen from '../screens/onboarding/WelcomeScreen';
import ParentSettingsScreen from '../screens/onboarding/ParentSettingsScreen';
import ParentalConsentScreen from '../screens/onboarding/ParentalConsentScreen';

// Parent screens
import ParentHomeScreen from '../screens/parent/HomeScreen';
import ImportRecipeScreen from '../screens/parent/ImportRecipeScreen';
import KidManagementScreen from '../screens/parent/KidManagementScreen';
import RecipeDetailScreen from '../screens/parent/RecipeDetailScreen';
import RecipeManagementScreen from '../screens/parent/RecipeManagementScreen';
import FavoritesScreen from '../screens/parent/FavoritesScreen';

// Kid screens
import KidHomeScreen from '../screens/kid/KidHomeScreen';
import KidProfileSelector from '../screens/kid/KidProfileSelector';
import RecipeViewScreen from '../screens/kid/RecipeViewScreen';
import KidSettingsScreen from '../screens/kid/KidSettingsScreen';
import BadgeCollectionScreen from '../screens/kid/BadgeCollectionScreen';

// Shared screens
import SettingsScreen from '../screens/shared/SettingsScreen';

import type { RootStackParamList, ParentTabParamList, KidTabParamList } from '../types';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const ParentTab = createBottomTabNavigator<ParentTabParamList>();
const KidTab = createBottomTabNavigator<KidTabParamList>();

// Parent Tab Navigator
function ParentTabNavigator() {
  return (
    <ErrorBoundary>
      <ParentTab.Navigator
        screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Import') {
            iconName = focused ? 'add-circle' : 'add-circle-outline';
          } else if (route.name === 'Kids') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          } else {
            iconName = 'help-circle-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
      })}
    >
      <ParentTab.Screen
        name="Home"
        component={ParentHomeScreen}
        options={{ title: 'My Recipes' }}
      />
      <ParentTab.Screen
        name="Import"
        component={ImportRecipeScreen}
        options={{ title: 'Import Recipe' }}
      />
      <ParentTab.Screen
        name="Kids"
        component={KidManagementScreen}
        options={{ title: 'Manage Kids' }}
      />
      <ParentTab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
    </ParentTab.Navigator>
    </ErrorBoundary>
  );
}

// Kid Tab Navigator
function KidTabNavigator() {
  return (
    <ErrorBoundary>
      <KidTab.Navigator
        screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap;

          if (route.name === 'Recipes') {
            iconName = focused ? 'restaurant' : 'restaurant-outline';
          } else if (route.name === 'Settings') {
            iconName = focused ? 'settings' : 'settings-outline';
          } else {
            iconName = 'help-circle-outline';
          }

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#10b981',
        tabBarInactiveTintColor: 'gray',
        headerShown: false,
        tabBarLabelStyle: { fontSize: 14, fontWeight: '600' },
        tabBarStyle: { height: 80, paddingBottom: 10, paddingTop: 5 },
      })}
    >
      <KidTab.Screen
        name="Recipes"
        component={KidHomeScreen}
        options={{ title: 'My Recipes' }}
      />
      <KidTab.Screen
        name="Settings"
        component={KidSettingsScreen}
        options={{ title: 'Settings' }}
      />
    </KidTab.Navigator>
    </ErrorBoundary>
  );
}

// Main App Navigator
export default function AppNavigator() {
  const { user, loading, parentProfile, deviceMode, currentKid, selectKid, setDeviceMode, consentStatus, checkConsentStatus } = useAuth();
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = React.useState(false);
  const navigationRef = useRef<NavigationContainerRef<any>>(null);
  const legalScreens = (
    <>
      <RootStack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ headerShown: true, title: 'Privacy Policy' }}
      />
      <RootStack.Screen
        name="TermsOfService"
        component={TermsOfServiceScreen}
        options={{ headerShown: true, title: 'Terms of Service' }}
      />
    </>
  );

  useEffect(() => {
    // Initialize deep linking service
    deepLinkService.setNavigationRef(navigationRef);
    deepLinkService.initialize();
  }, []);

  // Function to complete onboarding
  const completeOnboarding = () => {
    setHasCompletedOnboarding(true);
  };

  // Check if user has completed onboarding
  React.useEffect(() => {
    if (parentProfile) {
      setHasCompletedOnboarding(true);
    }
  }, [parentProfile]);

  React.useEffect(() => {
    if (!user || !parentProfile) {
      setHasCompletedOnboarding(false);
    }
  }, [user, parentProfile]);


  // Show loading screen while checking auth
  if (loading) {
    return null; // You could show a loading screen here
  }

  return (
    <NavigationContainer ref={navigationRef}>
      <RootStack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          // Not authenticated - show auth screen
          <>
            <RootStack.Screen name="Auth">
              {() => (
                <AuthErrorBoundary>
                  <AuthScreen />
                </AuthErrorBoundary>
              )}
            </RootStack.Screen>
            {legalScreens}
          </>
        ) : consentStatus !== 'verified' ? (
          // Authenticated but parental consent not verified - show consent screen
          <>
            <RootStack.Screen name="ParentalConsent">
              {() => (
                <ParentalConsentScreen
                  onConsentVerified={() => {
                    checkConsentStatus();
                  }}
                />
              )}
            </RootStack.Screen>
            {legalScreens}
          </>
        ) : !hasCompletedOnboarding ? (
          // Authenticated but no profile - show onboarding
          <>
            <RootStack.Screen
              name="ParentSettings"
              children={() => <ParentSettingsScreen onComplete={completeOnboarding} />}
            />
            {legalScreens}
          </>
        ) : deviceMode === 'kid' ? (
          // Device is in Kid Mode - show kid stack
          <>
            {!currentKid ? (
              // No kid selected - show profile selector
              <RootStack.Screen name="KidSelector">
                {() => (
                  <KidProfileSelector
                    onKidSelected={(kid) => selectKid(kid.id)}
                    onExitKidMode={() => setDeviceMode('parent')}
                  />
                )}
              </RootStack.Screen>
            ) : (
              // Kid selected - show kid interface
              <>
                <RootStack.Screen
                  name="Main"
                  component={KidTabNavigator}
                />
                <RootStack.Screen
                  name="RecipeView"
                  component={RecipeViewScreen}
                  options={{
                    headerShown: true,
                    title: 'Let\'s Cook!'
                  }}
                />
                <RootStack.Screen
                  name="BadgeCollection"
                  component={BadgeCollectionScreen}
                  options={{
                    headerShown: false,
                  }}
                />
              </>
            )}
            {legalScreens}
          </>
        ) : (
          // Device is in Parent Mode - show parent stack
          <>
            <RootStack.Screen
              name="Main"
              component={ParentTabNavigator}
            />
            <RootStack.Screen
              name="RecipeDetail"
              component={RecipeDetailScreen}
              options={{
                headerShown: true,
                title: 'Recipe Details'
              }}
            />
            <RootStack.Screen
              name="RecipeManagement"
              component={RecipeManagementScreen}
              options={{
                headerShown: true,
                title: 'Recipe Management'
              }}
            />
            <RootStack.Screen
              name="Favorites"
              component={FavoritesScreen}
              options={{
                headerShown: true,
                title: 'Favorites'
              }}
            />
            {legalScreens}
          </>
        )}
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
