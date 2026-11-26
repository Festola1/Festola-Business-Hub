import {
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  auth,
  createGmailSendProvider,
  googleProvider,
  isFirestoreEnabled,
  isFirestoreOfflineError,
} from '../firebase';
import { ensureFirebaseWorkspace, type FirestoreBusinessDoc } from '../lib/firestore-sync';

function formatFirebaseSyncError(err: unknown, fallback: string): string {
  if (isFirestoreOfflineError(err)) {
    return 'Cloud sync is temporarily offline. Your workspace will reconnect automatically as soon as internet access returns.';
  }
  return err instanceof Error ? err.message : fallback;
}

export interface FirebaseContextValue {
  firebaseReady: boolean;
  firebaseUser: User | null;
  firebaseDisplayName: string | null;
  firebaseDefaultBusinessId: string | null;
  firebaseBusinesses: FirestoreBusinessDoc[];
  firebaseError: string | null;
  gmailAccessToken: string | null;
  gmailSenderEmail: string | null;
  signInWithGoogle: () => Promise<User | null>;
  connectGmailSender: (loginHint?: string | null) => Promise<{
    accessToken: string;
    senderEmail: string | null;
  } | null>;
  clearGmailAccessToken: () => void;
  signOutFirebase: () => Promise<void>;
}

const DEFAULT_FIREBASE_CONTEXT: FirebaseContextValue = {
  firebaseReady: true,
  firebaseUser: null,
  firebaseDisplayName: null,
  firebaseDefaultBusinessId: null,
  firebaseBusinesses: [],
  firebaseError: null,
  gmailAccessToken: null,
  gmailSenderEmail: null,
  signInWithGoogle: async () => null,
  connectGmailSender: async () => null,
  clearGmailAccessToken: () => undefined,
  signOutFirebase: async () => undefined,
};

