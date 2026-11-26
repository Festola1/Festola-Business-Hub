import { Eye, Printer, RotateCcw, Search } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ReceiptModal } from '../../components/receipts/ReceiptModal';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { FormField, Input, Select } from '../../components/ui/FormControls';
import { Modal } from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Pagination';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  fetchSaleDetail,
  fetchSales,
  returnSaleItems,
  voidSale,
  type SalePaymentStatus,
  type SaleRecord,
  type SaleStatus,
  type TenderMethod,
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import { formatDateTime, formatMoney, formatQty, generateUuid } from '../../lib/format';
import { fetchCurrentBusiness } from '../../lib/identity-api';
import { canRoleAccess } from '../../lib/permissions';
import { emitWorkspaceEvent, useWorkspaceEventTick } from '../../lib/workspace-events';

interface ReturnLineDraft {
  saleItemId: string;
  quantity: string;
  disposition: 'restock' | 'damaged';
}

function formatTenderMethodLabel(method: TenderMethod): string {
  if (method === 'pos_card') return 'POS Card';
  if (method === 'transfer') return 'Bank Transfer';
  if (method === 'credit') return 'Credit';
  return 'Cash';
}

function getSaleStatusClass(status: SaleStatus): string {
  if (status === 'voided') return 'text-[#DC2626] font-semibold';
  if (status === 'returned' || status === 'partially_returned') return 'text-[#D97706] font-medium';
  return 'text-[#16A34A] font-medium';
}

function toRangeStartIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  return `${dateStr}T00:00:00.000Z`;
}

function toRangeEndIso(dateStr: string): string | undefined {
  if (!dateStr) return undefined;
  return `${dateStr}T23:59:59.999Z`;
}

/**
 * Sales & Receipts Ledger + Sale Detail Inspection + Owner/Manager Online-Only Multi-Item Returns & Audited Voids (D-14, D-15).
 */
