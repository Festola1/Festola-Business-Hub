import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getFriendlyApiError } from '../lib/error-messages';
import {
  fetchMe,
  logoutSession,
  type TenantMembershipSummary,
  type UserProfile,
} from '../lib/identity-api';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

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
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [isLoading, setIsLoading] = useState<boolean>(Boolean(supabase));
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [memberships, setMemberships] = useState<TenantMembershipSummary[]>([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(() =>
    readStoredBusinessId(),
  );
  const [tenantEpoch, setTenantEpoch] = useState<number>(0);
  const [emailNotVerified, setEmailNotVerified] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const loadAccount = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.access_token) {
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

    const response = await fetchMe(activeSession.access_token);
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
      void loadAccount(data.session);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }
      setSession(nextSession);
      void loadAccount(nextSession);
    });

    return () => {
      mounted = false;
      subscription.subscription.unsubscribe();
    };
  }, [supabase, loadAccount]);

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

  const refreshAccount = useCallback(async () => {
    await loadAccount(session);
  }, [loadAccount, session]);

  const signOut = useCallback(async () => {
    const token = session?.access_token;
    if (token) {
      // Best-effort server audit/session logout (Stage 07 POST /api/v1/auth/logout)
      try {
        await logoutSession(token);
      } catch {
        setAuthError(null);
      }
    }

    writeStoredBusinessId(null);
    setSelectedBusinessId(null);
    setProfile(null);
    setMemberships([]);
    setEmailNotVerified(false);
    setAuthError(null);
    setTenantEpoch((prev) => prev + 1);

    if (supabase) {
      await supabase.auth.signOut();
    }
  }, [session, supabase]);

  const value: AuthContextValue = {
    supabaseConfigured: Boolean(supabase),
    isLoading,
    session,
    accessToken: session?.access_token ?? null,
    profile,
    memberships,
    activeMembership,
    tenantEpoch,
    emailNotVerified,
    authError,
    selectBusiness,
    refreshAccount,
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
