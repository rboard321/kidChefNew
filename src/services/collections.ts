import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  orderBy,
} from 'firebase/firestore';
import { auth, db } from './firebase';
import type { Collection } from '../types';

export interface CollectionService {
  createCollection: (parentId: string, name: string, description?: string) => Promise<string>;
  getCollections: (parentId: string) => Promise<Collection[]>;
  getCollection: (collectionId: string) => Promise<Collection | null>;
  updateCollection: (collectionId: string, updates: Partial<Collection>) => Promise<void>;
  deleteCollection: (collectionId: string) => Promise<void>;
  addRecipeToCollection: (collectionId: string, recipeId: string) => Promise<void>;
  removeRecipeFromCollection: (collectionId: string, recipeId: string) => Promise<void>;
}

const normalizeName = (name: string) => name.trim();

export const collectionService: CollectionService = {
  async createCollection(parentId: string, name: string, description?: string) {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }
    const normalized = normalizeName(name);
    if (!normalized) {
      throw new Error('Collection name is required');
    }

    const now = serverTimestamp();
    const docRef = await addDoc(collection(db, 'collections'), {
      parentId,
      name: normalized,
      nameLower: normalized.toLowerCase(),
      description: description?.trim() || '',
      recipeIds: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    return docRef.id;
  },

  async getCollections(parentId: string) {
    if (!auth.currentUser) {
      return [];
    }

    const q = query(
      collection(db, 'collections'),
      where('parentId', '==', parentId),
      orderBy('nameLower', 'asc')
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...(docSnap.data() as Omit<Collection, 'id'>),
    }));
  },

  async getCollection(collectionId: string) {
    if (!auth.currentUser) {
      return null;
    }

    const docSnap = await getDoc(doc(db, 'collections', collectionId));
    if (!docSnap.exists()) return null;
    return { id: docSnap.id, ...(docSnap.data() as Omit<Collection, 'id'>) };
  },

  async updateCollection(collectionId: string, updates: Partial<Collection>) {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }

    const updateData: Partial<Collection> = { ...updates };
    if (updateData.name) {
      updateData.name = normalizeName(updateData.name);
      updateData.nameLower = updateData.name.toLowerCase();
    }

    await updateDoc(doc(db, 'collections', collectionId), {
      ...updateData,
      updatedAt: serverTimestamp(),
    });
  },

  async deleteCollection(collectionId: string) {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }
    await deleteDoc(doc(db, 'collections', collectionId));
  },

  async addRecipeToCollection(collectionId: string, recipeId: string) {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }
    await updateDoc(doc(db, 'collections', collectionId), {
      recipeIds: arrayUnion(recipeId),
      updatedAt: serverTimestamp(),
    });
  },

  async removeRecipeFromCollection(collectionId: string, recipeId: string) {
    if (!auth.currentUser) {
      throw new Error('User not authenticated');
    }
    await updateDoc(doc(db, 'collections', collectionId), {
      recipeIds: arrayRemove(recipeId),
      updatedAt: serverTimestamp(),
    });
  },
};
