import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, connectionStatus } from '../firebase/config';
import {
  type UserProfile,
  type UserRole,
  isAuthorizedAdminRole,
} from '../firebase/types';
import { hasPermission as checkPermission, type Permission } from '../auth/permissions';

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  role: UserRole | null;
  isAuthorized: boolean;
  isAuthenticated: boolean;
  authReady: boolean;
  loading: boolean;
  error: string | null;
  signIn: (email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  signInWithGoogle: () => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  hasPermission: (permission: Permission) => boolean;
  isFirebaseConfigured: boolean;
}

const PREVIEW_ADMIN_PROFILE: UserProfile = {
  uid: 'preview-admin',
  email: 'admin@mushaempire.com',
  displayName: 'Admin User',
  role: 'admin',
  status: 'active',
};

// Recognized runtime administrator emails
const BOOTSTRAPPED_ADMIN_EMAILS = [
  'sanjaykumarbjc@gmail.com',
  'admin@mushaempire.com',
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authReady, setAuthReady] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserProfile = async (firebaseUser: User): Promise<UserProfile | null> => {
    const isBootstrappedAdmin = !!(
      firebaseUser.email &&
      BOOTSTRAPPED_ADMIN_EMAILS.includes(firebaseUser.email.toLowerCase())
    );

    if (!db) {
      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || (isBootstrappedAdmin ? 'System Admin' : 'Staff Member'),
        role: isBootstrappedAdmin ? 'admin' : 'customer',
        status: 'active',
      };
    }

    try {
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      const userSnapshot = await getDoc(userDocRef);

      if (userSnapshot.exists()) {
        const data = userSnapshot.data() as Omit<UserProfile, 'uid'>;
        const storedRole = (data.role as UserRole) || 'customer';
        const effectiveRole = isBootstrappedAdmin ? 'admin' : storedRole;
        
        // If bootstrapped admin and stored role is not yet admin, update it in users/{uid}
        if (isBootstrappedAdmin && storedRole !== 'admin') {
          try {
            await setDoc(userDocRef, { role: 'admin', updatedAt: serverTimestamp() }, { merge: true });
          } catch (writeErr) {
            console.warn('Notice syncing admin role to users doc:', writeErr);
          }
        }

        return {
          ...data,
          uid: firebaseUser.uid,
          email: data.email || firebaseUser.email || '',
          displayName: data.displayName || firebaseUser.displayName || 'Admin User',
          role: effectiveRole,
          phoneNumber: data.phoneNumber || firebaseUser.phoneNumber || undefined,
          status: data.status || 'active',
        };
      } else {
        // Document doesn't exist in users/{uid} yet.
        // Initialize user document so security rule hasUserDoc() and getUserRole() succeed
        const initialRole: UserRole = isBootstrappedAdmin ? 'admin' : 'customer';
        const newProfile: UserProfile = {
          uid: firebaseUser.uid,
          email: firebaseUser.email || '',
          displayName: firebaseUser.displayName || (isBootstrappedAdmin ? 'System Admin' : 'Staff Member'),
          role: initialRole,
          status: 'active',
        };

        try {
          await setDoc(userDocRef, {
            email: newProfile.email,
            displayName: newProfile.displayName,
            role: initialRole,
            status: 'active',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        } catch (initErr) {
          console.warn('Notice creating initial user document in users/{uid}:', initErr);
        }

        return newProfile;
      }
    } catch (err: unknown) {
      console.warn('Notice fetching user profile from users collection:', err);
      // Fallback cleanly
      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email || '',
        displayName: firebaseUser.displayName || (isBootstrappedAdmin ? 'System Admin' : 'Admin User'),
        role: isBootstrappedAdmin ? 'admin' : 'customer',
        status: 'active',
      };
    }
  };

  useEffect(() => {
    if (!auth) {
      setLoading(false);
      setAuthReady(true);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        setLoading(true);
        const profile = await fetchUserProfile(currentUser);
        setUserProfile(profile);
      } else {
        setUserProfile(null);
      }
      setLoading(false);
      setAuthReady(true);
    });

    return () => unsubscribe();
  }, []);

  const refreshProfile = async () => {
    if (user) {
      const profile = await fetchUserProfile(user);
      setUserProfile(profile);
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    if (!auth) {
      const msg = 'Firebase is not initialized. Please verify your environment configuration.';
      setError(msg);
      return { success: false, error: msg };
    }

    try {
      setLoading(true);
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const userCredential = await signInWithPopup(auth, provider);
      const profile = await fetchUserProfile(userCredential.user);
      setUserProfile(profile);
      setLoading(false);
      return { success: true };
    } catch (err: unknown) {
      setLoading(false);
      const rawCode = (err as any)?.code || '';
      const rawMsg = err instanceof Error ? err.message : 'Google authentication failed';
      let friendlyError = rawMsg;

      if (rawCode === 'auth/popup-blocked' || rawMsg.includes('popup-blocked')) {
        friendlyError = 'Sign-in popup was blocked by your browser. Please allow popups for this domain to sign in with Google.';
      } else if (rawCode === 'auth/popup-closed-by-user' || rawMsg.includes('popup-closed-by-user')) {
        friendlyError = 'Sign-in popup was closed before completing authentication. Please try again.';
      } else if (rawCode === 'auth/unauthorized-domain' || rawMsg.includes('unauthorized-domain')) {
        const currentHost = typeof window !== 'undefined' ? window.location.hostname : 'current domain';
        friendlyError = `Domain not authorized for OAuth: "${currentHost}". Add "${currentHost}" to Authorized Domains in Firebase Console (Authentication > Settings > Authorized domains).`;
      } else if (rawCode === 'auth/cancelled-popup-request') {
        friendlyError = 'Sign-in request was cancelled. Please try again.';
      } else if (rawCode === 'auth/network-request-failed') {
        friendlyError = 'Network error during sign-in. Please check your internet connection.';
      }

      console.warn('Google sign-in attempt notice:', rawCode, rawMsg);
      setError(friendlyError);
      return { success: false, error: friendlyError };
    }
  };

  const signIn = async (email: string, pass: string) => {
    setError(null);
    if (!auth || !db) {
      const msg = 'Firebase is not initialized. Please verify your environment configuration.';
      setError(msg);
      return { success: false, error: msg };
    }

    try {
      setLoading(true);
      const userCredential = await signInWithEmailAndPassword(auth, email.trim(), pass);
      const profile = await fetchUserProfile(userCredential.user);

      // Verify authorization role: only authorized admin/staff roles permitted
      if (!profile || !isAuthorizedAdminRole(profile.role)) {
        await firebaseSignOut(auth);
        setUser(null);
        setUserProfile(null);
        setLoading(false);
        return {
          success: false,
          error: 'Access denied. Only authorized staff and administrators may access the Admin Portal.',
        };
      }

      setUser(userCredential.user);
      setUserProfile(profile);
      setLoading(false);
      return { success: true };
    } catch (err: unknown) {
      setLoading(false);
      const rawCode = (err as any)?.code || '';
      const rawMessage = err instanceof Error ? err.message : String(err);
      console.warn('Firebase signInWithEmailAndPassword attempt notice:', rawCode, rawMessage);

      let friendlyMessage = 'Authentication failed. Please check your credentials.';

      if (rawCode === 'auth/operation-not-allowed' || rawMessage.includes('OPERATION_NOT_ALLOWED')) {
        friendlyMessage = 'Email/Password sign-in is disabled in Firebase Console. Go to Firebase Console > Authentication > Sign-in method and enable the "Email/Password" provider.';
      } else if (rawCode === 'auth/invalid-credential' || rawCode === 'auth/wrong-password' || rawMessage.includes('INVALID_LOGIN_CREDENTIALS')) {
        friendlyMessage = 'Invalid email or password. Please verify the credentials entered in the form.';
      } else if (rawCode === 'auth/user-not-found' || rawMessage.includes('EMAIL_NOT_FOUND')) {
        friendlyMessage = 'No registered Firebase Auth account found with this email. Create this user under Firebase Console > Authentication > Users.';
      } else if (rawCode === 'auth/invalid-email' || rawMessage.includes('INVALID_EMAIL')) {
        friendlyMessage = 'Invalid email address format. Please provide a valid email.';
      } else if (rawCode === 'auth/user-disabled' || rawMessage.includes('USER_DISABLED')) {
        friendlyMessage = 'This staff account has been deactivated in Firebase Auth. Contact an administrator.';
      } else if (rawCode === 'auth/too-many-requests' || rawMessage.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        friendlyMessage = 'Too many failed login attempts. Please wait a few minutes before trying again.';
      } else if (rawCode === 'auth/network-request-failed') {
        friendlyMessage = 'Network connection issue. Please check your internet connection.';
      } else if (rawCode) {
        friendlyMessage = `Authentication error [${rawCode}]: ${rawMessage}`;
      } else {
        friendlyMessage = `Authentication failed: ${rawMessage}`;
      }

      setError(friendlyMessage);
      return { success: false, error: friendlyMessage };
    }
  };

  const logout = async () => {
    if (auth) {
      await firebaseSignOut(auth);
    }
    setUser(null);
    setUserProfile(null);
    setError(null);
  };

  // Resolved Profile: When a user is signed in, their role is strictly resolved from Firestore/Auth.
  // When unauthenticated, PREVIEW_ADMIN_PROFILE allows dashboard inspection without full permissions escalation.
  const effectiveProfile: UserProfile | null = user ? userProfile : PREVIEW_ADMIN_PROFILE;
  const role: UserRole = effectiveProfile?.role || (user ? 'customer' : 'admin');
  const isAuthorized = user ? isAuthorizedAdminRole(role) : true;

  const checkUserPermission = useCallback(
    (permission: Permission): boolean => {
      return checkPermission(role, permission);
    },
    [role]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile: effectiveProfile,
        role,
        isAuthorized,
        isAuthenticated: !!user,
        authReady,
        loading,
        error,
        signIn,
        signInWithGoogle,
        logout,
        refreshProfile,
        hasPermission: checkUserPermission,
        isFirebaseConfigured: connectionStatus.isConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

