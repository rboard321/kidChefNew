import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { BugReportModal } from '../../components/BugReportModal';
import { featureFlags, getAppVersionString, config } from '../../utils/environment';
import { kidProgressService } from '../../services/kidProgressService';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { signOut, kidProfiles } = useAuth();
  const [safetyNotes, setSafetyNotes] = useState(true);
  const [readAloud, setReadAloud] = useState(false);
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
    icon,
    disabled
  }: {
    title: string;
    description: string;
    value: boolean;
    onValueChange: (value: boolean) => void;
    icon: string;
    disabled?: boolean;
  }) => (
    <View style={[styles.settingItem, disabled && styles.settingItemDisabled]}>
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
        disabled={disabled}
        trackColor={{ false: '#e5e7eb', true: '#93c5fd' }}
        thumbColor={value ? '#2563eb' : '#f3f4f6'}
      />
    </View>
  );

  const ActionButton = ({ title, icon, onPress, color = '#2563eb', disabled, subtitle }: {
    title: string;
    icon: string;
    onPress: () => void;
    color?: string;
    disabled?: boolean;
    subtitle?: string;
  }) => (
    <TouchableOpacity
      style={[
        styles.actionButton,
        { borderColor: color },
        disabled && styles.actionButtonDisabled
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={styles.actionIcon}>{icon}</Text>
      <View style={styles.actionTextBlock}>
        <Text style={[styles.actionTitle, { color }]}>{title}</Text>
        {subtitle && <Text style={styles.actionSubtitle}>{subtitle}</Text>}
      </View>
    </TouchableOpacity>
  );

  const openSupportEmail = (subject: string) => {
    const url = `mailto:${config.supportEmail}?subject=${encodeURIComponent(subject)}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('Unable to Open Email', `Please email us at ${config.supportEmail}.`);
    });
  };

  const openFamilyProfiles = () => {
    const parentNav = navigation.getParent();
    if (parentNav) {
      parentNav.navigate('Kids' as never);
      return;
    }
    Alert.alert('Navigation Error', 'Unable to open family profiles right now.');
  };

  const handleResetProgress = () => {
    if (!kidProfiles.length) {
      Alert.alert('No Kids Found', 'Create a kid profile first.');
      return;
    }
    Alert.alert(
      'Reset Kid Progress',
      'Choose which kid to reset. This cannot be undone.',
      [
        ...kidProfiles.map((kid) => ({
          text: kid.name,
          style: 'destructive' as const,
          onPress: async () => {
            try {
              await kidProgressService.resetProgress(kid.id);
              Alert.alert('Reset Complete', `${kid.name}'s progress has been reset.`);
            } catch (error) {
              console.error('Reset progress failed:', error);
              Alert.alert('Reset Failed', 'Please try again.');
            }
          }
        })),
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

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
            description="Coming soon"
            value={readAloud}
            onValueChange={setReadAloud}
            icon="🔊"
            disabled
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
            description="Coming soon"
            value={darkMode}
            onValueChange={setDarkMode}
            icon="🌙"
            disabled
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account & Data</Text>

          <ActionButton
            title="Manage Family Profiles"
            icon="👨‍👩‍👧‍👦"
            onPress={openFamilyProfiles}
          />

          <ActionButton
            title="Export Recipes"
            icon="📤"
            onPress={() => {}}
            disabled
            subtitle="Coming soon"
          />

          <ActionButton
            title="Reset Kid Progress"
            icon="🔄"
            onPress={handleResetProgress}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support</Text>

          <ActionButton
            title="Help & FAQ"
            icon="❓"
            onPress={() => openSupportEmail('KidChef Help')}
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
            onPress={() => openSupportEmail('KidChef Support')}
          />

          <ActionButton
            title="Rate KidChef"
            icon="⭐"
            onPress={() => {}}
            disabled
            subtitle="Coming soon"
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
  settingItemDisabled: {
    opacity: 0.55,
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
  actionButtonDisabled: {
    opacity: 0.55,
  },
  actionIcon: {
    fontSize: 20,
    marginRight: 15,
    width: 30,
    textAlign: 'center',
  },
  actionTextBlock: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  actionSubtitle: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
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
