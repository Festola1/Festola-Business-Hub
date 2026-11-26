import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { isCloudSqlConfigured } from '../../src/db/index.ts';
import { firebaseUidToUuid, getOrCreateFirebaseUser } from '../../src/db/users.ts';
import { ApiError } from '../middleware/error-handler.ts';
import type { AuthTokenVerifier, VerifiedAuthUser } from './supabase-admin.ts';

function hasValidFirebaseProjectId(): boolean {
  const projectId = typeof firebaseConfig.projectId === 'string' ? firebaseConfig.projectId : '';
  return projectId.length > 0 && projectId !== 'remixed-project-id';
}

let cachedAdminAuth: Auth | null = null;

export function getFirebaseAdminAuth(): Auth | null {
  if (!hasValidFirebaseProjectId()) {
    return null;
  }
  if (cachedAdminAuth) {
    return cachedAdminAuth;
  }
  const app =
    getApps().length > 0
      ? getApp()
      : initializeApp({
          projectId: firebaseConfig.projectId,
        });
  cachedAdminAuth = getAuth(app);
  return cachedAdminAuth;
}

/**
 * Server-side Firebase ID Token verifier (`verifyIdToken` requires zero IAM).
 * Synchronizes the verified Firebase account to PostgreSQL `user_profiles` when Cloud SQL is active.
 */
export function createFirebaseAuthVerifier(): AuthTokenVerifier | null {
  const adminAuth = getFirebaseAdminAuth();
  if (!adminAuth) {
    return null;
  }

  return {
    async verifyAccessToken(accessToken: string): Promise<VerifiedAuthUser | null> {
      let decoded;
      try {
        decoded = await adminAuth.verifyIdToken(accessToken);
      } catch {
        return null;
      }

      if (!decoded.uid || !decoded.email) {
        return null;
      }

      const email = decoded.email.trim().toLowerCase();
      const fullName =
        typeof decoded.name === 'string' && decoded.name.trim().length > 0
          ? decoded.name.trim()
          : (email.split('@')[0] ?? 'Festola User');

      let resolvedUserId = firebaseUidToUuid(decoded.uid);
      if (isCloudSqlConfigured()) {
        try {
          const synced = await getOrCreateFirebaseUser({
            uid: decoded.uid,
            email,
            fullName,
          });
          resolvedUserId = synced.id;
        } catch {
          throw new ApiError(
            503,
            'INTERNAL_SERVER_ERROR',
            'Database connection is temporarily unavailable. Check that Cloud SQL is active on your linked Google Cloud project.',
          );
        }
      }

      return {
        id: resolvedUserId,
        email,
        fullName,
        emailConfirmedAt: decoded.email_verified ? new Date().toISOString() : null,
        aal: 'aal1',
      };
    },
  };
}
