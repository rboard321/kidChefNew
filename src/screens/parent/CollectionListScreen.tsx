import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import { useCollections } from '../../hooks/useCollections';
import { collectionService } from '../../services/collections';
import { queryKeys } from '../../services/queryClient';
import { SUBSCRIPTION_PLANS } from '../../config/plans';
import type { Collection } from '../../types';

export default function CollectionListScreen() {
  const navigation = useNavigation<any>();
  const { parentProfile, effectivePlan, subscription } = useAuth();
  const parentId = parentProfile?.id ?? '';
  const queryClient = useQueryClient();
  const { data: collections = [], isLoading } = useCollections(parentId);
  const [createVisible, setCreateVisible] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const maxCollections = useMemo(() => {
    if (subscription?.isBetaTester) return 'unlimited';
    return SUBSCRIPTION_PLANS[effectivePlan].limits.maxCollections;
  }, [effectivePlan, subscription?.isBetaTester]);

  const atLimit =
    maxCollections !== 'unlimited' && collections.length >= maxCollections;

  const openCreate = () => {
    if (atLimit) {
      Alert.alert(
        'Collection Limit Reached',
        'Free users can create up to 5 collections. Upgrade to KidChef Plus for unlimited collections.',
        [
          { text: 'Not Now', style: 'cancel' },
          { text: 'View Plans', onPress: () => navigation.navigate('Pricing') },
        ]
      );
      return;
    }
    setName('');
    setDescription('');
    setCreateVisible(true);
  };

  const handleCreate = async () => {
    if (!parentId) return;
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Missing Name', 'Please name your collection.');
      return;
    }

    try {
      setSaving(true);
      await collectionService.createCollection(parentId, trimmed, description);
      queryClient.invalidateQueries({ queryKey: queryKeys.collections(parentId) });
      setCreateVisible(false);
    } catch (error) {
      console.error('Failed to create collection:', error);
      Alert.alert('Error', 'Unable to create collection. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const renderCollection = ({ item }: { item: Collection }) => (
    <TouchableOpacity
      style={styles.collectionCard}
      onPress={() => navigation.navigate('CollectionDetail', { collectionId: item.id })}
    >
      <View style={styles.collectionHeader}>
        <Text style={styles.collectionName}>{item.name}</Text>
        <Text style={styles.collectionCount}>{item.recipeIds?.length || 0}</Text>
      </View>
      {item.description ? (
        <Text style={styles.collectionDescription} numberOfLines={2}>
          {item.description}
        </Text>
      ) : (
        <Text style={styles.collectionDescriptionEmpty}>No description</Text>
      )}
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.title}>Collections</Text>
        <Text style={styles.subtitle}>Group recipes by theme, cuisine, or mood.</Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.createButton} onPress={openCreate}>
          <Text style={styles.createButtonText}>➕ New Collection</Text>
        </TouchableOpacity>
        {maxCollections !== 'unlimited' && (
          <Text style={styles.limitText}>
            {collections.length}/{maxCollections} collections used
          </Text>
        )}
      </View>

      {isLoading ? (
        <Text style={styles.loadingText}>Loading collections...</Text>
      ) : collections.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>📂</Text>
          <Text style={styles.emptyTitle}>No collections yet</Text>
          <Text style={styles.emptyText}>Create one to start organizing recipes.</Text>
        </View>
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(item) => item.id}
          renderItem={renderCollection}
          contentContainerStyle={styles.list}
        />
      )}

      <Modal visible={createVisible} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Collection</Text>
            <TextInput
              style={styles.input}
              placeholder="Collection name"
              value={name}
              onChangeText={setName}
              maxLength={40}
            />
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Description (optional)"
              value={description}
              onChangeText={setDescription}
              multiline
              maxLength={120}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity onPress={() => setCreateVisible(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleCreate} disabled={saving}>
                <Text style={styles.saveButtonText}>{saving ? 'Saving...' : 'Create'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1f2937',
  },
  subtitle: {
    color: '#6b7280',
    marginTop: 4,
  },
  actions: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  createButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  createButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  limitText: {
    color: '#6b7280',
    fontSize: 12,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  collectionCard: {
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  collectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  collectionName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  collectionCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#2563eb',
    backgroundColor: '#e0e7ff',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  collectionDescription: {
    color: '#6b7280',
  },
  collectionDescriptionEmpty: {
    color: '#9ca3af',
    fontStyle: 'italic',
  },
  emptyState: {
    alignItems: 'center',
    marginTop: 40,
  },
  emptyEmoji: {
    fontSize: 48,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 12,
    color: '#1f2937',
  },
  emptyText: {
    color: '#6b7280',
    marginTop: 6,
  },
  loadingText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#6b7280',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 12,
    color: '#1f2937',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  inputMultiline: {
    height: 80,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  cancelText: {
    color: '#6b7280',
    fontWeight: '600',
  },
  saveButton: {
    backgroundColor: '#2563eb',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: '700',
  },
});
