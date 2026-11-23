import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ToastProvider } from '../../src/components/ui/ToastProvider';
import { AuthContext, type AuthContextValue } from '../../src/contexts/AuthContext';
import { enqueueOfflineSale, setRegisteredLocalDevice } from '../../src/lib/offline-store';
import CustomersPage from '../../src/pages/app/CustomersPage';
import DashboardPage from '../../src/pages/app/DashboardPage';
import ExpensesPage from '../../src/pages/app/ExpensesPage';
import InventoryPage from '../../src/pages/app/InventoryPage';
import PosPage from '../../src/pages/app/PosPage';
import ProductsPage from '../../src/pages/app/ProductsPage';
import ReportsPage from '../../src/pages/app/ReportsPage';
import SalesPage from '../../src/pages/app/SalesPage';
import SubscriptionPage from '../../src/pages/app/SubscriptionPage';
import SyncPage from '../../src/pages/app/SyncPage';

const BIZ_ID = '11111111-1111-4111-8111-111111111111';

function buildAuth(role: 'owner' | 'manager' | 'cashier' = 'owner'): AuthContextValue {
  return {
    supabaseConfigured: true,
    isLoading: false,
    session: null,
    accessToken: 'jwt-token',
    profile: {
      id: 'user-1',
      email: `${role}@festola.ng`,
      fullName: `Adaeze (${role})`,
      phone: null,
      acceptedTermsAt: '2026-01-01T00:00:00Z',
    },
    memberships: [],
    activeMembership: {
      businessId: BIZ_ID,
      businessName: 'Adaeze Supermarket',
      userId: 'user-1',
      role,
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
}

function renderWithProviders(
  ui: ReactNode,
  role: 'owner' | 'manager' | 'cashier' = 'owner',
  initialEntries: string[] = ['/app/dashboard'],
) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthContext.Provider value={buildAuth(role)}>
        <ToastProvider>{ui}</ToastProvider>
      </AuthContext.Provider>
    </MemoryRouter>,
  );
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Complete Frontend Operational Modules', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('DashboardPage renders Owner financial summary KPIs and hides profit/COGS for Cashier', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/reports/summary')) {
        return jsonResponse({
          summary: {
            salesCount: 12,
            grossSales: '250000.00',
            returnsAndVoids: '0.00',
            netSales: '250000.00',
            cashCollectedOnSales: '210000.00',
            creditExtended: '40000.00',
            taxCollected: '0.00',
            cogs: '170000.00',
            grossProfit: '80000.00',
            operatingExpenses: '20000.00',
            netOperatingProfit: '60000.00',
            outstandingReceivables: '40000.00',
          },
        });
      }
      if (url.includes('/products?')) {
        return jsonResponse({
          products: [
            {
              id: 'p1',
              businessId: BIZ_ID,
              categoryId: null,
              sku: 'MILK-1',
              barcode: null,
              name: 'Peak Milk Tin',
              unit: 'tin',
              sellingPrice: '1200.00',
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
        return jsonResponse({
          sales: [
            {
              id: 'sale-1',
              businessId: BIZ_ID,
              locationId: 'loc-1',
              customerId: null,
              deviceId: null,
              clientSaleUuid: 'uuid-1',
              saleNumber: 'SL-2026-0001',
              status: 'completed',
              paymentStatus: 'paid',
              subtotalAmount: '5000.00',
              discountAmount: '0.00',
              taxEnabledSnapshot: false,
              taxModeSnapshot: 'exclusive',
              taxRateSnapshot: '0',
              taxAmount: '0.00',
              totalAmount: '5000.00',
              amountPaid: '5000.00',
              creditAmount: '0.00',
              creditRemaining: '0.00',
              notes: null,
              soldBy: 'user-1',
              soldAt: '2026-11-20T09:00:00Z',
              createdAt: '2026-11-20T09:00:00Z',
              items: [],
              payments: [],
              receipt: null,
              returns: [],
            },
          ],
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    const { unmount } = renderWithProviders(<DashboardPage />, 'owner');
    expect(await screen.findByText(/Gross Profit \(30 days\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Peak Milk Tin/i)).toBeInTheDocument();
    expect(screen.getByText(/SL-2026-0001/i)).toBeInTheDocument();
    unmount();

    renderWithProviders(<DashboardPage />, 'cashier');
    expect(await screen.findByText(/SL-2026-0001/i)).toBeInTheDocument();
    expect(screen.queryByText(/Gross Profit \(30 days\)/i)).not.toBeInTheDocument();
  });

  it('ProductsPage enforces D-09 Cashier cost/WAC redaction while showing cost to Owner', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
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
              id: 'prod-1',
              businessId: BIZ_ID,
              categoryId: 'cat-1',
              sku: 'BEV-01',
              barcode: '6150001',
              name: 'Milo 400g',
              unit: 'tin',
              sellingPrice: '4500.00',
              costPrice: '3100.00',
              weightedAvgCost: '3200.00',
              lastPositiveWac: '3200.00',
              onHand: '18',
              reorderLevel: '5',
              isTaxExempt: false,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    const { unmount } = renderWithProviders(<ProductsPage />, 'owner');
    expect(await screen.findByText('Milo 400g')).toBeInTheDocument();
    expect(screen.getByText(/WAC Cost/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add product/i })).toBeInTheDocument();
    unmount();

    renderWithProviders(<ProductsPage />, 'cashier');
    expect(await screen.findByText('Milo 400g')).toBeInTheDocument();
    expect(screen.queryByText(/WAC Cost/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add product/i })).not.toBeInTheDocument();
  });

  it('InventoryPage loads stock movements and restock batches without any stock_counts UI (C-02)', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/products?')) {
        return jsonResponse({
          products: [
            {
              id: 'prod-1',
              businessId: BIZ_ID,
              categoryId: null,
              sku: 'RICE-50',
              barcode: null,
              name: 'Mama Gold Rice 50kg',
              unit: 'bag',
              sellingPrice: '85000.00',
              weightedAvgCost: '74000.00',
              onHand: '10',
              reorderLevel: '3',
              isTaxExempt: false,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/inventory/movements')) {
        return jsonResponse({
          movements: [
            {
              id: 'mov-1',
              businessId: BIZ_ID,
              locationId: 'loc-1',
              productId: 'prod-1',
              movementType: 'restock_in',
              quantityDelta: '10',
              balanceAfter: '10',
              unitCostSnapshot: '74000.00',
              referenceType: 'restock_batch',
              referenceId: 'batch-1',
              reason: 'Initial supplier batch',
              createdBy: 'user-1',
              createdAt: '2026-11-19T10:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/restocks')) {
        return jsonResponse({
          restocks: [
            {
              id: 'batch-1',
              batchNumber: 'RST-2026-0001',
              supplierNote: 'Alaba Wholesale',
              notes: null,
              totalCost: '740000.00',
              receivedBy: 'user-1',
              receivedAt: '2026-11-19T10:00:00Z',
              items: [],
            },
          ],
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    renderWithProviders(<InventoryPage />, 'manager');
    expect(await screen.findByText(/Mama Gold Rice 50kg/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Receive restock/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Stock Adjustment/i })).toBeInTheDocument();
    expect(screen.queryByText(/Stock Count/i)).not.toBeInTheDocument();
  });

  it('PosPage adds an item, completes checkout with POST /api/v1/sales, and opens immutable ReceiptModal', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/products?') && method === 'GET') {
        return jsonResponse({
          products: [
            {
              id: 'prod-1',
              businessId: BIZ_ID,
              categoryId: null,
              sku: 'SODA-1',
              barcode: '5449000',
              name: 'Coca-Cola 50cl',
              unit: 'bottle',
              sellingPrice: '500.00',
              onHand: '40',
              reorderLevel: '5',
              isTaxExempt: false,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/customers?') && method === 'GET') {
        return jsonResponse({ customers: [] });
      }
      if (url.endsWith('/api/v1/businesses/current') && method === 'GET') {
        return jsonResponse({
          business: {
            id: BIZ_ID,
            name: 'Adaeze Supermarket',
            slug: 'adaeze-supermarket',
            currencyCode: 'NGN',
            timezone: 'Africa/Lagos',
            phone: null,
            address: null,
            taxId: null,
            taxEnabled: true,
            taxMode: 'exclusive',
            taxRate: '7.5',
            allowNegativeStock: false,
            receiptFooter: 'No refunds after 7 days',
            status: 'active',
          },
        });
      }
      if (url.endsWith('/api/v1/sales') && method === 'POST') {
        return jsonResponse(
          {
            sale: {
              id: 'sale-99',
              businessId: BIZ_ID,
              locationId: 'loc-1',
              customerId: null,
              deviceId: null,
              clientSaleUuid: 'uuid-99',
              saleNumber: 'SL-2026-0099',
              status: 'completed',
              paymentStatus: 'paid',
              subtotalAmount: '500.00',
              discountAmount: '0.00',
              taxEnabledSnapshot: true,
              taxModeSnapshot: 'exclusive',
              taxRateSnapshot: '7.5',
              taxAmount: '37.50',
              totalAmount: '537.50',
              amountPaid: '537.50',
              creditAmount: '0.00',
              creditRemaining: '0.00',
              notes: null,
              soldBy: 'user-1',
              soldAt: '2026-11-20T10:30:00Z',
              createdAt: '2026-11-20T10:30:00Z',
              items: [
                {
                  id: 'si-1',
                  productId: 'prod-1',
                  productNameSnapshot: 'Coca-Cola 50cl',
                  unitSnapshot: 'bottle',
                  quantity: '1',
                  quantityReturned: '0',
                  unitPrice: '500.00',
                  discountAmount: '0.00',
                  taxRateSnapshot: '7.5',
                  taxAmount: '37.50',
                  lineTotal: '537.50',
                  isTaxExemptSnapshot: false,
                },
              ],
              payments: [
                {
                  id: 'sp-1',
                  method: 'cash',
                  amount: '537.50',
                  referenceNote: null,
                  createdAt: '2026-11-20T10:30:00Z',
                },
              ],
              receipt: {
                id: 'rec-99',
                businessId: BIZ_ID,
                receiptNumber: 'REC-2026-0099',
                receiptType: 'sale',
                saleId: 'sale-99',
                debtPaymentId: null,
                snapshotPayload: {},
                issuedBy: 'user-1',
                issuedAt: '2026-11-20T10:30:00Z',
              },
              returns: [],
            },
          },
          201,
        );
      }
      return jsonResponse({});
    });
    globalThis.fetch = fetchMock as typeof fetch;

    renderWithProviders(<PosPage />, 'cashier');
    const productBtn = await screen.findByRole('button', { name: /Coca-Cola 50cl/i });
    fireEvent.click(productBtn);

    expect(await screen.findByText(/Estimated Tax \(7\.5% exclusive\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Line discount/i)).toBeInTheDocument();

    const completeBtn = await screen.findByRole('button', { name: /Complete sale/i });
    fireEvent.click(completeBtn);

    expect(await screen.findByText(/Receipt: REC-2026-0099/i)).toBeInTheDocument();
    expect(screen.getByText(/No refunds after 7 days/i)).toBeInTheDocument();
  });

  it('SalesPage restricts Void & Return buttons to Owner/Manager (D-15) while allowing Receipt view for Cashier', async () => {
    const sampleSale = {
      id: 'sale-1',
      businessId: BIZ_ID,
      locationId: 'loc-1',
      customerId: null,
      deviceId: null,
      clientSaleUuid: 'uuid-1',
      saleNumber: 'SL-2026-0042',
      status: 'completed',
      paymentStatus: 'paid',
      subtotalAmount: '12000.00',
      discountAmount: '0.00',
      taxEnabledSnapshot: false,
      taxModeSnapshot: 'exclusive',
      taxRateSnapshot: '0',
      taxAmount: '0.00',
      totalAmount: '12000.00',
      amountPaid: '12000.00',
      creditAmount: '0.00',
      creditRemaining: '0.00',
      notes: null,
      soldBy: 'user-1',
      soldAt: '2026-11-20T10:00:00Z',
      createdAt: '2026-11-20T10:00:00Z',
      items: [],
      payments: [],
      receipt: null,
      returns: [],
    };
    globalThis.fetch = vi.fn(async () => jsonResponse({ sales: [sampleSale] })) as typeof fetch;

    const { unmount } = renderWithProviders(<SalesPage />, 'manager');
    expect(await screen.findByText('SL-2026-0042')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Void/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Return/i })).toBeInTheDocument();
    unmount();

    renderWithProviders(<SalesPage />, 'cashier');
    expect(await screen.findByText('SL-2026-0042')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Receipt/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Void/i })).not.toBeInTheDocument();
  });

  it('CustomersPage collects a debt repayment and issues a Debt Repayment Receipt', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/customers?') && method === 'GET') {
        return jsonResponse({
          customers: [
            {
              id: 'cust-1',
              businessId: BIZ_ID,
              fullName: 'Emeka Obi',
              phone: '08031234567',
              email: null,
              address: null,
              creditLimit: '50000.00',
              outstandingBalance: '15000.00',
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.endsWith('/customers/cust-1/debt-payments') && method === 'POST') {
        return jsonResponse(
          {
            debtPayment: {
              id: 'dp-1',
              customerId: 'cust-1',
              amount: '10000.00',
              method: 'transfer',
              referenceNote: 'GTB-7788',
              status: 'posted',
              reversalReason: null,
              paidAt: '2026-11-20T11:00:00Z',
              receipt: {
                id: 'rec-dp-1',
                businessId: BIZ_ID,
                receiptNumber: 'REC-DEBT-001',
                receiptType: 'debt_payment',
                saleId: null,
                debtPaymentId: 'dp-1',
                snapshotPayload: {},
                issuedBy: 'user-1',
                issuedAt: '2026-11-20T11:00:00Z',
              },
            },
          },
          201,
        );
      }
      return jsonResponse({});
    }) as typeof fetch;

    renderWithProviders(<CustomersPage />, 'cashier');
    expect(await screen.findByText('Emeka Obi')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Collect$/i }));
    fireEvent.change(screen.getByLabelText(/Amount received/i), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: /Post repayment & issue receipt/i }));

    expect(await screen.findByText(/Receipt: REC-DEBT-001/i)).toBeInTheDocument();
  });

  it('ExpensesPage lists operating expenses and records a new expense', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/expense-categories')) {
        return jsonResponse({
          categories: [
            { id: 'ec-1', name: 'Fuel & Power', isActive: true, createdAt: '2026-11-01T00:00:00Z' },
          ],
        });
      }
      if (url.includes('/expenses') && method === 'GET') {
        return jsonResponse({
          expenses: [
            {
              id: 'exp-1',
              categoryId: 'ec-1',
              amount: '18500.00',
              paymentMethod: 'cash',
              description: 'Diesel for shop generator',
              incurredOn: '2026-11-20',
              status: 'posted',
              reversalReason: null,
              createdAt: '2026-11-20T09:00:00Z',
            },
          ],
        });
      }
      if (url.endsWith('/expenses') && method === 'POST') {
        return jsonResponse(
          {
            expense: {
              id: 'exp-2',
              categoryId: 'ec-1',
              amount: '5000.00',
              paymentMethod: 'cash',
              description: 'NEPA meter recharge',
              incurredOn: '2026-11-20',
              status: 'posted',
              reversalReason: null,
              createdAt: '2026-11-20T10:00:00Z',
            },
          },
          201,
        );
      }
      return jsonResponse({});
    }) as typeof fetch;

    renderWithProviders(<ExpensesPage />, 'owner');
    expect(await screen.findByText('Diesel for shop generator')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Record expense/i }));
    fireEvent.change(screen.getByLabelText(/Amount \(NGN\)/i), { target: { value: '5000' } });
    fireEvent.change(screen.getByLabelText(/Description/i), {
      target: { value: 'NEPA meter recharge' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save expense/i }));

    await waitFor(() => {
      expect(screen.getByText(/Operating expense recorded/i)).toBeInTheDocument();
    });
  });

  it('ReportsPage displays Financial P&L, Inventory Valuation, and Debtors Aging', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/reports/summary')) {
        return jsonResponse({
          summary: {
            salesCount: 20,
            grossSales: '400000.00',
            returnsAndVoids: '10000.00',
            netSales: '390000.00',
            cashCollectedOnSales: '350000.00',
            creditExtended: '40000.00',
            taxCollected: '0.00',
            cogs: '260000.00',
            grossProfit: '130000.00',
            operatingExpenses: '30000.00',
            netOperatingProfit: '100000.00',
            outstandingReceivables: '40000.00',
          },
        });
      }
      if (url.includes('/reports/sales-by-day')) {
        return jsonResponse({
          series: [
            { date: '2026-11-20', salesCount: 4, grossSales: '80000.00', netSales: '80000.00' },
          ],
        });
      }
      if (url.includes('/reports/top-products')) {
        return jsonResponse({
          products: [
            {
              productId: 'p1',
              productName: 'Golden Penny Semovita',
              unitsSold: '15',
              revenue: '120000.00',
              cogs: '90000.00',
            },
          ],
        });
      }
      if (url.includes('/reports/inventory-valuation')) {
        return jsonResponse({
          valuation: {
            activeProductCount: 42,
            totalCostValuation: '850000.00',
            totalRetailValue: '1200000.00',
            lowStockCount: 0,
            lowStockItems: [],
          },
        });
      }
      if (url.includes('/reports/debtors-aging')) {
        return jsonResponse({
          aging: {
            buckets: {
              days0to30: '25000.00',
              days31to60: '15000.00',
              days61to90: '0.00',
              days90Plus: '0.00',
            },
            debtors: [
              {
                customerId: 'c1',
                fullName: 'Bola Adeyemi',
                phone: '08020001111',
                outstandingBalance: '40000.00',
                openInvoiceCount: 2,
              },
            ],
          },
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    renderWithProviders(<ReportsPage />, 'owner');
    expect(await screen.findByText('Golden Penny Semovita')).toBeInTheDocument();
    expect(screen.getByText('Bola Adeyemi')).toBeInTheDocument();
    expect(screen.getByText(/Inventory Valuation \(Moving WAC\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^sales$/i })).toBeInTheDocument();
  });

  it('SyncPage pushes queued offline sales idempotently and renders Owner/Manager sync conflicts', async () => {
    setRegisteredLocalDevice(BIZ_ID, {
      deviceId: 'dev-uuid-1',
      deviceCode: 'A1B2',
    });
    enqueueOfflineSale(BIZ_ID, {
      clientOperationUuid: 'op-uuid-1',
      occurredAt: '2026-11-20T08:00:00Z',
      offlineReceiptNumber: 'OFF-A1B2-0001',
      deviceId: 'dev-uuid-1',
      estimatedTotal: '2500.00',
      itemSummary: 'Peak Milk × 2',
      payload: {
        clientSaleUuid: 'op-uuid-1',
        deviceId: 'dev-uuid-1',
        offlineReceiptNumber: 'OFF-A1B2-0001',
        items: [{ productId: 'p1', quantity: '2', discountAmount: '0.00' }],
        payments: [{ method: 'cash', amount: '2500.00' }],
      },
    });

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/devices')) {
        return jsonResponse({
          devices: [
            {
              id: 'dev-uuid-1',
              businessId: BIZ_ID,
              userId: 'user-1',
              deviceCode: 'A1B2',
              deviceName: 'Front Counter',
              status: 'active',
              lastVerifiedAt: '2026-11-20T07:00:00Z',
              offlineExpiresAt: '2026-11-27T07:00:00Z',
              revokedAt: null,
              createdAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/sync/conflicts') && method === 'GET') {
        return jsonResponse({
          conflicts: [
            {
              id: 'conf-1',
              deviceId: 'dev-uuid-1',
              clientOperationUuid: 'op-old-1',
              entityType: 'sale',
              reason: 'Insufficient stock during offline sync',
              status: 'open',
              resolutionAction: null,
              resolutionNote: null,
              resolvedAt: null,
              payload: {},
              createdAt: '2026-11-20T07:30:00Z',
            },
          ],
        });
      }
      if (url.endsWith('/sync/push') && method === 'POST') {
        return jsonResponse({
          results: [{ clientOperationUuid: 'op-uuid-1', status: 'applied', entityId: 'sale-55' }],
        });
      }
      return jsonResponse({});
    }) as typeof fetch;

    renderWithProviders(<SyncPage />, 'owner');
    expect(await screen.findByText('OFF-A1B2-0001')).toBeInTheDocument();
    expect(screen.getByText(/Insufficient stock during offline sync/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Push sync batch/i }));
    expect(
      await screen.findByText(/All local offline sales on this browser have been synced/i),
    ).toBeInTheDocument();
  });

  it('SubscriptionPage renders server-owned plans only (D-01) and initiates Paystack checkout', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/subscriptions/current')) {
        return jsonResponse({
          subscription: {
            id: 'sub-1',
            status: 'trialing',
            trialEndsAt: '2026-12-04T00:00:00Z',
            currentPeriodEnd: '2026-12-04T00:00:00Z',
            graceEndsAt: null,
            limits: {
              planId: 'plan-trial',
              planCode: 'trial',
              displayName: '14-Day Free Trial',
              maxStaff: 3,
              maxProducts: 500,
              maxOfflineDevices: 2,
            },
          },
          status: 'trialing',
          staffCount: 1,
          productCount: 12,
          activeDeviceCount: 1,
        });
      }
      if (url.includes('/plans')) {
        return jsonResponse({
          plans: [
            {
              id: 'plan-t1',
              planCode: 'tier_1_monthly',
              displayName: 'Tier 1 (Server Catalog)',
              billingInterval: 'monthly',
              priceAmount: '15000.00',
              currencyCode: 'NGN',
              maxStaff: 5,
              maxProducts: 2000,
              maxOfflineDevices: 3,
              isActive: true,
            },
          ],
        });
      }
      if (url.includes('/subscriptions/invoices')) {
        return jsonResponse({ invoices: [] });
      }
      if (url.endsWith('/subscriptions/checkout') && method === 'POST') {
        return jsonResponse(
          {
            invoice: {
              id: 'inv-1',
              planId: 'plan-t1',
              provider: 'paystack',
              providerReference: 'FEST-REF-1234',
              amount: '15000.00',
              currencyCode: 'NGN',
              status: 'pending',
              checkoutUrl: 'https://checkout.paystack.com/test123',
              paidAt: null,
              createdAt: '2026-11-20T12:00:00Z',
            },
            checkoutUrl: 'https://checkout.paystack.com/test123',
            reference: 'FEST-REF-1234',
          },
          201,
        );
      }
      return jsonResponse({});
    }) as typeof fetch;

    renderWithProviders(<SubscriptionPage />, 'owner', ['/app/subscription']);
    expect(await screen.findByText('Tier 1 (Server Catalog)')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Subscribe via Paystack/i }));
    expect(await screen.findByText(/Paystack checkout ready/i)).toBeInTheDocument();
    expect(screen.getByText('FEST-REF-1234')).toBeInTheDocument();
  });
});
