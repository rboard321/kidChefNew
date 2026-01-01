import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ScrollView,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import PinInput from '../../components/PinInput';
import type { KidProfile } from '../../types';

const { width } = Dimensions.get('window');

interface KidProfileSelectorProps {
  onKidSelected: (kid: KidProfile) => void;
  onExitKidMode: () => void;
}

export default function KidProfileSelector({ onKidSelected, onExitKidMode }: KidProfileSelectorProps) {
  const { kidProfiles, parentProfile, setDeviceModeWithPin } = useAuth();
  const [showPinInput, setShowPinInput] = useState(false);

  const getAgeGroup = (age: number): string => {
    if (age <= 8) return 'Little Chef';
    if (age <= 12) return 'Junior Chef';
    return 'Teen Chef';
  };

  const getReadingLevelColor = (level: string): string => {
    switch (level) {
      case 'beginner': return '#10b981';
      case 'intermediate': return '#f59e0b';
      case 'advanced': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const handleExitToParentMode = () => {
    const hasPinProtection = parentProfile?.kidModePin;

    if (hasPinProtection) {
      setShowPinInput(true);
    } else {
      // No PIN set, ask if they want to set one
      Alert.alert(
        'Exit to Parent Mode',
        'Would you like to set a PIN to protect kid mode in the future?',
        [
          {
            text: 'No, Just Exit',
            onPress: onExitKidMode
          },
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Set PIN',
            onPress: onExitKidMode // For now just exit, PIN setup can be added later
          }
        ]
      );
    }
  };

  const handlePinSuccess = async () => {
    setShowPinInput(false);
    onExitKidMode();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>👨‍🍳 Who's Cooking Today?</Text>
        <Text style={styles.subtitle}>
          Welcome to the {parentProfile?.familyName || 'family'} kitchen!
        </Text>
        <Text style={styles.instructions}>
          Pick your profile to see your special recipes!
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {kidProfiles.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>👶</Text>
            <Text style={styles.emptyTitle}>No Kids Added Yet!</Text>
            <Text style={styles.emptyText}>
              Ask your parent to add you to the family account first.
            </Text>
          </View>
        ) : (
          <View style={styles.kidGrid}>
            {kidProfiles.map((kid) => (
              <TouchableOpacity
                key={kid.id}
                style={styles.kidCard}
                onPress={() => onKidSelected(kid)}
                activeOpacity={0.8}
              >
                <View style={styles.kidAvatar}>
                  <Text style={styles.kidEmoji}>{kid.avatarEmoji || '👶'}</Text>
                </View>

                <View style={styles.kidInfo}>
                  <Text style={styles.kidName}>{kid.name}</Text>
                  <Text style={styles.kidAge}>{getAgeGroup(kid.age)}</Text>

                  <View style={[
                    styles.readingBadge,
                    { backgroundColor: getReadingLevelColor(kid.readingLevel) }
                  ]}>
                    <Text style={styles.readingText}>{kid.readingLevel}</Text>
                  </View>

                  {kid.allergyFlags && kid.allergyFlags.length > 0 && (
                    <View style={styles.allergyContainer}>
                      <Text style={styles.allergyIcon}>⚠️</Text>
                      <Text style={styles.allergyText}>Has allergies</Text>
                    </View>
                  )}
                </View>

                <View style={styles.tapHint}>
                  <Text style={styles.tapHintText}>Tap to cook! 🚀</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.parentModeButton}
          onPress={handleExitToParentMode}
        >
          <Text style={styles.parentModeButtonText}>👩‍💼 Parent Mode</Text>
        </TouchableOpacity>

        <Text style={styles.footerHint}>
          Need help? Ask your parent! 💝
        </Text>
      </View>

      <PinInput
        visible={showPinInput}
        onClose={() => setShowPinInput(false)}
        onSuccess={handlePinSuccess}
        title="Parent PIN Required"
        subtitle="Enter your PIN to access Parent Mode"
        correctPin={parentProfile?.kidModePin || ''}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fef3c7', // Warm yellow background
  },
  header: {
    padding: 20,
    paddingTop: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#dc2626',
    fontWeight: '600',
    marginBottom: 5,
    textAlign: 'center',
  },
  instructions: {
    fontSize: 16,
    color: '#92400e',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  scrollContent: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 0,
  },
  kidGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 15,
  },
  kidCard: {
    width: (width - 60) / 2, // Two cards per row with gap
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 3,
    borderColor: '#fbbf24',
    marginBottom: 15,
  },
  kidAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fef3c7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 15,
    borderWidth: 3,
    borderColor: '#fbbf24',
  },
  kidEmoji: {
    fontSize: 48,
  },
  kidInfo: {
    alignItems: 'center',
    marginBottom: 10,
  },
  kidName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 5,
    textAlign: 'center',
  },
  kidAge: {
    fontSize: 14,
    color: '#92400e',
    marginBottom: 8,
    fontWeight: '500',
  },
  readingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginBottom: 8,
  },
  readingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  allergyContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  allergyIcon: {
    fontSize: 12,
    marginRight: 4,
  },
  allergyText: {
    fontSize: 11,
    color: '#ef4444',
    fontWeight: '500',
  },
  tapHint: {
    backgroundColor: '#10b981',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  tapHintText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#dc2626',
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#92400e',
    textAlign: 'center',
    lineHeight: 24,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
  },
  parentModeButton: {
    backgroundColor: '#6b7280',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 10,
  },
  parentModeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  footerHint: {
    fontSize: 14,
    color: '#92400e',
    fontStyle: 'italic',
    textAlign: 'center',
  },
});