import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  sendEmailVerification as firebaseSendEmailVerification,
  reload
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import type { ParentProfile } from '../types';

export interface AuthService {
  signUp: (email: string, password: string, profile: Partial<ParentProfile>) => Promise<User>;
  signIn: (email: string, password: string) => Promise<User>;
  signOut: () => Promise<void>;
  onAuthStateChanged: (callback: (user: User | null) => void) => () => void;
  sendEmailVerification: (user: User) => Promise<void>;
  checkEmailVerification: (user: User) => Promise<boolean>;
}

export const authService: AuthService = {
  async signUp(email: string, password: string, profile: Partial<ParentProfile>) {
    console.log('🔐 Starting signup process for email:', email);

    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    console.log('👤 User account created successfully:', {
      uid: user.uid,
      email: user.email,
      emailVerified: user.emailVerified
    });

    try {
      // Send email verification immediately after account creation
      console.log('📧 Attempting to send verification email...');
      await authService.sendEmailVerification(user);
      console.log('✅ Signup process completed successfully');
    } catch (emailError) {
      console.warn('⚠️ Signup succeeded but email verification failed:', emailError);
      // Don't throw here - user account was created successfully
    }

    // Note: Parent profile creation is now handled in ParentSettingsScreen
    return user;
  },

  async signIn(email: string, password: string) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
  },

  async signOut() {
    await signOut(auth);
  },

  onAuthStateChanged(callback: (user: User | null) => void) {
    return onAuthStateChanged(auth, callback);
  },


  async sendEmailVerification(user: User) {
    try {
      console.log('📧 Starting email verification process:', {
        userEmail: user.email,
        userUID: user.uid,
        emailVerified: user.emailVerified,
        timestamp: new Date().toISOString()
      });

      console.log('📧 Attempting to send email verification without custom settings first...');

      await firebaseSendEmailVerification(user);

      console.log('✅ Email verification sent successfully to:', user.email);

      if (__DEV__) {
        console.log('🔍 Email verification debug info:', {
          userEmail: user.email,
          userUID: user.uid,
          providerData: user.providerData,
          metadata: {
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime
          }
        });
      }
    } catch (error: any) {
      console.error('❌ Error sending email verification:', {
        error: error.message || error,
        code: error.code || 'unknown',
        userEmail: user.email,
        userUID: user.uid,
        fullError: error
      });
      throw error;
    }
  },

  async checkEmailVerification(user: User): Promise<boolean> {
    try {
      console.log('📧 Checking email verification for user:', {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        beforeReload: true,
        timestamp: new Date().toISOString()
      });

      await reload(user);

      console.log('📧 After user reload:', {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        afterReload: true,
        timestamp: new Date().toISOString()
      });

      const isVerified = user.emailVerified;

      // Update parent profile verification status if changed
      if (isVerified) {
        console.log('✅ User is verified, updating parent profile...');
        try {
          await setDoc(doc(db, 'parentProfiles', user.uid), { emailVerified: true }, { merge: true });
          console.log('✅ Parent profile verification status updated');
        } catch (docError) {
          console.error('⚠️ Failed to update parent profile verification status:', docError);
          // Don't fail the verification check if profile update fails
        }
      } else {
        console.log('❌ User email is still not verified after reload');
      }

      console.log('📧 Final verification result:', {
        isVerified,
        uid: user.uid,
        email: user.email,
        timestamp: new Date().toISOString()
      });

      return isVerified;
    } catch (error) {
      console.error('❌ Error checking email verification:', {
        error: error?.message || error,
        code: error?.code || 'unknown',
        uid: user.uid,
        email: user.email,
        timestamp: new Date().toISOString()
      });
      return false;
    }
  },
};
