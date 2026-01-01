import {
  collection,
  doc,
  getDocs,
  getDoc,
  query,
  where,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { db } from './firebase';
import { parentProfileService } from './parentProfile';
import { kidProfileService } from './kidProfile';
import type { UserProfile, ParentProfile, KidProfile, UserSettings } from '../types';

export interface MigrationService {
  checkMigrationNeeded: (userId: string) => Promise<boolean>;
  migrateUserToMultiKid: (userId: string) => Promise<{ parentId: string; kidId: string }>;
  getMigrationStatus: (userId: string) => Promise<'not_needed' | 'needed' | 'completed'>;
  rollbackMigration: (userId: string) => Promise<void>;
}

const defaultUserSettings: UserSettings = {
  safetyNotes: true,
  readAloud: false,
  autoSimplify: true,
  fontSize: 'medium',
  temperatureUnit: 'fahrenheit',
  language: 'en',
  showDifficulty: true,
  enableVoiceInstructions: false,
  theme: 'light',
};

export const migrationService: MigrationService = {
  async checkMigrationNeeded(userId: string): Promise<boolean> {
    try {
      const parentProfile = await parentProfileService.getParentProfile(userId);
      if (parentProfile) {
        return false;
      }

      const legacyProfileQuery = query(
        collection(db, 'userProfiles'),
        where('userId', '==', userId)
      );
      const legacySnapshot = await getDocs(legacyProfileQuery);

      return !legacySnapshot.empty;
    } catch (error) {
      console.error('Error checking migration status:', error);
      return false;
    }
  },

  async getMigrationStatus(userId: string): Promise<'not_needed' | 'needed' | 'completed'> {
    try {
      const parentProfile = await parentProfileService.getParentProfile(userId);
      if (parentProfile) {
        return 'completed';
      }

      const legacyProfileQuery = query(
        collection(db, 'userProfiles'),
        where('userId', '==', userId)
      );
      const legacySnapshot = await getDocs(legacyProfileQuery);

      return legacySnapshot.empty ? 'not_needed' : 'needed';
    } catch (error) {
      console.error('Error getting migration status:', error);
      return 'not_needed';
    }
  },

  async migrateUserToMultiKid(userId: string): Promise<{ parentId: string; kidId: string }> {
    try {
      const legacyProfileQuery = query(
        collection(db, 'userProfiles'),
        where('userId', '==', userId)
      );
      const legacySnapshot = await getDocs(legacyProfileQuery);

      if (legacySnapshot.empty) {
        throw new Error('No legacy profile found for migration');
      }

      const legacyDoc = legacySnapshot.docs[0];
      const legacyData = legacyDoc.data() as UserProfile;

      const parentProfileData = {
        familyName: `${legacyData.parentName}'s Family`,
        parentName: legacyData.parentName,
        email: legacyData.email || `${userId}@placeholder.com`,
        settings: legacyData.settings || defaultUserSettings,
        kidIds: [], // Will be populated after creating kid
      };

      const parentId = await parentProfileService.createParentProfile(userId, parentProfileData);

      const kidProfileData = {
        name: legacyData.kidName,
        age: legacyData.kidAge,
        readingLevel: legacyData.readingLevel,
        allergyFlags: [],
        permissions: {
          canViewIngredients: true,
          canUseKnives: legacyData.kidAge >= 10,
          canUseStove: legacyData.kidAge >= 12,
          canUseOven: legacyData.kidAge >= 14,
          requiresAdultHelp: legacyData.kidAge < 8,
          maxCookingTimeMinutes: Math.min(60, Math.max(15, legacyData.kidAge * 5)),
        },
        avatarEmoji: '👶',
      };

      const kidId = await kidProfileService.createKidProfile(parentId, kidProfileData);

      await parentProfileService.addKidToParent(parentId, kidId);

      const batch = writeBatch(db);

      const recipesQuery = query(
        collection(db, 'recipes'),
        where('userId', '==', userId)
      );
      const recipesSnapshot = await getDocs(recipesQuery);

      recipesSnapshot.forEach((recipeDoc) => {
        const recipeRef = doc(db, 'recipes', recipeDoc.id);
        batch.update(recipeRef, {
          parentId,
          updatedAt: Timestamp.now(),
        });
      });

      batch.update(doc(db, 'userProfiles', legacyDoc.id), {
        migrated: true,
        migratedAt: Timestamp.now(),
        newParentId: parentId,
      });

      await batch.commit();

      console.log('Migration completed successfully', { parentId, kidId });
      return { parentId, kidId };

    } catch (error) {
      console.error('Error during migration:', error);
      throw error;
    }
  },

  async rollbackMigration(userId: string): Promise<void> {
    try {
      const parentProfile = await parentProfileService.getParentProfile(userId);
      if (!parentProfile) {
        throw new Error('No parent profile found to rollback');
      }

      const kids = await kidProfileService.getParentKids(parentProfile.id);

      const batch = writeBatch(db);

      for (const kid of kids) {
        batch.delete(doc(db, 'kidProfiles', kid.id));
      }

      batch.delete(doc(db, 'parentProfiles', parentProfile.id));

      const legacyProfileQuery = query(
        collection(db, 'userProfiles'),
        where('userId', '==', userId)
      );
      const legacySnapshot = await getDocs(legacyProfileQuery);

      if (!legacySnapshot.empty) {
        const legacyDoc = legacySnapshot.docs[0];
        batch.update(doc(db, 'userProfiles', legacyDoc.id), {
          migrated: false,
          migratedAt: null,
          newParentId: null,
        });
      }

      const recipesQuery = query(
        collection(db, 'recipes'),
        where('parentId', '==', parentProfile.id)
      );
      const recipesSnapshot = await getDocs(recipesQuery);

      recipesSnapshot.forEach((recipeDoc) => {
        const recipeRef = doc(db, 'recipes', recipeDoc.id);
        batch.update(recipeRef, {
          parentId: null,
          updatedAt: Timestamp.now(),
        });
      });

      await batch.commit();

      console.log('Migration rollback completed successfully');
    } catch (error) {
      console.error('Error during migration rollback:', error);
      throw error;
    }
  },
};