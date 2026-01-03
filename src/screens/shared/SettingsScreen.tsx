import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { BugReportModal } from '../../components/BugReportModal';
import { featureFlags, getAppVersionString } from '../../utils/environment';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signOut } = useAuth();
  const [safetyNotes, setSafetyNotes] = useState(true);
  const [readAloud, setReadAloud] = useState(true);
  const [autoSimplify, setAutoSimplify] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [bugReportVisible, setBugReportVisible] = useState(false);

  const showBugReport = featureFlags.betaTestingMode || featureFlags.enableFeedbackCollection;

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
      Alert.alert('Sign Out Failed', 'Please try again.');
    }
  };

  const confirmSignOut = () => {
    Alert.alert(
      'Sign Out',
      'You will need to sign in again to access your account.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: () => void handleSignOut() },
      ]
    );
  };

  const SettingItem = ({
    title,
    description,
    value,
    onValueChange,
    icon
  }: {
    title: string;
    description: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    icon: string;
  }) => (
    <View style={styles.settingItem}>
      <View style={styles.settingIcon}>
        <Text style={styles.iconText}>{icon}</Text>
      </View>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        <Text style={styles.settingDescription}>{description}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
        thumbColor={value ? '#2563eb' : '#f3f4f6'}
      />
    </View>
  );

  const ActionButton = ({ title, icon, onPress, color = '#2563eb' }: {
    title: string;
    icon: string;
    onPress: () => void;
    color?: string;
  }) => (
    <TouchableOpacity style={[styles.actionButton, { borderColor: color }]} onPress={onPress}>
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={[styles.actionTitle, { color }]}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Customize your KidChef experience</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kid Safety & Learning</Text>

          <SettingItem
            title="Show Safety Notes"
            description="Highlight when adult help is needed"
            value={safetyNotes}
            onValueChange={setSafetyNotes}
            icon="⚠️"
          />

          <SettingItem
            title="Enable Read-Aloud Mode"
            description="Kids can hear instructions spoken out loud"
            value={readAloud}
            onValueChange={setReadAloud}
            icon="🔊"
          />

          <SettingItem
            title="Auto-Simplify Recipes"
            description="Automatically convert all recipes to kid-friendly versions"
            value={autoSimplify}
            onValueChange={setAutoSimplify}
            icon="✨"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>General</Text>

          <SettingItem
            title="Push Notifications"
            description="Get reminders and cooking tips"
            value={notifications}
            onValueChange={setNotifications}
            icon="🔔"
          />

          <SettingItem
            title="Dark Mode"
            description="Switch to dark theme"
            value={darkMode}
            onValueChange={setDarkMode}
            icon="🌙"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & Data</Text>

          <ActionButton
            title="Manage Family Profiles"
            icon="👨‍👩‍👧‍👦"
            onPress={() => console.log('Manage profiles')}
          />

          <ActionButton
            title="Export Recipes"
            icon="📤"
            onPress={() => console.log('Export recipes')}
          />

          <ActionButton
            title="Reset Kid Progress"
            icon="🔄"
            onPress={() => console.log('Reset progress')}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>

          <ActionButton
            title="Help & FAQ"
            icon="❓"
            onPress={() => console.log('Help')}
          />

          <ActionButton
            title="Privacy Policy"
            icon="🔒"
            onPress={() => navigation.navigate('PrivacyPolicy')}
          />

          <ActionButton
            title="Terms of Service"
            icon="📜"
            onPress={() => navigation.navigate('TermsOfService')}
          />

          <ActionButton
            title="Contact Support"
            icon="💬"
            onPress={() => console.log('Contact support')}
          />

          <ActionButton
            title="Rate KidChef"
            icon="⭐"
            onPress={() => console.log('Rate app')}
          />

          {showBugReport && (
            <ActionButton
              title="Report a Bug (Beta)"
              icon="🐞"
              onPress={() => setBugReportVisible(true)}
            />
          )}
        </View>

        <View style={styles.section}>
          <ActionButton
            title="Sign Out"
            icon="🚪"
            onPress={confirmSignOut}
            color="#ef4444"
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>KidChef {getAppVersionString()}</Text>
          <Text style={styles.footerSubtext}>
            Made with ❤️ for families who love to cook together
          </Text>
        </View>
      </ScrollView>
      <BugReportModal
        visible={bugReportVisible}
        onClose={() => setBugReportVisible(false)}
        prefilledContext={{ screen: 'settings' }}
      />
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
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#6b7280',
  },
  section: {
    backgroundColor: 'white',
    margin: 15,
    borderRadius: 12,
    overflow: 'hidden',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1f2937',
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  iconText: {
    fontSize: 18,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 20,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 15,
    width: 30,
    textAlign: 'center',
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  footer: {
    padding: 30,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 14,
    color: '#9ca3af',
    fontWeight: '500',
    marginBottom: 5,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#d1d5db',
    textAlign: 'center',
    lineHeight: 18,
  },
});