export const FirebaseContext = createContext<FirebaseContextValue>(DEFAULT_FIREBASE_CONTEXT);

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const isTestEnv = import.meta.env.MODE === 'test';
  const [firebaseReady, setFirebaseReady] = useState<boolean>(isTestEnv);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseDisplayName, setFirebaseDisplayName] = useState<string | null>(null);
  const [firebaseDefaultBusinessId, setFirebaseDefaultBusinessId] = useState<string | null>(null);
  const [firebaseBusinesses, setFirebaseBusinesses] = useState<FirestoreBusinessDoc[]>([]);
  const [firebaseError, setFirebaseError] = useState<string | null>(null);
  // Kept strictly in React memory (never localStorage or sessionStorage)
  const [gmailAccessToken, setGmailAccessToken] = useState<string | null>(null);
  const [gmailSenderEmail, setGmailSenderEmail] = useState<string | null>(null);

  const syncVerifiedUserWorkspace = useCallback(
    async (user: User, isMounted: () => boolean): Promise<void> => {
      if (!isFirestoreEnabled) {
        if (isMounted()) {
          setFirebaseDisplayName(user.displayName ?? user.email ?? 'Business Owner');
          setFirebaseDefaultBusinessId(null);
          setFirebaseBusinesses([]);
          setFirebaseError(null);
          setFirebaseReady(true);
        }
        return;
      }
      try {
        const result = await ensureFirebaseWorkspace(user);
        if (!isMounted()) {
          return;
        }
        setFirebaseDisplayName(result.displayName);
        setFirebaseDefaultBusinessId(result.defaultBusinessId);
        setFirebaseBusinesses(result.businesses);
        setFirebaseError(null);
      } catch (err: unknown) {
        if (!isMounted()) {
          return;
        }
        setFirebaseError(formatFirebaseSyncError(err, 'Unable to sync your Firebase workspace.'));
      } finally {
        if (isMounted()) {
          setFirebaseReady(true);
        }
      }
    },
    [],
  );

  useEffect(() => {
    if (isTestEnv) {
      return;
    }

    let mounted = true;
    const isMounted = () => mounted;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!mounted) {
        return;
      }
      setFirebaseUser(user);
      setFirebaseError(null);

      if (!user) {
        setFirebaseDisplayName(null);
        setFirebaseDefaultBusinessId(null);
        setFirebaseBusinesses([]);
        setGmailAccessToken(null);
        setGmailSenderEmail(null);
        setFirebaseReady(true);
        return;
      }

      if (!user.emailVerified || !isFirestoreEnabled) {
        setFirebaseDisplayName(user.displayName ?? user.email ?? 'User');
        setFirebaseDefaultBusinessId(null);
        setFirebaseBusinesses([]);
        setFirebaseReady(true);
        return;
      }

      void syncVerifiedUserWorkspace(user, isMounted);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [isTestEnv, syncVerifiedUserWorkspace]);

  // Automatically re-sync workspace when connectivity returns after an offline error
  useEffect(() => {
    if (
      isTestEnv ||
      !isFirestoreEnabled ||
      !firebaseUser?.emailVerified ||
      (!firebaseError && firebaseBusinesses.length > 0)
    ) {
      return;
    }

    let mounted = true;
    const handleOnline = () => {
      void syncVerifiedUserWorkspace(firebaseUser, () => mounted);
    };
    window.addEventListener('online', handleOnline);
    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
    };
  }, [
    isTestEnv,
    firebaseUser,
    firebaseError,
    firebaseBusinesses.length,
    syncVerifiedUserWorkspace,
  ]);

  const signInWithGoogle = useCallback(async (): Promise<User | null> => {
    setFirebaseError(null);
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      if (credential.user && credential.user.emailVerified) {
        setFirebaseUser(credential.user);
        if (isFirestoreEnabled) {
          const result = await ensureFirebaseWorkspace(credential.user);
          setFirebaseDisplayName(result.displayName);
          setFirebaseDefaultBusinessId(result.defaultBusinessId);
          setFirebaseBusinesses(result.businesses);
        } else {
          setFirebaseDisplayName(
            credential.user.displayName ?? credential.user.email ?? 'Business Owner',
          );
          setFirebaseDefaultBusinessId(null);
          setFirebaseBusinesses([]);
        }
        setFirebaseReady(true);
      }
      return credential.user;
    } catch (err: unknown) {
      const message = formatFirebaseSyncError(err, 'Google sign-in was cancelled or failed.');
      setFirebaseError(message);
      throw err;
    }
  }, []);

  const connectGmailSender = useCallback(
    async (
      loginHint?: string | null,
    ): Promise<{ accessToken: string; senderEmail: string | null } | null> => {
      const currentUser = auth.currentUser;
      const hasGoogleProvider = Boolean(
        currentUser?.providerData?.some((provider) => provider.providerId === 'google.com'),
      );
      const provider = createGmailSendProvider(loginHint ?? currentUser?.email ?? null);
      const result =
        currentUser && hasGoogleProvider
          ? await reauthenticateWithPopup(currentUser, provider)
          : await signInWithPopup(auth, provider);
      const oauthCred = GoogleAuthProvider.credentialFromResult(result);
      const token = oauthCred?.accessToken ?? null;
      if (!token) {
        throw new Error(
          'Gmail send permission was not granted. Please allow Gmail sending to deliver invitation emails directly.',
        );
      }
      const senderEmail = result.user.email ?? null;
      setGmailAccessToken(token);
      setGmailSenderEmail(senderEmail);
      return { accessToken: token, senderEmail };
    },
    [],
  );

  const clearGmailAccessToken = useCallback(() => {
    setGmailAccessToken(null);
    setGmailSenderEmail(null);
  }, []);

  const signOutFirebase = useCallback(async (): Promise<void> => {
    setFirebaseError(null);
    setGmailAccessToken(null);
    setGmailSenderEmail(null);
    if (!isTestEnv && auth.currentUser) {
      await signOut(auth);
    }
    setFirebaseUser(null);
    setFirebaseDisplayName(null);
    setFirebaseDefaultBusinessId(null);
    setFirebaseBusinesses([]);
  }, [isTestEnv]);

  return (
    <FirebaseContext.Provider
      value={{
        firebaseReady,
        firebaseUser,
        firebaseDisplayName,
        firebaseDefaultBusinessId,
        firebaseBusinesses,
        firebaseError,
        gmailAccessToken,
        gmailSenderEmail,
        signInWithGoogle,
        connectGmailSender,
        clearGmailAccessToken,
        signOutFirebase,
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase(): FirebaseContextValue {
  return useContext(FirebaseContext);
}
