import {
  collection,
  doc,
  addDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';
import { auth, db } from './firebase';

export type NoticeType =
  | 'account_creation'
  | 'data_collection_start'
  | 'new_feature_access'
  | 'kid_profile_creation'
  | 'recipe_activity'
  | 'consent_expiration'
  | 'data_export'
  | 'data_deletion';

export interface ParentalNotice {
  id: string;
  userId: string;
  parentEmail: string;
  noticeType: NoticeType;
  title: string;
  message: string;
  dataCollected?: string[];
  childrenAffected?: string[];
  actionRequired?: boolean;
  sentAt: Timestamp;
  acknowledged?: boolean;
  acknowledgedAt?: Timestamp;
  metadata?: Record<string, any>;
}

export interface NoticeTemplate {
  type: NoticeType;
  title: string;
  messageTemplate: string;
  requiresAcknowledgment: boolean;
}

// COPPA-compliant notice templates
const NOTICE_TEMPLATES: Record<NoticeType, NoticeTemplate> = {
  account_creation: {
    type: 'account_creation',
    title: 'KidChef Account Created - Data Collection Notice',
    messageTemplate: `Dear {{parentName}},

Thank you for creating a KidChef account. As required by COPPA, we must inform you about the information we collect from children under 13.

INFORMATION WE COLLECT:
{{dataCollected}}

HOW WE USE THIS INFORMATION:
• Provide age-appropriate cooking content
• Customize recipes to your child's skill level and allergies
• Track cooking progress and achievements
• Ensure safety through content filtering

YOUR PARENTAL RIGHTS:
• Review all information we have about your child
• Delete your child's account and data at any time
• Refuse further collection of information
• Update or correct any information

To exercise these rights, reply to this email or contact us at kidchefapp@gmail.com.

Best regards,
The KidChef Team`,
    requiresAcknowledgment: true,
  },

  data_collection_start: {
    type: 'data_collection_start',
    title: 'New Data Collection Activity - Your Consent Required',
    messageTemplate: `Dear {{parentName}},

We are about to begin collecting new information about {{childName}} for the following purpose:

PURPOSE: {{purpose}}
DATA TO BE COLLECTED: {{dataTypes}}
CHILDREN AFFECTED: {{childrenAffected}}

This collection requires your explicit consent. The data will be used only for the stated purpose and will follow our privacy policy.

If you do not consent to this data collection, please reply to this email within 48 hours.

Your parental rights remain unchanged, and you can withdraw consent at any time.

Best regards,
The KidChef Team`,
    requiresAcknowledgment: true,
  },

  kid_profile_creation: {
    type: 'kid_profile_creation',
    title: 'New Child Profile Created',
    messageTemplate: `Dear {{parentName}},

A new profile has been created for {{childName}} (age {{childAge}}) on your KidChef account.

PROFILE INFORMATION:
• Name: {{childName}}
• Age: {{childAge}}
• Reading Level: {{readingLevel}}
• Allergies: {{allergies}}
• Cooking Preferences: {{preferences}}

This information helps us provide age-appropriate content and ensure your child's safety while cooking.

You can update or delete this profile at any time through your parent dashboard.

Best regards,
The KidChef Team`,
    requiresAcknowledgment: false,
  },

  recipe_activity: {
    type: 'recipe_activity',
    title: 'Weekly Recipe Activity Report',
    messageTemplate: `Dear {{parentName}},

Here's this week's cooking activity for {{childName}}:

RECIPES VIEWED: {{recipesViewed}}
RECIPES COMPLETED: {{recipesCompleted}}
NEW SKILLS LEARNED: {{skillsLearned}}
SAFETY NOTES FOLLOWED: {{safetyNotes}}

All activity data is used solely to improve your child's cooking experience and track their progress.

View detailed activity in your parent dashboard: [Dashboard Link]

Best regards,
The KidChef Team`,
    requiresAcknowledgment: false,
  },

  consent_expiration: {
    type: 'consent_expiration',
    title: 'Parental Consent Expiring Soon - Action Required',
    messageTemplate: `Dear {{parentName}},

Your parental consent for {{childName}}'s KidChef account will expire on {{expirationDate}}.

To continue your child's access to KidChef, you must renew your consent before the expiration date.

WHAT HAPPENS IF NOT RENEWED:
• Your child's account will be suspended
• No new data collection will occur
• Existing data will be retained for 30 days for renewal
• After 30 days, all data will be permanently deleted

To renew consent, click here: {{renewalLink}}

Best regards,
The KidChef Team`,
    requiresAcknowledgment: true,
  },

  new_feature_access: {
    type: 'new_feature_access',
    title: 'New Feature Available - Data Collection Notice',
    messageTemplate: `Dear {{parentName}},

We've added a new feature to KidChef: {{featureName}}

This feature requires collecting the following information:
{{newDataTypes}}

FEATURE BENEFITS:
{{featureBenefits}}

If you do not want this information collected, you can disable this feature in your parent settings.

Best regards,
The KidChef Team`,
    requiresAcknowledgment: false,
  },

  data_export: {
    type: 'data_export',
    title: 'Your Child\'s Data Export Ready',
    messageTemplate: `Dear {{parentName}},

Your requested data export for {{childName}} is ready for download.

EXPORT INCLUDES:
{{exportContents}}

Download your data here: {{downloadLink}}
This link will expire in 7 days for security reasons.

If you have questions about the exported data, please contact us.

Best regards,
The KidChef Team`,
    requiresAcknowledgment: false,
  },

  data_deletion: {
    type: 'data_deletion',
    title: 'Child Data Deletion Completed',
    messageTemplate: `Dear {{parentName}},

As requested, we have permanently deleted all data associated with {{childName}}'s profile.

DELETED DATA INCLUDED:
{{deletedData}}

This action cannot be undone. If you wish to use KidChef again in the future, you will need to create a new account and go through the consent process again.

Thank you for using KidChef.

Best regards,
The KidChef Team`,
    requiresAcknowledgment: false,
  },
};

export interface ParentalNoticeService {
  sendNotice: (noticeType: NoticeType, userId: string, templateData: Record<string, any>) => Promise<string>;
  getNotices: (userId: string, limit?: number) => Promise<ParentalNotice[]>;
  acknowledgeNotice: (noticeId: string) => Promise<void>;
  getPendingNotices: (userId: string) => Promise<ParentalNotice[]>;
  sendDataCollectionNotice: (userId: string, childName: string, dataTypes: string[], purpose: string) => Promise<string>;
  sendWeeklyActivityReport: (userId: string, childName: string, activityData: any) => Promise<string>;
}

export const parentalNoticeService: ParentalNoticeService = {
  async sendNotice(noticeType: NoticeType, userId: string, templateData: Record<string, any>): Promise<string> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('User must be authenticated to send notices');
    }

    try {
      const template = NOTICE_TEMPLATES[noticeType];
      if (!template) {
        throw new Error(`Unknown notice type: ${noticeType}`);
      }

      // Get user email for sending
      const parentEmail = templateData.parentEmail || currentUser.email;
      if (!parentEmail) {
        throw new Error('Parent email not available for notice');
      }

      // Replace template variables
      let message = template.messageTemplate;
      Object.entries(templateData).forEach(([key, value]) => {
        const placeholder = `{{${key}}}`;
        message = message.replace(new RegExp(placeholder, 'g'), String(value));
      });

      // Create notice record
      const notice: Omit<ParentalNotice, 'id'> = {
        userId,
        parentEmail,
        noticeType,
        title: template.title,
        message,
        actionRequired: template.requiresAcknowledgment,
        sentAt: Timestamp.now(),
        acknowledged: false,
        metadata: templateData,
        ...(templateData.dataCollected && { dataCollected: templateData.dataCollected }),
        ...(templateData.childrenAffected && { childrenAffected: templateData.childrenAffected }),
      };

      const docRef = await addDoc(collection(db, 'parentalNotices'), notice);

      // In production, integrate with email service (SendGrid, AWS SES, etc.)
      await this.sendEmailNotification(parentEmail, template.title, message);

      if (__DEV__) {
        console.log('Parental notice sent:', {
          noticeId: docRef.id,
          type: noticeType,
          recipient: parentEmail,
        });
      }

      return docRef.id;
    } catch (error) {
      console.error('Error sending parental notice:', error);
      throw error;
    }
  },

  async sendEmailNotification(email: string, subject: string, message: string): Promise<void> {
    // In production, this would integrate with a real email service
    console.log('📧 EMAIL NOTIFICATION');
    console.log('To:', email);
    console.log('Subject:', subject);
    console.log('Message:', message.substring(0, 200) + '...');

    // TODO: Integrate with Firebase Functions to send actual emails
    // Example implementation would call a cloud function:
    // await functions.httpsCallable('sendParentalNotice')({ email, subject, message });
  },

  async getNotices(userId: string, limit: number = 20): Promise<ParentalNotice[]> {
    try {
      const q = query(
        collection(db, 'parentalNotices'),
        where('userId', '==', userId),
        orderBy('sentAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const notices: ParentalNotice[] = [];

      querySnapshot.forEach((doc) => {
        notices.push({
          id: doc.id,
          ...doc.data(),
        } as ParentalNotice);
      });

      return notices.slice(0, limit);
    } catch (error) {
      console.error('Error fetching parental notices:', error);
      return [];
    }
  },

  async acknowledgeNotice(noticeId: string): Promise<void> {
    try {
      const noticeRef = doc(db, 'parentalNotices', noticeId);
      const noticeSnap = await getDoc(noticeRef);

      if (!noticeSnap.exists()) {
        throw new Error('Notice not found');
      }

      await noticeRef.update({
        acknowledged: true,
        acknowledgedAt: Timestamp.now(),
      });

      console.log('Notice acknowledged:', noticeId);
    } catch (error) {
      console.error('Error acknowledging notice:', error);
      throw error;
    }
  },

  async getPendingNotices(userId: string): Promise<ParentalNotice[]> {
    try {
      const q = query(
        collection(db, 'parentalNotices'),
        where('userId', '==', userId),
        where('actionRequired', '==', true),
        where('acknowledged', '==', false),
        orderBy('sentAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const notices: ParentalNotice[] = [];

      querySnapshot.forEach((doc) => {
        notices.push({
          id: doc.id,
          ...doc.data(),
        } as ParentalNotice);
      });

      return notices;
    } catch (error) {
      console.error('Error fetching pending notices:', error);
      return [];
    }
  },

  async sendDataCollectionNotice(userId: string, childName: string, dataTypes: string[], purpose: string): Promise<string> {
    return await this.sendNotice('data_collection_start', userId, {
      childName,
      dataTypes: dataTypes.join(', '),
      purpose,
      childrenAffected: [childName],
    });
  },

  async sendWeeklyActivityReport(userId: string, childName: string, activityData: any): Promise<string> {
    return await this.sendNotice('recipe_activity', userId, {
      childName,
      recipesViewed: activityData.recipesViewed || 0,
      recipesCompleted: activityData.recipesCompleted || 0,
      skillsLearned: activityData.skillsLearned?.join(', ') || 'None',
      safetyNotes: activityData.safetyNotes || 0,
    });
  },
};

// Helper functions for common notice scenarios
export const sendAccountCreationNotice = async (userId: string, parentName: string, parentEmail: string) => {
  const dataCollected = [
    'Child\'s first name and age',
    'Reading level and cooking skill level',
    'Dietary restrictions and allergies',
    'Recipe viewing and interaction data',
    'App usage analytics (anonymized)',
  ];

  return await parentalNoticeService.sendNotice('account_creation', userId, {
    parentName,
    parentEmail,
    dataCollected: dataCollected.join('\n• '),
  });
};

export const sendKidProfileNotice = async (
  userId: string,
  parentName: string,
  kidData: {
    name: string;
    age: number;
    readingLevel: string;
    allergies: string[];
  }
) => {
  return await parentalNoticeService.sendNotice('kid_profile_creation', userId, {
    parentName,
    childName: kidData.name,
    childAge: kidData.age,
    readingLevel: kidData.readingLevel,
    allergies: kidData.allergies.join(', ') || 'None',
    preferences: 'Age-appropriate recipes',
  });
};
