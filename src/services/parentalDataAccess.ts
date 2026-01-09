import { logger } from '../utils/logger';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { kidProfileService } from './kidProfile';
import { parentProfileService } from './parentProfile';

export interface ChildDataSummary {
  kidId: string;
  kidName: string;
  dataTypes: {
    profile: boolean;
    recipes: boolean;
    activity: boolean;
    preferences: boolean;
    achievements: boolean;
  };
  lastActivity: Date | null;
  totalRecords: number;
}

export interface DataExportRequest {
  id: string;
  userId: string;
  kidIds: string[];
  requestedAt: Timestamp;
  status: 'pending' | 'processing' | 'ready' | 'expired';
  downloadUrl?: string;
  expiresAt?: Timestamp;
  exportData?: any;
}

export interface DataDeletionRequest {
  id: string;
  userId: string;
  kidIds: string[];
  requestedAt: Timestamp;
  status: 'pending' | 'processing' | 'completed';
  deletedDataTypes: string[];
  completedAt?: Timestamp;
}

export interface ParentalDataAccessService {
  getChildDataSummary: (userId: string) => Promise<ChildDataSummary[]>;
  getChildDataDetails: (kidId: string) => Promise<any>;
  requestDataExport: (kidIds: string[]) => Promise<string>;
  getDataExportStatus: (requestId: string) => Promise<DataExportRequest | null>;
  requestDataDeletion: (kidIds: string[], dataTypes: string[]) => Promise<string>;
  getDataDeletionStatus: (requestId: string) => Promise<DataDeletionRequest | null>;
  downloadChildData: (kidId: string) => Promise<any>;
  deleteAllChildData: (kidId: string) => Promise<void>;
  getParentalRightsInfo: () => Promise<any>;
}

