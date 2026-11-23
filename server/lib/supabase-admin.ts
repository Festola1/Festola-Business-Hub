import { createClient } from '@supabase/supabase-js';
import type { ServerEnv } from '../config/env.ts';

export type AuthAssuranceLevel = 'aal1' | 'aal2';

export interface VerifiedAuthUser {
  id: string;
  email: string;
  fullName: string;
  /**
   * ISO timestamp when email was verified in Supabase Auth.
   * Explicitly `null` indicates an unverified email account (blocked from onboarding/invites).
   */
  emailConfirmedAt?: string | null;
  /**
   * Authenticator Assurance Level (aal2 = MFA verified; enforced for Platform Admins in staging/prod).
   */
  aal?: AuthAssuranceLevel | null;
}

export interface AuthTokenVerifier {
  verifyAccessToken: (accessToken: string) => Promise<VerifiedAuthUser | null>;
  /**
   * Optional server-side session revocation (used on staff suspension/revocation & global sign-out).
   */
  signOutUser?: (userId: string) => Promise<void>;
}

/**
 * Server-only Supabase JWT verification adapter.
 * Validates Bearer JWTs directly against Supabase Auth (never trusts client-decoded claims).
 * Returns null when Supabase credentials are not configured so middleware fails closed.
 */
export function createSupabaseAuthVerifier(env: ServerEnv): AuthTokenVerifier | null {
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_ANON_KEY;
  if (!env.SUPABASE_URL || !key) {
    return null;
  }

  const supabase = createClient(env.SUPABASE_URL, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const hasServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY);

  return {
    async verifyAccessToken(accessToken: string): Promise<VerifiedAuthUser | null> {
      const { data, error } = await supabase.auth.getUser(accessToken);
      if (error || !data.user || !data.user.email) {
        return null;
      }

      const rawMeta = data.user.user_metadata as Record<string, unknown> | undefined;
      const appMeta = data.user.app_metadata as Record<string, unknown> | undefined;
      const fullName =
        typeof rawMeta?.full_name === 'string' && rawMeta.full_name.trim().length > 0
          ? rawMeta.full_name.trim()
          : data.user.email.split('@')[0] || 'Festola User';

      const emailConfirmedAt =
        typeof data.user.email_confirmed_at === 'string' ? data.user.email_confirmed_at : null;

      const factors = Array.isArray(data.user.factors) ? data.user.factors : [];
      const hasVerifiedMfa = factors.some((factor) => factor.status === 'verified');
      const aal: AuthAssuranceLevel = appMeta?.aal === 'aal2' || hasVerifiedMfa ? 'aal2' : 'aal1';

      return {
        id: data.user.id,
        email: data.user.email.toLowerCase(),
        fullName,
        emailConfirmedAt,
        aal,
      };
    },

    async signOutUser(userId: string): Promise<void> {
      if (!hasServiceRole) {
        return;
      }
      await supabase.auth.admin.signOut(userId, 'global');
    },
  };
}
