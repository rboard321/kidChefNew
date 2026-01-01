import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../../contexts/AuthContext';
import PinInput from '../../components/PinInput';
import type { KidProfile, ReadingLevel } from '../../types';

export default function KidManagementScreen() {
  const { kidProfiles, addKid, updateKid, removeKid, loading, parentProfile, setKidModePin } = useAuth();
  const [addingKid, setAddingKid] = useState(false);
  const [editingKid, setEditingKid] = useState<KidProfile | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPinInput, setShowPinInput] = useState(false);
  const [pinStep, setPinStep] = useState<'set' | 'confirm' | null>(null);
  const [firstPin, setFirstPin] = useState('');
  const [pendingSaveAfterPin, setPendingSaveAfterPin] = useState(false);
  const [returnToModalAfterPin, setReturnToModalAfterPin] = useState(false);

  // Form state for adding/editing kids
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    readingLevel: 'intermediate' as ReadingLevel,
    allergyFlags: [] as string[],
    avatarEmoji: '👶',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      age: '',
      readingLevel: 'intermediate',
      allergyFlags: [],
      avatarEmoji: '👶',
    });
    setShowPinInput(false);
    setPinStep(null);
    setFirstPin('');
    setPendingSaveAfterPin(false);
    setReturnToModalAfterPin(false);
  };

  const openAddModal = () => {
    resetForm();
    setEditingKid(null);
    setShowAddModal(true);
  };

  const openEditModal = (kid: KidProfile) => {
    setFormData({
      name: kid.name,
      age: kid.age.toString(),
      readingLevel: kid.readingLevel,
      allergyFlags: kid.allergyFlags || [],
      avatarEmoji: kid.avatarEmoji || '👶',
    });
    setEditingKid(kid);
    setShowAddModal(true);
  };

  const handleSaveKid = async () => {
    if (!formData.name.trim() || !formData.age) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const age = parseInt(formData.age);
    if (isNaN(age) || age < 3 || age > 18) {
      Alert.alert('Error', 'Age must be between 3 and 18');
      return;
    }

    if (!editingKid && !parentProfile?.kidModePin) {
      Alert.alert(
        'Set Kid Mode PIN?',
        'Add a 4-digit PIN so kids can’t exit kid mode without your help.',
        [
          { text: 'Skip for Now', style: 'cancel', onPress: saveKidProfile },
          {
            text: 'Set PIN',
            onPress: () => {
              setPendingSaveAfterPin(true);
              startPinSetup();
            }
          },
        ]
      );
      return;
    }

    await saveKidProfile();
  };

  const saveKidProfile = async () => {
    const age = parseInt(formData.age);

    try {
      setAddingKid(true);

      const kidData = {
        name: formData.name.trim(),
        age,
        readingLevel: formData.readingLevel,
        allergyFlags: formData.allergyFlags,
        avatarEmoji: formData.avatarEmoji,
        permissions: {
          canViewIngredients: true,
          canUseKnives: age >= 10,
          canUseStove: age >= 12,
          canUseOven: age >= 14,
          requiresAdultHelp: age < 8,
          maxCookingTimeMinutes: Math.min(60, Math.max(15, age * 5)),
        },
      };

      if (editingKid) {
        await updateKid(editingKid.id, kidData);
        Alert.alert('Success', `${formData.name}'s profile has been updated!`);
      } else {
        await addKid(kidData);
        Alert.alert('Success', `${formData.name} has been added to your family!`);
      }

      setShowAddModal(false);
      resetForm();
    } catch (error) {
      console.error('Error saving kid:', error);
      Alert.alert('Error', 'Failed to save kid profile. Please try again.');
    } finally {
      setAddingKid(false);
    }
  };

  const handleDeleteKid = (kid: KidProfile) => {
    Alert.alert(
      'Remove Kid',
      `Are you sure you want to remove ${kid.name} from your family? This will also delete all their converted recipes.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeKid(kid.id);
              Alert.alert('Success', `${kid.name} has been removed from your family.`);
            } catch (error) {
              console.error('Error removing kid:', error);
              Alert.alert('Error', 'Failed to remove kid. Please try again.');
            }
          },
        },
      ]
    );
  };

  const startPinSetup = () => {
    setReturnToModalAfterPin(true);
    setShowAddModal(false);
    setPinStep('set');
    setShowPinInput(true);
  };

  const handlePinSuccess = async (pin?: string) => {
    const pinValue = pin || '';
    if (!pinValue) return;

    if (pinStep === 'set') {
      setFirstPin(pinValue);
      setPinStep('confirm');
      setShowPinInput(false);
      setTimeout(() => setShowPinInput(true), 300);
      return;
    }

    if (pinStep === 'confirm') {
      if (pinValue !== firstPin) {
        Alert.alert(
          'PINs Don\'t Match',
          'The PINs you entered don\'t match. Please try again.',
          [
            {
              text: 'Try Again',
              onPress: () => {
                setPinStep('set');
                setFirstPin('');
                setShowPinInput(false);
                setTimeout(() => setShowPinInput(true), 300);
              }
            }
          ]
        );
        return;
      }

      try {
        await setKidModePin(pinValue);
        Alert.alert('PIN Set', 'Kid mode PIN has been updated.');
        if (pendingSaveAfterPin) {
          setPendingSaveAfterPin(false);
          await saveKidProfile();
          return;
        }
      } catch (error) {
        console.error('Error setting PIN:', error);
        Alert.alert('Error', 'Failed to set PIN. Please try again.');
      } finally {
        setShowPinInput(false);
        setPinStep(null);
        setFirstPin('');
        if (returnToModalAfterPin && !pendingSaveAfterPin) {
          setShowAddModal(true);
        }
        setReturnToModalAfterPin(false);
      }
    }
  };


  const getAgeGroup = (age: number): string => {
    if (age <= 8) return 'Little Chef';
    if (age <= 12) return 'Junior Chef';
    return 'Teen Chef';
  };

  const getReadingLevelColor = (level: ReadingLevel): string => {
    switch (level) {
      case 'beginner': return '#10b981';
      case 'intermediate': return '#f59e0b';
      case 'advanced': return '#8b5cf6';
      default: return '#6b7280';
    }
  };

  const renderKid = ({ item }: { item: KidProfile }) => (
    <View style={styles.kidCard}>
      <View style={styles.kidHeader}>
        <Text style={styles.kidEmoji}>{item.avatarEmoji || '👶'}</Text>
        <View style={styles.kidInfo}>
          <Text style={styles.kidName}>{item.name}</Text>
          <Text style={styles.kidDetails}>Age {item.age} • {getAgeGroup(item.age)}</Text>
        </View>
        <View style={[styles.readingBadge, { backgroundColor: getReadingLevelColor(item.readingLevel) }]}>
          <Text style={styles.readingText}>{item.readingLevel}</Text>
        </View>
      </View>

      {item.allergyFlags && item.allergyFlags.length > 0 && (
        <View style={styles.allergySection}>
          <Text style={styles.allergyLabel}>Allergies:</Text>
          <Text style={styles.allergyText}>{item.allergyFlags.join(', ')}</Text>
        </View>
      )}

      <View style={styles.kidActions}>
        <TouchableOpacity style={styles.editButton} onPress={() => openEditModal(item)}>
          <Text style={styles.editButtonText}>✏️ Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteKid(item)}>
          <Text style={styles.deleteButtonText}>🗑️ Remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Manage Kids</Text>
        <Text style={styles.subtitle}>Add and manage your children's profiles</Text>
      </View>

      <TouchableOpacity style={styles.addButton} onPress={openAddModal}>
        <Text style={styles.addButtonText}>👶 Add Kid Profile</Text>
      </TouchableOpacity>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={styles.loadingText}>Loading kids...</Text>
        </View>
      ) : (
        <FlatList
          data={kidProfiles}
          renderItem={renderKid}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Add/Edit Kid Modal */}
      <Modal
        visible={showAddModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => {
              Keyboard.dismiss();
              setShowAddModal(false);
            }}>
              <Text style={styles.cancelButton}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {editingKid ? 'Edit Kid' : 'Add New Kid'}
            </Text>
            <TouchableOpacity onPress={handleSaveKid} disabled={addingKid}>
              <Text style={[styles.saveButton, addingKid && styles.disabledButton]}>
                {addingKid ? 'Saving...' : 'Save'}
              </Text>
            </TouchableOpacity>
          </View>

          <KeyboardAvoidingView
            style={styles.modalKeyboardContainer}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
          >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.formGroup}>
              <Text style={styles.label}>Name *</Text>
              <TextInput
                style={styles.input}
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                placeholder="Enter kid's name"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Age *</Text>
              <TextInput
                style={styles.input}
                value={formData.age}
                onChangeText={(text) => setFormData({ ...formData, age: text })}
                placeholder="Enter age (3-18)"
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Reading Level</Text>
              <View style={styles.levelButtons}>
                {(['beginner', 'intermediate', 'advanced'] as ReadingLevel[]).map((level) => (
                  <TouchableOpacity
                    key={level}
                    style={[
                      styles.levelButton,
                      formData.readingLevel === level && styles.selectedLevelButton,
                    ]}
                    onPress={() => setFormData({ ...formData, readingLevel: level })}
                  >
                    <Text
                      style={[
                        styles.levelButtonText,
                        formData.readingLevel === level && styles.selectedLevelButtonText,
                      ]}
                    >
                      {level.charAt(0).toUpperCase() + level.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Avatar</Text>
              <View style={styles.emojiSelector}>
                {['👶', '🧒', '👦', '👧', '🧑', '👩', '👨'].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={[
                      styles.emojiButton,
                      formData.avatarEmoji === emoji && styles.selectedEmojiButton,
                    ]}
                    onPress={() => setFormData({ ...formData, avatarEmoji: emoji })}
                  >
                    <Text style={styles.emoji}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Kid Mode PIN</Text>
              <Text style={styles.helperText}>
                Set a 4-digit PIN so kids can’t exit kid mode without your help.
              </Text>
              <View style={styles.pinActions}>
                <TouchableOpacity style={styles.pinButton} onPress={startPinSetup}>
                  <Text style={styles.pinButtonText}>
                    {parentProfile?.kidModePin ? 'Change PIN' : 'Set PIN'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
              </ScrollView>
            </TouchableWithoutFeedback>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <PinInput
        visible={showPinInput}
        onClose={() => {
          setShowPinInput(false);
          setPinStep(null);
          setFirstPin('');
          if (returnToModalAfterPin) {
            setShowAddModal(true);
          }
          setReturnToModalAfterPin(false);
          setPendingSaveAfterPin(false);
        }}
        onSuccess={handlePinSuccess}
        title={pinStep === 'confirm' ? 'Confirm Your PIN' : 'Set Your PIN'}
        subtitle={pinStep === 'confirm' ? 'Enter the same PIN again' : 'Enter a 4-digit PIN'}
        mode="input"
      />

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
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
  addButton: {
    backgroundColor: '#2563eb',
    margin: 20,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  list: {
    padding: 20,
    paddingTop: 0,
  },
  kidCard: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 16,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  kidHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  kidEmoji: {
    fontSize: 48,
    marginRight: 15,
  },
  kidInfo: {
    flex: 1,
  },
  kidName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  kidDetails: {
    fontSize: 14,
    color: '#6b7280',
  },
  readingBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  readingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  allergySection: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  allergyLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
    marginRight: 8,
  },
  allergyText: {
    fontSize: 14,
    color: '#ef4444',
    flex: 1,
  },
  kidActions: {
    flexDirection: 'row',
    gap: 10,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#f3f4f6',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#fef2f2',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#ef4444',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#6b7280',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyEmoji: {
    fontSize: 80,
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#6b7280',
    textAlign: 'center',
    lineHeight: 24,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  modalKeyboardContainer: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    paddingTop: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    backgroundColor: 'white',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  cancelButton: {
    fontSize: 16,
    color: '#6b7280',
  },
  saveButton: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2563eb',
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  formGroup: {
    marginBottom: 24,
  },
  helperText: {
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 12,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  levelButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  levelButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: 'white',
    alignItems: 'center',
  },
  selectedLevelButton: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  levelButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  selectedLevelButtonText: {
    color: 'white',
  },
  emojiSelector: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  emojiButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedEmojiButton: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  emoji: {
    fontSize: 24,
  },
  pinActions: {
    flexDirection: 'row',
    gap: 10,
  },
  pinButton: {
    backgroundColor: '#2563eb',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  pinButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});