export const parentalDataAccessService: ParentalDataAccessService = {
  async getChildDataSummary(userId: string): Promise<ChildDataSummary[]> {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.uid !== userId) {
      throw new Error('Unauthorized access to child data');
    }

    try {
      // Get parent profile to get kid IDs
      const parentProfile = await parentProfileService.getParentProfile(userId);
      if (!parentProfile) {
        return [];
      }

      // Get kid profiles
      const kidProfiles = await kidProfileService.getParentKids(parentProfile.id);
      const summaries: ChildDataSummary[] = [];

      for (const kid of kidProfiles) {
        // Check what data exists for this kid
        const [recipes, activities] = await Promise.all([
          getDocs(query(collection(db, 'kidRecipes'), where('kidId', '==', kid.id))),
          getDocs(query(collection(db, 'kidActivity'), where('kidId', '==', kid.id))),
        ]);

        const summary: ChildDataSummary = {
          kidId: kid.id,
          kidName: kid.name,
          dataTypes: {
            profile: true, // Profile always exists
            recipes: !recipes.empty,
            activity: !activities.empty,
            preferences: !!(kid as any).preferences,
            achievements: !!(kid as any).achievements,
          },
          lastActivity: this.getLastActivityDate(activities),
          totalRecords: recipes.size + activities.size + 1, // +1 for profile
        };

        summaries.push(summary);
      }

      return summaries;
    } catch (error) {
      console.error('Error getting child data summary:', error);
      throw error;
    }
  },

  getLastActivityDate(activitiesSnapshot: any): Date | null {
    if (activitiesSnapshot.empty) return null;

    let lastDate: Date | null = null;
    activitiesSnapshot.forEach((doc: any) => {
      const data = doc.data();
      const activityDate = data.createdAt?.toDate?.() || data.timestamp?.toDate?.();
      if (activityDate && (!lastDate || activityDate > lastDate)) {
        lastDate = activityDate;
      }
    });

    return lastDate;
  },

  async getChildDataDetails(kidId: string): Promise<any> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated');
    }

    try {
      // Verify parent owns this kid
      const kidProfile = await kidProfileService.getKidProfile(kidId);
      if (!kidProfile) {
        throw new Error('Kid profile not found');
      }

      const parentProfile = await parentProfileService.getParentProfile(currentUser.uid);
      if (!parentProfile || kidProfile.parentId !== parentProfile.id) {
        throw new Error('Unauthorized access to this child\'s data');
      }

      // Gather all data for this kid
      const [recipesSnapshot, activitiesSnapshot] = await Promise.all([
        getDocs(query(collection(db, 'kidRecipes'), where('kidId', '==', kidId))),
        getDocs(query(collection(db, 'kidActivity'), where('kidId', '==', kidId))),
      ]);

      const recipes: any[] = [];
      recipesSnapshot.forEach(doc => {
        recipes.push({ id: doc.id, ...doc.data() });
      });

      const activities: any[] = [];
      activitiesSnapshot.forEach(doc => {
        activities.push({ id: doc.id, ...doc.data() });
      });

      return {
        profile: kidProfile,
        recipes,
        activities,
        summary: {
          totalRecipes: recipes.length,
          totalActivities: activities.length,
          dataCollected: {
            name: kidProfile.name,
            age: kidProfile.age,
            allergies: kidProfile.allergyFlags,
            readingLevel: kidProfile.readingLevel,
            permissions: kidProfile.permissions,
          }
        }
      };
    } catch (error) {
      console.error('Error getting child data details:', error);
      throw error;
    }
  },

  async requestDataExport(kidIds: string[]): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated');
    }

    try {
      // Create export request
      const exportRequest: Omit<DataExportRequest, 'id'> = {
        userId: currentUser.uid,
        kidIds,
        requestedAt: Timestamp.now(),
        status: 'pending',
        expiresAt: Timestamp.fromDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)), // 7 days
      };

      const docRef = await collection(db, 'dataExportRequests').add(exportRequest);

      // In production, this would trigger a background job to process the export
      // For now, we'll process it immediately
      await this.processDataExport(docRef.id, kidIds);

      return docRef.id;
    } catch (error) {
      console.error('Error requesting data export:', error);
      throw error;
    }
  },

  async processDataExport(requestId: string, kidIds: string[]): Promise<void> {
    try {
      // Gather all data for the requested kids
      const exportData: any = {
        exportedAt: new Date().toISOString(),
        children: [],
      };

      for (const kidId of kidIds) {
        const childData = await this.getChildDataDetails(kidId);
        exportData.children.push({
          kidId,
          ...childData
        });
      }

      // In production, this would upload to secure storage and generate download URL
      // For now, we'll store the data directly and mark as ready
      const requestRef = doc(db, 'dataExportRequests', requestId);
      await requestRef.update({
        status: 'ready',
        exportData: JSON.stringify(exportData, null, 2),
        downloadUrl: `mock-download-url-${requestId}`,
      });

      logger.debug('Data export processed for request:', requestId);
    } catch (error) {
      console.error('Error processing data export:', error);
      throw error;
    }
  },

  async getDataExportStatus(requestId: string): Promise<DataExportRequest | null> {
    try {
      const docSnap = await getDoc(doc(db, 'dataExportRequests', requestId));
      if (!docSnap.exists()) return null;

      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as DataExportRequest;
    } catch (error) {
      console.error('Error getting export status:', error);
      return null;
    }
  },

  async requestDataDeletion(kidIds: string[], dataTypes: string[]): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated');
    }

    try {
      const deletionRequest: Omit<DataDeletionRequest, 'id'> = {
        userId: currentUser.uid,
        kidIds,
        requestedAt: Timestamp.now(),
        status: 'pending',
        deletedDataTypes: dataTypes,
      };

      const docRef = await collection(db, 'dataDeletionRequests').add(deletionRequest);

      // Process deletion immediately (in production, this might be queued)
      await this.processDataDeletion(docRef.id, kidIds, dataTypes);

      return docRef.id;
    } catch (error) {
      console.error('Error requesting data deletion:', error);
      throw error;
    }
  },

  async processDataDeletion(requestId: string, kidIds: string[], dataTypes: string[]): Promise<void> {
    const batch = writeBatch(db);

    try {
      for (const kidId of kidIds) {
        if (dataTypes.includes('recipes') || dataTypes.includes('all')) {
          // Delete kid recipes
          const recipesSnapshot = await getDocs(
            query(collection(db, 'kidRecipes'), where('kidId', '==', kidId))
          );
          recipesSnapshot.forEach(doc => batch.delete(doc.ref));
        }

        if (dataTypes.includes('activity') || dataTypes.includes('all')) {
          // Delete activity records
          const activitySnapshot = await getDocs(
            query(collection(db, 'kidActivity'), where('kidId', '==', kidId))
          );
          activitySnapshot.forEach(doc => batch.delete(doc.ref));
        }

        if (dataTypes.includes('profile') || dataTypes.includes('all')) {
          // Delete kid profile (this should be done last)
          batch.delete(doc(db, 'kidProfiles', kidId));
        }
      }

      // Execute all deletions
      await batch.commit();

      // Update deletion request status
      await doc(db, 'dataDeletionRequests', requestId).update({
        status: 'completed',
        completedAt: Timestamp.now(),
      });

      logger.debug('Data deletion completed for request:', requestId);
    } catch (error) {
      console.error('Error processing data deletion:', error);
      throw error;
    }
  },

  async getDataDeletionStatus(requestId: string): Promise<DataDeletionRequest | null> {
    try {
      const docSnap = await getDoc(doc(db, 'dataDeletionRequests', requestId));
      if (!docSnap.exists()) return null;

      return {
        id: docSnap.id,
        ...docSnap.data(),
      } as DataDeletionRequest;
    } catch (error) {
      console.error('Error getting deletion status:', error);
      return null;
    }
  },

  async downloadChildData(kidId: string): Promise<any> {
    return await this.getChildDataDetails(kidId);
  },

  async deleteAllChildData(kidId: string): Promise<void> {
    return await this.processDataDeletion('immediate', [kidId], ['all']);
  },

  async getParentalRightsInfo(): Promise<any> {
    return {
      rights: [
        {
          title: 'Review Information',
          description: 'You can review all information we have collected about your child at any time.',
          action: 'View child data details in the dashboard below.',
        },
        {
          title: 'Request Corrections',
          description: 'You can request corrections to any inaccurate information about your child.',
          action: 'Edit your child\'s profile or contact support.',
        },
        {
          title: 'Export Data',
          description: 'You can request a complete copy of all data we have about your child.',
          action: 'Use the "Export Data" button to download a complete record.',
        },
        {
          title: 'Delete Information',
          description: 'You can request deletion of all or specific types of information about your child.',
          action: 'Use the "Delete Data" options to remove information.',
        },
        {
          title: 'Stop Data Collection',
          description: 'You can refuse further collection of information about your child.',
          action: 'Revoke consent or delete the account to stop all data collection.',
        },
      ],
      contactInfo: {
        email: 'kidchefapp@gmail.com',
        subject: 'KidChef Parental Rights Request',
        responseTime: '48 hours',
      },
      legalBasis: 'Children\'s Online Privacy Protection Act (COPPA)',
      lastUpdated: '2024-12-27',
    };
  },
};
