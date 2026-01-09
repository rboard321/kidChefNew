import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { User } from 'firebase/auth';
import { authService } from '../services/auth';
import { authErrorHandler, authOperationManager } from '../services/authErrorHandler';
import { parentProfileService } from '../services/parentProfile';
import { kidProfileService } from '../services/kidProfile';
import { hashPin, verifyPin, validatePinFormat } from '../utils/pinSecurity';
import { sendAccountCreationNotice, sendKidProfileNotice } from '../services/parentalNotice';
import { onSnapshot, doc } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db } from '../services/firebase';
import type { ParentProfile, KidProfile, SubscriptionData, SubscriptionPlan, FeatureKey } from '../types';
import { clearSharedAuthToken, setSharedAuthToken } from '../utils/sharedAuthToken';
import * as subscriptionService from '../services/subscriptionService';
import { canAccessFeature, hasValidSubscription as checkValidSubscription, getEffectivePlan } from '../services/featureGate';
import { logger } from '../utils/logger';

interface AuthContextType {
  user: User | null;
  parentProfile: ParentProfile | null;
  kidProfiles: KidProfile[];
  currentKid: KidProfile | null;
  deviceMode: 'parent' | 'kid';
  legalAcceptance: {
    termsAcceptedAt: Date;
    privacyPolicyAcceptedAt: Date;
    coppaDisclosureAccepted: boolean;
  } | null;
  loading: boolean;
  requiresEmailVerification: boolean;

