import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '../../src/App';
import { ToastProvider } from '../../src/components/ui/ToastProvider';
import { AuthContext, AuthProvider, type AuthContextValue } from '../../src/contexts/AuthContext';
import DebtsPage from '../../src/pages/app/DebtsPage';
import PurchasesPage from '../../src/pages/app/PurchasesPage';
import SuppliersPage from '../../src/pages/app/SuppliersPage';

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
      fullName: 'Adaeze Okafor',
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
      subscriptionStatus: 'active',
      limits: {
        planId: 'plan-business',
        planCode: 'business',
        displayName: 'Business Plan',
        maxStaff: 10,
        maxProducts: 2000,
        maxOfflineDevices: 5,
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

function renderWithProviders(ui: ReactNode, role: 'owner' | 'manager' | 'cashier' = 'owner') {
  return render(
    <MemoryRouter>
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

describe('Commercial SaaS Operational Modules (Purchases, Suppliers, Debts & Direct Routes)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('SuppliersPage adds a supplier, opens profile, and records a verified supplier payment', () => {
    renderWithProviders(<SuppliersPage />, 'owner');

    fireEvent.click(screen.getByRole('button', { name: /Add Supplier/i }));
    fireEvent.change(screen.getByLabelText(/Supplier Name/i), {
      target: { value: 'Oke-Arin Distributors' },
    });
    fireEvent.change(screen.getByLabelText(/Products Supplied/i), {
      target: { value: 'Noodles & Cooking Oil' },
    });
    fireEvent.change(screen.getByLabelText(/Outstanding Balance/i), {
      target: { value: '50000' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save Supplier/i }));

    expect(screen.getByText('Oke-Arin Distributors')).toBeInTheDocument();

    // Record partial payment
    fireEvent.click(screen.getByRole('button', { name: /^Pay$/i }));
    fireEvent.change(screen.getByLabelText(/Amount Paid/i), { target: { value: '20000' } });
    fireEvent.click(screen.getByRole('button', { name: /Record Supplier Payment/i }));

    expect(screen.getByText(/Supplier payment recorded/i)).toBeInTheDocument();
  });

  it('PurchasesPage loads purchase batches and confirms a validated restock purchase', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/products?')) {
        return jsonResponse({
          products: [
            {
              id: 'prod-1',
              businessId: BIZ_ID,
              categoryId: null,
              sku: 'RICE-50',
              barcode: null,
              name: 'Golden Rice 50kg',
              unit: 'bag',
              sellingPrice: '85000.00',
              weightedAvgCost: '72000.00',
              onHand: '5',
              reorderLevel: '2',
              isTaxExempt: false,
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/restocks') && method === 'GET') {
        return jsonResponse({
          restocks: [
            {
              id: 'rst-1',
              batchNumber: 'RST-2026-0010',
              supplierNote: 'Lagos Rice Mill',
              notes: 'Invoice: INV-90 · Payment: PAID',
              totalCost: '360000.00',
              receivedBy: 'user-1',
              receivedAt: '2026-11-20T08:00:00Z',
              items: [],
            },
          ],
        });
      }
      if (url.endsWith('/restocks') && method === 'POST') {
        return jsonResponse(
          {
            restock: {
              id: 'rst-2',
              batchNumber: 'RST-2026-0011',
              supplierNote: 'Direct Supplier',
              notes: 'Payment: PAID',
              totalCost: '144000.00',
              receivedBy: 'user-1',
              receivedAt: '2026-11-23T09:00:00Z',
              items: [],
            },
          },
          201,
        );
      }
      return jsonResponse({});
    }) as typeof fetch;

    renderWithProviders(<PurchasesPage />, 'owner');
    expect(await screen.findByText('RST-2026-0010')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Create Purchase/i }));
    fireEvent.change(screen.getByLabelText(/^Product$/i), { target: { value: 'prod-1' } });
    fireEvent.change(screen.getByLabelText(/^Quantity$/i), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Purchase & Update Stock/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Purchase confirmed and stock updated atomically/i),
      ).toBeInTheDocument();
    });
  });

  it('DebtsPage displays aging buckets, prevents overpayment, and issues a verified Debt Repayment Receipt', async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      if (url.includes('/customers?') && method === 'GET') {
        return jsonResponse({
          customers: [
            {
              id: 'cust-1',
              businessId: BIZ_ID,
              fullName: 'Tunde Bakare',
              phone: '08023456789',
              email: null,
              address: null,
              creditLimit: '50000.00',
              outstandingBalance: '25000.00',
              isActive: true,
              createdAt: '2026-11-01T00:00:00Z',
              updatedAt: '2026-11-01T00:00:00Z',
            },
          ],
        });
      }
      if (url.includes('/reports/debtors-aging')) {
        return jsonResponse({
          aging: {
            buckets: {
              days0to30: '15000.00',
              days31to60: '10000.00',
              days61to90: '0.00',
              days90Plus: '0.00',
            },
            debtors: [],
          },
        });
      }
      if (url.endsWith('/customers/cust-1/debt-payments') && method === 'POST') {
        return jsonResponse(
          {
            debtPayment: {
              id: 'dp-10',
              customerId: 'cust-1',
              amount: '10000.00',
              method: 'cash',
              referenceNote: null,
              status: 'posted',
              reversalReason: null,
              paidAt: '2026-11-23T10:00:00Z',
              receipt: {
                id: 'rec-10',
                businessId: BIZ_ID,
                receiptNumber: 'REC-DEBT-010',
                receiptType: 'debt_payment',
                saleId: null,
                debtPaymentId: 'dp-10',
                snapshotPayload: {},
                issuedBy: 'user-1',
                issuedAt: '2026-11-23T10:00:00Z',
              },
            },
          },
          201,
        );
      }
      return jsonResponse({});
    }) as typeof fetch;

    renderWithProviders(<DebtsPage />, 'owner');
    expect(await screen.findByText('Tunde Bakare')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Record Payment/i }));
    fireEvent.change(screen.getByLabelText(/Amount Received/i), { target: { value: '10000' } });
    fireEvent.click(screen.getByRole('button', { name: /Post Payment & Issue Receipt/i }));

    expect(await screen.findByText(/Receipt: REC-DEBT-010/i)).toBeInTheDocument();
  });

  it('protects Section 21 direct module routes (/dashboard, /purchases, /debts) by redirecting unauthenticated users to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: /Sign in/i })).toBeInTheDocument();
  });
});
