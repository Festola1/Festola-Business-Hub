import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type { SupplierPaymentRecord, SupplierRecord } from './offline-store';

/**
 * Blueprint-synchronized volumetric limits from firebase-blueprint.json.
 * Outgoing payloads are strictly validated/truncated to match firestore.rules verbatim.
 */
const BLUEPRINT_LIMITS = {
  ID_PATTERN: /^[a-zA-Z0-9_-]{1,128}$/,
  DISPLAY_NAME_MAX: 120,
  BUSINESS_NAME_MAX: 120,
  SUPPLIER_NAME_MAX: 120,
  PHONE_MAX: 40,
  USER_PHONE_MAX: 32,
  EMAIL_MAX: 254,
  ADDRESS_MAX: 240,
  PRODUCTS_SUPPLIED_MAX: 240,
  PAYMENTS_MAX: 50,
} as const;

export interface FirestoreBusinessDoc {
  id: string;
  ownerId: string;
  name: string;
  currency: 'NGN' | 'USD' | 'GHS' | 'KES' | 'GBP';
  status: 'active' | 'archived';
}

export interface FirestoreUserWorkspaceResult {
  displayName: string;
  defaultBusinessId: string;
  businesses: FirestoreBusinessDoc[];
}

function clampString(value: string, maxLen: number): string {
  return value.trim().slice(0, maxLen);
}

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 120);
  if (BLUEPRINT_LIMITS.ID_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}-${Date.now()}`;
}

function sanitizeAmount(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Number(value.toFixed(2));
}

function sanitizePayments(payments: SupplierPaymentRecord[]): SupplierPaymentRecord[] {
  return payments.slice(0, BLUEPRINT_LIMITS.PAYMENTS_MAX).map((p) => ({
    id: sanitizeId(p.id, 'pay'),
    amount: String(p.amount).slice(0, 32),
    method: p.method,
    paidAt: String(p.paidAt).slice(0, 64),
    referenceNote: clampString(p.referenceNote || 'Supplier settlement', 120),
  }));
}

const inFlightWorkspaceSync = new Map<string, Promise<FirestoreUserWorkspaceResult>>();

async function runEnsureFirebaseWorkspace(user: User): Promise<FirestoreUserWorkspaceResult> {
  const uid = user.uid;
  const userDocPath = `users/${uid}`;
  const userRef = doc(db, 'users', uid);

  let existingUserSnap;
  try {
    existingUserSnap = await getDoc(userRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, userDocPath);
  }

  let displayName = clampString(
    user.displayName || user.email?.split('@')[0] || 'Business Owner',
    BLUEPRINT_LIMITS.DISPLAY_NAME_MAX,
  );
  if (displayName.length === 0) {
    displayName = 'Business Owner';
  }

  let defaultBusinessId = sanitizeId(`biz-${uid.slice(0, 24)}`, 'biz');

  if (!existingUserSnap.exists()) {
    const privateRef = doc(db, 'users', uid, 'private', 'info');
    const bizRef = doc(db, 'businesses', defaultBusinessId);
    const defaultBizName = clampString(
      `${displayName}'s Business`,
      BLUEPRINT_LIMITS.BUSINESS_NAME_MAX,
    );
    const safeBizName = defaultBizName.length >= 2 ? defaultBizName : 'Festola Store';
    const safeEmail = clampString(user.email || `${uid}@festola.local`, BLUEPRINT_LIMITS.EMAIL_MAX);

    const [privateExists, bizExists] = await Promise.all([getDoc(privateRef), getDoc(bizRef)])
      .then(
        ([privateSnap, existingBizSnap]) =>
          [privateSnap.exists(), existingBizSnap.exists()] as const,
      )
      .catch(() => [false, false] as const);

    const batch = writeBatch(db);
    batch.set(userRef, {
      uid,
      displayName,
      defaultBusinessId,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (!privateExists) {
      batch.set(privateRef, {
        uid,
        email: safeEmail,
        phone: clampString(user.phoneNumber || '', BLUEPRINT_LIMITS.USER_PHONE_MAX),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    if (!bizExists) {
      batch.set(bizRef, {
        id: defaultBusinessId,
        ownerId: uid,
        name: safeBizName,
        currency: 'NGN',
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      // Handle rare cross-tab race where another tab created the workspace concurrently
      let recoveredSnap = null;
      try {
        const retrySnap = await getDoc(userRef);
        if (retrySnap.exists()) {
          recoveredSnap = retrySnap;
        }
      } catch {
        recoveredSnap = null;
      }

      if (recoveredSnap) {
        const data = recoveredSnap.data();
        if (typeof data.displayName === 'string' && data.displayName.trim()) {
          displayName = data.displayName;
        }
        if (typeof data.defaultBusinessId === 'string' && data.defaultBusinessId.trim()) {
          defaultBusinessId = data.defaultBusinessId;
        }
      } else {
        handleFirestoreError(error, OperationType.WRITE, userDocPath);
      }
    }
  } else {
    const data = existingUserSnap.data();
    if (typeof data.displayName === 'string' && data.displayName.trim()) {
      displayName = data.displayName;
    }
    if (typeof data.defaultBusinessId === 'string' && data.defaultBusinessId.trim()) {
      defaultBusinessId = data.defaultBusinessId;
    }
  }

  // Query only businesses owned by the current authenticated user (Pillar 8 compliant)
  const businessesQuery = query(collection(db, 'businesses'), where('ownerId', '==', uid));
  let bizSnap;
  try {
    bizSnap = await getDocs(businessesQuery);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'businesses');
  }

  const businesses: FirestoreBusinessDoc[] = bizSnap.docs
    .map((docSnap) => {
      const d = docSnap.data();
      return {
        id: String(d.id ?? docSnap.id),
        ownerId: String(d.ownerId ?? uid),
        name: String(d.name ?? 'Festola Store'),
        currency: (d.currency as FirestoreBusinessDoc['currency']) || 'NGN',
        status: (d.status as FirestoreBusinessDoc['status']) || 'active',
      };
    })
    .filter((b) => b.status === 'active');

  return {
    displayName,
    defaultBusinessId,
    businesses,
  };
}

/**
 * Ensures the signed-in Firebase user has an atomically created profile,
 * owner-only private PII record, and primary Business workspace in Firestore.
 * Concurrent calls for the same UID share a single in-flight promise so
 * signInWithPopup + onAuthStateChanged never issue duplicate create batches.
 */
export function ensureFirebaseWorkspace(user: User): Promise<FirestoreUserWorkspaceResult> {
  const existingPromise = inFlightWorkspaceSync.get(user.uid);
  if (existingPromise) {
    return existingPromise;
  }

  const syncPromise = runEnsureFirebaseWorkspace(user).finally(() => {
    inFlightWorkspaceSync.delete(user.uid);
  });
  inFlightWorkspaceSync.set(user.uid, syncPromise);
  return syncPromise;
}

/**
 * Real-time Firestore listener for business suppliers.
 * Always filters by both ownerId and businessId to satisfy rule-enforced list queries.
 */
export function subscribeToFirestoreSuppliers(
  businessId: string,
  ownerId: string,
  onData: (suppliers: SupplierRecord[]) => void,
  onFailure?: (err: Error) => void,
): Unsubscribe {
  const path = `businesses/${businessId}/suppliers`;
  const suppliersQuery = query(
    collection(db, 'businesses', businessId, 'suppliers'),
    where('ownerId', '==', ownerId),
    where('businessId', '==', businessId),
  );

  return onSnapshot(
    suppliersQuery,
    (snapshot) => {
      const rows: SupplierRecord[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          const createdTs =
            d.createdAt && typeof d.createdAt.toDate === 'function'
              ? (d.createdAt.toDate() as Date).toISOString()
              : new Date().toISOString();
          return {
            id: String(d.id ?? docSnap.id),
            name: String(d.name ?? ''),
            phone: String(d.phone ?? ''),
            email: String(d.email ?? ''),
            address: String(d.address ?? ''),
            productsSupplied: String(d.productsSupplied ?? ''),
            totalPurchases: Number(d.totalPurchases ?? 0),
            outstandingBalance: Number(d.outstandingBalance ?? 0),
            payments: Array.isArray(d.payments) ? (d.payments as SupplierPaymentRecord[]) : [],
            createdAt: createdTs,
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      onData(rows);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch (wrapped) {
        onFailure?.(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    },
  );
}

export async function createFirestoreSupplier(
  businessId: string,
  ownerId: string,
  supplier: SupplierRecord,
): Promise<void> {
  const safeId = sanitizeId(supplier.id, 'sup');
  const path = `businesses/${businessId}/suppliers/${safeId}`;
  const safeName = clampString(supplier.name, BLUEPRINT_LIMITS.SUPPLIER_NAME_MAX);
  if (safeName.length < 2) {
    throw new Error('Supplier name must be at least 2 characters.');
  }

  try {
    await setDoc(doc(db, 'businesses', businessId, 'suppliers', safeId), {
      id: safeId,
      businessId,
      ownerId,
      name: safeName,
      phone: clampString(supplier.phone, BLUEPRINT_LIMITS.PHONE_MAX),
      email: clampString(supplier.email, BLUEPRINT_LIMITS.EMAIL_MAX),
      address: clampString(supplier.address, BLUEPRINT_LIMITS.ADDRESS_MAX),
      productsSupplied: clampString(
        supplier.productsSupplied,
        BLUEPRINT_LIMITS.PRODUCTS_SUPPLIED_MAX,
      ),
      totalPurchases: sanitizeAmount(supplier.totalPurchases),
      outstandingBalance: sanitizeAmount(supplier.outstandingBalance),
      payments: sanitizePayments(supplier.payments),
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFirestoreSupplierDetails(
  businessId: string,
  supplierId: string,
  updates: {
    name: string;
    phone: string;
    email: string;
    address: string;
    productsSupplied: string;
    outstandingBalance: number;
  },
): Promise<void> {
  const path = `businesses/${businessId}/suppliers/${supplierId}`;
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'suppliers', supplierId), {
      name: clampString(updates.name, BLUEPRINT_LIMITS.SUPPLIER_NAME_MAX),
      phone: clampString(updates.phone, BLUEPRINT_LIMITS.PHONE_MAX),
      email: clampString(updates.email, BLUEPRINT_LIMITS.EMAIL_MAX),
      address: clampString(updates.address, BLUEPRINT_LIMITS.ADDRESS_MAX),
      productsSupplied: clampString(
        updates.productsSupplied,
        BLUEPRINT_LIMITS.PRODUCTS_SUPPLIED_MAX,
      ),
      outstandingBalance: sanitizeAmount(updates.outstandingBalance),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function recordFirestoreSupplierPayment(
  businessId: string,
  supplierId: string,
  outstandingBalance: number,
  payments: SupplierPaymentRecord[],
): Promise<void> {
  const path = `businesses/${businessId}/suppliers/${supplierId}`;
  try {
    await updateDoc(doc(db, 'businesses', businessId, 'suppliers', supplierId), {
      outstandingBalance: sanitizeAmount(outstandingBalance),
      payments: sanitizePayments(payments),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreSupplier(
  businessId: string,
  supplierId: string,
): Promise<void> {
  const path = `businesses/${businessId}/suppliers/${supplierId}`;
  try {
    await deleteDoc(doc(db, 'businesses', businessId, 'suppliers', supplierId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}
