import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const rawFirebaseConfig = firebaseConfig as typeof firebaseConfig & {
  firestoreDatabaseId?: string;
};
export const isFirestoreEnabled = Boolean(
  typeof rawFirebaseConfig.firestoreDatabaseId === 'string' &&
    rawFirebaseConfig.firestoreDatabaseId.trim().length > 0,
);
const firestoreDatabaseId = rawFirebaseConfig.firestoreDatabaseId || '(default)';

const app = initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') {
    return getFirestore(app, firestoreDatabaseId);
  }

  // Force HTTP long-polling to avoid WebChannel HTTP/2 streaming disconnects
  // (`FirebaseError: [code=unavailable]`) in proxied, iframe, or mobile networks,
  // and enable multi-tab IndexedDB persistence for offline-first operation.
  try {
    return initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firestoreDatabaseId,
    );
  } catch {
    try {
      return initializeFirestore(
        app,
        {
          experimentalForceLongPolling: true,
          localCache: memoryLocalCache(),
        },
        firestoreDatabaseId,
      );
    } catch {
      return getFirestore(app, firestoreDatabaseId);
    }
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export function createGmailSendProvider(loginHint?: string | null): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.addScope(GMAIL_SEND_SCOPE);
  provider.setCustomParameters(
    loginHint ? { login_hint: loginHint, prompt: 'consent' } : { prompt: 'select_account consent' },
  );
  return provider;
}

export const firebaseProjectConfig = {
  projectId: firebaseConfig.projectId,
  firestoreDatabaseId,
} as const;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function isFirestoreOfflineError(error: unknown): boolean {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  return (
    lower.includes('client is offline') ||
    lower.includes('code=unavailable') ||
    lower.includes('could not reach cloud firestore backend') ||
    lower.includes('failed to get document because the client is offline')
  );
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  if (!isFirestoreEnabled || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
    return;
  }
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

if (isFirestoreEnabled && typeof window !== 'undefined' && import.meta.env.MODE !== 'test') {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    window.addEventListener(
      'online',
      () => {
        void testConnection();
      },
      { once: true },
    );
  } else {
    void testConnection();
  }
}
