import React, { useState, useEffect } from 'react';
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
import { useAuth } from '../../contexts/AuthContext';
import { PinChangeModal } from '../../components/PinChangeModal';

export default function SettingsScreen() {
  const [safetyNotes, setSafetyNotes] = useState(true);
  const [readAloud, setReadAloud] = useState(true);
  const [autoSimplify, setAutoSimplify] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [showPinChangeModal, setShowPinChangeModal] = useState(false);

  const { user, parentProfile, changePIN, signOut } = useAuth();
<<<<<<< HEAD
=======
  const envInfo = getEnvironmentInfo();

  // Debug modal states disabled to prevent render loop
  // useEffect(() => {
  //   console.log('🔍 Settings Screen Modal States:', {
  //     showPinChangeModal,
  //     showBugReportModal,
  //     showEnvironmentDebug,
  //     timestamp: new Date().toISOString()
  //   });
  // }, [showPinChangeModal, showBugReportModal, showEnvironmentDebug]);

  // Enable shake-to-report functionality - disabled for debugging
  // useShakeToReport(() => {
  //   setShowBugReportModal(true);
  // }, true);
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)

  const handleSignOut = () => {
    console.log('🚪 Sign out button pressed');
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('🚪 Starting sign out process...');
              await signOut();
              console.log('✅ Sign out successful');
            } catch (error) {
              console.error('❌ Sign out error:', error);
              Alert.alert('Error', 'Failed to sign out. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleClearStorage = () => {
    Alert.alert(
      'Clear Local Storage',
      'This will force log you out and clear all cached data. Use this if sign out is not working.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Clear Storage',
          style: 'destructive',
          onPress: async () => {
            try {
              const AsyncStorage = require('@react-native-async-storage/async-storage').default;
              await AsyncStorage.clear();
              console.log('🧹 AsyncStorage cleared');
              Alert.alert('Storage Cleared', 'Please close and reopen the app.');
            } catch (error) {
              console.error('❌ Clear storage error:', error);
            }
          },
        },
      ]
    );
  };

  const handleChangePIN = () => {
    if (!parentProfile?.kidModePin) {
      Alert.alert(
        'No PIN Set',
        'You need to create a kid profile first to set up a PIN.',
        [{ text: 'OK' }]
      );
      return;
    }
    setShowPinChangeModal(true);
  };

  const handlePinChanged = async (newPin: string) => {
    try {
      await changePIN(newPin);
    } catch (error: any) {
      throw new Error(error.message || 'Failed to change PIN');
    }
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
    <TouchableOpacity
      style={[styles.actionButton, { borderColor: color }]}
      onPress={() => {
        console.log(`🟡 ActionButton pressed: ${title}`);
        onPress();
      }}
      activeOpacity={0.6}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
    >
      <Text style={styles.actionIcon}>{icon}</Text>
      <Text style={[styles.actionTitle, { color }]}>{title}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
<<<<<<< HEAD
      <PinChangeModal
        visible={showPinChangeModal}
        onClose={() => setShowPinChangeModal(false)}
        onPinChanged={handlePinChanged}
        currentPin={parentProfile?.kidModePin}
      />
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
=======
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {false && envInfo.shouldShowDebugInfo && (
          <EnvironmentBanner
            onPress={() => setShowEnvironmentDebug(true)}
            showDetails={envInfo.isDev}
          />
        )}
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Text style={styles.subtitle}>Customize your KidChef experience</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Preferences</Text>
          <SettingItem
            title="Safety Notes"
            description="Show safety tips and warnings during cooking"
            value={safetyNotes}
            onValueChange={setSafetyNotes}
            icon="🛡️"
          />
          <SettingItem
            title="Read Aloud"
            description="Automatically read recipe instructions"
            value={readAloud}
            onValueChange={setReadAloud}
            icon="🔊"
          />
          <SettingItem
            title="Auto-Simplify"
            description="Automatically simplify complex recipes"
            value={autoSimplify}
            onValueChange={setAutoSimplify}
            icon="✨"
          />
          <SettingItem
            title="Notifications"
            description="Receive helpful cooking tips and updates"
            value={notifications}
            onValueChange={setNotifications}
            icon="📳"
          />
          <SettingItem
            title="Dark Mode"
            description="Use dark theme throughout the app"
            value={darkMode}
            onValueChange={setDarkMode}
            icon="🌙"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <Text style={styles.accountInfo}>
            Signed in as: {user?.email || 'Unknown'}
          </Text>
          <Text style={styles.accountInfo}>
            Family: {parentProfile?.familyName || 'Unknown'}
          </Text>

          <ActionButton
            title="Change Kid Mode PIN"
            icon="🔒"
            onPress={handleChangePIN}
          />
          <ActionButton
            title="Sign Out"
            icon="🚪"
            onPress={handleSignOut}
            color="#ef4444"
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support & Feedback</Text>
          <ActionButton
            title="Send Feedback"
            icon="💬"
            onPress={handleSendFeedback}
          />
          <ActionButton
<<<<<<< HEAD
=======
            title="Report a Bug"
            icon="🐛"
            onPress={handleReportBug}
          />
          <ActionButton
            title="Contact Support"
            icon="🆘"
            onPress={handleContactSupport}
          />
          <ActionButton
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
            title="Help & FAQ"
            icon="❓"
            onPress={() => console.log('Help')}
          />
<<<<<<< HEAD

          <ActionButton
            title="Contact Support"
            icon="💬"
            onPress={() => console.log('Contact support')}
          />

=======
>>>>>>> 9d14aef (Implement native share extension infrastructure for recipe imports)
          <ActionButton
            title="Rate KidChef"
            icon="⭐"
            onPress={() => console.log('Rate app')}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Advanced</Text>
          <ActionButton
            title="Clear Local Storage"
            icon="🗑️"
            onPress={handleClearStorage}
            color="#ef4444"
          />
        </View>


        <View style={styles.footer}>
          <Text style={styles.footerText}>KidChef v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            Made with ❤️ for families who love to cook together
          </Text>
        </View>
      </ScrollView>

      {showPinChangeModal && (
        <PinChangeModal
          visible={showPinChangeModal}
          onClose={() => setShowPinChangeModal(false)}
          onPinChanged={handlePinChanged}
          currentPin={parentProfile?.kidModePin || ''}
        />
      )}

      {showBugReportModal && (
        <BugReportModal
          visible={showBugReportModal}
          onClose={() => setShowBugReportModal(false)}
        />
      )}

      {showEnvironmentDebug && envInfo.shouldShowDebugInfo && (
        <EnvironmentDebugModal
          visible={showEnvironmentDebug}
          onClose={() => setShowEnvironmentDebug(false)}
        />
      )}
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
  accountInfo: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
    paddingHorizontal: 20,
  },
  settingAction: {
    fontSize: 14,
    color: '#2563eb',
    fontWeight: '600',
  },
});
