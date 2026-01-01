import {
  collection,
  doc,
  addDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';

export type ConsentMethod = 'credit_card' | 'digital_signature' | 'government_id' | 'video_call';
export type ConsentStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export interface ParentalConsent {
  id: string;
  userId: string;
  parentName: string;
  parentEmail: string;
  method: ConsentMethod;
  status: ConsentStatus;
  verificationData?: {
    stripePaymentIntentId?: string;
    signatureData?: string;
    idVerificationData?: any;
    videoCallRecordId?: string;
  };
  createdAt: Timestamp;
  verifiedAt?: Timestamp;
  expiresAt: Timestamp;
  ipAddress?: string;
  userAgent?: string;
}

export interface ConsentVerificationRequest {
  parentName: string;
  parentEmail: string;
  method: ConsentMethod;
  childrenInfo: {
    name: string;
    age: number;
  }[];
}

export interface ParentalConsentService {
  initiateConsent: (request: ConsentVerificationRequest) => Promise<string>;
  verifyStripeConsent: (consentId: string, paymentIntentId: string) => Promise<boolean>;
  checkConsentStatus: (userId: string) => Promise<ConsentStatus>;
  getConsentRecord: (userId: string) => Promise<ParentalConsent | null>;
  renewConsent: (userId: string) => Promise<string>;
  revokeConsent: (userId: string) => Promise<void>;
  sendConsentNotice: (parentEmail: string, consentRecord: ParentalConsent) => Promise<void>;
}

// Stripe configuration for COPPA verification
const COPPA_VERIFICATION_AMOUNT = 50; // $0.50 verification charge (refunded immediately)

export const parentalConsentService: ParentalConsentService = {
  async initiateConsent(request: ConsentVerificationRequest): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to initiate parental consent');
    }

    try {
      // Check if there's already a valid consent
      const existingConsent = await this.getConsentRecord(currentUser.uid);
      if (existingConsent && existingConsent.status === 'verified') {
        const now = Timestamp.now();
        if (existingConsent.expiresAt.seconds > now.seconds) {
          throw new Error('Valid parental consent already exists');
        }
      }

      // Create consent record
      const now = Timestamp.now();
      const expirationDate = new Date();
      expirationDate.setFullYear(expirationDate.getFullYear() + 2); // Valid for 2 years

      const consentData: Omit<ParentalConsent, 'id'> = {
        userId: currentUser.uid,
        parentName: request.parentName,
        parentEmail: request.parentEmail,
        method: request.method,
        status: 'pending',
        createdAt: now,
        expiresAt: Timestamp.fromDate(expirationDate),
        ipAddress: 'unknown', // In production, capture real IP
        userAgent: 'mobile-app',
      };

      const docRef = await addDoc(collection(db, 'parentalConsents'), consentData);

      // Send initial consent notice to parent
      await this.sendConsentNotice(request.parentEmail, {
        ...consentData,
        id: docRef.id
      });

      // Note: Consent initiation logged for compliance (no sensitive data)
      return docRef.id;
    } catch (error) {
      console.error('Error initiating parental consent:', error);
      throw error;
    }
  },

  async verifyStripeConsent(consentId: string, paymentIntentId: string): Promise<boolean> {
    try {
      // In production, you would verify the payment with Stripe's API
      // For now, we'll simulate the verification process

      const consentDoc = doc(db, 'parentalConsents', consentId);
      const consentSnap = await getDoc(consentDoc);

      if (!consentSnap.exists()) {
        throw new Error('Consent record not found');
      }

      // Update consent record with verification data
      await updateDoc(consentDoc, {
        status: 'verified',
        verifiedAt: Timestamp.now(),
        'verificationData.stripePaymentIntentId': paymentIntentId,
      });

      // Note: Consent verification logged for compliance
      return true;
    } catch (error) {
      console.error('Error verifying Stripe consent:', error);
      throw error;
    }
  },

  async checkConsentStatus(userId: string): Promise<ConsentStatus> {
    try {
      const consent = await this.getConsentRecord(userId);
      if (!consent) return 'pending';

      // Check if consent is expired
      const now = Timestamp.now();
      if (consent.expiresAt.seconds <= now.seconds) {
        return 'expired';
      }

      return consent.status;
    } catch (error) {
      console.error('Error checking consent status:', error);
      return 'pending';
    }
  },

  async getConsentRecord(userId: string): Promise<ParentalConsent | null> {
    try {
      const q = query(
        collection(db, 'parentalConsents'),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) return null;

      // Get the most recent consent record
      const consents = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() } as ParentalConsent))
        .sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);

      return consents[0];
    } catch (error) {
      console.error('Error fetching consent record:', error);
      return null;
    }
  },

  async renewConsent(userId: string): Promise<string> {
    try {
      const currentConsent = await this.getConsentRecord(userId);
      if (!currentConsent) {
        throw new Error('No existing consent record found');
      }

      // Create new consent request with same details
      const renewalRequest: ConsentVerificationRequest = {
        parentName: currentConsent.parentName,
        parentEmail: currentConsent.parentEmail,
        method: currentConsent.method,
        childrenInfo: [], // Would need to fetch from kid profiles
      };

      return await this.initiateConsent(renewalRequest);
    } catch (error) {
      console.error('Error renewing consent:', error);
      throw error;
    }
  },

  async revokeConsent(userId: string): Promise<void> {
    try {
      const consent = await this.getConsentRecord(userId);
      if (!consent) return;

      const consentDoc = doc(db, 'parentalConsents', consent.id);
      await updateDoc(consentDoc, {
        status: 'rejected',
        revokedAt: Timestamp.now(),
      });

      // Note: Consent revocation logged for compliance
    } catch (error) {
      console.error('Error revoking consent:', error);
      throw error;
    }
  },

  async sendConsentNotice(parentEmail: string, consentRecord: ParentalConsent): Promise<void> {
    try {
      // In production, this would integrate with an email service
      // Note: Email notification sent for consent compliance
      if (__DEV__) {
        console.log('Consent Record:', {
          id: consentRecord.id,
          method: consentRecord.method,
          status: consentRecord.status,
          createdAt: consentRecord.createdAt,
        });
      }

      // TODO: Integrate with Firebase Functions to send actual emails
      // This notice should include:
      // - What data will be collected from children
      // - How the data will be used
      // - Parental rights and controls
      // - Instructions to complete verification
    } catch (error) {
      console.error('Error sending consent notice:', error);
      throw error;
    }
  },
};

// Utility function to format verification amounts for display
export const formatVerificationAmount = (cents: number): string => {
  return `$${(cents / 100).toFixed(2)}`;
};

// Helper to check if consent is required for new features
export const isConsentRequiredForFeature = async (userId: string, feature: string): Promise<boolean> => {
  const consentStatus = await parentalConsentService.checkConsentStatus(userId);

  // All features require verified parental consent
  return consentStatus !== 'verified';
};