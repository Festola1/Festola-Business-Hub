import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../src/App';
import { AppShell } from '../../src/components/layout/AppShell';
import { ConfirmDialog } from '../../src/components/ui/ConfirmDialog';
import { DataTable } from '../../src/components/ui/DataTable';
import { Pagination } from '../../src/components/ui/Pagination';
import { ToastProvider } from '../../src/components/ui/ToastProvider';
import { AuthContext, type AuthContextValue } from '../../src/contexts/AuthContext';
import { enqueueOfflineSale } from '../../src/lib/offline-store';
import { getVisibleNavItems } from '../../src/lib/permissions';
import { emitWorkspaceEvent } from '../../src/lib/workspace-events';
import DashboardPage from '../../src/pages/app/DashboardPage';

const BIZ_ID = '11111111-1111-4111-8111-111111111111';

function buildAuth(
  role: 'owner' | 'manager' | 'cashier' = 'owner',
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  return {
    supabaseConfigured: true,
    isLoading: false,
    session: {
      access_token: 'jwt-token',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-1',
        email: `${role}@festola.ng`,
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: '2026-01-01T00:00:00Z',
      },
    } as AuthContextValue['session'],
    accessToken: 'jwt-token',
    profile: {
      id: 'user-1',
      email: `${role}@festola.ng`,
      fullName: `Adaeze (${role})`,
      phone: null,
      acceptedTermsAt: '2026-01-01T00:00:00Z',
    },
    memberships: [
      {
        businessId: BIZ_ID,
        businessName: 'Adaeze Supermarket',
        userId: 'user-1',
        role,
        membershipStatus: 'active',
        subscriptionStatus: 'active',
        limits: {
          planId: 'plan-growth',
          planCode: 'growth',
          displayName: 'Growth Plan',
          maxStaff: 10,
          maxProducts: 1000,
          maxOfflineDevices: 5,
        },
        defaultLocationId: 'loc-1',
      },
    ],
    activeMembership: {
      businessId: BIZ_ID,
      businessName: 'Adaeze Supermarket',
      userId: 'user-1',
      role,
      membershipStatus: 'active',
      subscriptionStatus: 'active',
      limits: {
        planId: 'plan-growth',
        planCode: 'growth',
        displayName: 'Growth Plan',
        maxStaff: 10,
        maxProducts: 1000,
        maxOfflineDevices: 5,
      },
      defaultLocationId: 'loc-1',
    },
    tenantEpoch: 0,
    emailNotVerified: false,
    authError: null,
    selectBusiness: vi.fn(() => true),
    refreshAccount: vi.fn(async () => undefined),
    refreshAccessToken: vi.fn(async () => null),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Reactive Protected Shell, Reference Dashboard, Release 2 Exclusion & UI Primitives', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('excludes Release 2 navigation (Purchases, Suppliers) by default while keeping all 12 core Release 1 screens', () => {
    const release1OwnerPaths = getVisibleNavItems('owner').map((item) => item.path);
    expect(release1OwnerPaths).toEqual(
      expect.arrayContaining([
        '/app/dashboard',
        '/app/pos',
        '/app/sales',
        '/app/products',
        '/app/inventory',
        '/app/customers',
        '/app/debts',
        '/app/expenses',
        '/app/reports',
        '/app/staff',
        '/app/subscription',
        '/app/settings',
      ]),
    );
    expect(release1OwnerPaths).not.toContain('/app/purchases');
    expect(release1OwnerPaths).not.toContain('/app/suppliers');

    // Opt-in Release 2 flag restores Purchases & Suppliers cleanly
    const withR2 = getVisibleNavItems('owner', { includeRelease2: true }).map((i) => i.path);
    expect(withR2).toContain('/app/purchases');
    expect(withR2).toContain('/app/suppliers');
  });

  it('updates AppShell online/offline/sync indicator reactively when offline sales are queued or connectivity changes', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ notifications: [], unreadCount: 0 }),
    ) as typeof fetch;

    render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('owner')}>
          <Routes>
            <Route path="/app" element={<AppShell />}>
              <Route path="dashboard" element={<div>Dashboard Content</div>} />
            </Route>
          </Routes>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /Online and synced/i })).toBeInTheDocument();

    act(() => {
      enqueueOfflineSale(BIZ_ID, {
        clientOperationUuid: 'op-1',
        occurredAt: new Date().toISOString(),
        offlineReceiptNumber: 'OFF-DEV1-0001',
        deviceId: 'dev-1',
        estimatedTotal: '4500.00',
        itemSummary: 'Peak Milk x3',
        payload: {
          clientSaleUuid: 'sale-uuid-1',
          deviceId: 'dev-1',
          offlineReceiptNumber: 'OFF-DEV1-0001',
          items: [{ productId: 'p1', quantity: '3', discountAmount: '0.00' }],
          payments: [{ method: 'cash', amount: '4500.00' }],
        },
      });
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Online, 1 pending sync/i })).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new window.Event('offline'));
    });

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Offline mode, 1 queued/i })).toBeInTheDocument();
    });

    act(() => {
      window.dispatchEvent(new window.Event('online'));
    });
  });

  it('refreshes DashboardPage KPIs reactively on workspace events and requires authentication without dev fixtures when token is absent', async () => {
    let summaryCallCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/reports/summary')) {
        summaryCallCount += 1;
        return jsonResponse({
          summary: {
            salesCount: summaryCallCount === 1 ? 10 : 11,
            grossSales: summaryCallCount === 1 ? '100000.00' : '125000.00',
            returnsAndVoids: '0.00',
            netSales: summaryCallCount === 1 ? '100000.00' : '125000.00',
            cashCollectedOnSales: '90000.00',
            creditExtended: '10000.00',
            taxCollected: '0.00',
            cogs: '60000.00',
            grossProfit: '40000.00',
            operatingExpenses: '12000.00',
            netOperatingProfit: '28000.00',
            outstandingReceivables: '10000.00',
          },
        });
      }
      if (url.includes('/reports/sales-by-day')) {
        return jsonResponse({
          series: [
            { date: '2026-11-23', netSales: '45000.00', salesCount: 4 },
            { date: '2026-11-24', netSales: '55000.00', salesCount: 6 },
          ],
        });
      }
      if (url.includes('/product-categories')) {
        return jsonResponse({
          categories: [
            {
              id: 'cat-1',
              businessId: BIZ_ID,
              name: 'Beverages',
              description: null,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/products?')) {
        return jsonResponse({
          products: [
            {
              id: 'p1',
              businessId: BIZ_ID,
              categoryId: 'cat-1',
              sku: 'BEV-1',
              barcode: null,
              name: 'Milo Tin',
              unit: 'tin',
              sellingPrice: '4500.00',
              onHand: '2',
              reorderLevel: '5',
              isTaxExempt: false,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/sales?')) {
        return jsonResponse({ sales: [] });
      }
      if (url.includes('/customers?')) {
        return jsonResponse({ customers: [] });
      }
      return jsonResponse({});
    }) as typeof fetch;

    const { unmount } = render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('owner')}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('₦100,000.00')).toBeInTheDocument();
    expect(screen.getByText(/Sales by Category/i)).toBeInTheDocument();
    expect(screen.getByText(/Module API & Pending Integrations Tracker/i)).toBeInTheDocument();

    // Emit reactive sales event — Dashboard refetches immediately without page reload
    act(() => {
      emitWorkspaceEvent(BIZ_ID, 'sales');
    });

    await waitFor(() => {
      expect(screen.getByText('₦125,000.00')).toBeInTheDocument();
    });
    expect(summaryCallCount).toBe(2);
    unmount();

    // Without REST accessToken, never show temporary fixtures or fake ₦0.00 — show session_expired honestly
    render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('owner', { accessToken: null })}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Session expired — sign in required/i)).toBeInTheDocument();
    expect(screen.queryByText(/Temporary Development Fixture Active/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Switch to empty state/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('₦0.00')).not.toBeInTheDocument();
  });

  it('renders verified empty states only on 200 OK, and never disguises 500/403/401/offline failures with ₦0.00', async () => {
    // 1. Verified empty database state (200 OK with empty records)
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/reports/summary')) {
        return jsonResponse({
          summary: {
            salesCount: 0,
            grossSales: '0.00',
            returnsAndVoids: '0.00',
            netSales: '0.00',
            cashCollectedOnSales: '0.00',
            creditExtended: '0.00',
            taxCollected: '0.00',
            cogs: '0.00',
            grossProfit: '0.00',
            operatingExpenses: '0.00',
            netOperatingProfit: '0.00',
            outstandingReceivables: '0.00',
          },
        });
      }
      if (url.includes('/reports/sales-by-day')) return jsonResponse({ series: [] });
      if (url.includes('/reports/sales-by-category')) return jsonResponse({ categories: [] });
      if (url.includes('/reports/inventory-valuation')) {
        return jsonResponse({
          valuation: {
            activeProductCount: 0,
            totalUnitsOnHand: '0',
            totalCostValuation: '0.00',
            totalRetailValue: '0.00',
          },
        });
      }
      if (url.includes('/product-categories')) return jsonResponse({ categories: [] });
      if (url.includes('/products?')) return jsonResponse({ products: [] });
      if (url.includes('/sales?')) return jsonResponse({ sales: [] });
      if (url.includes('/customers?')) return jsonResponse({ customers: [] });
      if (url.includes('/debt-payments')) return jsonResponse({ debtPayments: [] });
      if (url.includes('/subscriptions/current')) {
        return jsonResponse({
          status: 'trialing',
          subscription: {
            displayName: '14-Day Free Trial',
            maxStaff: 3,
            maxProducts: 500,
            maxOfflineDevices: 2,
          },
          staffCount: 1,
          productCount: 0,
          activeDeviceCount: 0,
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    const { unmount: unmountEmpty } = render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('owner')}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('No recent transactions')).toBeInTheDocument();
    expect(screen.getAllByText('₦0.00').length).toBeGreaterThanOrEqual(4);
    expect(screen.getAllByText('No inventory records').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('No sales data available').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Subscription Status')).toBeInTheDocument();
    expect(screen.getByText('Customer Payments')).toBeInTheDocument();
    unmountEmpty();

    // 2. Backend connection failure (500) must show ErrorState and NEVER render ₦0.00
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'INTERNAL_ERROR', message: 'Database unavailable', details: {} },
          }),
          { status: 500, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof fetch;

    const { unmount: unmountError } = render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('owner')}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Unable to load live business data/i)).toBeInTheDocument();
    expect(screen.queryByText('₦0.00')).not.toBeInTheDocument();
    unmountError();

    // 3. Unauthorized access (403 PERMISSION_DENIED) must show PermissionDeniedState without ₦0.00
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'PERMISSION_DENIED', message: 'Tenant access denied', details: {} },
          }),
          { status: 403, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof fetch;

    const { unmount: unmountForbidden } = render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('owner')}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Unauthorized workspace access/i)).toBeInTheDocument();
    expect(screen.queryByText('₦0.00')).not.toBeInTheDocument();
    unmountForbidden();

    // 4. Expired session (401 UNAUTHENTICATED) calls refreshAccessToken once before showing session_expired
    const refreshAccessToken = vi.fn(async () => null);
    globalThis.fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'UNAUTHENTICATED', message: 'Token expired', details: {} },
          }),
          { status: 401, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof fetch;

    const { unmount: unmountExpired } = render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('owner', { refreshAccessToken })}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Session expired — sign in required/i)).toBeInTheDocument();
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('₦0.00')).not.toBeInTheDocument();
    unmountExpired();

    // 5. Offline operation: serves cached snapshot saved from step 1 with sync timestamp, or uncached notice for another tenant
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      get: () => false,
    });
    try {
      const { unmount: unmountOfflineCached } = render(
        <MemoryRouter initialEntries={['/app/dashboard']}>
          <AuthContext.Provider value={buildAuth('owner')}>
            <ToastProvider>
              <DashboardPage />
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      expect(
        await screen.findByText(/Offline mode — displaying last synced workspace data/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/Last synchronized on/i)).toBeInTheDocument();
      unmountOfflineCached();

      // Another tenant with no cached snapshot gets offline_no_cache without fake ₦0.00
      const otherBizId = '22222222-2222-4222-8222-222222222222';
      const { unmount: unmountOfflineUncached } = render(
        <MemoryRouter initialEntries={['/app/dashboard']}>
          <AuthContext.Provider
            value={buildAuth('owner', {
              activeMembership: {
                ...buildAuth('owner').activeMembership!,
                businessId: otherBizId,
                businessName: 'Uncached Store',
              },
            })}
          >
            <ToastProvider>
              <DashboardPage />
            </ToastProvider>
          </AuthContext.Provider>
        </MemoryRouter>,
      );

      expect(
        await screen.findByText(/Offline — no synced dashboard snapshot available/i),
      ).toBeInTheDocument();
      expect(screen.queryByText('₦0.00')).not.toBeInTheDocument();
      unmountOfflineUncached();
    } finally {
      Object.defineProperty(window.navigator, 'onLine', {
        configurable: true,
        get: () => true,
      });
    }
  });

  it('renders PermissionDeniedState when a Cashier navigates directly to a restricted Owner route (/app/settings)', async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ notifications: [], unreadCount: 0 }),
    ) as typeof fetch;

    render(
      <MemoryRouter initialEntries={['/app/settings']}>
        <AuthContext.Provider value={buildAuth('cashier')}>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/You do not have permission to open this screen/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Return to Dashboard/i })).toHaveAttribute(
      'href',
      '/app/dashboard',
    );
  });

  it('supports sorting in DataTable, page transitions in Pagination, and Escape/confirm in ConfirmDialog', () => {
    const onPageChange = vi.fn();
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <div>
        <DataTable
          caption="Test catalog"
          rows={[
            { id: '2', name: 'Zebra Pen', amount: 500 },
            { id: '1', name: 'Apple Juice', amount: 1200 },
          ]}
          rowKey={(r) => r.id}
          columns={[
            { key: 'name', header: 'Item', sortValue: (r) => r.name, render: (r) => r.name },
            {
              key: 'amount',
              header: 'Amount',
              align: 'right',
              sortValue: (r) => r.amount,
              render: (r) => r.amount,
            },
          ]}
        />
        <Pagination
          page={1}
          pageSize={10}
          totalItems={24}
          onPageChange={onPageChange}
          itemLabel="records"
        />
        <ConfirmDialog
          open
          title="Confirm archive"
          description="This action archives the item."
          confirmLabel="Archive"
          onConfirm={onConfirm}
          onClose={onClose}
        />
      </div>,
    );

    // Sort by Item ascending
    fireEvent.click(screen.getByRole('button', { name: /Item/i }));
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Apple Juice');

    // Pagination next page
    fireEvent.click(screen.getByRole('button', { name: /Next page/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    // ConfirmDialog actions
    fireEvent.click(screen.getByRole('button', { name: /^Archive$/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('supports category cross-filtering, live sales filtering, Sale Detail preview, inline Quick Restock (RBAC-gated), and focus revalidation', async () => {
    let summaryFetches = 0;
    let adjustmentPosted = false;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/inventory/adjustments') && init?.method === 'POST') {
        adjustmentPosted = true;
        return jsonResponse({
          movement: { id: 'mov-1' },
          product: { id: 'p-milo', onHand: '12' },
        });
      }
      if (url.includes('/reports/summary')) {
        summaryFetches += 1;
        return jsonResponse({
          summary: {
            salesCount: 8,
            grossSales: '200000.00',
            returnsAndVoids: '0.00',
            netSales: '200000.00',
            cashCollectedOnSales: '160000.00',
            creditExtended: '40000.00',
            taxCollected: '0.00',
            cogs: '110000.00',
            grossProfit: '90000.00',
            operatingExpenses: '30000.00',
            netOperatingProfit: '60000.00',
            outstandingReceivables: '40000.00',
          },
        });
      }
      if (url.includes('/reports/sales-by-day')) {
        return jsonResponse({
          series: [
            { date: '2026-11-23', netSales: '90000.00', salesCount: 3 },
            { date: '2026-11-24', netSales: '110000.00', salesCount: 5 },
          ],
        });
      }
      if (url.includes('/product-categories')) {
        return jsonResponse({
          categories: [
            {
              id: 'cat-bev',
              businessId: BIZ_ID,
              name: 'Beverages',
              description: null,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
            {
              id: 'cat-grain',
              businessId: BIZ_ID,
              name: 'Grains',
              description: null,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/products?')) {
        return jsonResponse({
          products: [
            {
              id: 'p-milo',
              businessId: BIZ_ID,
              categoryId: 'cat-bev',
              sku: 'BEV-1',
              barcode: null,
              name: 'Milo Refill',
              unit: 'pack',
              sellingPrice: '4500.00',
              onHand: '2',
              reorderLevel: '10',
              isTaxExempt: false,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
            {
              id: 'p-rice',
              businessId: BIZ_ID,
              categoryId: 'cat-grain',
              sku: 'GRN-1',
              barcode: null,
              name: 'Golden Rice 5kg',
              unit: 'bag',
              sellingPrice: '15000.00',
              onHand: '1',
              reorderLevel: '8',
              isTaxExempt: false,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/sales?')) {
        return jsonResponse({
          sales: [
            {
              id: 'sale-1',
              businessId: BIZ_ID,
              locationId: 'loc-1',
              customerId: 'cust-1',
              deviceId: null,
              clientSaleUuid: 'u1',
              saleNumber: 'SL-1001',
              status: 'completed',
              paymentStatus: 'paid',
              subtotalAmount: '9000.00',
              discountAmount: '0.00',
              taxEnabledSnapshot: false,
              taxModeSnapshot: 'exclusive',
              taxRateSnapshot: '0',
              taxAmount: '0.00',
              totalAmount: '9000.00',
              amountPaid: '9000.00',
              creditAmount: '0.00',
              creditRemaining: '0.00',
              notes: null,
              soldBy: 'user-1',
              soldAt: '2026-11-24T10:00:00Z',
              createdAt: '2026-11-24T10:00:00Z',
              items: [
                {
                  id: 'si-1',
                  productId: 'p-milo',
                  productNameSnapshot: 'Milo Refill',
                  unitSnapshot: 'pack',
                  quantity: '2',
                  quantityReturned: '0',
                  unitPrice: '4500.00',
                  discountAmount: '0.00',
                  taxRateSnapshot: '0',
                  taxAmount: '0.00',
                  lineTotal: '9000.00',
                  isTaxExemptSnapshot: false,
                },
              ],
              payments: [],
              receipt: null,
              returns: [],
            },
            {
              id: 'sale-2',
              businessId: BIZ_ID,
              locationId: 'loc-1',
              customerId: null,
              deviceId: null,
              clientSaleUuid: 'u2',
              saleNumber: 'SL-1002',
              status: 'completed',
              paymentStatus: 'partial',
              subtotalAmount: '30000.00',
              discountAmount: '0.00',
              taxEnabledSnapshot: false,
              taxModeSnapshot: 'exclusive',
              taxRateSnapshot: '0',
              taxAmount: '0.00',
              totalAmount: '30000.00',
              amountPaid: '15000.00',
              creditAmount: '15000.00',
              creditRemaining: '15000.00',
              notes: null,
              soldBy: 'user-1',
              soldAt: '2026-11-24T09:00:00Z',
              createdAt: '2026-11-24T09:00:00Z',
              items: [
                {
                  id: 'si-2',
                  productId: 'p-rice',
                  productNameSnapshot: 'Golden Rice 5kg',
                  unitSnapshot: 'bag',
                  quantity: '2',
                  quantityReturned: '0',
                  unitPrice: '15000.00',
                  discountAmount: '0.00',
                  taxRateSnapshot: '0',
                  taxAmount: '0.00',
                  lineTotal: '30000.00',
                  isTaxExemptSnapshot: false,
                },
              ],
              payments: [],
              receipt: null,
              returns: [],
            },
          ],
        });
      }
      if (url.includes('/customers?')) {
        return jsonResponse({
          customers: [
            {
              id: 'cust-1',
              businessId: BIZ_ID,
              fullName: 'Chidi Stores',
              phone: '08030000000',
              email: null,
              address: null,
              creditLimit: null,
              outstandingBalance: '0.00',
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    const { unmount } = render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('owner')}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    // Wait for initial load
    expect(await screen.findByText(/Chidi Stores · SL-1001/)).toBeInTheDocument();
    expect(screen.getByText('SL-1002')).toBeInTheDocument();
    expect(screen.getByText('Milo Refill')).toBeInTheDocument();
    expect(screen.getByText('Golden Rice 5kg')).toBeInTheDocument();

    // 1. Cross-filter by clicking "Beverages" category legend button
    fireEvent.click(screen.getByRole('button', { name: 'Beverages' }));
    expect(screen.getByLabelText(/Active dashboard category filter/i)).toBeInTheDocument();
    expect(screen.getByText('Milo Refill')).toBeInTheDocument();
    expect(screen.queryByText('Golden Rice 5kg')).not.toBeInTheDocument();
    expect(screen.queryByText('SL-1002')).not.toBeInTheDocument();

    // Clear category cross-filter
    fireEvent.click(screen.getByRole('button', { name: /Clear filter/i }));
    expect(screen.getByText('Golden Rice 5kg')).toBeInTheDocument();
    expect(screen.getByText('SL-1002')).toBeInTheDocument();

    // 2. Payment status filter ("Partial") isolates SL-1002
    fireEvent.click(screen.getByRole('button', { name: 'Partial' }));
    expect(screen.getByText('SL-1002')).toBeInTheDocument();
    expect(screen.queryByText(/Chidi Stores · SL-1001/)).not.toBeInTheDocument();

    // 3. Click sale row to open inline Sale Detail preview modal
    fireEvent.click(screen.getByText('SL-1002'));
    expect(await screen.findByRole('dialog', { name: /Sale SL-1002/i })).toBeInTheDocument();
    expect(screen.getByText(/Collect Balance/i)).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    // 4. Toggle chart metric to Orders
    fireEvent.click(screen.getByRole('button', { name: 'Orders' }));
    expect(screen.getByText(/5 orders/i)).toBeInTheDocument();

    // 5. Inline Quick Restock modal posts POST /api/v1/inventory/adjustments and refreshes reactively
    fireEvent.click(screen.getByRole('button', { name: /Restock Milo Refill/i }));
    expect(
      await screen.findByRole('dialog', { name: /Quick Restock · Milo Refill/i }),
    ).toBeInTheDocument();
    const fetchesBeforeRestock = summaryFetches;
    fireEvent.click(screen.getByRole('button', { name: /Post Stock In/i }));

    await waitFor(() => {
      expect(adjustmentPosted).toBe(true);
      expect(summaryFetches).toBeGreaterThan(fetchesBeforeRestock);
    });

    // 6. Window focus triggers silent SWR revalidation without flashing full-page skeleton
    const fetchesBeforeFocus = summaryFetches;
    act(() => {
      window.dispatchEvent(new window.Event('focus'));
    });
    await waitFor(() => {
      expect(summaryFetches).toBeGreaterThan(fetchesBeforeFocus);
    });

    unmount();

    // 7. RBAC verification: Cashier does NOT see the Restock button on Low Stock rows
    render(
      <MemoryRouter initialEntries={['/app/dashboard']}>
        <AuthContext.Provider value={buildAuth('cashier')}>
          <ToastProvider>
            <DashboardPage />
          </ToastProvider>
        </AuthContext.Provider>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Milo Refill')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Restock Milo Refill/i })).not.toBeInTheDocument();
  });
});
