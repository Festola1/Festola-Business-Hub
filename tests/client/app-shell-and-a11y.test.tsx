import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppShell } from '../../src/components/layout/AppShell';
import { ErrorBoundary } from '../../src/components/ui/ErrorBoundary';
import { AuthContext, type AuthContextValue } from '../../src/contexts/AuthContext';
import type { TenantMembershipSummary } from '../../src/lib/identity-api';
import ModuleStagePlaceholderPage from '../../src/pages/app/ModuleStagePlaceholderPage';
import NotFoundPage from '../../src/pages/NotFoundPage';

const BIZ_OWNER: TenantMembershipSummary = {
  businessId: '11111111-1111-4111-8111-111111111111',
  businessName: 'Festola Demo Store',
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
  defaultLocationId: 'loc-1',
};

const BIZ_CASHIER: TenantMembershipSummary = {
  businessId: '22222222-2222-4222-8222-222222222222',
  businessName: 'Ikeja Branch',
  userId: 'user-1',
  role: 'cashier',
  membershipStatus: 'active',
  subscriptionStatus: 'active',
  limits: {
    planId: 'plan-1',
    planCode: 'tier_1',
    displayName: 'Capacity Tier',
    maxStaff: 10,
    maxProducts: 1000,
    maxOfflineDevices: 5,
  },
  defaultLocationId: 'loc-2',
};

function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    supabaseConfigured: true,
    isLoading: false,
    session: null,
    accessToken: 'jwt-token',
    profile: {
      id: 'user-1',
      email: 'owner@festola.ng',
      fullName: 'Adaeze Okafor',
      phone: null,
      acceptedTermsAt: '2026-01-01T00:00:00Z',
    },
    memberships: [BIZ_OWNER, BIZ_CASHIER],
    activeMembership: BIZ_OWNER,
    tenantEpoch: 0,
    emailNotVerified: false,
    authError: null,
    selectBusiness: vi.fn(() => true),
    refreshAccount: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  };
}

function ThrowingChild(): never {
  throw new Error('Synthetic UI failure');
}

describe('Stage 09 AppShell Keyboard A11y, ErrorBoundary & Honest Stage Labeling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('renders skip-to-content link, notifications unread count, authorized switcher, and closes drawer on Escape with focus return', async () => {
    globalThis.fetch = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          success: true,
          data: { notifications: [], unreadCount: 3 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    const selectBusiness = vi.fn(() => true);
    render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={makeAuthValue({ selectBusiness })}>
          <Routes>
            <Route path="/" element={<div>Public Landing View</div>} />
            <Route path="/app" element={<AppShell />}>
              <Route
                path="dashboard"
                element={
                  <ModuleStagePlaceholderPage
                    title="Dashboard"
                    stage="Stage P-06"
                    description="Daily sales summary."
                    readyEndpoints={['GET /api/v1/reports/dashboard']}
                  />
                }
              />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    // Skip link targets #main-content and Landing Page link targets /
    const skipLink = screen.getByRole('link', { name: /Skip to main content/i });
    expect(skipLink).toHaveAttribute('href', '#main-content');
    expect(document.getElementById('main-content')).toBeInTheDocument();
    const landingLink = screen.getByRole('link', { name: /Go to landing page/i });
    expect(landingLink).toHaveAttribute('href', '/');

    // Unread notification counter loads from Stage 08 GET /api/v1/notifications
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Notifications \(3 unread\)/i })).toBeInTheDocument();
    });

    // Authorized business switcher lists only server memberships
    const switcher = screen.getByLabelText(/Switch active business/i);
    fireEvent.change(switcher, { target: { value: BIZ_CASHIER.businessId } });
    expect(selectBusiness).toHaveBeenCalledWith(BIZ_CASHIER.businessId);

    // Mobile/tablet drawer opens, is dialog, closes on Escape, and restores focus to menu button
    const menuTrigger = screen.getByRole('button', { name: /Open navigation menu/i });
    menuTrigger.focus();
    fireEvent.click(menuTrigger);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(menuTrigger);

    // Honest non-masquerading stage placeholder notice
    expect(screen.getByText(/UI Stage Pending \(Stage P-06\)/i)).toBeInTheDocument();
    expect(screen.getByText(/GET \/api\/v1\/reports\/dashboard/i)).toBeInTheDocument();
  });

  it('catches render errors inside ErrorBoundary and displays branded recovery UI', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary compact>
        <ThrowingChild />
      </ErrorBoundary>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      /This screen ran into an unexpected display error/i,
    );
    expect(screen.getByRole('button', { name: /Reload view/i })).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it('renders branded NotFoundPage with safe return navigation', () => {
    render(
      <MemoryRouter initialEntries={['/unknown-route']}>
        <AuthContext.Provider value={makeAuthValue({ session: null, activeMembership: null })}>
          <NotFoundPage />
        </AuthContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText(/404 · Page not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to home page/i })).toHaveAttribute('href', '/');
  });
});
