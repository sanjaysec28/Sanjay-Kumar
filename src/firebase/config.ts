import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

/**
 * Firebase Client Configuration for Musha Empire Admin Portal
 * Connects directly to the existing Musha Empire Firebase project.
 * Uses environment variables to prevent hardcoded credentials.
 */

export interface FirebaseConnectionStatus {
  isConfigured: boolean;
  projectId: string | null;
  authDomain: string | null;
  missingKeys: string[];
}

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (process.env as Record<string, string | undefined>);

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || '',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || '',
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

// Check which required keys are missing
const requiredKeyMap: Record<string, string> = {
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
};

const missingKeys = Object.entries(requiredKeyMap)
  .filter(([_, value]) => !value || value.startsWith('your-'))
  .map(([key]) => key);

export const connectionStatus: FirebaseConnectionStatus = {
  isConfigured: missingKeys.length === 0,
  projectId: firebaseConfig.projectId || null,
  authDomain: firebaseConfig.authDomain || null,
  missingKeys,
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;

try {
  // Initialize only if not already initialized
  if (getApps().length === 0) {
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
      app = initializeApp(firebaseConfig);
    }
  } else {
    app = getApps()[0];
  }

  if (app) {
    auth = getAuth(app);
    db = getFirestore(app);
  }
} catch (error) {
  console.warn('Firebase initialization notice:', error);
}

export { app, auth, db };
