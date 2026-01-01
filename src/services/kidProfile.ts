import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import type { KidProfile, KidPermissions } from '../types';

export interface KidProfileService {
  createKidProfile: (parentId: string, kidData: Omit<KidProfile, 'id' | 'parentId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  getKidProfile: (kidId: string) => Promise<KidProfile | null>;
  getParentKids: (parentId: string) => Promise<KidProfile[]>;
  updateKidProfile: (kidId: string, updates: Partial<KidProfile>) => Promise<void>;
  updateKidPermissions: (kidId: string, permissions: KidPermissions) => Promise<void>;
  deleteKidProfile: (kidId: string) => Promise<void>;
  getKidsByReadingLevel: (readingLevel: string) => Promise<KidProfile[]>;
  getKidsWithAllergies: (allergens: string[]) => Promise<KidProfile[]>;
}

export const kidProfileService: KidProfileService = {
  async createKidProfile(parentId: string, kidData: Omit<KidProfile, 'id' | 'parentId' | 'createdAt' | 'updatedAt'>) {
    try {
      const now = Timestamp.now();
      const kidProfile: Omit<KidProfile, 'id'> = {
        ...kidData,
        parentId,
        allergyFlags: kidData.allergyFlags || [],
        permissions: kidData.permissions || {
          canViewIngredients: true,
          canUseKnives: false,
          canUseStove: false,
          canUseOven: false,
          requiresAdultHelp: true,
          maxCookingTimeMinutes: 30,
        },
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await addDoc(collection(db, 'kidProfiles'), kidProfile);
      return docRef.id;
    } catch (error) {
      console.error('Error creating kid profile:', error);
      throw error;
    }
  },

  async getKidProfile(kidId: string): Promise<KidProfile | null> {
    try {
      const docSnap = await getDoc(doc(db, 'kidProfiles', kidId));
      if (docSnap.exists()) {
        return {
          id: docSnap.id,
          ...docSnap.data(),
        } as KidProfile;
      }
      return null;
    } catch (error) {
      console.error('Error fetching kid profile:', error);
      return null;
    }
  },

  async getParentKids(parentId: string): Promise<KidProfile[]> {
    try {
      const q = query(
        collection(db, 'kidProfiles'),
        where('parentId', '==', parentId)
      );

      const querySnapshot = await getDocs(q);
      const kids: KidProfile[] = [];

      querySnapshot.forEach((doc) => {
        kids.push({
          id: doc.id,
          ...doc.data(),
        } as KidProfile);
      });

      return kids.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Error fetching parent kids:', error);
      throw error;
    }
  },

  async updateKidProfile(kidId: string, updates: Partial<KidProfile>) {
    try {
      const updateData = {
        ...updates,
        updatedAt: Timestamp.now(),
      };
      delete updateData.id;
      delete updateData.createdAt;

      await updateDoc(doc(db, 'kidProfiles', kidId), updateData);
    } catch (error) {
      console.error('Error updating kid profile:', error);
      throw error;
    }
  },

  async updateKidPermissions(kidId: string, permissions: KidPermissions) {
    try {
      await updateDoc(doc(db, 'kidProfiles', kidId), {
        permissions,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error updating kid permissions:', error);
      throw error;
    }
  },

  async deleteKidProfile(kidId: string) {
    try {
      await deleteDoc(doc(db, 'kidProfiles', kidId));
    } catch (error) {
      console.error('Error deleting kid profile:', error);
      throw error;
    }
  },

  async getKidsByReadingLevel(readingLevel: string): Promise<KidProfile[]> {
    try {
      const q = query(
        collection(db, 'kidProfiles'),
        where('readingLevel', '==', readingLevel)
      );

      const querySnapshot = await getDocs(q);
      const kids: KidProfile[] = [];

      querySnapshot.forEach((doc) => {
        kids.push({
          id: doc.id,
          ...doc.data(),
        } as KidProfile);
      });

      return kids;
    } catch (error) {
      console.error('Error fetching kids by reading level:', error);
      return [];
    }
  },

  async getKidsWithAllergies(allergens: string[]): Promise<KidProfile[]> {
    try {
      const q = query(collection(db, 'kidProfiles'));
      const querySnapshot = await getDocs(q);
      const kids: KidProfile[] = [];

      querySnapshot.forEach((doc) => {
        const kidData = { id: doc.id, ...doc.data() } as KidProfile;
        const hasAllergies = allergens.some(allergen =>
          kidData.allergyFlags?.includes(allergen)
        );
        if (hasAllergies) {
          kids.push(kidData);
        }
      });

      return kids;
    } catch (error) {
      console.error('Error fetching kids with allergies:', error);
      return [];
    }
  },
};