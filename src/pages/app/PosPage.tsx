import { Minus, Plus, Search, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { FormField, Input, Select } from '../../components/ui/FormControls';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  createSale,
  fetchCustomers,
  fetchProducts,
  type CustomerItem,
  type ProductItem,
  type SaleRecord,
  type TenderMethod,
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import { formatMoney, formatQty, generateUuid } from '../../lib/format';
import { fetchCurrentBusiness, type BusinessDetails } from '../../lib/identity-api';
import {
  enqueueOfflineSale,
  getRegisteredLocalDevice,
  loadOfflineBootstrapCache,
  nextOfflineReceiptNumber,
} from '../../lib/offline-store';

interface CartLine {
  product: ProductItem;
  quantity: number;
  discountAmount: number;
}

interface TenderLine {
  method: TenderMethod;
  amount: string;
  referenceNote: string;
}

/**
 * Touch-first Point of Sale Counter (D-13 tender recording, D-14 immutable receipts, D-05 offline queue).
 * Final tax, WAC cost snapshot, and totals are always authoritatively calculated on the server.
 */
export default function PosPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const isOnline = useOnlineStatus();
  const { pushToast } = useToast();

  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const [business, setBusiness] = useState<BusinessDetails | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [tenders, setTenders] = useState<TenderLine[]>([
    { method: 'cash', amount: '', referenceNote: '' },
  ]);
  const [notes, setNotes] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Completed / queued receipt modal state
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);
  const [offlineReceiptNo, setOfflineReceiptNo] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !activeMembership) return;
    let cancelled = false;

    if (!isOnline) {
      const cached = loadOfflineBootstrapCache(activeMembership.businessId);
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setProducts(cached?.products ?? []);
        setCustomers(cached?.customers ?? []);
        setLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }

    void Promise.all([
      fetchProducts(accessToken, activeMembership.businessId, { isActive: true, limit: 200 }),
      fetchCustomers(accessToken, activeMembership.businessId, { limit: 200 }),
      fetchCurrentBusiness(accessToken, activeMembership.businessId),
    ]).then(([prodRes, custRes, bizRes]) => {
      if (cancelled) return;
      if (prodRes.success && prodRes.data) {
        setProducts(prodRes.data.products);
      } else {
        const cached = loadOfflineBootstrapCache(activeMembership.businessId);
        if (cached) setProducts(cached.products);
      }
      if (custRes.success && custRes.data) {
        setCustomers(custRes.data.customers);
      }
      if (bizRes.success && bizRes.data?.business) {
        setBusiness(bizRes.data.business);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, isOnline, tenantEpoch]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku && p.sku.toLowerCase().includes(q)) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)),
    );
  }, [products, search]);

  const taxEnabled = Boolean(business?.taxEnabled);
  const taxMode = business?.taxMode ?? 'exclusive';
  const taxRate = Number(business?.taxRate ?? 0);

  const pricing = useMemo(() => {
    let grossSubtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;
    let grandTotal = 0;

    for (const line of cart) {
      const lineGross = Number(line.product.sellingPrice) * line.quantity;
      const clampedDiscount = Math.min(lineGross, Math.max(0, line.discountAmount));
      const taxableNet = Math.max(0, lineGross - clampedDiscount);
      grossSubtotal += lineGross;
      totalDiscount += clampedDiscount;

      if (taxEnabled && taxRate > 0 && !line.product.isTaxExempt) {
        if (taxMode === 'exclusive') {
          const lineTax = Number(((taxableNet * taxRate) / 100).toFixed(2));
          totalTax += lineTax;
          grandTotal += taxableNet + lineTax;
        } else {
          const lineTax = Number(((taxableNet * taxRate) / (100 + taxRate)).toFixed(2));
          totalTax += lineTax;
          grandTotal += taxableNet;
        }
      } else {
        grandTotal += taxableNet;
      }
    }

    return {
      grossSubtotal: Number(grossSubtotal.toFixed(2)),
      totalDiscount: Number(totalDiscount.toFixed(2)),
      estimatedTax: Number(totalTax.toFixed(2)),
      estimatedTotal: Number(grandTotal.toFixed(2)),
    };
  }, [cart, taxEnabled, taxMode, taxRate]);

  const addToCart = (product: ProductItem) => {
    setCheckoutError(null);
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [...prev, { product, quantity: 1, discountAmount: 0 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((l) =>
          l.product.id === productId ? { ...l, quantity: Math.max(0, l.quantity + delta) } : l,
        )
        .filter((l) => l.quantity > 0),
    );
  };

  const updateDiscount = (productId: string, rawValue: string) => {
    const parsed = rawValue.trim() === '' ? 0 : Number(rawValue);
    setCart((prev) =>
      prev.map((l) => {
        if (l.product.id !== productId) return l;
        const maxDiscount = Number(l.product.sellingPrice) * l.quantity;
        const safe = Number.isFinite(parsed) ? Math.min(maxDiscount, Math.max(0, parsed)) : 0;
        return { ...l, discountAmount: safe };
      }),
    );
  };

  const handleBarcodeSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = products.find(
      (p) => p.barcode?.toLowerCase() === q || p.sku?.toLowerCase() === q,
    );
    if (exact) {
      addToCart(exact);
      setSearch('');
      pushToast(`Added ${exact.name} to cart.`, 'info');
    }
  };

  const handleCompleteSale = async () => {
    if (!accessToken || !activeMembership) return;
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError('Add at least one product to the cart before checking out.');
      return;
    }

    const effectiveTenders = tenders
      .map((t) => ({
        method: t.method,
        amount:
          t.amount.trim() !== ''
            ? Number(t.amount)
            : tenders.length === 1
              ? pricing.estimatedTotal
              : 0,
        referenceNote: t.referenceNote.trim() || null,
      }))
      .filter((t) => Number.isFinite(t.amount) && t.amount > 0);

    if (effectiveTenders.length === 0) {
      setCheckoutError('Enter a valid payment amount.');
      return;
    }

    const hasCredit = effectiveTenders.some((t) => t.method === 'credit');
    if (hasCredit && !customerId) {
      setCheckoutError('Select a customer account when recording a credit sale.');
      return;
    }

    const clientSaleUuid = generateUuid();
    const itemsPayload = cart.map((l) => ({
      productId: l.product.id,
      quantity: l.quantity.toFixed(3),
      discountAmount: l.discountAmount.toFixed(2),
    }));
    const paymentsPayload = effectiveTenders.map((t) => ({
      method: t.method,
      amount: t.amount.toFixed(2),
      referenceNote: t.referenceNote,
    }));

    // Offline queueing path (D-05, D-09, D-14 itemized offline receipt preview)
    if (!isOnline) {
      const localDevice = getRegisteredLocalDevice(activeMembership.businessId);
      if (!localDevice) {
        setCheckoutError(
          'You are offline and this browser is not linked to a registered offline device yet. Register this device in Offline Devices while online.',
        );
        return;
      }

      const nowIso = new Date().toISOString();
      const offNumber = nextOfflineReceiptNumber(
        activeMembership.businessId,
        localDevice.deviceCode,
      );
      enqueueOfflineSale(activeMembership.businessId, {
        clientOperationUuid: clientSaleUuid,
        occurredAt: nowIso,
        offlineReceiptNumber: offNumber,
        deviceId: localDevice.deviceId,
        estimatedTotal: pricing.estimatedTotal.toFixed(2),
        itemSummary: cart.map((c) => `${c.quantity}× ${c.product.name}`).join(', '),
        payload: {
          clientSaleUuid,
          customerId: customerId || null,
          deviceId: localDevice.deviceId,
          offlineReceiptNumber: offNumber,
          notes: notes.trim() || null,
          items: itemsPayload,
          payments: paymentsPayload,
        },
      });

      const paidAmount = effectiveTenders
        .filter((t) => t.method !== 'credit')
        .reduce((s, t) => s + t.amount, 0);
      const creditAmount = effectiveTenders
        .filter((t) => t.method === 'credit')
        .reduce((s, t) => s + t.amount, 0);

      const offlinePreviewSale: SaleRecord = {
        id: clientSaleUuid,
        businessId: activeMembership.businessId,
        locationId: activeMembership.defaultLocationId,
        customerId: customerId || null,
        deviceId: localDevice.deviceId,
        clientSaleUuid,
        saleNumber: offNumber,
        status: 'completed',
        paymentStatus: creditAmount > 0 ? (paidAmount > 0 ? 'partial' : 'unpaid') : 'paid',
        subtotalAmount: pricing.grossSubtotal.toFixed(2),
        discountAmount: pricing.totalDiscount.toFixed(2),
        taxEnabledSnapshot: taxEnabled,
        taxModeSnapshot: taxMode,
        taxRateSnapshot: String(taxRate),
        taxAmount: pricing.estimatedTax.toFixed(2),
        totalAmount: pricing.estimatedTotal.toFixed(2),
        amountPaid: paidAmount.toFixed(2),
        creditAmount: creditAmount.toFixed(2),
        creditRemaining: creditAmount.toFixed(2),
        notes: notes.trim() || null,
        soldBy: activeMembership.userId,
        soldAt: nowIso,
        createdAt: nowIso,
        items: cart.map((line, index) => {
          const lineNet = Math.max(
            0,
            Number(line.product.sellingPrice) * line.quantity - line.discountAmount,
          );
          return {
            id: `offline-item-${index}`,
            productId: line.product.id,
            productNameSnapshot: line.product.name,
            unitSnapshot: line.product.unit,
            quantity: line.quantity.toFixed(3),
            quantityReturned: '0.000',
            unitPrice: line.product.sellingPrice,
            discountAmount: line.discountAmount.toFixed(2),
            taxRateSnapshot: line.product.isTaxExempt ? '0' : String(taxRate),
            taxAmount: '0.00',
            lineTotal: lineNet.toFixed(2),
            isTaxExemptSnapshot: line.product.isTaxExempt,
          };
        }),
        payments: effectiveTenders.map((t, index) => ({
          id: `offline-pay-${index}`,
          method: t.method,
          amount: t.amount.toFixed(2),
          referenceNote: t.referenceNote,
          createdAt: nowIso,
        })),
        receipt: null,
        returns: [],
      };

      setOfflineReceiptNo(offNumber);
      setReceiptSale(offlinePreviewSale);
      setCart([]);
      setCustomerId('');
      setTenders([{ method: 'cash', amount: '', referenceNote: '' }]);
      setNotes('');
      pushToast(`Offline sale queued (${offNumber}). Sync when back online.`, 'info');
      return;
    }

    setSubmitting(true);
    const res = await createSale(accessToken, activeMembership.businessId, {
      clientSaleUuid,
      customerId: customerId || null,
      notes: notes.trim() || null,
      items: itemsPayload,
      payments: paymentsPayload,
    });
    setSubmitting(false);

    if (!res.success || !res.data) {
      setCheckoutError(getFriendlyApiError(res.error, 'Unable to complete sale.'));
      return;
    }

    setReceiptSale(res.data.sale);
    setOfflineReceiptNo(null);
    setCart([]);
    setCustomerId('');
    setNotes('');
    setTenders([{ method: 'cash', amount: '', referenceNote: '' }]);
    pushToast(
      `Sale completed (${res.data.sale.receipt?.receiptNumber ?? res.data.sale.saleNumber}).`,
      'success',
    );
  };

  const selectedCustomerName = useMemo(() => {
    if (!receiptSale?.customerId) return null;
    return customers.find((c) => c.id === receiptSale.customerId)?.fullName ?? null;
  }, [customers, receiptSale]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Point of Sale"
        description={
          isOnline
            ? 'Tap products or scan barcodes, choose tender method(s), and issue an immutable receipt.'
            : 'Offline mode active — completed sales queue locally on registered devices for sync.'
        }
      />

      {isReadOnly && (
        <AlertBanner tone="warning" title="Read-only mode">
          New counter sales are paused until subscription renewal. Your existing receipts remain
          available.
        </AlertBanner>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Product Picker */}
        <div className="space-y-4 lg:col-span-7">
          <form onSubmit={handleBarcodeSearchSubmit}>
            <div className="relative">
              <label htmlFor="pos-search" className="sr-only">
                Search product or scan barcode
              </label>
              <Search
                className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#52525B]"
                aria-hidden="true"
              />
              <Input
                id="pos-search"
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Scan barcode or search product name / SKU..."
                className="pl-10"
              />
            </div>
          </form>

          {loading ? (
            <LoadingSkeleton rows={4} label="Loading counter catalog..." />
          ) : filteredProducts.length === 0 ? (
            <EmptyState
              title="No matching products"
              description="Add products in Catalog or clear your search filter to sell at the counter."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  disabled={isReadOnly}
                  onClick={() => addToCart(product)}
                  className="flex min-h-[76px] flex-col justify-between rounded-lg border border-[#E4E4E7] bg-white p-4 text-left transition-colors hover:border-[#991B1B] hover:bg-[#FEF2F2]/30 disabled:opacity-60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold text-[#18181B]">{product.name}</span>
                    <span className="font-mono-tabular text-sm font-bold text-[#991B1B] shrink-0">
                      {formatMoney(product.sellingPrice)}
                    </span>
                  </div>
                  <p className="mt-2 font-mono-tabular text-xs text-[#52525B]">
                    Stock: {formatQty(product.onHand)} {product.unit}
                    {product.sku ? ` · ${product.sku}` : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart & Multi-Tender Checkout */}
        <div className="lg:col-span-5">
          <Card className="divide-y divide-[#E4E4E7]">
            <div className="flex items-center justify-between px-5 py-4">
              <h2 className="text-base font-semibold text-[#18181B]">
                Current Cart (<span className="font-mono-tabular">{cart.length}</span>)
              </h2>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-medium text-[#52525B] hover:text-[#DC2626]"
                >
                  Clear
                </button>
              )}
            </div>

            <div className="p-5">
              {cart.length === 0 ? (
                <p className="py-6 text-center text-sm text-[#52525B]">
                  Tap products on the left or scan a barcode to start a sale.
                </p>
              ) : (
                <ul className="divide-y divide-[#E4E4E7]">
                  {cart.map((line) => (
                    <li key={line.product.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-[#18181B]">
                            {line.product.name}
                          </p>
                          <p className="font-mono-tabular text-xs text-[#52525B]">
                            {formatMoney(line.product.sellingPrice)} each
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            aria-label={`Decrease ${line.product.name}`}
                            onClick={() => updateQty(line.product.id, -1)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#E4E4E7] text-[#18181B] hover:bg-[#F4F5F7]"
                          >
                            <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                          <span className="w-8 text-center font-mono-tabular text-sm font-semibold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase ${line.product.name}`}
                            onClick={() => updateQty(line.product.id, 1)}
                            className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-[#E4E4E7] text-[#18181B] hover:bg-[#F4F5F7]"
                          >
                            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-xs text-[#52525B]">
                        <label
                          htmlFor={`disc-${line.product.id}`}
                          className="text-[11px] text-[#52525B]"
                        >
                          Line discount (NGN)
                        </label>
                        <input
                          id={`disc-${line.product.id}`}
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.discountAmount === 0 ? '' : line.discountAmount}
                          onChange={(e) => updateDiscount(line.product.id, e.target.value)}
                          placeholder="0.00"
                          className="h-8 w-28 rounded border border-[#E4E4E7] bg-white px-2 text-right font-mono-tabular text-xs text-[#18181B]"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-4 p-5">
              {checkoutError && <AlertBanner tone="error">{checkoutError}</AlertBanner>}

              <FormField id="pos-customer" label="Customer (optional; required for credit)">
                <Select
                  id="pos-customer"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">Walk-in customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName}
                      {Number(c.outstandingBalance) > 0
                        ? ` (Owes ${formatMoney(c.outstandingBalance)})`
                        : ''}
                    </option>
                  ))}
                </Select>
              </FormField>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#18181B]">Payment Tender(s)</p>
                  <button
                    type="button"
                    onClick={() =>
                      setTenders((prev) => [
                        ...prev,
                        { method: 'transfer', amount: '', referenceNote: '' },
                      ])
                    }
                    className="text-xs font-medium text-[#991B1B] hover:underline"
                  >
                    + Split payment
                  </button>
                </div>

                {tenders.map((t, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      aria-label={`Payment method ${idx + 1}`}
                      value={t.method}
                      onChange={(e) =>
                        setTenders((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, method: e.target.value as TenderMethod } : row,
                          ),
                        )
                      }
                    >
                      <option value="cash">Cash</option>
                      <option value="transfer">Bank Transfer</option>
                      <option value="pos_card">POS Card</option>
                      <option value="credit">Credit</option>
                    </Select>
                    <Input
                      type="number"
                      mono
                      step="0.01"
                      min="0"
                      aria-label={`Tender amount ${idx + 1}`}
                      placeholder={
                        tenders.length === 1 ? pricing.estimatedTotal.toFixed(2) : 'Amount'
                      }
                      value={t.amount}
                      onChange={(e) =>
                        setTenders((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, amount: e.target.value } : row,
                          ),
                        )
                      }
                    />
                    {tenders.length > 1 && (
                      <button
                        type="button"
                        aria-label={`Remove payment ${idx + 1}`}
                        onClick={() => setTenders((prev) => prev.filter((_, i) => i !== idx))}
                        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#52525B] hover:text-[#DC2626]"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <FormField id="pos-notes" label="Sale note (optional)">
                <Input
                  id="pos-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Transfer ref or delivery note"
                />
              </FormField>

              <dl className="space-y-1 border-t border-[#E4E4E7] pt-3 text-xs">
                <div className="flex justify-between text-[#52525B]">
                  <dt>Subtotal</dt>
                  <dd className="font-mono-tabular">{formatMoney(pricing.grossSubtotal)}</dd>
                </div>
                {pricing.totalDiscount > 0 && (
                  <div className="flex justify-between text-[#52525B]">
                    <dt>Discounts</dt>
                    <dd className="font-mono-tabular">-{formatMoney(pricing.totalDiscount)}</dd>
                  </div>
                )}
                {taxEnabled && taxRate > 0 && (
                  <div className="flex justify-between text-[#52525B]">
                    <dt>
                      Estimated Tax ({taxRate}% {taxMode})
                    </dt>
                    <dd className="font-mono-tabular">{formatMoney(pricing.estimatedTax)}</dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-[#E4E4E7] pt-2">
                  <div>
                    <dt className="text-xs font-semibold text-[#18181B]">Estimated Total</dt>
                    <p className="text-[11px] text-[#52525B]">
                      Final tax &amp; total verified by server
                    </p>
                  </div>
                  <dd className="font-mono-tabular text-xl font-bold text-[#18181B]">
                    {formatMoney(pricing.estimatedTotal)}
                  </dd>
                </div>
              </dl>

              <Button
                variant="primary"
                fullWidth
                disabled={isReadOnly || cart.length === 0}
                loading={submitting}
                loadingLabel="Processing sale..."
                onClick={() => void handleCompleteSale()}
              >
                {isOnline ? 'Complete Sale & Issue Receipt' : 'Queue Offline Sale'}
              </Button>
            </div>
          </Card>
        </div>
      </div>

      <ReceiptModal
        open={Boolean(receiptSale || offlineReceiptNo)}
        onClose={() => {
          setReceiptSale(null);
          setOfflineReceiptNo(null);
        }}
        businessName={activeMembership?.businessName ?? 'Festola Store'}
        currencyCode={business?.currencyCode ?? 'NGN'}
        sale={receiptSale}
        customerName={selectedCustomerName}
        offlineReceiptNumber={offlineReceiptNo}
        receiptFooter={business?.receiptFooter ?? null}
      />
    </div>
  );
}
