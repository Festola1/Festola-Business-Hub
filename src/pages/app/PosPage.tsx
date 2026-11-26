import { Minus, Plus, Search, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
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
import { canRoleAccess } from '../../lib/permissions';
import { emitWorkspaceEvent } from '../../lib/workspace-events';

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
 * Fast, responsive Point of Sale Counter:
 * - Barcode & SKU keyboard-first scanning + catalog search
 * - Policy-governed discounts, tax calculation, and authorized customer credit checks
 * - Pinned idempotency key per cart checkout attempt (prevents duplicate sales on retry/double-click)
 * - Cash change-due helper + digital payment reference recording + immediate stock reconciliation
 * - Authoritative server totals, WAC COGS snapshots, and immutable receipts (D-05, D-13, D-14)
 */
export default function PosPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const isOnline = useOnlineStatus();
  const { pushToast } = useToast();

  const role = activeMembership?.role ?? 'cashier';
  const canApplyDiscount = canRoleAccess(role, 'sales.apply_discount');
  const canOverrideCreditLimit = canRoleAccess(role, 'sales.authorize_credit_override');
  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const pinnedCheckoutUuidRef = useRef<string | null>(null);

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
  const [cashReceived, setCashReceived] = useState('');
  const [notes, setNotes] = useState('');
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Completed / queued receipt modal state
  const [receiptSale, setReceiptSale] = useState<SaleRecord | null>(null);
  const [offlineReceiptNo, setOfflineReceiptNo] = useState<string | null>(null);

  const invalidateCheckoutAttempt = useCallback(() => {
    pinnedCheckoutUuidRef.current = null;
  }, []);

  const refreshCounterData = useCallback(async () => {
    if (!accessToken || !activeMembership || !isOnline) return;
    const [prodRes, custRes] = await Promise.all([
      fetchProducts(accessToken, activeMembership.businessId, { isActive: true, limit: 200 }),
      fetchCustomers(accessToken, activeMembership.businessId, { limit: 200 }),
    ]);
    if (prodRes.success && prodRes.data) {
      setProducts(prodRes.data.products);
    }
    if (custRes.success && custRes.data) {
      setCustomers(custRes.data.customers);
    }
  }, [accessToken, activeMembership, isOnline]);

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

  // Quick `/` shortcut to focus barcode/product search
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === '/' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        event.preventDefault();
        document.getElementById('pos-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const allowNegativeStock = Boolean(business?.allowNegativeStock);
  const currencyCode = business?.currencyCode ?? 'NGN';

  const cartQtyByProductId = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of cart) {
      map.set(line.product.id, line.quantity);
    }
    return map;
  }, [cart]);

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
      const clampedDiscount = canApplyDiscount
        ? Math.min(lineGross, Math.max(0, line.discountAmount))
        : 0;
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
  }, [cart, canApplyDiscount, taxEnabled, taxMode, taxRate]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === customerId) ?? null,
    [customers, customerId],
  );

  const resolvedTenders = useMemo(
    () =>
      tenders.map((t) => ({
        method: t.method,
        amount:
          t.amount.trim() !== ''
            ? Number(t.amount)
            : tenders.length === 1
              ? pricing.estimatedTotal
              : 0,
        referenceNote: t.referenceNote.trim() || null,
      })),
    [tenders, pricing.estimatedTotal],
  );

  const tenderedSum = useMemo(
    () =>
      Number(
        resolvedTenders
          .filter((t) => Number.isFinite(t.amount) && t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0)
          .toFixed(2),
      ),
    [resolvedTenders],
  );

  const cashTenderAllocation = useMemo(
    () =>
      Number(
        resolvedTenders
          .filter((t) => t.method === 'cash' && Number.isFinite(t.amount) && t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0)
          .toFixed(2),
      ),
    [resolvedTenders],
  );

  const creditTenderAllocation = useMemo(
    () =>
      Number(
        resolvedTenders
          .filter((t) => t.method === 'credit' && Number.isFinite(t.amount) && t.amount > 0)
          .reduce((sum, t) => sum + t.amount, 0)
          .toFixed(2),
      ),
    [resolvedTenders],
  );

  const cashReceivedNum = Number(cashReceived);
  const changeDue =
    cashTenderAllocation > 0 && Number.isFinite(cashReceivedNum) && cashReceivedNum > cashTenderAllocation
      ? Number((cashReceivedNum - cashTenderAllocation).toFixed(2))
      : 0;

  const creditAvailable = useMemo(() => {
    if (!selectedCustomer || selectedCustomer.creditLimit === null) return null;
    return Number(
      (Number(selectedCustomer.creditLimit) - Number(selectedCustomer.outstandingBalance)).toFixed(2),
    );
  }, [selectedCustomer]);

  const addToCart = (product: ProductItem) => {
    setCheckoutError(null);
    const available = Number(product.onHand);
    const currentInCart = cartQtyByProductId.get(product.id) ?? 0;

    if (!allowNegativeStock && currentInCart + 1 > available) {
      setCheckoutError(
        `Insufficient stock for "${product.name}". Only ${formatQty(available)} ${product.unit} available.`,
      );
      return;
    }

    invalidateCheckoutAttempt();
    setCart((prev) => {
      const existing = prev.find((l) => l.product.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.product.id === product.id ? { ...l, quantity: Number((l.quantity + 1).toFixed(3)) } : l,
        );
      }
      return [...prev, { product, quantity: 1, discountAmount: 0 }];
    });
  };

  const updateQty = (productId: string, delta: number) => {
    setCheckoutError(null);
    const line = cart.find((l) => l.product.id === productId);
    if (!line) return;
    const nextQty = Number((line.quantity + delta).toFixed(3));
    if (nextQty > 0 && !allowNegativeStock && nextQty > Number(line.product.onHand)) {
      setCheckoutError(
        `Insufficient stock for "${line.product.name}". Only ${formatQty(line.product.onHand)} ${line.product.unit} available.`,
      );
      return;
    }
    invalidateCheckoutAttempt();
    setCart((prev) =>
      prev
        .map((l) => (l.product.id === productId ? { ...l, quantity: Math.max(0, nextQty) } : l))
        .filter((l) => l.quantity > 0),
    );
  };

  const setExactQty = (productId: string, rawValue: string) => {
    setCheckoutError(null);
    const parsed = Number(rawValue);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    const rounded = Number(parsed.toFixed(3));
    const line = cart.find((l) => l.product.id === productId);
    if (!line) return;

    if (!allowNegativeStock && rounded > Number(line.product.onHand)) {
      setCheckoutError(
        `Insufficient stock for "${line.product.name}". Only ${formatQty(line.product.onHand)} ${line.product.unit} available.`,
      );
      return;
    }
    invalidateCheckoutAttempt();
    setCart((prev) =>
      prev.map((l) => {
        if (l.product.id !== productId) return l;
        const maxDiscount = Number(l.product.sellingPrice) * rounded;
        return {
          ...l,
          quantity: rounded,
          discountAmount: Math.min(l.discountAmount, maxDiscount),
        };
      }),
    );
  };

  const removeFromCart = (productId: string) => {
    invalidateCheckoutAttempt();
    setCart((prev) => prev.filter((l) => l.product.id !== productId));
  };

  const updateDiscount = (productId: string, rawValue: string) => {
    if (!canApplyDiscount) return;
    invalidateCheckoutAttempt();
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
      document.getElementById('pos-search')?.focus();
    } else if (filteredProducts.length === 1) {
      const onlyMatch = filteredProducts[0];
      if (onlyMatch) {
        addToCart(onlyMatch);
        setSearch('');
        pushToast(`Added ${onlyMatch.name} to cart.`, 'info');
        document.getElementById('pos-search')?.focus();
      }
    }
  };

  const handleCompleteSale = async () => {
    if (!accessToken || !activeMembership || submitting) return;
    setCheckoutError(null);

    if (cart.length === 0) {
      setCheckoutError('Add at least one product to the cart before checking out.');
      return;
    }

    const effectiveTenders = resolvedTenders.filter((t) => Number.isFinite(t.amount) && t.amount > 0);
    if (effectiveTenders.length === 0) {
      setCheckoutError('Enter a valid payment amount.');
      return;
    }

    if (Math.abs(tenderedSum - pricing.estimatedTotal) > 0.009) {
      setCheckoutError(
        `Tender total (${formatMoney(tenderedSum, currencyCode)}) must equal cart total (${formatMoney(pricing.estimatedTotal, currencyCode)}).`,
      );
      return;
    }

    if (creditTenderAllocation > 0) {
      if (!selectedCustomer) {
        setCheckoutError('Select a registered customer account when recording a credit sale.');
        return;
      }
      if (selectedCustomer.creditLimit === null && !canOverrideCreditLimit) {
        setCheckoutError(
          'This customer has no approved credit limit. Ask a Manager or Owner to set a credit limit or authorize this sale.',
        );
        return;
      }
      if (creditAvailable !== null && creditTenderAllocation > creditAvailable + 0.001) {
        setCheckoutError(
          `Credit amount exceeds ${selectedCustomer.fullName}'s available credit (${formatMoney(Math.max(0, creditAvailable), currencyCode)}).`,
        );
        return;
      }
    }

    if (!pinnedCheckoutUuidRef.current) {
      pinnedCheckoutUuidRef.current = generateUuid();
    }
    const clientSaleUuid = pinnedCheckoutUuidRef.current;

    const itemsPayload = cart.map((l) => ({
      productId: l.product.id,
      quantity: l.quantity.toFixed(3),
      discountAmount: (canApplyDiscount ? l.discountAmount : 0).toFixed(2),
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
            Number(line.product.sellingPrice) * line.quantity -
              (canApplyDiscount ? line.discountAmount : 0),
          );
          return {
            id: `offline-item-${index}`,
            productId: line.product.id,
            productNameSnapshot: line.product.name,
            unitSnapshot: line.product.unit,
            quantity: line.quantity.toFixed(3),
            quantityReturned: '0.000',
            unitPrice: line.product.sellingPrice,
            discountAmount: (canApplyDiscount ? line.discountAmount : 0).toFixed(2),
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

      pinnedCheckoutUuidRef.current = null;
      setOfflineReceiptNo(offNumber);
      setReceiptSale(offlinePreviewSale);
      setCart([]);
      setCustomerId('');
      setCashReceived('');
      setTenders([{ method: 'cash', amount: '', referenceNote: '' }]);
      setNotes('');
      pushToast(`Offline sale queued (${offNumber}). Sync when back online.`, 'info');
      return;
    }

    setSubmitting(true);
    const res = await createSale(
      accessToken,
      activeMembership.businessId,
      {
        clientSaleUuid,
        customerId: customerId || null,
        notes: notes.trim() || null,
        items: itemsPayload,
        payments: paymentsPayload,
      },
      clientSaleUuid,
    );
    setSubmitting(false);

    if (!res.success || !res.data) {
      setCheckoutError(getFriendlyApiError(res.error, 'Unable to complete sale.'));
      return;
    }

    // Clear pinned key ONLY after server commit succeeds
    pinnedCheckoutUuidRef.current = null;

    // Immediately reconcile local on-hand balances, then refresh from server
    const soldQtyByProduct = new Map<string, number>();
    for (const item of res.data.sale.items) {
      soldQtyByProduct.set(
        item.productId,
        (soldQtyByProduct.get(item.productId) ?? 0) + Number(item.quantity),
      );
    }
    setProducts((prev) =>
      prev.map((p) => {
        const deducted = soldQtyByProduct.get(p.id);
        if (!deducted) return p;
        return { ...p, onHand: (Number(p.onHand) - deducted).toFixed(3) };
      }),
    );

    setReceiptSale(res.data.sale);
    setOfflineReceiptNo(null);
    setCart([]);
    setCustomerId('');
    setCashReceived('');
    setNotes('');
    setTenders([{ method: 'cash', amount: '', referenceNote: '' }]);
    pushToast(
      `Sale completed (${res.data.sale.receipt?.receiptNumber ?? res.data.sale.saleNumber}).`,
      'success',
    );
    emitWorkspaceEvent(activeMembership.businessId, 'sales');
    void refreshCounterData();
  };

  const selectedReceiptCustomerName = useMemo(() => {
    if (!receiptSale?.customerId) return null;
    return customers.find((c) => c.id === receiptSale.customerId)?.fullName ?? null;
  }, [customers, receiptSale]);

  const splitRemaining = Number((pricing.estimatedTotal - tenderedSum).toFixed(2));

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Point of Sale"
        description={
          isOnline
            ? 'Scan barcodes or tap products, collect Cash, Digital, or Authorized Credit tenders, and issue an immutable receipt.'
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
                placeholder="Scan barcode or search product name / SKU... (press / to focus)"
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
              {filteredProducts.map((product) => {
                const onHandNum = Number(product.onHand);
                const reorderNum = Number(product.reorderLevel);
                const inCartQty = cartQtyByProductId.get(product.id) ?? 0;
                const remainingSelectable = onHandNum - inCartQty;
                const isOutOfStock = !allowNegativeStock && remainingSelectable <= 0;
                const isLowStock = onHandNum > 0 && onHandNum <= reorderNum;

                return (
                  <button
                    key={product.id}
                    type="button"
                    disabled={isReadOnly || isOutOfStock}
                    onClick={() => addToCart(product)}
                    className={`flex min-h-[82px] flex-col justify-between rounded-lg border bg-white p-4 text-left transition-colors disabled:opacity-55 ${
                      inCartQty > 0
                        ? 'border-[#991B1B] bg-[#FEF2F2]/20'
                        : 'border-[#E4E4E7] hover:border-[#991B1B] hover:bg-[#FEF2F2]/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-semibold text-[#18181B]">{product.name}</span>
                      <span className="font-mono-tabular text-sm font-bold text-[#991B1B] shrink-0">
                        {formatMoney(product.sellingPrice, currencyCode)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                      <span
                        className={`font-mono-tabular ${
                          onHandNum <= 0
                            ? 'font-semibold text-[#DC2626]'
                            : isLowStock
                              ? 'font-medium text-[#D97706]'
                              : 'text-[#52525B]'
                        }`}
                      >
                        Stock: {formatQty(product.onHand)} {product.unit}
                        {product.sku ? ` · ${product.sku}` : ''}
                      </span>
                      {inCartQty > 0 && (
                        <span className="font-mono-tabular text-[11px] font-semibold text-[#991B1B]">
                          {formatQty(inCartQty)} in cart
                        </span>
                      )}
                      {isOutOfStock && inCartQty === 0 && (
                        <span className="text-[11px] font-semibold text-[#DC2626]">
                          Out of stock
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
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
                  onClick={() => {
                    invalidateCheckoutAttempt();
                    setCart([]);
                    setCashReceived('');
                  }}
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
                  {cart.map((line) => {
                    const lineGross = Number(line.product.sellingPrice) * line.quantity;
                    const lineNet = Math.max(
                      0,
                      lineGross - (canApplyDiscount ? line.discountAmount : 0),
                    );
                    return (
                      <li key={line.product.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-[#18181B]">
                              {line.product.name}
                            </p>
                            <p className="font-mono-tabular text-xs text-[#52525B]">
                              {formatMoney(line.product.sellingPrice, currencyCode)} ×{' '}
                              {formatQty(line.quantity)} ={' '}
                              <span className="font-semibold text-[#18181B]">
                                {formatMoney(lineNet, currencyCode)}
                              </span>
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              aria-label={`Decrease ${line.product.name}`}
                              onClick={() => updateQty(line.product.id, -1)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E4E4E7] text-[#18181B] hover:bg-[#F4F5F7]"
                            >
                              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <input
                              type="number"
                              aria-label={`Quantity for ${line.product.name}`}
                              min="0.001"
                              step="1"
                              value={line.quantity}
                              onChange={(e) => setExactQty(line.product.id, e.target.value)}
                              className="h-9 w-14 rounded-md border border-[#E4E4E7] bg-white px-1.5 text-center font-mono-tabular text-sm font-semibold text-[#18181B]"
                            />
                            <button
                              type="button"
                              aria-label={`Increase ${line.product.name}`}
                              onClick={() => updateQty(line.product.id, 1)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[#E4E4E7] text-[#18181B] hover:bg-[#F4F5F7]"
                            >
                              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              aria-label={`Remove ${line.product.name}`}
                              onClick={() => removeFromCart(line.product.id)}
                              className="inline-flex h-9 w-8 items-center justify-center rounded-md text-[#71717A] hover:text-[#DC2626]"
                            >
                              <X className="h-3.5 w-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 text-xs text-[#52525B]">
                          <label
                            htmlFor={`disc-${line.product.id}`}
                            className="text-[11px] text-[#52525B]"
                          >
                            Line discount ({currencyCode})
                            {!canApplyDiscount && (
                              <span className="ml-1 text-[10px] text-[#71717A]">
                                (Manager/Owner only)
                              </span>
                            )}
                          </label>
                          <input
                            id={`disc-${line.product.id}`}
                            type="number"
                            min="0"
                            step="0.01"
                            disabled={!canApplyDiscount}
                            title={
                              canApplyDiscount
                                ? 'Approved line discount'
                                : 'Discounts require Manager or Owner approval'
                            }
                            value={line.discountAmount === 0 ? '' : line.discountAmount}
                            onChange={(e) => updateDiscount(line.product.id, e.target.value)}
                            placeholder={canApplyDiscount ? '0.00' : 'Locked'}
                            className="h-8 w-28 rounded border border-[#E4E4E7] bg-white px-2 text-right font-mono-tabular text-xs text-[#18181B] disabled:cursor-not-allowed disabled:bg-[#F4F5F7] disabled:text-[#71717A]"
                          />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="space-y-4 p-5">
              {checkoutError && <AlertBanner tone="error">{checkoutError}</AlertBanner>}

              <div className="space-y-2">
                <FormField id="pos-customer" label="Customer (optional; required for credit)">
                  <Select
                    id="pos-customer"
                    value={customerId}
                    onChange={(e) => {
                      invalidateCheckoutAttempt();
                      setCustomerId(e.target.value);
                    }}
                  >
                    <option value="">Walk-in customer</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.fullName}
                        {Number(c.outstandingBalance) > 0
                          ? ` (Owes ${formatMoney(c.outstandingBalance, currencyCode)})`
                          : ''}
                      </option>
                    ))}
                  </Select>
                </FormField>

                {selectedCustomer && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[#E4E4E7] bg-[#F4F5F7]/60 px-3 py-2 text-[11px] text-[#52525B]">
                    <span>
                      Balance:{' '}
                      <strong className="font-mono-tabular text-[#18181B]">
                        {formatMoney(selectedCustomer.outstandingBalance, currencyCode)}
                      </strong>
                    </span>
                    <span>
                      Credit Limit:{' '}
                      <strong className="font-mono-tabular text-[#18181B]">
                        {selectedCustomer.creditLimit !== null
                          ? formatMoney(selectedCustomer.creditLimit, currencyCode)
                          : 'Not set'}
                      </strong>
                    </span>
                    {creditAvailable !== null && (
                      <span>
                        Available:{' '}
                        <strong
                          className={`font-mono-tabular ${
                            creditAvailable <= 0 ? 'text-[#DC2626]' : 'text-[#16A34A]'
                          }`}
                        >
                          {formatMoney(Math.max(0, creditAvailable), currencyCode)}
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-[#18181B]">Payment Tender(s)</p>
                  <button
                    type="button"
                    onClick={() => {
                      invalidateCheckoutAttempt();
                      setTenders((prev) => [
                        ...prev,
                        {
                          method: 'transfer',
                          amount:
                            splitRemaining > 0 && prev.length === 1
                              ? ''
                              : splitRemaining > 0
                                ? splitRemaining.toFixed(2)
                                : '',
                          referenceNote: '',
                        },
                      ]);
                    }}
                    className="text-xs font-medium text-[#991B1B] hover:underline"
                  >
                    + Split payment
                  </button>
                </div>

                {tenders.map((t, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Select
                        aria-label={`Payment method ${idx + 1}`}
                        value={t.method}
                        onChange={(e) => {
                          invalidateCheckoutAttempt();
                          setTenders((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, method: e.target.value as TenderMethod } : row,
                            ),
                          );
                        }}
                      >
                        <option value="cash">Cash</option>
                        <option value="transfer">Bank Transfer</option>
                        <option value="pos_card">POS Card</option>
                        <option value="credit">Authorized Credit</option>
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
                        onChange={(e) => {
                          invalidateCheckoutAttempt();
                          setTenders((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, amount: e.target.value } : row,
                            ),
                          );
                        }}
                      />
                      {tenders.length > 1 && (
                        <button
                          type="button"
                          aria-label={`Remove payment ${idx + 1}`}
                          onClick={() => {
                            invalidateCheckoutAttempt();
                            setTenders((prev) => prev.filter((_, i) => i !== idx));
                          }}
                          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#52525B] hover:text-[#DC2626]"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    {(t.method === 'transfer' || t.method === 'pos_card') && (
                      <Input
                        aria-label={`Payment reference ${idx + 1}`}
                        value={t.referenceNote}
                        onChange={(e) => {
                          invalidateCheckoutAttempt();
                          setTenders((prev) =>
                            prev.map((row, i) =>
                              i === idx ? { ...row, referenceNote: e.target.value } : row,
                            ),
                          );
                        }}
                        placeholder={
                          t.method === 'transfer'
                            ? 'Bank transfer reference (optional)'
                            : 'POS terminal RRN / approval code (optional)'
                        }
                        className="h-9 text-xs"
                      />
                    )}
                  </div>
                ))}

                {tenders.length > 1 && Math.abs(splitRemaining) > 0.009 && (
                  <p
                    className={`font-mono-tabular text-[11px] font-medium ${
                      splitRemaining > 0 ? 'text-[#D97706]' : 'text-[#DC2626]'
                    }`}
                  >
                    {splitRemaining > 0
                      ? `Remaining to allocate: ${formatMoney(splitRemaining, currencyCode)}`
                      : `Over-allocated by ${formatMoney(Math.abs(splitRemaining), currencyCode)}`}
                  </p>
                )}

                {cashTenderAllocation > 0 && cart.length > 0 && (
                  <div className="flex items-center justify-between gap-2 rounded-md border border-[#E4E4E7] bg-[#F4F5F7]/50 px-3 py-2 text-xs">
                    <label htmlFor="pos-cash-received" className="text-[#52525B]">
                      Cash received
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="pos-cash-received"
                        type="number"
                        min="0"
                        step="0.01"
                        value={cashReceived}
                        onChange={(e) => setCashReceived(e.target.value)}
                        placeholder={cashTenderAllocation.toFixed(2)}
                        className="h-8 w-28 rounded border border-[#E4E4E7] bg-white px-2 text-right font-mono-tabular text-xs text-[#18181B]"
                      />
                      <span className="font-mono-tabular text-[11px] font-semibold text-[#16A34A]">
                        Change: {formatMoney(changeDue, currencyCode)}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <FormField id="pos-notes" label="Sale note (optional)">
                <Input
                  id="pos-notes"
                  value={notes}
                  onChange={(e) => {
                    invalidateCheckoutAttempt();
                    setNotes(e.target.value);
                  }}
                  placeholder="Delivery note or invoice memo"
                />
              </FormField>

              <dl className="space-y-1 border-t border-[#E4E4E7] pt-3 text-xs">
                <div className="flex justify-between text-[#52525B]">
                  <dt>Subtotal</dt>
                  <dd className="font-mono-tabular">
                    {formatMoney(pricing.grossSubtotal, currencyCode)}
                  </dd>
                </div>
                {pricing.totalDiscount > 0 && (
                  <div className="flex justify-between text-[#52525B]">
                    <dt>Approved Discounts</dt>
                    <dd className="font-mono-tabular">
                      -{formatMoney(pricing.totalDiscount, currencyCode)}
                    </dd>
                  </div>
                )}
                {taxEnabled && taxRate > 0 && (
                  <div className="flex justify-between text-[#52525B]">
                    <dt>
                      Estimated Tax ({taxRate}% {taxMode})
                    </dt>
                    <dd className="font-mono-tabular">
                      {formatMoney(pricing.estimatedTax, currencyCode)}
                    </dd>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-[#E4E4E7] pt-2">
                  <div>
                    <dt className="text-xs font-semibold text-[#18181B]">Estimated Total</dt>
                    <p className="text-[11px] text-[#52525B]">
                      Authoritative total, tax &amp; stock committed by server
                    </p>
                  </div>
                  <dd className="font-mono-tabular text-xl font-bold text-[#18181B]">
                    {formatMoney(pricing.estimatedTotal, currencyCode)}
                  </dd>
                </div>
              </dl>

              <Button
                variant="primary"
                fullWidth
                disabled={isReadOnly || cart.length === 0}
                loading={submitting}
                loadingLabel="Committing sale..."
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
        currencyCode={currencyCode}
        sale={receiptSale}
        customerName={selectedReceiptCustomerName}
        offlineReceiptNumber={offlineReceiptNo}
        receiptFooter={business?.receiptFooter ?? null}
      />
    </div>
  );
}
