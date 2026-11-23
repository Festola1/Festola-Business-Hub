import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../src/App';
import { ACTIVE_BUSINESS_STORAGE_KEY, AuthProvider, useAuth } from '../../src/contexts/AuthContext';
import type { TenantMembershipSummary } from '../../src/lib/identity-api';

const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn();

vi.mock('../../src/lib/supabase-browser', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
      signOut: mockSignOut,
    },
  }),
}));

const BIZ_A: TenantMembershipSummary = {
  businessId: '11111111-1111-4111-8111-111111111111',
  businessName: 'Adaeze Supermarket',
  userId: 'user-1',
  role: 'owner',
  membershipStatus: 'active',
  subscriptionStatus: 'trialing',
  limits: {
    planId: 'plan-trial',
    planCode: 'trial',
    displayName: '14-Day Free Trial',
    maxStaff: 3,
    maxProducts: 500,
    maxOfflineDevices: 2,
  },
  defaultLocationId: 'loc-a',
};

const BIZ_B: TenantMembershipSummary = {
  businessId: '22222222-2222-4222-8222-222222222222',
  businessName: 'Lagos Pharmacy Annex',
  userId: 'user-1',
  role: 'manager',
  membershipStatus: 'active',
  subscriptionStatus: 'active',
  limits: {
    planId: 'plan-tier-1',
    planCode: 'tier_1',
    displayName: 'Capacity Tier',
    maxStaff: 10,
    maxProducts: 2000,
    maxOfflineDevices: 5,
  },
  defaultLocationId: 'loc-b',
};

function AuthHarness() {
  const { activeMembership, tenantEpoch, selectBusiness, signOut } = useAuth();
  return (
    <div>
      <p data-testid="active-biz">{activeMembership?.businessId ?? 'none'}</p>
      <p data-testid="epoch">{tenantEpoch}</p>
      <button type="button" onClick={() => selectBusiness(BIZ_B.businessId)}>
        Switch to B
      </button>
      <button type="button" onClick={() => selectBusiness('99999999-9999-4999-8999-999999999999')}>
        Attempt Unauthorized Switch
      </button>
      <button type="button" onClick={() => void signOut()}>
        Do Sign Out
      </button>
    </div>
  );
}

describe('Stage 09 AuthContext Security, Authorized Business Switcher & Logout', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    window.localStorage.clear();
    mockSignOut.mockClear();
    mockGetSession.mockResolvedValue({
      data: {
        session: {
          access_token: 'valid-jwt-token',
          user: { id: 'user-1', email: 'adaeze@festola.ng' },
        },
      },
    });
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sanitizes tampered localStorage businessId, rejects unauthorized switches, and calls POST /api/v1/auth/logout on signOut', async () => {
    window.localStorage.setItem(
      ACTIVE_BUSINESS_STORAGE_KEY,
      '99999999-9999-4999-8999-999999999999',
    );

    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/api/v1/auth/me')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              profile: {
                id: 'user-1',
                email: 'adaeze@festola.ng',
                fullName: 'Adaeze Okafor',
                phone: null,
                acceptedTermsAt: '2026-01-01T00:00:00Z',
              },
              memberships: [BIZ_A, BIZ_B],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/auth/logout')) {
        return new Response(JSON.stringify({ success: true, data: { signedOut: true } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: false }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    render(
      <AuthProvider>
        <AuthHarness />
      </AuthProvider>,
    );

    // Tampered storage value must be ignored and overwritten with authorized BIZ_A
    await waitFor(() => {
      expect(screen.getByTestId('active-biz')).toHaveTextContent(BIZ_A.businessId);
    });
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(BIZ_A.businessId);

    // Attempting an unauthorized switch must be rejected without changing active business or epoch
    fireEvent.click(screen.getByRole('button', { name: /Attempt Unauthorized Switch/i }));
    expect(screen.getByTestId('active-biz')).toHaveTextContent(BIZ_A.businessId);
    expect(screen.getByTestId('epoch')).toHaveTextContent('0');

    // Authorized switch succeeds and increments tenantEpoch to reset tenant state
    fireEvent.click(screen.getByRole('button', { name: /Switch to B/i }));
    expect(screen.getByTestId('active-biz')).toHaveTextContent(BIZ_B.businessId);
    expect(screen.getByTestId('epoch')).toHaveTextContent('1');
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBe(BIZ_B.businessId);

    // Sign out calls POST /api/v1/auth/logout, clears storage, and calls supabase.auth.signOut
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Do Sign Out/i }));
    });
    expect(
      fetchMock.mock.calls.some(([url, init]) => {
        const opts = init as RequestInit | undefined;
        return String(url).endsWith('/api/v1/auth/logout') && opts?.method === 'POST';
      }),
    ).toBe(true);
    expect(mockSignOut).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(ACTIVE_BUSINESS_STORAGE_KEY)).toBeNull();
  });

  it('routes users with EMAIL_NOT_VERIFIED from /app/dashboard to /verify-email', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: false,
          error: {
            code: 'EMAIL_NOT_VERIFIED',
            message: 'Email address not verified.',
            details: {},
          },
        }),
        { status: 403, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('heading', { name: /Verify your email address/i }),
    ).toBeInTheDocument();
  });
});
