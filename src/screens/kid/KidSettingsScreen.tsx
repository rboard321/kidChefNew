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

export default function KidSettingsScreen() {
  const navigation = useNavigation();
  const [readAloud, setReadAloud] = useState(true);
  const [darkMode, setDarkMode] = useState(false);

  const { currentKid, setDeviceModeWithPin, parentProfile } = useAuth();

  const handleExitKidMode = () => {
    const hasPinProtection = parentProfile?.kidModePin;

    if (hasPinProtection) {
      Alert.alert(
        'Exit Kid Mode',
        'Ask your parent to enter the PIN to exit Kid Mode.',
        [{ text: 'OK' }]
      );
    } else {
      Alert.alert(
        'Exit Kid Mode',
        'Are you sure you want to exit Kid Mode?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Yes, Exit',
            style: 'default',
            onPress: async () => {
              await setDeviceModeWithPin('parent');
            }
          }
        ]
      );
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
        thumbColor={value ? '#10b981' : '#f3f4f6'}
      />
    </View>
  );

  const ActionButton = ({ title, icon, onPress, color = '#10b981' }: {
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
          <Text style={styles.title}>Hi {currentKid?.name}! ⚙️</Text>
          <Text style={styles.subtitle}>Your personal cooking settings</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Cooking Preferences</Text>

          <SettingItem
            title="Read Instructions Aloud"
            description="Hear recipe steps spoken out loud"
            value={readAloud}
            onValueChange={setReadAloud}
            icon="🔊"
          />

          <SettingItem
            title="Dark Mode"
            description="Switch to darker colors"
            value={darkMode}
            onValueChange={setDarkMode}
            icon="🌙"
          />

          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Text style={styles.iconText}>⚠️</Text>
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>Safety Notes</Text>
              <Text style={styles.settingDescription}>
                Always shown to keep you safe while cooking
              </Text>
            </View>
            <View style={styles.alwaysOnBadge}>
              <Text style={styles.alwaysOnText}>Always On</Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>My Cooking Journey</Text>

          <ActionButton
            title="My Badges Collection"
            icon="🏆"
            onPress={() => navigation.navigate('BadgeCollection' as never)}
          />

          <ActionButton
            title="My Cooking Progress"
            icon="📊"
            onPress={() => console.log('Show progress')}
          />

          <View style={styles.settingItem}>
            <View style={styles.settingIcon}>
              <Text style={styles.iconText}>🎨</Text>
            </View>
            <View style={styles.settingContent}>
              <Text style={styles.settingTitle}>My Avatar</Text>
              <Text style={styles.settingDescription}>
                {currentKid?.avatarEmoji || '👨‍🍳'} Change your cooking avatar
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Need Help?</Text>

          <ActionButton
            title="Ask a Parent"
            icon="👨‍👩‍👧‍👦"
            onPress={() => Alert.alert('Need Help?', 'Ask your parent if you need help with anything!', [{ text: 'OK' }])}
          />

          <ActionButton
            title="Cooking Tips"
            icon="💡"
            onPress={() => Alert.alert('Cooking Tips', 'Remember to always wash your hands before cooking and ask for help with sharp tools!', [{ text: 'Got it!' }])}
          />
        </View>

        <View style={styles.section}>
          <ActionButton
            title="Exit Kid Mode"
            icon="👋"
            onPress={handleExitKidMode}
            color="#ef4444"
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>KidChef v1.0.0</Text>
          <Text style={styles.footerSubtext}>
            Happy cooking, {currentKid?.name}! 🍽️✨
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f9ff',
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
    color: '#1e40af',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#1e40af',
  },
  section: {
    backgroundColor: 'white',
    margin: 15,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#10b981',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e40af',
    padding: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0f2fe',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0f2fe',
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e0f2fe',
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
    color: '#1e40af',
    marginBottom: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#1e40af',
    lineHeight: 20,
  },
  alwaysOnBadge: {
    backgroundColor: '#10b981',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  alwaysOnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0f2fe',
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
    color: '#1e40af',
    fontWeight: '500',
    marginBottom: 5,
  },
  footerSubtext: {
    fontSize: 12,
    color: '#10b981',
    textAlign: 'center',
    lineHeight: 18,
  },
});