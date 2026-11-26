import type { User } from 'firebase/auth';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetDoc = vi.fn();
const mockGetDocs = vi.fn();
const mockBatchSet = vi.fn();
const mockBatchCommit = vi.fn();
const mockWriteBatch = vi.fn(() => ({
  set: mockBatchSet,
  commit: mockBatchCommit,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  getDoc: (...args: unknown[]) => mockGetDoc(...args),
  getDocs: (...args: unknown[]) => mockGetDocs(...args),
  onSnapshot: vi.fn(),
  query: vi.fn((...args: unknown[]) => args),
  serverTimestamp: vi.fn(() => 'SERVER_TIMESTAMP'),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn((...args: unknown[]) => args),
  writeBatch: () => mockWriteBatch(),
}));

vi.mock('../../src/firebase', () => ({
  db: { __mockDb: true },
  OperationType: {
    CREATE: 'create',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',
    GET: 'get',
    WRITE: 'write',
  },
  handleFirestoreError: vi.fn((err: unknown, op: string, path: string | null) => {
    throw new Error(
      `Firestore Error (${op} ${path}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }),
}));

import { ensureFirebaseWorkspace } from '../../src/lib/firestore-sync';

function makeMockUser(uid = 'ZaAQbGruStR23xFcUQG6fTCb9Ej2'): User {
  return {
    uid,
    displayName: 'Festus Ginah',
    email: 'festusginah25@gmail.com',
    emailVerified: true,
    phoneNumber: null,
  } as unknown as User;
}

describe('ensureFirebaseWorkspace race protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates concurrent sign-in calls so batch.commit only runs once for a new user', async () => {
    // Simulate a brand-new user where users/{uid}, private/info, and businesses/{id} do not exist yet
    mockGetDoc.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { exists: () => false, data: () => undefined };
    });

    mockBatchCommit.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
    });

    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'biz-ZaAQbGruStR23xFcUQG6fTCb',
          data: () => ({
            id: 'biz-ZaAQbGruStR23xFcUQG6fTCb',
            ownerId: 'ZaAQbGruStR23xFcUQG6fTCb9Ej2',
            name: "Festus Ginah's Business",
            currency: 'NGN',
            status: 'active',
          }),
        },
      ],
    });

    const user = makeMockUser();

    // Simulate onAuthStateChanged + signInWithGoogle firing simultaneously
    const [resultA, resultB] = await Promise.all([
      ensureFirebaseWorkspace(user),
      ensureFirebaseWorkspace(user),
    ]);

    expect(mockWriteBatch).toHaveBeenCalledTimes(1);
    expect(mockBatchCommit).toHaveBeenCalledTimes(1);
    expect(mockBatchSet).toHaveBeenCalledTimes(3);
    expect(resultA).toEqual(resultB);
    expect(resultA.defaultBusinessId).toBe('biz-ZaAQbGruStR23xFcUQG6fTCb');
    expect(resultA.businesses).toHaveLength(1);
  });

  it('recovers gracefully if another browser tab creates the user profile concurrently', async () => {
    let userDocReads = 0;
    mockGetDoc.mockImplementation(async (ref: { path: string }) => {
      if (ref.path === 'users/tabRaceUser123') {
        userDocReads += 1;
        if (userDocReads === 1) {
          return { exists: () => false, data: () => undefined };
        }
        return {
          exists: () => true,
          data: () => ({
            displayName: 'Tab Created Name',
            defaultBusinessId: 'biz-tabRaceUser123',
          }),
        };
      }
      return { exists: () => false, data: () => undefined };
    });

    mockBatchCommit.mockRejectedValueOnce(new Error('Missing or insufficient permissions.'));
    mockGetDocs.mockResolvedValue({
      docs: [
        {
          id: 'biz-tabRaceUser123',
          data: () => ({
            id: 'biz-tabRaceUser123',
            ownerId: 'tabRaceUser123',
            name: "Tab Created Name's Business",
            currency: 'NGN',
            status: 'active',
          }),
        },
      ],
    });

    const result = await ensureFirebaseWorkspace(makeMockUser('tabRaceUser123'));
    expect(result.displayName).toBe('Tab Created Name');
    expect(result.defaultBusinessId).toBe('biz-tabRaceUser123');
    expect(result.businesses).toHaveLength(1);
  });
});
