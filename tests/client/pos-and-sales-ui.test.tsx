import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceiptModal } from '../../src/components/receipts/ReceiptModal';
import { ToastProvider } from '../../src/components/ui/ToastProvider';
import { AuthContext, type AuthContextValue } from '../../src/contexts/AuthContext';
import type { SaleRecord } from '../../src/lib/commerce-api';
import PosPage from '../../src/pages/app/PosPage';
import SalesPage from '../../src/pages/app/SalesPage';

const AUTH_OWNER = {
  loading: false,
  isLoading: false,
  supabaseConfigured: true,
  session: null,
  profile: {
    id: 'user-owner',
    email: 'owner@festola.test',
    fullName: 'Owner Festola',
    phone: null,
    acceptedTermsAt: '2026-11-01T00:00:00.000Z',
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
  accessToken: 'test-token',
  user: {
    id: 'user-owner',
    email: 'owner@festola.test',
    fullName: 'Owner Festola',
    phone: null,
  },
  memberships: [
    {
      businessId: 'biz-1',
      businessName: 'Festola Verification Mart',
      userId: 'user-owner',
      role: 'owner' as const,
      membershipStatus: 'active' as const,
      subscriptionStatus: 'active' as const,
      defaultLocationId: 'loc-1',
    },
  ],
  activeMembership: {
    businessId: 'biz-1',
    businessName: 'Festola Verification Mart',
    userId: 'user-owner',
    role: 'owner' as const,
    membershipStatus: 'active' as const,
    subscriptionStatus: 'active' as const,
    defaultLocationId: 'loc-1',
  },
  tenantEpoch: 1,
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  refreshSession: vi.fn(),
  setActiveBusiness: vi.fn(),
} as unknown as AuthContextValue;

function renderWithAuth(ui: React.ReactElement) {
  return render(
    <AuthContext.Provider value={AUTH_OWNER}>
      <ToastProvider>{ui}</ToastProvider>
    </AuthContext.Provider>,
  );
}

describe('POS & Sales UI Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('pins the same Idempotency-Key across a failed checkout retry, shows change due, updates stock live, and displays committed receipt', async () => {
    const submittedIdempotencyKeys: string[] = [];
    let attemptCount = 0;

    const committedSale: SaleRecord = {
      id: 'sale-100',
      businessId: 'biz-1',
      locationId: 'loc-1',
      customerId: null,
      deviceId: null,
      clientSaleUuid: '11111111-1111-4111-8111-111111111111',
      saleNumber: 'REC-20261126-0001',
      status: 'completed',
      paymentStatus: 'paid',
      subtotalAmount: '7500.00',
      discountAmount: '0.00',
      taxEnabledSnapshot: false,
      taxModeSnapshot: 'exclusive',
      taxRateSnapshot: '0.0000',
      taxAmount: '0.00',
      totalAmount: '7500.00',
      amountPaid: '7500.00',
      creditAmount: '0.00',
      creditRemaining: '0.00',
      notes: null,
      soldBy: 'user-owner',
      soldAt: '2026-11-26T10:00:00.000Z',
      createdAt: '2026-11-26T10:00:00.000Z',
      items: [
        {
          id: 'si-1',
          productId: 'prod-oil',
          productNameSnapshot: 'Groundnut Oil 5L',
          unitSnapshot: 'bottle',
          quantity: '5.000',
          quantityReturned: '0.000',
          unitPrice: '1500.00',
          discountAmount: '0.00',
          taxRateSnapshot: '0.0000',
          taxAmount: '0.00',
          lineTotal: '7500.00',
          isTaxExemptSnapshot: true,
        },
      ],
      payments: [
        {
          id: 'sp-1',
          method: 'cash',
          amount: '7500.00',
          referenceNote: null,
          createdAt: '2026-11-26T10:00:00.000Z',
        },
      ],
      receipt: {
        id: 'rec-100',
        businessId: 'biz-1',
        receiptNumber: 'REC-20261126-0001',
        receiptType: 'sale',
        saleId: 'sale-100',
        debtPaymentId: null,
        snapshotPayload: {
          businessName: 'Festola Verification Mart',
          locationName: 'Lagos Main Counter',
          locationAddress: '44 Marina Road, Lagos',
          locationPhone: '+2348099990000',
          currencyCode: 'NGN',
          receiptNumber: 'REC-20261126-0001',
          customerName: null,
          taxEnabled: false,
          taxMode: 'exclusive',
          taxRate: '0.0000',
          items: [
            {
              name: 'Groundnut Oil 5L',
              unit: 'bottle',
              quantity: '5.000',
              unitPrice: '1500.00',
              discountAmount: '0.00',
              taxAmount: '0.00',
              lineTotal: '7500.00',
            },
          ],
          subtotalAmount: '7500.00',
          discountAmount: '0.00',
          taxAmount: '0.00',
          totalAmount: '7500.00',
          amountPaid: '7500.00',
          creditAmount: '0.00',
          creditRemaining: '0.00',
          payments: [{ method: 'cash', amount: '7500.00', referenceNote: null }],
          receiptFooter: 'Thank you!',
          issuedAt: '2026-11-26T10:00:00.000Z',
        },
        issuedBy: 'user-owner',
        issuedAt: '2026-11-26T10:00:00.000Z',
      },
      returns: [],
    };

    let currentStock = '50.000';
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/api/v1/products')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              products: [
                {
                  id: 'prod-oil',
                  businessId: 'biz-1',
                  categoryId: null,
                  sku: 'OIL-5L',
                  barcode: '6150001000050',
                  name: 'Groundnut Oil 5L',
                  unit: 'bottle',
                  sellingPrice: '1500.00',
                  onHand: currentStock,
                  reorderLevel: '5.000',
                  isTaxExempt: true,
                  isActive: true,
                  createdAt: '2026-11-26T00:00:00.000Z',
                  updatedAt: '2026-11-26T00:00:00.000Z',
                },
              ],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/v1/customers')) {
        return new Response(JSON.stringify({ success: true, data: { customers: [] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/v1/businesses/current')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              business: {
                id: 'biz-1',
                name: 'Festola Verification Mart',
                currencyCode: 'NGN',
                taxEnabled: false,
                taxMode: 'exclusive',
                taxRate: '0.0000',
                allowNegativeStock: false,
                receiptFooter: 'Thank you!',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.endsWith('/api/v1/sales') && init?.method === 'POST') {
        const headers = new Headers(init.headers);
        const key = headers.get('Idempotency-Key') ?? '';
        submittedIdempotencyKeys.push(key);
        attemptCount += 1;
        if (attemptCount === 1) {
          return new Response(
            JSON.stringify({
              success: false,
              error: { code: 'INTERNAL_SERVER_ERROR', message: 'Temporary network blip.' },
            }),
            { status: 500, headers: { 'Content-Type': 'application/json' } },
          );
        }
        currentStock = '45.000';
        return new Response(JSON.stringify({ success: true, data: { sale: committedSale } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderWithAuth(<PosPage />);

    // Wait for product catalog to render
    await screen.findByText('Groundnut Oil 5L');
    expect(screen.getByText(/Stock: 50 bottle/i)).toBeInTheDocument();

    // Add product and set quantity directly to 5
    fireEvent.click(screen.getByRole('button', { name: /Groundnut Oil 5L/i }));
    const qtyInput = await screen.findByLabelText('Quantity for Groundnut Oil 5L');
    fireEvent.change(qtyInput, { target: { value: '5' } });

    // Enter cash received = 10,000 -> Change: NGN 2,500.00
    const cashReceivedInput = screen.getByLabelText(/Cash received/i);
    fireEvent.change(cashReceivedInput, { target: { value: '10000' } });
    expect(screen.getByText(/Change:.*2,500\.00/)).toBeInTheDocument();

    // First click fails transiently
    fireEvent.click(screen.getByRole('button', { name: /Complete Sale & Issue Receipt/i }));
    await screen.findByText(/Something went wrong on our side/i);

    // Retry click reuses the EXACT same Idempotency-Key
    fireEvent.click(screen.getByRole('button', { name: /Complete Sale & Issue Receipt/i }));
    await screen.findByText(/Receipt: REC-20261126-0001/i);

    expect(submittedIdempotencyKeys).toHaveLength(2);
    expect(submittedIdempotencyKeys[0]).toBeTruthy();
    expect(submittedIdempotencyKeys[0]).toBe(submittedIdempotencyKeys[1]);

    // Stock immediately reconciled to 45 on counter
    await waitFor(() => {
      expect(screen.getByText(/Stock: 45 bottle/i)).toBeInTheDocument();
    });
  });

  it('opens Sale Detail modal, applies paymentMethod filter, and submits multi-item return in SalesPage', async () => {
    const requestedUrls: string[] = [];
    let returnPayload: Record<string, unknown> | null = null;

    const sampleSale: SaleRecord = {
      id: 'sale-200',
      businessId: 'biz-1',
      locationId: 'loc-1',
      customerId: null,
      deviceId: null,
      clientSaleUuid: '22222222-2222-4222-8222-222222222222',
      saleNumber: 'REC-20261126-0002',
      status: 'completed',
      paymentStatus: 'paid',
      subtotalAmount: '5000.00',
      discountAmount: '0.00',
      taxEnabledSnapshot: false,
      taxModeSnapshot: 'exclusive',
      taxRateSnapshot: '0.0000',
      taxAmount: '0.00',
      totalAmount: '5000.00',
      amountPaid: '5000.00',
      creditAmount: '0.00',
      creditRemaining: '0.00',
      notes: 'Counter transfer',
      soldBy: 'user-owner',
      soldAt: '2026-11-26T11:00:00.000Z',
      createdAt: '2026-11-26T11:00:00.000Z',
      items: [
        {
          id: 'si-a',
          productId: 'prod-a',
          productNameSnapshot: 'Soap Pack',
          unitSnapshot: 'pack',
          quantity: '2.000',
          quantityReturned: '0.000',
          unitPrice: '1500.00',
          discountAmount: '0.00',
          taxRateSnapshot: '0.0000',
          taxAmount: '0.00',
          lineTotal: '3000.00',
          isTaxExemptSnapshot: true,
        },
        {
          id: 'si-b',
          productId: 'prod-b',
          productNameSnapshot: 'Toothpaste Box',
          unitSnapshot: 'box',
          quantity: '2.000',
          quantityReturned: '0.000',
          unitPrice: '1000.00',
          discountAmount: '0.00',
          taxRateSnapshot: '0.0000',
          taxAmount: '0.00',
          lineTotal: '2000.00',
          isTaxExemptSnapshot: true,
        },
      ],
      payments: [
        {
          id: 'sp-2',
          method: 'transfer',
          amount: '5000.00',
          referenceNote: 'NIP-1234',
          createdAt: '2026-11-26T11:00:00.000Z',
        },
      ],
      receipt: null,
      returns: [],
    };

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = typeof input === 'string' ? input : input.toString();
      requestedUrls.push(url);
      if (url.includes('/api/v1/sales/sale-200/returns') && init?.method === 'POST') {
        returnPayload = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              sale: { ...sampleSale, status: 'partially_returned' },
              saleReturn: {
                id: 'ret-1',
                returnType: 'return',
                reason: 'Returned both items partially',
                totalReversed: '2500.00',
                debtReducedAmount: '0.00',
                refundAmount: '2500.00',
                processedBy: 'user-owner',
                createdAt: '2026-11-26T11:10:00.000Z',
              },
            },
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url.includes('/api/v1/sales/sale-200')) {
        return new Response(JSON.stringify({ success: true, data: { sale: sampleSale } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/v1/sales')) {
        return new Response(JSON.stringify({ success: true, data: { sales: [sampleSale] } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/api/v1/businesses/current')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: { business: { id: 'biz-1', currencyCode: 'NGN', receiptFooter: 'Thanks!' } },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    renderWithAuth(<SalesPage />);
    await screen.findByText('REC-20261126-0002');

    // Filter by payment method = transfer
    fireEvent.change(screen.getByLabelText('Filter by payment method'), {
      target: { value: 'transfer' },
    });
    await waitFor(() => {
      expect(requestedUrls.some((u) => u.includes('paymentMethod=transfer'))).toBe(true);
    });

    // Open Sale Detail modal
    fireEvent.click(screen.getByRole('button', { name: /Details/i }));
    await screen.findByText('Payment Allocations');
    expect(screen.getByText(/Ref: NIP-1234/i)).toBeInTheDocument();

    // Open Return / Void modal from Detail modal and enter multi-item return quantities
    fireEvent.click(screen.getAllByRole('button', { name: /Return \/ Void/i })[1]!);
    await screen.findByText('Process Sale Return or Full Void');

    fireEvent.change(screen.getByLabelText('Return quantity for Soap Pack'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText('Return quantity for Toothpaste Box'), {
      target: { value: '1' },
    });
    fireEvent.change(screen.getByLabelText(/Audit reason/i), {
      target: { value: 'Customer returned 1 of each item' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm Item Return/i }));

    await waitFor(() => {
      expect(returnPayload).not.toBeNull();
    });
    expect((returnPayload as { items?: unknown[] } | null)?.items).toHaveLength(2);
  });

  it('renders ReceiptModal strictly from committed snapshotPayload and displays voided watermark', () => {
    const voidedSale: SaleRecord = {
      id: 'sale-void',
      businessId: 'biz-1',
      locationId: 'loc-1',
      customerId: null,
      deviceId: null,
      clientSaleUuid: '33333333-3333-4333-8333-333333333333',
      saleNumber: 'REC-20261126-0099',
      status: 'voided',
      paymentStatus: 'paid',
      subtotalAmount: '100.00',
      discountAmount: '0.00',
      taxEnabledSnapshot: false,
      taxModeSnapshot: 'exclusive',
      taxRateSnapshot: '0.0000',
      taxAmount: '0.00',
      totalAmount: '100.00',
      amountPaid: '100.00',
      creditAmount: '0.00',
      creditRemaining: '0.00',
      notes: null,
      soldBy: 'user-owner',
      soldAt: '2026-11-26T12:00:00.000Z',
      createdAt: '2026-11-26T12:00:00.000Z',
      items: [],
      payments: [],
      receipt: {
        id: 'rec-99',
        businessId: 'biz-1',
        receiptNumber: 'REC-20261126-0099',
        receiptType: 'sale',
        saleId: 'sale-void',
        debtPaymentId: null,
        snapshotPayload: {
          businessName: 'Committed Snapshot Store',
          locationName: 'Victoria Island Branch',
          currencyCode: 'NGN',
          receiptNumber: 'REC-20261126-0099',
          customerName: 'Ngozi Eze',
          taxEnabled: false,
          taxMode: 'exclusive',
          taxRate: '0.0000',
          items: [
            {
              name: 'Immutable Snapshot Item',
              unit: 'pcs',
              quantity: '5.000',
              unitPrice: '1500.00',
              discountAmount: '0.00',
              taxAmount: '0.00',
              lineTotal: '7500.00',
            },
          ],
          subtotalAmount: '7500.00',
          discountAmount: '0.00',
          taxAmount: '0.00',
          totalAmount: '7500.00',
          amountPaid: '7500.00',
          creditAmount: '0.00',
          creditRemaining: '0.00',
          payments: [{ method: 'pos_card', amount: '7500.00', referenceNote: 'RRN-7712' }],
          receiptFooter: 'Committed snapshot footer',
          issuedAt: '2026-11-26T12:00:00.000Z',
        },
        issuedBy: 'user-owner',
        issuedAt: '2026-11-26T12:00:00.000Z',
      },
      returns: [],
    };

    render(
      <ReceiptModal
        open={true}
        onClose={vi.fn()}
        businessName="Mutable Fallback Name"
        sale={voidedSale}
      />,
    );

    expect(screen.getByText('Committed Snapshot Store')).toBeInTheDocument();
    expect(screen.getByText('Victoria Island Branch')).toBeInTheDocument();
    expect(screen.getByText('Immutable Snapshot Item')).toBeInTheDocument();
    expect(screen.getByText('Customer: Ngozi Eze')).toBeInTheDocument();
    expect(screen.getByText('Ref: RRN-7712')).toBeInTheDocument();
    expect(screen.getByText(/VOIDED — ORIGINAL RECEIPT PRESERVED/i)).toBeInTheDocument();
    expect(screen.getByText('Committed snapshot footer')).toBeInTheDocument();
  });
});
