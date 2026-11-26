import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from './index.ts';
import { userProfiles } from './schema.ts';

/**
 * Deterministically maps a Firebase Auth UID string to a valid RFC 4122 UUIDv5-style
 * identifier so PostgreSQL UUID foreign keys and tenant context validation remain strictly typed.
 */
export function firebaseUidToUuid(firebaseUid: string): string {
  const hash = createHash('sha256').update(`festola-firebase-uid:${firebaseUid}`).digest();
  // Set version 5 nibble & RFC 4122 variant bits
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/**
 * Safely upserts a verified Firebase Auth user into PostgreSQL `user_profiles` using Drizzle ORM.
 * Handles concurrent first-request sign-ins and existing email linkage without race failures.
 */
export async function getOrCreateFirebaseUser(input: {
  uid: string;
  email: string;
  fullName: string;
}) {
  const normalizedEmail = input.email.trim().toLowerCase();
  const displayName =
    input.fullName.trim().length > 0
      ? input.fullName.trim()
      : (normalizedEmail.split('@')[0] ?? 'Festola User');
  const deterministicId = firebaseUidToUuid(input.uid);

  try {
    const existingByUid = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.firebaseUid, input.uid))
      .limit(1);

    if (existingByUid[0]) {
      const updated = await db
        .update(userProfiles)
        .set({
          email: normalizedEmail,
          fullName: existingByUid[0].fullName || displayName,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.id, existingByUid[0].id))
        .returning();
      return updated[0] ?? existingByUid[0];
    }

    const existingByEmail = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.email, normalizedEmail))
      .limit(1);

    if (existingByEmail[0]) {
      const linked = await db
        .update(userProfiles)
        .set({
          firebaseUid: input.uid,
          fullName: existingByEmail[0].fullName || displayName,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.id, existingByEmail[0].id))
        .returning();
      return linked[0] ?? existingByEmail[0];
    }

    const inserted = await db
      .insert(userProfiles)
      .values({
        id: deterministicId,
        firebaseUid: input.uid,
        email: normalizedEmail,
        fullName: displayName,
      })
      .onConflictDoUpdate({
        target: userProfiles.id,
        set: {
          firebaseUid: input.uid,
          email: normalizedEmail,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (inserted[0]) {
      return inserted[0];
    }

    const fallback = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.firebaseUid, input.uid))
      .limit(1);

    if (!fallback[0]) {
      throw new Error('User profile could not be resolved after upsert.');
    }
    return fallback[0];
  } catch (error) {
    console.error('Database user synchronization failed:', error);
    throw new Error('Unable to synchronize user profile with database.', { cause: error });
  }
}
