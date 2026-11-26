import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/ui/ToastProvider';
import { AuthContext, type AuthContextValue } from '../../src/contexts/AuthContext';
import { FirebaseContext, type FirebaseContextValue } from '../../src/contexts/FirebaseContext';
import {
  buildInvitationAcceptUrl,
  buildStaffInvitationMimeMessage,
  encodeBase64UrlUtf8,
  sendStaffInvitationEmail,
} from '../../src/lib/gmail-invite';
import { getSafeRedirectPath } from '../../src/lib/redirect';
import StaffPage from '../../src/pages/app/StaffPage';
import AcceptInvitePage from '../../src/pages/auth/AcceptInvitePage';

function makeAuthValue(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    supabaseConfigured: false,
    isLoading: false,
    session: null,
    accessToken: 'owner-jwt-token',
    profile: {
      id: 'user-owner-1',
      email: 'owner@festola.ng',
      fullName: 'Adaeze Okafor',
      phone: null,
      acceptedTermsAt: '2026-01-01T00:00:00.000Z',
    },
    memberships: [
      {
        businessId: 'biz-1',
        businessName: 'Festola Retail Hub',
        userId: 'user-owner-1',
        role: 'owner',
        membershipStatus: 'active',
        subscriptionStatus: 'active',
        limits: {
          planId: 'plan-growth',
          planCode: 'growth',
          displayName: 'Growth',
          maxStaff: 5,
          maxProducts: 500,
          maxOfflineDevices: 3,
        },
        defaultLocationId: 'loc-1',
      },
    ],
    activeMembership: {
      businessId: 'biz-1',
      businessName: 'Festola Retail Hub',
      userId: 'user-owner-1',
      role: 'owner',
      membershipStatus: 'active',
      subscriptionStatus: 'active',
      limits: {
        planId: 'plan-growth',
        planCode: 'growth',
        displayName: 'Growth',
        maxStaff: 5,
        maxProducts: 500,
        maxOfflineDevices: 3,
      },
      defaultLocationId: 'loc-1',
    },
    tenantEpoch: 0,
    emailNotVerified: false,
    authError: null,
    selectBusiness: vi.fn().mockReturnValue(true),
    refreshAccount: vi.fn().mockResolvedValue(undefined),
    signOut: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeFirebaseValue(overrides: Partial<FirebaseContextValue> = {}): FirebaseContextValue {
  return {
    firebaseReady: true,
    firebaseUser: null,
    firebaseDisplayName: null,
    firebaseDefaultBusinessId: null,
    firebaseBusinesses: [],
    firebaseError: null,
    gmailAccessToken: null,
    gmailSenderEmail: null,
    signInWithGoogle: vi.fn().mockResolvedValue(null),
    connectGmailSender: vi.fn().mockResolvedValue({
      accessToken: 'gmail-oauth-token-123',
      senderEmail: 'owner@festola.ng',
    }),
    clearGmailAccessToken: vi.fn(),
    signOutFirebase: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Direct Gmail staff invitations & automatic acceptance', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('validates safe relative redirect paths and blocks external or protocol-relative redirects', () => {
    expect(getSafeRedirectPath('/accept-invite?token=abc123')).toBe('/accept-invite?token=abc123');
    expect(getSafeRedirectPath('https://evil.example/steal')).toBeNull();
    expect(getSafeRedirectPath('//evil.example/steal')).toBeNull();
    expect(getSafeRedirectPath('/\\evil.example')).toBeNull();
    expect(getSafeRedirectPath(null)).toBeNull();
  });

  it('builds sanitized RFC 2822 invitation MIME messages and sends via Gmail API', async () => {
    const acceptUrl = buildInvitationAcceptUrl('tok_live_123', 'https://hub.festola.ng');
    expect(acceptUrl).toBe('https://hub.festola.ng/accept-invite?token=tok_live_123');

    const mime = buildStaffInvitationMimeMessage({
      toEmail: 'cashier@festola.ng\r\nBcc: evil@attacker.test',
      businessName: 'Festola <Retail> & Co',
      role: 'cashier',
      inviterName: 'Adaeze Okafor',
      acceptUrl,
      expiresAt: '2026-12-10T00:00:00.000Z',
    });

    expect(mime).toContain('To: cashier@festola.ng Bcc: evil@attacker.test');
    expect(mime).not.toContain('\r\nBcc:');
    expect(mime).toContain('Festola &lt;Retail&gt; &amp; Co');
    expect(mime).toContain(acceptUrl);
    expect(encodeBase64UrlUtf8('hello+world/test=')).not.toMatch(/[+/=]/);

    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 'gmail-msg-1' }, 200));
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await sendStaffInvitationEmail({
      gmailAccessToken: 'gmail-access-token',
      toEmail: 'cashier@festola.ng',
      businessName: 'Festola Retail Hub',
      role: 'cashier',
      inviterName: 'Adaeze Okafor',
      acceptUrl,
      expiresAt: '2026-12-10T00:00:00.000Z',
    });

    expect(result).toEqual({ ok: true, messageId: 'gmail-msg-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer gmail-access-token',
          'Content-Type': 'application/json',
        }),
      }),
    );
  });

  it('requires explicit confirmation before creating and emailing a staff invitation via Gmail', async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input.toString();
        if (url.endsWith('/api/v1/staff') && (!init?.method || init.method === 'GET')) {
          return jsonResponse({
            success: true,
            data: {
              members: [
                {
                  id: 'mem-1',
                  businessId: 'biz-1',
                  userId: 'user-owner-1',
                  role: 'owner',
                  status: 'active',
                  email: 'owner@festola.ng',
                  fullName: 'Adaeze Okafor',
                  revokedAt: null,
                  createdAt: '2026-11-01T00:00:00.000Z',
                },
              ],
              pendingInvitations: [],
            },
          });
        }
        if (url.endsWith('/api/v1/staff/invitations') && init?.method === 'POST') {
          return jsonResponse(
            {
              success: true,
              data: {
                invitation: {
                  id: 'inv-1',
                  businessId: 'biz-1',
                  email: 'cashier@festola.ng',
                  role: 'cashier',
                  status: 'pending',
                  expiresAt: '2026-12-10T00:00:00.000Z',
                  createdAt: '2026-11-25T00:00:00.000Z',
                },
                inviteToken: 'one-time-token-xyz',
              },
            },
            201,
          );
        }
        if (url === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
          return jsonResponse({ id: 'gmail-msg-99' }, 200);
        }
        throw new Error(`Unexpected fetch URL: ${url}`);
      });
    global.fetch = fetchMock as unknown as typeof fetch;

    const connectGmailSender = vi.fn().mockResolvedValue({
      accessToken: 'gmail-live-token',
      senderEmail: 'owner@festola.ng',
    });

    render(
      <MemoryRouter>
        <FirebaseContext.Provider value={makeFirebaseValue({ connectGmailSender })}>
          <AuthContext.Provider value={makeAuthValue()}>
            <ToastProvider>
              <StaffPage />
            </ToastProvider>
          </AuthContext.Provider>
        </FirebaseContext.Provider>
      </MemoryRouter>,
    );

    const emailInput = await screen.findByLabelText(/staff email address/i);
    fireEvent.change(emailInput, { target: { value: 'cashier@festola.ng' } });
    fireEvent.click(screen.getByRole('button', { name: /send invitation/i }));

    // Explicit confirmation dialog must appear before any invitation or email is sent
    expect(await screen.findByText(/send staff invitation email/i)).toBeInTheDocument();
    expect(connectGmailSender).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /confirm & send email/i }));

    await waitFor(() => {
      expect(connectGmailSender).toHaveBeenCalledTimes(1);
    });

    expect(
      await screen.findByText(/invitation email sent directly to cashier@festola\.ng/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/one-time-token-xyz/i)).not.toBeInTheDocument();
  });

  it('automatically accepts a URL invitation token when signed in and redirects to dashboard', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        success: true,
        data: {
          membership: {
            id: 'mem-cashier',
            businessId: 'biz-joined-99',
            userId: 'user-cashier-2',
            role: 'cashier',
            status: 'active',
            revokedAt: null,
            createdAt: '2026-11-25T00:00:00.000Z',
          },
        },
      }),
    );
    global.fetch = fetchMock as unknown as typeof fetch;

    const selectBusiness = vi.fn().mockReturnValue(true);
    const refreshAccount = vi.fn().mockResolvedValue(undefined);

    render(
      <MemoryRouter initialEntries={['/accept-invite?token=auto-token-1234567890']}>
        <FirebaseContext.Provider value={makeFirebaseValue()}>
          <AuthContext.Provider
            value={makeAuthValue({
              accessToken: 'cashier-jwt-token',
              selectBusiness,
              refreshAccount,
            })}
          >
            <ToastProvider>
              <Routes>
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
                <Route path="/app/dashboard" element={<div>Joined Dashboard View</div>} />
              </Routes>
            </ToastProvider>
          </AuthContext.Provider>
        </FirebaseContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Joined Dashboard View')).toBeInTheDocument();
    expect(selectBusiness).toHaveBeenCalledWith('biz-joined-99', { allowPendingRefresh: true });
    expect(refreshAccount).toHaveBeenCalledTimes(1);
  });

  it('offers one-click Google sign-in and redirect-preserving email links when unauthenticated', async () => {
    render(
      <MemoryRouter initialEntries={['/accept-invite?token=pending-token-9999']}>
        <FirebaseContext.Provider value={makeFirebaseValue()}>
          <AuthContext.Provider value={makeAuthValue({ accessToken: null, profile: null })}>
            <ToastProvider>
              <Routes>
                <Route path="/accept-invite" element={<AcceptInvitePage />} />
              </Routes>
            </ToastProvider>
          </AuthContext.Provider>
        </FirebaseContext.Provider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByRole('button', { name: /continue with google & accept automatically/i }),
    ).toBeInTheDocument();

    const emailSignInLink = screen.getByRole('link', { name: /sign in with email/i });
    expect(emailSignInLink.getAttribute('href')).toContain(
      '/login?redirect=%2Faccept-invite%3Ftoken%3Dpending-token-9999',
    );
  });
});
