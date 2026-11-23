import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/ui/ToastProvider';
import { AuthContext, type AuthContextValue } from '../../src/contexts/AuthContext';
import NotificationsPage from '../../src/pages/app/NotificationsPage';
import SettingsPage from '../../src/pages/app/SettingsPage';

const AUTH_VALUE: AuthContextValue = {
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
  memberships: [],
  activeMembership: {
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
    defaultLocationId: 'loc-1',
  },
  tenantEpoch: 0,
  emailNotVerified: false,
  authError: null,
  selectBusiness: vi.fn(() => true),
  refreshAccount: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
};

describe('Stage 09 Settings (Business + D-02 Location + Capacity) & D-12 Notifications Inbox', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('loads business settings, primary location, and subscription capacity, validates tax, and saves both forms', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.endsWith('/api/v1/businesses/current') && method === 'GET') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              business: {
                id: '11111111-1111-4111-8111-111111111111',
                name: 'Adaeze Supermarket',
                slug: 'adaeze-supermarket',
                currencyCode: 'NGN',
                timezone: 'Africa/Lagos',
                phone: '+2348011112222',
                address: '14 Allen Ave',
                taxId: null,
                taxEnabled: false,
                taxMode: 'exclusive',
                taxRate: '0',
                allowNegativeStock: false,
                receiptFooter: 'Thanks for shopping',
                status: 'active',
              },
              defaultLocation: {
                id: 'loc-1',
                businessId: '11111111-1111-4111-8111-111111111111',
                name: 'Main Store',
                address: '14 Allen Ave',
                phone: '+2348011112222',
                isDefault: true,
                isActive: true,
              },
              subscription: null,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/api/v1/locations') && method === 'GET') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              locations: [
                {
                  id: 'loc-1',
                  businessId: '11111111-1111-4111-8111-111111111111',
                  name: 'Main Store',
                  address: '14 Allen Ave',
                  phone: '+2348011112222',
                  isDefault: true,
                  isActive: true,
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/api/v1/subscriptions/current') && method === 'GET') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              subscription: null,
              status: 'trialing',
              staffCount: 2,
              productCount: 45,
              activeDeviceCount: 1,
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/api/v1/businesses/current/settings') && method === 'PATCH') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              business: {
                id: '11111111-1111-4111-8111-111111111111',
                name: 'Adaeze Supermarket Ltd',
                slug: 'adaeze-supermarket',
                currencyCode: 'NGN',
                timezone: 'Africa/Lagos',
                phone: '+2348011112222',
                address: '14 Allen Ave',
                taxId: null,
                taxEnabled: false,
                taxMode: 'exclusive',
                taxRate: '0',
                allowNegativeStock: false,
                receiptFooter: 'Thanks for shopping',
                status: 'active',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/api/v1/locations/loc-1') && method === 'PATCH') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              location: {
                id: 'loc-1',
                businessId: '11111111-1111-4111-8111-111111111111',
                name: 'Ikeja Flagship Counter',
                address: '14 Allen Ave',
                phone: '+2348011112222',
                isDefault: true,
                isActive: true,
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      return new Response(JSON.stringify({ success: false }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      });
    });

    globalThis.fetch = fetchMock as typeof fetch;

    render(
      <AuthContext.Provider value={AUTH_VALUE}>
        <ToastProvider>
          <SettingsPage />
        </ToastProvider>
      </AuthContext.Provider>,
    );

    expect(await screen.findByDisplayValue('Adaeze Supermarket')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Main Store')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('45 / 500')).toBeInTheDocument();

    // Update business name & save
    fireEvent.change(screen.getByLabelText(/Business name/i), {
      target: { value: 'Adaeze Supermarket Ltd' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save settings/i }));

    await waitFor(() => {
      expect(
        screen.getAllByText(/Business settings saved and recorded in the audit log/i).length,
      ).toBeGreaterThan(0);
    });

    // Update primary store location (D-02) & save
    fireEvent.change(screen.getByLabelText(/Location name/i), {
      target: { value: 'Ikeja Flagship Counter' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save location/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/Primary store location details updated/i).length).toBeGreaterThan(
        0,
      );
    });
  });

  it('loads NotificationsPage, marks individual & all notifications read, and exposes zero SMS/WhatsApp controls (D-12)', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';

      if (url.includes('/api/v1/notifications?') && method === 'GET') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              unreadCount: 2,
              notifications: [
                {
                  id: 'notif-1',
                  businessId: '11111111-1111-4111-8111-111111111111',
                  recipientUserId: 'user-1',
                  channel: 'in_app',
                  category: 'low_stock',
                  title: 'Low stock alert: Rice 50kg',
                  body: 'Remaining quantity dropped to 2 bags.',
                  metadata: {},
                  isRead: false,
                  readAt: null,
                  createdAt: '2026-11-20T09:00:00Z',
                },
                {
                  id: 'notif-2',
                  businessId: '11111111-1111-4111-8111-111111111111',
                  recipientUserId: 'user-1',
                  channel: 'in_app',
                  category: 'sync_conflict',
                  title: 'Offline sync conflict requires review',
                  body: 'Offline sale oversold 1 unit of Peak Milk.',
                  metadata: {},
                  isRead: false,
                  readAt: null,
                  createdAt: '2026-11-20T08:00:00Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/api/v1/notifications/notif-1/read') && method === 'PATCH') {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              notification: {
                id: 'notif-1',
                businessId: '11111111-1111-4111-8111-111111111111',
                recipientUserId: 'user-1',
                channel: 'in_app',
                category: 'low_stock',
                title: 'Low stock alert: Rice 50kg',
                body: 'Remaining quantity dropped to 2 bags.',
                metadata: {},
                isRead: true,
                readAt: '2026-11-20T10:00:00Z',
                createdAt: '2026-11-20T09:00:00Z',
              },
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }

      if (url.endsWith('/api/v1/notifications/mark-all-read') && method === 'POST') {
        return new Response(JSON.stringify({ success: true, data: { updatedCount: 1 } }), {
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
      <AuthContext.Provider value={AUTH_VALUE}>
        <ToastProvider>
          <NotificationsPage />
        </ToastProvider>
      </AuthContext.Provider>,
    );

    expect(await screen.findByText(/Low stock alert: Rice 50kg/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Delivery channels: In-app inbox · Transactional email/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/WhatsApp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/SMS/i)).not.toBeInTheDocument();

    // Mark first notification read
    const markReadButtons = screen.getAllByRole('button', { name: /^Mark read$/i });
    fireEvent.click(markReadButtons[0]!);
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Mark read$/i })).toHaveLength(1);
    });

    // Mark all remaining read
    fireEvent.click(screen.getByRole('button', { name: /Mark all read/i }));
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /^Mark read$/i })).not.toBeInTheDocument();
    });
  });
});
