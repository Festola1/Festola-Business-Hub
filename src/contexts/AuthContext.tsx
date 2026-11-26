import type { Session } from '@supabase/supabase-js';
import { onIdTokenChanged } from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { auth as firebaseAuth } from '../firebase';
import { getFriendlyApiError } from '../lib/error-messages';
import {
  fetchMe,
  logoutSession,
  type TenantMembershipSummary,
  type UserProfile,
} from '../lib/identity-api';
import { clearDashboardSnapshotsForUser } from '../lib/offline-store';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';
import { useFirebase } from './FirebaseContext';

export const ACTIVE_BUSINESS_STORAGE_KEY = 'festola.active_business_id';

export interface AuthContextValue {
  supabaseConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
  accessToken: string | null;
  profile: UserProfile | null;
  memberships: TenantMembershipSummary[];
  activeMembership: TenantMembershipSummary | null;
  tenantEpoch: number;
  emailNotVerified: boolean;
  authError: string | null;
  selectBusiness: (businessId: string, options?: { allowPendingRefresh?: boolean }) => boolean;
  refreshAccount: () => Promise<void>;
  refreshAccessToken?: () => Promise<string | null>;
  signOut: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredBusinessId(): string | null {
  try {
    return window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredBusinessId(businessId: string | null): void {
  try {
    if (businessId) {
      window.localStorage.setItem(ACTIVE_BUSINESS_STORAGE_KEY, businessId);
    } else {
      window.localStorage.removeItem(ACTIVE_BUSINESS_STORAGE_KEY);
    }
  } catch {
    return;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const isTestEnv = import.meta.env.MODE === 'test';
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const { firebaseReady, firebaseUser, firebaseDisplayName, firebaseError, signOutFirebase } =
    useFirebase();

  const [isLoading, setIsLoading] = useState<boolean>(Boolean(supabase));
  const [session, setSession] = useState<Session | null>(null);
  const [firebaseIdToken, setFirebaseIdToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<TenantMembershipSummary[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(() =>
    readStoredBusinessId(),
  );
  const [tenantEpoch, setTenantEpoch] = useState<number>(0);
  const [emailNotVerified, setEmailNotVerified] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadAccountWithToken = useCallback(async (token: string | null) => {
    if (!token) {
      setProfile(null);
      setMemberships([]);
      setEmailNotVerified(false);
      setAuthError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setAuthError(null);
    setEmailNotVerified(false);

    const response = await fetchMe(token);
    if (response.success && response.data) {
      // Strictly retain only active server-authorized memberships
      const activeOnly = response.data.memberships.filter((m) => m.membershipStatus === 'active');
      setProfile(response.data.profile);
      setMemberships(activeOnly);

      // Sanitize localStorage immediately if it holds a revoked/unauthorized businessId
      const stored = readStoredBusinessId();
      if (stored && !activeOnly.some((m) => m.businessId === stored)) {
        const fallbackId = activeOnly[0]?.businessId ?? null;
        setSelectedBusinessId(fallbackId);
        writeStoredBusinessId(fallbackId);
      }
    } else {
      setProfile(null);
      setMemberships([]);
      if (response.error?.code === 'EMAIL_NOT_VERIFIED') {
        setEmailNotVerified(true);
      }
      setAuthError(getFriendlyApiError(response.error, 'Unable to load account details.'));
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }
      setSession(data.session);
      if (data.session?.access_token) {
        void loadAccountWithToken(data.session.access_token);
      } else {
        setIsLoading(false);
      }
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }
      setSession(nextSession);
      if (nextSession?.access_token) {
        void loadAccountWithToken(nextSession.access_token);
      } else if (!firebaseUser) {
        void loadAccountWithToken(null);
      }
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase, loadAccountWithToken, firebaseUser]);

  const usingFirebaseSession = Boolean(!session && firebaseUser);

  // Keep Firebase ID token strictly in React memory and hydrate real PostgreSQL memberships
  useEffect(() => {
    if (!usingFirebaseSession || !firebaseUser) {
      return;
    }

    let mounted = true;

    const syncFirebaseToken = async (forceRefresh = false) => {
      try {
        const token = await firebaseUser.getIdToken(forceRefresh);
        if (!mounted) return;
        setFirebaseIdToken(token);
        await loadAccountWithToken(token);
      } catch {
        if (!mounted) return;
        setFirebaseIdToken(null);
        setAuthError('Your authentication session expired. Please sign in again.');
        setIsLoading(false);
      }
    };

    void syncFirebaseToken(false);

    if (isTestEnv) {
      return () => {
        mounted = false;
      };
    }

    const unsubscribe = onIdTokenChanged(firebaseAuth, (user) => {
      if (!mounted) return;
      if (!user) {
        setFirebaseIdToken(null);
        return;
      }
      void user
        .getIdToken()
        .then((token) => {
          if (mounted) {
            setFirebaseIdToken(token);
          }
        })
        .catch(() => {
          if (mounted) {
            setFirebaseIdToken(null);
          }
        });
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [usingFirebaseSession, firebaseUser, isTestEnv, loadAccountWithToken]);

  const activeAccessToken =
    session?.access_token ?? (usingFirebaseSession ? firebaseIdToken : null);

  const effectiveProfile = useMemo<UserProfile | null>(() => {
    if (profile) {
      return profile;
    }
    if (usingFirebaseSession && firebaseUser) {
      return {
        id: firebaseUser.uid,
        email: firebaseUser.email ?? '',
        fullName: firebaseDisplayName ?? firebaseUser.displayName ?? 'Business Owner',
        phone: firebaseUser.phoneNumber ?? null,
        acceptedTermsAt: firebaseUser.emailVerified ? new Date().toISOString() : null,
      };
    }
    return null;
  }, [profile, usingFirebaseSession, firebaseUser, firebaseDisplayName]);

  const effectiveSession = useMemo<Session | null>(() => {
    if (session) {
      return session;
    }
    if (usingFirebaseSession && firebaseUser && firebaseIdToken) {
      return {
        access_token: firebaseIdToken,
        refresh_token: '',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: profile?.id ?? firebaseUser.uid,
          email: firebaseUser.email ?? undefined,
          app_metadata: { provider: 'firebase_google' },
          user_metadata: { full_name: firebaseDisplayName ?? firebaseUser.displayName ?? '' },
          aud: 'authenticated',
          created_at: firebaseUser.metadata.creationTime ?? new Date().toISOString(),
        },
      } as Session;
    }
    return null;
  }, [session, usingFirebaseSession, firebaseUser, firebaseIdToken, firebaseDisplayName, profile]);

  const selectBusiness = useCallback(
    (businessId: string, options?: { allowPendingRefresh?: boolean }): boolean => {
      const isAuthorized = memberships.some(
        (m) => m.businessId === businessId && m.membershipStatus === 'active',
      );
      if (!isAuthorized && !options?.allowPendingRefresh) {
        return false;
      }
      setSelectedBusinessId(businessId);
      writeStoredBusinessId(businessId);
      setTenantEpoch((prev) => prev + 1);
      return true;
    },
    [memberships],
  );

  const activeMembership = useMemo(() => {
    if (memberships.length === 0) {
      return null;
    }
    const matched = memberships.find(
      (m) => m.businessId === selectedBusinessId && m.membershipStatus === 'active',
    );
    return matched ?? memberships[0] ?? null;
  }, [memberships, selectedBusinessId]);

  const refreshAccessToken = useCallback(async (): Promise<string | null> => {
    if (session && supabase) {
      const { data, error } = await supabase.auth.refreshSession();
      if (!error && data.session?.access_token) {
        setSession(data.session);
        return data.session.access_token;
      }
      return null;
    }
    if (firebaseUser) {
      try {
        const freshToken = await firebaseUser.getIdToken(true);
        setFirebaseIdToken(freshToken);
        return freshToken;
      } catch {
        return null;
      }
    }
    return null;
  }, [session, supabase, firebaseUser]);

  const refreshAccount = useCallback(async () => {
    if (usingFirebaseSession && firebaseUser) {
      try {
        const token = await firebaseUser.getIdToken();
        setFirebaseIdToken(token);
        await loadAccountWithToken(token);
      } catch {
        setAuthError('Unable to refresh your session. Please sign in again.');
      }
      return;
    }
    await loadAccountWithToken(session?.access_token ?? null);
  }, [loadAccountWithToken, session, usingFirebaseSession, firebaseUser]);

  const signOut = useCallback(async () => {
    const token = activeAccessToken;
    const currentUserId = profile?.id ?? firebaseUser?.uid ?? session?.user?.id ?? null;
    if (token) {
      // Best-effort server audit/session logout (Stage 07 POST /api/v1/auth/logout)
      try {
        await logoutSession(token);
      } catch {
        setAuthError(null);
      }
    }

    if (currentUserId) {
      clearDashboardSnapshotsForUser(currentUserId);
    }

    writeStoredBusinessId(null);
    setSelectedBusinessId(null);
    setFirebaseIdToken(null);
    setProfile(null);
    setMemberships([]);
    setEmailNotVerified(false);
    setAuthError(null);
    setTenantEpoch((prev) => prev + 1);

    if (supabase) {
      await supabase.auth.signOut();
    }
    await signOutFirebase();
  }, [activeAccessToken, profile, firebaseUser, session, supabase, signOutFirebase]);

  const effectiveLoading = isLoading || !firebaseReady;

  const value: AuthContextValue = {
    supabaseConfigured: Boolean(supabase),
    isLoading: effectiveLoading,
    session: effectiveSession,
    accessToken: activeAccessToken,
    profile: effectiveProfile,
    memberships,
    activeMembership,
    tenantEpoch,
    emailNotVerified: usingFirebaseSession
      ? Boolean(firebaseUser && !firebaseUser.emailVerified)
      : emailNotVerified,
    authError: authError ?? (!profile ? firebaseError : null),
    selectBusiness,
    refreshAccount,
    refreshAccessToken,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider.');
  }
  return ctx;
}