  // Subscription state
  subscription: SubscriptionData | null;
  effectivePlan: SubscriptionPlan;

  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, profile: Partial<ParentProfile>) => Promise<void>;
  signOut: () => Promise<void>;
  setLegalAcceptance: (acceptance: {
    termsAcceptedAt: Date;
    privacyPolicyAcceptedAt: Date;
    coppaDisclosureAccepted: boolean;
  }) => void;
  setDeviceMode: (mode: 'parent' | 'kid') => void;
  setDeviceModeWithPin: (mode: 'parent' | 'kid', pin?: string) => Promise<boolean>;
  selectKid: (kidId: string | null) => void;
  updateParentProfile: (updates: Partial<ParentProfile>) => Promise<void>;
  setKidModePin: (pin: string) => Promise<void>;
  changePIN: (newPin: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  addKid: (kidData: Omit<KidProfile, 'id' | 'parentId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateKid: (kidId: string, updates: Partial<KidProfile>) => Promise<void>;
  removeKid: (kidId: string) => Promise<void>;
  checkAndRunMigration: () => Promise<boolean>;

  // Subscription methods
  canAccessFeatureHelper: (feature: FeatureKey) => boolean;
  hasValidSubscription: () => boolean;
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [parentProfile, setParentProfile] = useState<ParentProfile | null>(null);
  const [kidProfiles, setKidProfiles] = useState<KidProfile[]>([]);
  const [currentKid, setCurrentKid] = useState<KidProfile | null>(null);
  const [deviceMode, setDeviceMode] = useState<'parent' | 'kid'>('parent');
  const [loading, setLoading] = useState(true);
  const [requiresEmailVerification, setRequiresEmailVerification] = useState(false);
  const [legalAcceptance, setLegalAcceptanceState] = useState<{
    termsAcceptedAt: Date;
    privacyPolicyAcceptedAt: Date;
    coppaDisclosureAccepted: boolean;
  } | null>(null);
  const legalAcceptanceStorageKey = 'kidchef.legalAcceptance';

  // Subscription state
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [effectivePlan, setEffectivePlan] = useState<SubscriptionPlan>('free');

  useEffect(() => {
    const loadAcceptance = async () => {
      try {
        const stored = await AsyncStorage.getItem(legalAcceptanceStorageKey);
        if (!stored) return;
        const parsed = JSON.parse(stored) as {
          termsAcceptedAt: string;
          privacyPolicyAcceptedAt: string;
          coppaDisclosureAccepted: boolean;
        };
        setLegalAcceptanceState({
          termsAcceptedAt: new Date(parsed.termsAcceptedAt),
          privacyPolicyAcceptedAt: new Date(parsed.privacyPolicyAcceptedAt),
          coppaDisclosureAccepted: parsed.coppaDisclosureAccepted,
        });
      } catch (error) {
        console.error('Error loading legal acceptance:', error);
      }
    };

    loadAcceptance();
  }, []);

  const persistLegalAcceptance = async (acceptance: {
    termsAcceptedAt: Date;
    privacyPolicyAcceptedAt: Date;
    coppaDisclosureAccepted: boolean;
  }) => {
    const payload = JSON.stringify({
      termsAcceptedAt: acceptance.termsAcceptedAt.toISOString(),
      privacyPolicyAcceptedAt: acceptance.privacyPolicyAcceptedAt.toISOString(),
      coppaDisclosureAccepted: acceptance.coppaDisclosureAccepted,
    });
    await AsyncStorage.setItem(legalAcceptanceStorageKey, payload);
  };

  const setLegalAcceptance = (acceptance: {
    termsAcceptedAt: Date;
    privacyPolicyAcceptedAt: Date;
    coppaDisclosureAccepted: boolean;
  }) => {
    setLegalAcceptanceState(acceptance);
    persistLegalAcceptance(acceptance).catch((error) => {
      console.error('Error saving legal acceptance:', error);
    });
  };

  const loadUserProfile = async (user: User) => {
    try {
      logger.debug('🔄 Loading user profile for UID:', user.uid);
      // Load parent profile
      const parent = await parentProfileService.getParentProfile(user.uid);
      logger.debug('👨‍👩‍👧‍👦 Parent profile loaded:', parent ? { id: parent.id, parentName: parent.parentName, familyName: parent.familyName } : 'null');
      setParentProfile(parent);

      // Load kids if parent profile exists
      if (parent) {
        const kids = await kidProfileService.getParentKids(parent.id);
        logger.debug('👶 Kids loaded:', kids.length);
        setKidProfiles(kids);

        // Load subscription
        const sub = await subscriptionService.getSubscription(parent.id);
        logger.debug('💳 Subscription loaded:', sub ? { plan: sub.plan, status: sub.status, isBetaTester: sub.isBetaTester } : 'null');
        setSubscription(sub);
        setEffectivePlan(getEffectivePlan(sub));
      } else {
        setKidProfiles([]);
        setCurrentKid(null);
        setSubscription(null);
        setEffectivePlan('free');
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  };


  const refreshProfile = async () => {
    if (user) {
      await loadUserProfile(user);
    }
  };

  const refreshEmailVerification = async () => {
    if (!user) return false;
    const isVerified = await authService.checkEmailVerification(user);
    if (isVerified) {
      setRequiresEmailVerification(false);
      await loadUserProfile(user);
    }
    return isVerified;
  };

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(async (user) => {
      setUser(user);

      if (user) {
        if (!user.emailVerified) {
          setRequiresEmailVerification(true);
          setParentProfile(null);
          setKidProfiles([]);
          setCurrentKid(null);
          setSubscription(null);
          setEffectivePlan('free');
          setLoading(false);
          return;
        }

        setRequiresEmailVerification(false);
        // Store auth token (non-blocking)
        user.getIdToken().then(setSharedAuthToken).catch((error) => {
          console.error('Failed to store shared auth token:', error);
        });

        // Load user profile before marking as loaded
        try {
          await loadUserProfile(user);
        } catch (error) {
          console.error('Error loading user profile:', error);
        }

        // Now we're ready to show the app
        setLoading(false);
      } else {
        clearSharedAuthToken();
        setParentProfile(null);
        setKidProfiles([]);
        setCurrentKid(null);
        setDeviceMode('parent');
        setRequiresEmailVerification(false);
        setLoading(false);
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const refreshToken = async (forceRefresh = false) => {
      try {
        const token = await user.getIdToken(forceRefresh);
        setSharedAuthToken(token);
      } catch (error) {
        console.error('Failed to refresh shared auth token:', error);
      }
    };

    const unsubscribe = authService.onIdTokenChanged((updatedUser) => {
      if (updatedUser) {
        refreshToken(false);
      }
    });

    const intervalId = setInterval(() => {
      refreshToken(true);
    }, 45 * 60 * 1000);

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        refreshToken(true);
      }
    });

    refreshToken(false);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
      appStateSubscription.remove();
    };
  }, [user?.uid]);

  // Real-time listener for parent profile changes (including kid profile updates)
  useEffect(() => {
    if (!user?.uid) return;

    let parentProfileUnsubscribe: (() => void) | null = null;

    const setupParentProfileListener = async () => {
      try {
        // First load the initial parent profile to get the parent profile ID
        const parentProfile = await parentProfileService.getParentProfile(user.uid);
        if (!parentProfile) return;

        // Set up a real-time listener for the parent profile document
        parentProfileUnsubscribe = onSnapshot(
          doc(db, 'parentProfiles', parentProfile.id),
          async (docSnapshot) => {
            if (docSnapshot.exists()) {
              logger.debug('📱 Parent profile updated from another device, refreshing...');
              await loadUserProfile(user);
            }
          },
          (error) => {
            console.error('Error listening to parent profile changes:', error);
          }
        );
      } catch (error) {
        console.error('Error setting up parent profile listener:', error);
      }
    };

    setupParentProfileListener();

    return () => {
      if (parentProfileUnsubscribe) {
        parentProfileUnsubscribe();
      }
    };
  }, [user?.uid]);

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      logger.debug('🔐 Starting sign-in process for email:', email);

      // Use enhanced auth operation manager for automatic retry
      const user = await authOperationManager.executeWithRetry(
        () => authService.signIn(email, password),
        `signIn_${email}`,
        'SignIn'
      );

      logger.debug('✅ Sign-in successful, checking email verification status:', {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        timestamp: new Date().toISOString()
      });

      // Check email verification status with retry logic
      const isVerified = await authOperationManager.executeWithRetry(
        () => authService.checkEmailVerification(user),
        `emailCheck_${user.uid}`,
        'EmailVerification'
      );

      logger.debug('📧 Email verification check result:', {
        isVerified,
        userEmailVerified: user.emailVerified,
        timestamp: new Date().toISOString()
      });

      if (!isVerified) {
        console.warn('❌ Email not verified, signing user out');
        await authService.signOut();
        setLoading(false);
        throw new Error('Please verify your email address before signing in. Check your email for the verification link.');
      }

      logger.debug('✅ Email verification successful, continuing with sign-in');
    } catch (error) {
      console.error('❌ Sign-in failed:', {
        error: error instanceof Error ? error.message : error,
        timestamp: new Date().toISOString()
      });
      setLoading(false);

      // Enhance error with user-friendly messaging
      const errorInfo = authErrorHandler.handleAuthError(error, 'SignIn');

      // Create enhanced error with user-friendly message
      const enhancedError = new Error(authErrorHandler.getUserFriendlyMessage(error));
      (enhancedError as any).originalError = error;
      (enhancedError as any).errorInfo = errorInfo;

      throw enhancedError;
    }
  };

  const signUp = async (email: string, password: string, profile: Partial<ParentProfile>) => {
    setLoading(true);
    try {
      // Use enhanced auth operation manager for signup with retry
      const user = await authOperationManager.executeWithRetry(
        () => authService.signUp(email, password, profile),
        `signUp_${email}`,
        'SignUp'
      );

      // Send COPPA-required account creation notice
      try {
        await sendAccountCreationNotice(
          user.uid,
          user.displayName || 'Parent',
          user.email || email
        );
        logger.debug('Account creation notice sent successfully');
      } catch (noticeError) {
        console.error('Error sending account creation notice:', noticeError);
        // Don't fail signup if notice fails, but log it for follow-up
      }
    } catch (error) {
      setLoading(false);

      // Enhance error with user-friendly messaging
      const errorInfo = authErrorHandler.handleAuthError(error, 'SignUp');

      // Create enhanced error with user-friendly message
      const enhancedError = new Error(authErrorHandler.getUserFriendlyMessage(error));
      (enhancedError as any).originalError = error;
      (enhancedError as any).errorInfo = errorInfo;

      throw enhancedError;
    }
  };

  const signInWithGoogle = async () => {
    setLoading(true);
    try {
      await authService.signInWithGoogle();
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await authService.signOut();
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };



  const updateParentProfile = async (updates: Partial<ParentProfile>) => {
    if (!parentProfile) throw new Error('No parent profile found');

    try {
      await parentProfileService.updateParentProfile(parentProfile.id, updates);
      await refreshProfile();
    } catch (error) {
      console.error('Error updating parent profile:', error);
      throw error;
    }
  };

  const setKidModePin = async (pin: string) => {
    if (!user) throw new Error('No user logged in');

    try {
      let targetParent = parentProfile;
      if (!targetParent) {
        await checkAndRunMigration();
        targetParent = await parentProfileService.getParentProfile(user.uid);
      }

      if (!targetParent) throw new Error('No parent profile found');

      // Validate PIN format
      if (!validatePinFormat(pin)) {
        throw new Error('PIN must be 4-6 digits');
      }

      // Hash the PIN before storing
      logger.debug('📝 Setting new PIN for parent profile:', targetParent.id);
      const hashedPin = await hashPin(pin);
      logger.debug('📝 About to store hashed PIN:', hashedPin.substring(0, 20) + '...');

      // Store the HASHED PIN, not the plain text
      await parentProfileService.updateParentProfile(targetParent.id, { kidModePin: hashedPin });
      await refreshProfile();
    } catch (error) {
      console.error('Error setting kid mode PIN:', error);
      throw error;
    }
  };

  const changePIN = async (newPin: string) => {
    if (!user) throw new Error('No user logged in');
    if (!parentProfile) throw new Error('No parent profile found');

    try {
      // Validate PIN format
      if (!validatePinFormat(newPin)) {
        throw new Error('PIN must be 4-6 digits');
      }

      // Hash the new PIN before storing
      const hashedPin = await hashPin(newPin);
      await parentProfileService.updateParentProfile(parentProfile.id, { kidModePin: hashedPin });
      await refreshProfile();
    } catch (error) {
      console.error('Error changing PIN:', error);
      throw error;
    }
  };

  const setDeviceModeWithPin = async (mode: 'parent' | 'kid', pin?: string): Promise<boolean> => {
    // If switching to kid mode, no PIN required
    if (mode === 'kid') {
      setCurrentKid(null);
      setDeviceMode(mode);
      return true;
    }

    // If switching from kid to parent mode, PIN is required
    if (mode === 'parent' && deviceMode === 'kid') {
      const storedHashedPin = parentProfile?.kidModePin;

      // If no PIN is set, allow access (for backward compatibility)
      if (!storedHashedPin) {
        setDeviceMode(mode);
        return true;
      }

      // Validate PIN
      if (!pin) {
        return false; // PIN required but not provided
      }

      // Use secure PIN verification instead of plain text comparison
      const isPinValid = await verifyPin(pin, storedHashedPin);
      if (!isPinValid) {
        const isLegacyPin = !storedHashedPin.includes(':') && /^\d{4,6}$/.test(storedHashedPin);
        if (isLegacyPin && pin === storedHashedPin && parentProfile) {
          const upgradedHash = await hashPin(pin);
          await parentProfileService.updateParentProfile(parentProfile.id, { kidModePin: upgradedHash });
          await refreshProfile();
          setDeviceMode(mode);
          return true;
        }
        return false; // Invalid PIN
      }
    }

    setDeviceMode(mode);
    return true;
  };

  const selectKid = (kidId: string | null) => {
    if (kidId) {
      const kid = kidProfiles.find(k => k.id === kidId);
      setCurrentKid(kid || null);
    } else {
      setCurrentKid(null);
    }
  };

  const addKid = async (kidData: Omit<KidProfile, 'id' | 'parentId' | 'createdAt' | 'updatedAt'>) => {
    if (!user) throw new Error('No user logged in');

    // Create parent profile if it doesn't exist
    if (!parentProfile) {
      logger.debug('No parent profile found, creating one...');
      const defaultParentData = {
        familyName: `${user.email?.split('@')[0] || 'Family'}'s Family`,
        parentName: user.displayName || user.email?.split('@')[0] || 'Parent',
        email: user.email || '',
        settings: {
          safetyNotes: true,
          readAloud: false,
          autoSimplify: false,
          fontSize: 'medium' as const,
          temperatureUnit: 'fahrenheit' as const,
          language: 'en',
          showDifficulty: true,
          enableVoiceInstructions: false,
          theme: 'light' as const,
        },
        termsAcceptedAt: legalAcceptance?.termsAcceptedAt,
        privacyPolicyAcceptedAt: legalAcceptance?.privacyPolicyAcceptedAt,
        coppaDisclosureAccepted: legalAcceptance?.coppaDisclosureAccepted,
        coppaConsentDate: legalAcceptance?.coppaDisclosureAccepted ? new Date() : undefined,
        kidIds: [],
      };

      const parentId = await parentProfileService.createParentProfile(user.uid, defaultParentData);
      logger.debug('Parent profile created with ID:', parentId);

      // Refresh to load the new parent profile
      await refreshProfile();
    }

    // Now parentProfile should exist
    if (!parentProfile) {
      throw new Error('Failed to create parent profile');
    }

    try {
      logger.debug('👶 Starting kid profile creation:', {
        parentId: parentProfile.id,
        kidData: { name: kidData.name, age: kidData.age, readingLevel: kidData.readingLevel },
        timestamp: new Date().toISOString()
      });

      const kidId = await kidProfileService.createKidProfile(parentProfile.id, kidData);
      logger.debug('✅ Kid profile created with ID:', kidId);

      await parentProfileService.addKidToParent(parentProfile.id, kidId);
      logger.debug('✅ Kid ID added to parent profile');

      await refreshProfile();
      logger.debug('✅ Profile refreshed after kid addition');

      // Send COPPA-required kid profile creation notice
      try {
        await sendKidProfileNotice(user.uid, parentProfile.parentName, {
          name: kidData.name,
          age: kidData.age,
          readingLevel: kidData.readingLevel,
          allergies: kidData.allergyFlags || [],
        });
        logger.debug('✅ Kid profile creation notice sent successfully');
      } catch (noticeError) {
        console.error('⚠️ Error sending kid profile notice:', noticeError);
        // Don't fail kid creation if notice fails, but log it
      }

      logger.debug('✅ Kid creation completed successfully');
      return kidId;
    } catch (error) {
      console.error('❌ Error adding kid:', {
        error: getErrorMessage(error),
        parentId: parentProfile.id,
        kidData: { name: kidData.name, age: kidData.age },
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  };

  const updateKid = async (kidId: string, updates: Partial<KidProfile>) => {
    try {
      await kidProfileService.updateKidProfile(kidId, updates);
      await refreshProfile();
    } catch (error) {
      console.error('Error updating kid:', error);
      throw error;
    }
  };

  const removeKid = async (kidId: string) => {
    if (!parentProfile) throw new Error('No parent profile found');

    try {
      logger.debug('🗑️ Starting kid profile removal:', {
        kidId,
        parentId: parentProfile.id,
        currentKidIds: parentProfile.kidIds,
        timestamp: new Date().toISOString()
      });

      await kidProfileService.deleteKidProfile(kidId);
      logger.debug('✅ Kid profile deleted from kidProfiles collection');

      await parentProfileService.removeKidFromParent(parentProfile.id, kidId);
      logger.debug('✅ Kid ID removed from parent profile');

      // Clear current kid if it was the one being removed
      if (currentKid?.id === kidId) {
        logger.debug('🧹 Clearing current kid since it was the one removed');
        setCurrentKid(null);
      }

      await refreshProfile();
      logger.debug('✅ Kid removal completed successfully');
    } catch (error) {
      console.error('❌ Error removing kid:', {
        error: getErrorMessage(error),
        kidId,
        parentId: parentProfile.id,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  };


  const checkAndRunMigration = async (): Promise<boolean> => {
    // Migration is not needed - user can reset data in test environment if needed
    return false;
  };

  // Subscription helper methods
  const canAccessFeatureHelper = (feature: FeatureKey): boolean => {
    return canAccessFeature(feature, parentProfile, subscription);
  };

  const hasValidSubscriptionHelper = (): boolean => {
    return checkValidSubscription(subscription);
  };

  const refreshSubscription = async () => {
    if (!parentProfile) return;

    try {
      const sub = await subscriptionService.getSubscription(parentProfile.id);
      logger.debug('💳 Subscription refreshed:', sub ? { plan: sub.plan, status: sub.status } : 'null');
      setSubscription(sub);
      setEffectivePlan(getEffectivePlan(sub));
    } catch (error) {
      console.error('Error refreshing subscription:', error);
    }
  };

  const value: AuthContextType = {
    user,
    parentProfile,
    kidProfiles,
    currentKid,
    deviceMode,
    legalAcceptance,
    loading,
    requiresEmailVerification,
    subscription,
    effectivePlan,
    signIn,
    signInWithGoogle,
    signUp,
    signOut,
    setLegalAcceptance,
    setDeviceMode: (mode: 'parent' | 'kid') => {
      if (mode === 'kid') {
        setCurrentKid(null);
      }
      setDeviceMode(mode);
    },
    setDeviceModeWithPin,
    selectKid,
    updateParentProfile,
    setKidModePin,
    changePIN,
    refreshProfile,
    refreshEmailVerification,
    addKid,
    updateKid,
    removeKid,
    checkAndRunMigration,
    canAccessFeatureHelper,
    hasValidSubscription: hasValidSubscriptionHelper,
    refreshSubscription,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext };
  const getErrorMessage = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
