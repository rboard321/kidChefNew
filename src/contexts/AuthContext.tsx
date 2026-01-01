import React, { createContext, useContext, useEffect, useState } from 'react';
import { User } from 'firebase/auth';
import { authService } from '../services/auth';
import { authErrorHandler, authOperationManager } from '../services/authErrorHandler';
import { parentProfileService } from '../services/parentProfile';
import { kidProfileService } from '../services/kidProfile';
import { hashPin, verifyPin, validatePinFormat } from '../utils/pinSecurity';
import { useSessionTimeout } from '../hooks/useSessionTimeout';
import { parentalConsentService, type ConsentStatus } from '../services/parentalConsent';
import { sendAccountCreationNotice, sendKidProfileNotice } from '../services/parentalNotice';
import { onSnapshot, doc } from 'firebase/firestore';
import { db } from '../services/firebase';
import type { ParentProfile, KidProfile } from '../types';

interface AuthContextType {
  user: User | null;
  parentProfile: ParentProfile | null;
  kidProfiles: KidProfile[];
  currentKid: KidProfile | null;
  deviceMode: 'parent' | 'kid';
  consentStatus: ConsentStatus;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUp: (email: string, password: string, profile: Partial<ParentProfile>) => Promise<void>;
  signOut: () => Promise<void>;
  setDeviceMode: (mode: 'parent' | 'kid') => void;
  setDeviceModeWithPin: (mode: 'parent' | 'kid', pin?: string) => Promise<boolean>;
  selectKid: (kidId: string | null) => void;
  updateParentProfile: (updates: Partial<ParentProfile>) => Promise<void>;
  setKidModePin: (pin: string) => Promise<void>;
  changePIN: (newPin: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  addKid: (kidData: Omit<KidProfile, 'id' | 'parentId' | 'createdAt' | 'updatedAt'>) => Promise<string>;
  updateKid: (kidId: string, updates: Partial<KidProfile>) => Promise<void>;
  removeKid: (kidId: string) => Promise<void>;
  checkAndRunMigration: () => Promise<boolean>;
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

  const loadUserProfile = async (user: User) => {
    try {
      console.log('🔄 Loading user profile for UID:', user.uid);
      // Load parent profile
      const parent = await parentProfileService.getParentProfile(user.uid);
      console.log('👨‍👩‍👧‍👦 Parent profile loaded:', parent ? { id: parent.id, parentName: parent.parentName, familyName: parent.familyName } : 'null');
      setParentProfile(parent);

      // Load kids if parent profile exists
      if (parent) {
        const kids = await kidProfileService.getParentKids(parent.id);
        console.log('👶 Kids loaded:', kids.length);
        setKidProfiles(kids);
      } else {
        setKidProfiles([]);
        setCurrentKid(null);
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

  useEffect(() => {
    const unsubscribe = authService.onAuthStateChanged(async (user) => {
      setUser(user);

      if (user) {
        await loadUserProfile(user);
      } else {
        setParentProfile(null);
        setKidProfiles([]);
        setCurrentKid(null);
        setDeviceMode('parent');
      }

      setLoading(false);
    });

    return unsubscribe;
  }, []);

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
              console.log('📱 Parent profile updated from another device, refreshing...');
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
      console.log('🔐 Starting sign-in process for email:', email);

      // Use enhanced auth operation manager for automatic retry
      const user = await authOperationManager.executeWithRetry(
        () => authService.signIn(email, password),
        `signIn_${email}`,
        'SignIn'
      );

      console.log('✅ Sign-in successful, checking email verification status:', {
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

      console.log('📧 Email verification check result:', {
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

      console.log('✅ Email verification successful, continuing with sign-in');
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
        console.log('Account creation notice sent successfully');
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

      if (!parentProfile) throw new Error('No parent profile found');

      // Hash the PIN before storing
      console.log('📝 Setting new PIN for parent profile:', parentProfile.id);
      const hashedPin = await hashPin(pin);
      console.log('📝 About to store hashed PIN:', hashedPin.substring(0, 20) + '...');

      await parentProfileService.updateParentProfile(targetParent.id, { kidModePin: pin });
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
      await parentProfileService.updateParentProfile(parentProfile.id, { kidModePin: newPin });
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
      const storedPin = parentProfile?.kidModePin;

      // If no PIN is set, allow access (for backward compatibility)
      if (!storedPin) {
        setDeviceMode(mode);
        return true;
      }

      // Validate PIN
      if (!pin) {
        return false; // PIN required but not provided
      }

      if (pin !== storedPin) {
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
      console.log('No parent profile found, creating one...');
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
        kidIds: [],
      };

      const parentId = await parentProfileService.createParentProfile(user.uid, defaultParentData);
      console.log('Parent profile created with ID:', parentId);

      // Refresh to load the new parent profile
      await refreshProfile();
    }

    // Now parentProfile should exist
    if (!parentProfile) {
      throw new Error('Failed to create parent profile');
    }

    try {
      console.log('👶 Starting kid profile creation:', {
        parentId: parentProfile.id,
        kidData: { name: kidData.name, age: kidData.age, readingLevel: kidData.readingLevel },
        timestamp: new Date().toISOString()
      });

      const kidId = await kidProfileService.createKidProfile(parentProfile.id, kidData);
      console.log('✅ Kid profile created with ID:', kidId);

      await parentProfileService.addKidToParent(parentProfile.id, kidId);
      console.log('✅ Kid ID added to parent profile');

      await refreshProfile();
      console.log('✅ Profile refreshed after kid addition');

      // Send COPPA-required kid profile creation notice
      try {
        await sendKidProfileNotice(user.uid, parentProfile.parentName, {
          name: kidData.name,
          age: kidData.age,
          readingLevel: kidData.readingLevel,
          allergies: kidData.allergyFlags || [],
        });
        console.log('✅ Kid profile creation notice sent successfully');
      } catch (noticeError) {
        console.error('⚠️ Error sending kid profile notice:', noticeError);
        // Don't fail kid creation if notice fails, but log it
      }

      console.log('✅ Kid creation completed successfully');
      return kidId;
    } catch (error) {
      console.error('❌ Error adding kid:', {
        error: error?.message || error,
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
      console.log('🗑️ Starting kid profile removal:', {
        kidId,
        parentId: parentProfile.id,
        currentKidIds: parentProfile.kidIds,
        timestamp: new Date().toISOString()
      });

      await kidProfileService.deleteKidProfile(kidId);
      console.log('✅ Kid profile deleted from kidProfiles collection');

      await parentProfileService.removeKidFromParent(parentProfile.id, kidId);
      console.log('✅ Kid ID removed from parent profile');

      // Clear current kid if it was the one being removed
      if (currentKid?.id === kidId) {
        console.log('🧹 Clearing current kid since it was the one removed');
        setCurrentKid(null);
      }

      await refreshProfile();
      console.log('✅ Kid removal completed successfully');
    } catch (error) {
      console.error('❌ Error removing kid:', {
        error: error?.message || error,
        kidId,
        parentId: parentProfile.id,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  };


  const checkAndRunMigration = async (): Promise<boolean> => {
    if (!user) return false;

    try {
      const migrationNeeded = await migrationService.checkMigrationNeeded(user.uid);
      if (migrationNeeded) {
        await migrationService.migrateUserToMultiKid(user.uid);
        await refreshProfile();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error during migration:', error);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    parentProfile,
    kidProfiles,
    currentKid,
    deviceMode,
    loading,
    signIn,
    signUp,
    signOut,
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
    addKid,
    updateKid,
    removeKid,
    checkAndRunMigration,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export { AuthContext };