export default function SalesPage() {
  const { accessToken, activeMembership } = useAuth();
  const isOnline = useOnlineStatus();
  const { pushToast } = useToast();

  const role = activeMembership?.role ?? 'cashier';
  const canVoidOrReturn = canRoleAccess(role, 'sales.void_or_return');
  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SaleStatus | ''>('');
  const [paymentFilter, setPaymentFilter] = useState<SalePaymentStatus | ''>('');
  const [methodFilter, setMethodFilter] = useState<TenderMethod | ''>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const reactiveTick = useWorkspaceEventTick(activeMembership?.businessId, ['sales', 'sync']);

  const [selectedReceiptSale, setSelectedReceiptSale] = useState<SaleRecord | null>(null);
  const [detailSale, setDetailSale] = useState<SaleRecord | null>(null);
  const [receiptFooter, setReceiptFooter] = useState<string | null>(null);
  const [currencyCode, setCurrencyCode] = useState('NGN');
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  // Void / Multi-Item Return modal state (Owner/Manager online-only D-15)
  const [actionSale, setActionSale] = useState<SaleRecord | null>(null);
  const [actionMode, setActionMode] = useState<'void' | 'return'>('return');
  const [reason, setReason] = useState('');
  const [voidDisposition, setVoidDisposition] = useState<'restock' | 'damaged'>('restock');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'transfer' | 'pos_card'>('cash');
  const [refundReferenceNote, setRefundReferenceNote] = useState('');
  const [returnLines, setReturnLines] = useState<Record<string, ReturnLineDraft>>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState(false);
  const actionIdempotencyRef = useRef<string | null>(null);

  const hasActiveFilters = Boolean(
    search.trim() || statusFilter || paymentFilter || methodFilter || fromDate || toDate,
  );

  useEffect(() => {
    if (!accessToken || !activeMembership) return;
    let cancelled = false;

    void Promise.all([
      fetchSales(accessToken, activeMembership.businessId, {
        search,
        status: statusFilter || undefined,
        paymentStatus: paymentFilter || undefined,
        paymentMethod: methodFilter || undefined,
        from: toRangeStartIso(fromDate),
        to: toRangeEndIso(toDate),
        limit: 100,
      }),
      fetchCurrentBusiness(accessToken, activeMembership.businessId),
    ]).then(([res, bizRes]) => {
      if (cancelled) return;
      if (!res.success || !res.data) {
        setErrorMessage(getFriendlyApiError(res.error, 'Unable to load sales ledger.'));
        setLoading(false);
        return;
      }
      setSales(res.data.sales);
      setPage(1);
      if (bizRes.success && bizRes.data?.business) {
        setReceiptFooter(bizRes.data.business.receiptFooter ?? null);
        setCurrencyCode(bizRes.data.business.currencyCode ?? 'NGN');
      }
      setErrorMessage(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    activeMembership,
    search,
    statusFilter,
    paymentFilter,
    methodFilter,
    fromDate,
    toDate,
    reloadTick,
    reactiveTick,
  ]);

  const loadFreshSale = async (sale: SaleRecord): Promise<SaleRecord> => {
    if (!accessToken || !activeMembership) return sale;
    setLoadingDetailId(sale.id);
    const res = await fetchSaleDetail(accessToken, activeMembership.businessId, sale.id);
    setLoadingDetailId(null);
    if (res.success && res.data?.sale) {
      return res.data.sale;
    }
    return sale;
  };

  const openReceiptModal = async (sale: SaleRecord) => {
    const fresh = await loadFreshSale(sale);
    setSelectedReceiptSale(fresh);
  };

  const openDetailModal = async (sale: SaleRecord) => {
    const fresh = await loadFreshSale(sale);
    setDetailSale(fresh);
  };

  const openActionModal = async (sale: SaleRecord, mode: 'void' | 'return') => {
    const fresh = await loadFreshSale(sale);
    setActionSale(fresh);
    setActionMode(mode === 'void' && fresh.status !== 'completed' ? 'return' : mode);
    setReason('');
    setVoidDisposition('restock');
    setRefundMethod('cash');
    setRefundReferenceNote('');
    actionIdempotencyRef.current = null;

    const initialLines: Record<string, ReturnLineDraft> = {};
    let prefilledFirst = false;
    for (const item of fresh.items) {
      const remaining = Math.max(0, Number(item.quantity) - Number(item.quantityReturned));
      const defaultQty = !prefilledFirst && remaining > 0 ? String(Math.min(1, remaining)) : '';
      if (defaultQty) prefilledFirst = true;
      initialLines[item.id] = {
        saleItemId: item.id,
        quantity: defaultQty,
        disposition: 'restock',
      };
    }
    setReturnLines(initialLines);
    setActionError(null);
  };

  const reversalPreview = useMemo(() => {
    if (!actionSale) return { totalReversed: 0, debtReduced: 0, refundDue: 0 };

    let totalReversed = 0;
    if (actionMode === 'void') {
      totalReversed = Number(actionSale.totalAmount);
    } else {
      for (const item of actionSale.items) {
        const draft = returnLines[item.id];
        const qty = Number(draft?.quantity ?? 0);
        const origQty = Number(item.quantity);
        if (!Number.isFinite(qty) || qty <= 0 || origQty <= 0) continue;
        const clampedQty = Math.min(qty, Math.max(0, origQty - Number(item.quantityReturned)));
        totalReversed += (Number(item.lineTotal) * clampedQty) / origQty;
      }
    }

    totalReversed = Number(totalReversed.toFixed(2));
    const creditRemaining = Number(actionSale.creditRemaining);
    const debtReduced = Number(Math.min(creditRemaining, totalReversed).toFixed(2));
    const refundDue = Number(Math.max(0, totalReversed - debtReduced).toFixed(2));
    return { totalReversed, debtReduced, refundDue };
  }, [actionSale, actionMode, returnLines]);

  const handleSubmitVoidOrReturn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership || !actionSale || processingAction) return;
    setActionError(null);

    if (!isOnline) {
      setActionError('Voids and returns require an active online connection (D-15).');
      return;
    }
    if (reason.trim().length < 5) {
      setActionError('Provide a detailed reason (at least 5 characters) for the audit ledger.');
      return;
    }

    const selectedItems =
      actionMode === 'return'
        ? actionSale.items
            .map((item) => {
              const draft = returnLines[item.id];
              const qty = Number(draft?.quantity ?? 0);
              const remaining = Math.max(0, Number(item.quantity) - Number(item.quantityReturned));
              return {
                item,
                qty,
                remaining,
                disposition: draft?.disposition ?? 'restock',
              };
            })
            .filter((row) => Number.isFinite(row.qty) && row.qty > 0)
        : [];

    if (actionMode === 'return') {
      if (selectedItems.length === 0) {
        setActionError('Enter a return quantity for at least one line item.');
        return;
      }
      const exceeded = selectedItems.find((row) => row.qty > row.remaining + 0.0001);
      if (exceeded) {
        setActionError(
          `Return quantity for "${exceeded.item.productNameSnapshot}" exceeds remaining returnable quantity (${formatQty(exceeded.remaining)}).`,
        );
        return;
      }
    }

    if (!actionIdempotencyRef.current) {
      actionIdempotencyRef.current = generateUuid();
    }

    setProcessingAction(true);
    const res =
      actionMode === 'void'
        ? await voidSale(
            accessToken,
            activeMembership.businessId,
            actionSale.id,
            {
              reason: reason.trim(),
              disposition: voidDisposition,
              refundMethod,
              refundReferenceNote: refundReferenceNote.trim() || null,
            },
            actionIdempotencyRef.current,
          )
        : await returnSaleItems(
            accessToken,
            activeMembership.businessId,
            actionSale.id,
            {
              reason: reason.trim(),
              refundMethod,
              refundReferenceNote: refundReferenceNote.trim() || null,
              items: selectedItems.map((row) => ({
                saleItemId: row.item.id,
                quantity: row.qty.toFixed(3),
                disposition: row.disposition,
              })),
            },
            actionIdempotencyRef.current,
          );
    setProcessingAction(false);

    if (!res.success) {
      setActionError(getFriendlyApiError(res.error, 'Unable to process sale correction.'));
      return;
    }

    actionIdempotencyRef.current = null;
    setActionSale(null);
    if (detailSale && detailSale.id === actionSale.id && res.data?.sale) {
      setDetailSale(res.data.sale);
    }
    pushToast(
      actionMode === 'void'
        ? 'Sale voided with non-destructive reversal and audit log.'
        : 'Item return processed (debt reduced first, remainder refunded).',
      'success',
    );
    emitWorkspaceEvent(activeMembership.businessId, 'sales');
    setReloadTick((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Sales & Receipts"
        description="Inspect completed sales, filter by date or tender method, print immutable receipts, and process Owner/Manager returns or audited voids."
      />

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="relative md:col-span-4">
            <label htmlFor="sales-search" className="sr-only">
              Search receipts
            </label>
            <Search
              className="pointer-events-none absolute top-3.5 left-3.5 h-4 w-4 text-[#52525B]"
              aria-hidden="true"
            />
            <Input
              id="sales-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt number or notes..."
              className="pl-10"
            />
          </div>

          <div className="md:col-span-2">
            <Select
              aria-label="Filter by sale status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as SaleStatus | '')}
            >
              <option value="">All statuses</option>
              <option value="completed">Completed</option>
              <option value="partially_returned">Partially returned</option>
              <option value="returned">Returned</option>
              <option value="voided">Voided</option>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Select
              aria-label="Filter by payment status"
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as SalePaymentStatus | '')}
            >
              <option value="">All payment states</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial credit</option>
              <option value="unpaid">Unpaid credit</option>
            </Select>
          </div>

          <div className="md:col-span-2">
            <Select
              aria-label="Filter by payment method"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value as TenderMethod | '')}
            >
              <option value="">All methods</option>
              <option value="cash">Cash</option>
              <option value="transfer">Bank Transfer</option>
              <option value="pos_card">POS Card</option>
              <option value="credit">Credit</option>
            </Select>
          </div>

          <div className="md:col-span-2 flex items-center justify-end">
            {hasActiveFilters && (
              <Button
                variant="secondary"
                size="sm"
                fullWidth
                onClick={() => {
                  setSearch('');
                  setStatusFilter('');
                  setPaymentFilter('');
                  setMethodFilter('');
                  setFromDate('');
                  setToDate('');
                }}
              >
                Reset Filters
              </Button>
            )}
          </div>

          <div className="md:col-span-3">
            <label htmlFor="sales-from" className="mb-1 block text-[11px] font-medium text-[#52525B]">
              From date
            </label>
            <Input
              id="sales-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div className="md:col-span-3">
            <label htmlFor="sales-to" className="mb-1 block text-[11px] font-medium text-[#52525B]">
              To date
            </label>
            <Input
              id="sales-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {loading ? (
        <LoadingSkeleton rows={5} label="Loading sales ledger..." />
      ) : errorMessage ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => {
            setLoading(true);
            setReloadTick((n) => n + 1);
          }}
        />
      ) : sales.length === 0 ? (
        <EmptyState
          title="No sales found"
          description={
            hasActiveFilters
              ? 'No transactions match your active filters. Try clearing one or more filters.'
              : 'Completed sales and immutable receipts will appear here once transactions are recorded in Point of Sale.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7]/60 text-xs text-[#52525B]">
                <tr>
                  <th className="px-5 py-3 font-medium">Receipt &amp; Time</th>
                  <th className="px-4 py-3 font-medium">Status &amp; Tenders</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {sales.slice((page - 1) * pageSize, page * pageSize).map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#F4F5F7]/40">
                    <td className="px-5 py-3">
                      <button
                        type="button"
                        onClick={() => void openDetailModal(sale)}
                        className="text-left hover:underline"
                      >
                        <p className="font-mono-tabular text-xs font-semibold text-[#18181B]">
                          {sale.receipt?.receiptNumber ?? sale.saleNumber}
                        </p>
                      </button>
                      <p className="font-mono-tabular text-[11px] text-[#52525B]">
                        {formatDateTime(sale.soldAt)} · {sale.items.length} item
                        {sale.items.length === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <p className="capitalize">
                        <span className={getSaleStatusClass(sale.status)}>
                          {sale.status.replace('_', ' ')}
                        </span>
                        <span className="text-[#52525B]"> · {sale.paymentStatus}</span>
                      </p>
                      <p className="text-[11px] text-[#71717A]">
                        {sale.payments.map((p) => formatTenderMethodLabel(p.method)).join(' + ')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-xs text-[#52525B]">
                      {formatMoney(sale.amountPaid, currencyCode)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#18181B]">
                      {formatMoney(sale.totalAmount, currencyCode)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={loadingDetailId === sale.id}
                          onClick={() => void openDetailModal(sale)}
                        >
                          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Details</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          loading={loadingDetailId === sale.id}
                          onClick={() => void openReceiptModal(sale)}
                        >
                          <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Receipt</span>
                        </Button>
                        {canVoidOrReturn &&
                          !isReadOnly &&
                          sale.status !== 'voided' &&
                          sale.status !== 'returned' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={!isOnline || loadingDetailId === sale.id}
                              onClick={() => void openActionModal(sale, 'return')}
                            >
                              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Return / Void</span>
                            </Button>
                          )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 pb-4">
            <Pagination
              page={page}
              pageSize={pageSize}
              totalItems={sales.length}
              onPageChange={setPage}
              onPageSizeChange={(nextSize) => {
                setPageSize(nextSize);
                setPage(1);
              }}
              itemLabel="sales"
            />
          </div>
        </Card>
      )}

      {/* Sale Detail Inspection Modal */}
      <Modal
        open={Boolean(detailSale)}
        onClose={() => setDetailSale(null)}
        title={
          detailSale
            ? `Sale ${detailSale.receipt?.receiptNumber ?? detailSale.saleNumber}`
            : 'Sale Detail'
        }
        description={detailSale ? `Recorded ${formatDateTime(detailSale.soldAt)}` : undefined}
      >
        {detailSale && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 rounded-lg border border-[#E4E4E7] bg-[#F4F5F7]/50 p-3 sm:grid-cols-4">
              <div>
                <p className="text-[11px] text-[#52525B]">Sale Status</p>
                <p className={`mt-0.5 capitalize ${getSaleStatusClass(detailSale.status)}`}>
                  {detailSale.status.replace('_', ' ')}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#52525B]">Payment State</p>
                <p className="mt-0.5 font-medium capitalize text-[#18181B]">
                  {detailSale.paymentStatus}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#52525B]">Amount Paid</p>
                <p className="mt-0.5 font-mono-tabular font-semibold text-[#18181B]">
                  {formatMoney(detailSale.amountPaid, currencyCode)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#52525B]">Credit Remaining</p>
                <p
                  className={`mt-0.5 font-mono-tabular font-semibold ${
                    Number(detailSale.creditRemaining) > 0 ? 'text-[#991B1B]' : 'text-[#52525B]'
                  }`}
                >
                  {formatMoney(detailSale.creditRemaining, currencyCode)}
                </p>
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold text-[#18181B]">Line Items</h3>
              <div className="overflow-x-auto rounded-lg border border-[#E4E4E7]">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7]/60 text-[11px] text-[#52525B]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Item</th>
                      <th className="px-3 py-2 text-right font-medium">Qty</th>
                      <th className="px-3 py-2 text-right font-medium">Unit Price</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E4E7]">
                    {detailSale.items.map((item) => (
                      <tr key={item.id}>
                        <td className="px-3 py-2">
                          <p className="font-medium text-[#18181B]">{item.productNameSnapshot}</p>
                          {Number(item.discountAmount) > 0 && (
                            <p className="font-mono-tabular text-[10px] text-[#991B1B]">
                              Discount: -{formatMoney(item.discountAmount, currencyCode)}
                            </p>
                          )}
                          {Number(item.quantityReturned) > 0 && (
                            <p className="font-mono-tabular text-[10px] text-[#D97706]">
                              Returned: {formatQty(item.quantityReturned)} {item.unitSnapshot}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-[#52525B]">
                          {formatQty(item.quantity)} {item.unitSnapshot}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular text-[#52525B]">
                          {formatMoney(item.unitPrice, currencyCode)}
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular font-semibold text-[#18181B]">
                          {formatMoney(item.lineTotal, currencyCode)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-[#E4E4E7] p-3">
                <h3 className="mb-1.5 font-semibold text-[#18181B]">Payment Allocations</h3>
                <ul className="space-y-1">
                  {detailSale.payments.map((p) => (
                    <li key={p.id} className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-[#18181B]">{formatTenderMethodLabel(p.method)}</span>
                        {p.referenceNote && (
                          <p className="font-mono-tabular text-[10px] text-[#71717A]">
                            Ref: {p.referenceNote}
                          </p>
                        )}
                      </div>
                      <span className="font-mono-tabular font-medium text-[#18181B]">
                        {formatMoney(p.amount, currencyCode)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-[#E4E4E7] p-3">
                <h3 className="mb-1.5 font-semibold text-[#18181B]">Financial Totals</h3>
                <dl className="space-y-1">
                  <div className="flex justify-between text-[#52525B]">
                    <dt>Subtotal</dt>
                    <dd className="font-mono-tabular">
                      {formatMoney(detailSale.subtotalAmount, currencyCode)}
                    </dd>
                  </div>
                  {Number(detailSale.discountAmount) > 0 && (
                    <div className="flex justify-between text-[#52525B]">
                      <dt>Discount</dt>
                      <dd className="font-mono-tabular">
                        -{formatMoney(detailSale.discountAmount, currencyCode)}
                      </dd>
                    </div>
                  )}
                  {detailSale.taxEnabledSnapshot && (
                    <div className="flex justify-between text-[#52525B]">
                      <dt>Tax ({detailSale.taxRateSnapshot}%)</dt>
                      <dd className="font-mono-tabular">
                        {formatMoney(detailSale.taxAmount, currencyCode)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-[#E4E4E7] pt-1 font-bold text-[#18181B]">
                    <dt>Grand Total</dt>
                    <dd className="font-mono-tabular">
                      {formatMoney(detailSale.totalAmount, currencyCode)}
                    </dd>
                  </div>
                  {detailSale.totalCogs !== undefined && (
                    <div className="flex justify-between text-[11px] text-[#71717A]">
                      <dt>COGS Snapshot</dt>
                      <dd className="font-mono-tabular">
                        {formatMoney(detailSale.totalCogs, currencyCode)}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {detailSale.returns.length > 0 && (
              <div className="rounded-lg border border-[#E4E4E7] p-3">
                <h3 className="mb-2 font-semibold text-[#18181B]">
                  Audited Returns &amp; Reversals ({detailSale.returns.length})
                </h3>
                <ul className="divide-y divide-[#E4E4E7]">
                  {detailSale.returns.map((ret) => (
                    <li key={ret.id} className="space-y-1 py-2 first:pt-0 last:pb-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold capitalize text-[#991B1B]">
                          {ret.returnType === 'full_void' ? 'Full Void' : 'Item Return'}
                        </span>
                        <span className="font-mono-tabular text-[11px] text-[#52525B]">
                          {formatDateTime(ret.createdAt)}
                        </span>
                      </div>
                      <p className="text-[#18181B]">Reason: {ret.reason}</p>
                      <p className="font-mono-tabular text-[11px] text-[#52525B]">
                        Reversed: {formatMoney(ret.totalReversed, currencyCode)} · Debt reduced:{' '}
                        {formatMoney(ret.debtReducedAmount, currencyCode)} · Refund:{' '}
                        {formatMoney(ret.refundAmount, currencyCode)}
                        {ret.refund ? ` (${formatTenderMethodLabel(ret.refund.method)})` : ''}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-2 border-t border-[#E4E4E7] pt-3">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setSelectedReceiptSale(detailSale);
                }}
              >
                <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                <span>View / Print Receipt</span>
              </Button>
              {canVoidOrReturn &&
                !isReadOnly &&
                detailSale.status !== 'voided' &&
                detailSale.status !== 'returned' && (
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={!isOnline}
                    onClick={() => {
                      const target = detailSale;
                      setDetailSale(null);
                      void openActionModal(target, 'return');
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Return / Void</span>
                  </Button>
                )}
            </div>
          </div>
        )}
      </Modal>

      <ReceiptModal
        open={Boolean(selectedReceiptSale)}
        onClose={() => setSelectedReceiptSale(null)}
        businessName={activeMembership?.businessName ?? 'Festola Store'}
        currencyCode={currencyCode}
        sale={selectedReceiptSale}
        receiptFooter={receiptFooter}
      />

      {/* Owner/Manager Online-Only Multi-Item Return & Audited Void Modal (D-15) */}
      <Modal
        open={Boolean(actionSale)}
        onClose={() => setActionSale(null)}
        title="Process Sale Return or Full Void"
        description="Online-only Owner/Manager action. Reversals reduce open customer debt first before issuing cash/digital refunds."
      >
        {actionSale && (
          <form onSubmit={(e) => void handleSubmitVoidOrReturn(e)} className="space-y-4" noValidate>
            {actionError && <AlertBanner tone="error">{actionError}</AlertBanner>}

            <div className="inline-flex gap-2">
              <button
                type="button"
                onClick={() => {
                  actionIdempotencyRef.current = null;
                  setActionMode('return');
                }}
                className={`min-h-[40px] rounded-lg border px-3.5 py-2 text-xs font-medium ${
                  actionMode === 'return'
                    ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                    : 'border-[#E4E4E7] bg-white text-[#52525B]'
                }`}
              >
                Return Item(s)
              </button>
              <button
                type="button"
                disabled={actionSale.status !== 'completed'}
                onClick={() => {
                  actionIdempotencyRef.current = null;
                  setActionMode('void');
                }}
                className={`min-h-[40px] rounded-lg border px-3.5 py-2 text-xs font-medium disabled:opacity-50 ${
                  actionMode === 'void'
                    ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                    : 'border-[#E4E4E7] bg-white text-[#52525B]'
                }`}
              >
                Full Void
              </button>
            </div>

            {actionMode === 'return' ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-[#18181B]">
                  Select quantities and stock disposition per line item
                </p>
                <div className="divide-y divide-[#E4E4E7] rounded-lg border border-[#E4E4E7]">
                  {actionSale.items.map((item) => {
                    const remaining = Math.max(
                      0,
                      Number(item.quantity) - Number(item.quantityReturned),
                    );
                    const draft = returnLines[item.id] ?? {
                      saleItemId: item.id,
                      quantity: '',
                      disposition: 'restock' as const,
                    };
                    return (
                      <div key={item.id} className="grid items-center gap-2 p-3 sm:grid-cols-12">
                        <div className="sm:col-span-5">
                          <p className="text-xs font-medium text-[#18181B]">
                            {item.productNameSnapshot}
                          </p>
                          <p className="font-mono-tabular text-[11px] text-[#52525B]">
                            Returnable: {formatQty(remaining)} of {formatQty(item.quantity)}{' '}
                            {item.unitSnapshot}
                          </p>
                        </div>
                        <div className="sm:col-span-3">
                          <Input
                            aria-label={`Return quantity for ${item.productNameSnapshot}`}
                            type="number"
                            mono
                            step="0.001"
                            min="0"
                            max={remaining}
                            disabled={remaining <= 0}
                            placeholder="0"
                            value={draft.quantity}
                            onChange={(e) => {
                              actionIdempotencyRef.current = null;
                              setReturnLines((prev) => ({
                                ...prev,
                                [item.id]: { ...draft, quantity: e.target.value },
                              }));
                            }}
                          />
                        </div>
                        <div className="sm:col-span-4">
                          <Select
                            aria-label={`Disposition for ${item.productNameSnapshot}`}
                            disabled={remaining <= 0}
                            value={draft.disposition}
                            onChange={(e) => {
                              actionIdempotencyRef.current = null;
                              setReturnLines((prev) => ({
                                ...prev,
                                [item.id]: {
                                  ...draft,
                                  disposition: e.target.value as 'restock' | 'damaged',
                                },
                              }));
                            }}
                          >
                            <option value="restock">Restock</option>
                            <option value="damaged">Damaged (no restock)</option>
                          </Select>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <FormField id="ret-disp" label="Stock disposition for all voided items" required>
                <Select
                  id="ret-disp"
                  value={voidDisposition}
                  onChange={(e) => {
                    actionIdempotencyRef.current = null;
                    setVoidDisposition(e.target.value as 'restock' | 'damaged');
                  }}
                >
                  <option value="restock">Restock to sellable inventory</option>
                  <option value="damaged">Damaged / write-off (do not restock)</option>
                </Select>
              </FormField>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="ret-method" label="Refund method" required>
                <Select
                  id="ret-method"
                  value={refundMethod}
                  onChange={(e) => {
                    actionIdempotencyRef.current = null;
                    setRefundMethod(e.target.value as 'cash' | 'transfer' | 'pos_card');
                  }}
                >
                  <option value="cash">Cash</option>
                  <option value="transfer">Bank Transfer</option>
                  <option value="pos_card">POS Card</option>
                </Select>
              </FormField>

              <FormField id="ret-ref" label="Refund reference (optional)">
                <Input
                  id="ret-ref"
                  value={refundReferenceNote}
                  onChange={(e) => {
                    actionIdempotencyRef.current = null;
                    setRefundReferenceNote(e.target.value);
                  }}
                  placeholder="Transfer ref or voucher #"
                />
              </FormField>
            </div>

            <div className="grid grid-cols-3 gap-2 rounded-lg border border-[#E4E4E7] bg-[#F4F5F7]/60 p-3 text-xs">
              <div>
                <p className="text-[11px] text-[#52525B]">Total Reversed</p>
                <p className="font-mono-tabular font-semibold text-[#18181B]">
                  {formatMoney(reversalPreview.totalReversed, currencyCode)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#52525B]">Credit Reduced</p>
                <p className="font-mono-tabular font-semibold text-[#16A34A]">
                  {formatMoney(reversalPreview.debtReduced, currencyCode)}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-[#52525B]">Refund Payout</p>
                <p className="font-mono-tabular font-semibold text-[#991B1B]">
                  {formatMoney(reversalPreview.refundDue, currencyCode)}
                </p>
              </div>
            </div>

            <FormField id="ret-reason" label="Audit reason" required>
              <Input
                id="ret-reason"
                required
                value={reason}
                onChange={(e) => {
                  actionIdempotencyRef.current = null;
                  setReason(e.target.value);
                }}
                placeholder="Customer returned unopened pack"
              />
            </FormField>

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setActionSale(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={processingAction}
                loadingLabel="Processing..."
              >
                {actionMode === 'void' ? 'Confirm Full Void' : 'Confirm Item Return'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
