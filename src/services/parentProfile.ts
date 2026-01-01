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
import type { ParentProfile, UserSettings } from '../types';

export interface ParentProfileService {
  createParentProfile: (userId: string, profileData: Omit<ParentProfile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  getParentProfile: (userId: string) => Promise<ParentProfile | null>;
  updateParentProfile: (profileId: string, updates: Partial<ParentProfile>) => Promise<void>;
  updateParentSettings: (profileId: string, settings: UserSettings) => Promise<void>;
  addKidToParent: (profileId: string, kidId: string) => Promise<void>;
  removeKidFromParent: (profileId: string, kidId: string) => Promise<void>;
  deleteParentProfile: (profileId: string) => Promise<void>;
}

export const parentProfileService: ParentProfileService = {
  async createParentProfile(userId: string, profileData: Omit<ParentProfile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) {
    try {
      const now = Timestamp.now();
      const parentProfile: Omit<ParentProfile, 'id'> = {
        ...profileData,
        userId,
        kidIds: [],
        createdAt: now,
        updatedAt: now,
      };

      const docRef = await addDoc(collection(db, 'parentProfiles'), parentProfile);
      return docRef.id;
    } catch (error) {
      console.error('Error creating parent profile:', error);
      throw error;
    }
  },

  async getParentProfile(userId: string): Promise<ParentProfile | null> {
    try {
      const q = query(
        collection(db, 'parentProfiles'),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const doc = querySnapshot.docs[0];
        return {
          id: doc.id,
          ...doc.data(),
        } as ParentProfile;
      }
      return null;
    } catch (error) {
      console.error('Error fetching parent profile:', error);
      return null;
    }
  },

  async updateParentProfile(profileId: string, updates: Partial<ParentProfile>) {
    try {
      const updateData = {
        ...updates,
        updatedAt: Timestamp.now(),
      };
      delete updateData.id;
      delete updateData.createdAt;

      await updateDoc(doc(db, 'parentProfiles', profileId), updateData);
    } catch (error) {
      console.error('Error updating parent profile:', error);
      throw error;
    }
  },

  async updateParentSettings(profileId: string, settings: UserSettings) {
    try {
      await updateDoc(doc(db, 'parentProfiles', profileId), {
        settings,
        updatedAt: Timestamp.now(),
      });
    } catch (error) {
      console.error('Error updating parent settings:', error);
      throw error;
    }
  },

  async addKidToParent(profileId: string, kidId: string) {
    try {
      const parentDoc = await getDoc(doc(db, 'parentProfiles', profileId));
      if (parentDoc.exists()) {
        const currentKidIds = parentDoc.data()?.kidIds || [];
        if (!currentKidIds.includes(kidId)) {
          await updateDoc(doc(db, 'parentProfiles', profileId), {
            kidIds: [...currentKidIds, kidId],
            updatedAt: Timestamp.now(),
          });
        }
      }
    } catch (error) {
      console.error('Error adding kid to parent:', error);
      throw error;
    }
  },

  async removeKidFromParent(profileId: string, kidId: string) {
    try {
      const parentDoc = await getDoc(doc(db, 'parentProfiles', profileId));
      if (parentDoc.exists()) {
        const currentKidIds = parentDoc.data()?.kidIds || [];
        const updatedKidIds = currentKidIds.filter((id: string) => id !== kidId);
        await updateDoc(doc(db, 'parentProfiles', profileId), {
          kidIds: updatedKidIds,
          updatedAt: Timestamp.now(),
        });
      }
    } catch (error) {
      console.error('Error removing kid from parent:', error);
      throw error;
    }
  },

  async deleteParentProfile(profileId: string) {
    try {
      await deleteDoc(doc(db, 'parentProfiles', profileId));
    } catch (error) {
      console.error('Error deleting parent profile:', error);
      throw error;
    }
  },
};