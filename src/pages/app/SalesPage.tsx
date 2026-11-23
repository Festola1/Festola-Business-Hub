import { Printer, RotateCcw, Search } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
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
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import { formatDateTime, formatMoney, formatQty } from '../../lib/format';
import { fetchCurrentBusiness } from '../../lib/identity-api';
import { canRoleAccess } from '../../lib/permissions';

/**
 * Sales & Receipts Ledger + Owner/Manager Online-Only Full Voids & Item Returns (D-14, D-15).
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
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [selectedReceiptSale, setSelectedReceiptSale] = useState<SaleRecord | null>(null);
  const [receiptFooter, setReceiptFooter] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  // Void / Return modal state (Owner/Manager online-only D-15)
  const [actionSale, setActionSale] = useState<SaleRecord | null>(null);
  const [actionMode, setActionMode] = useState<'void' | 'return'>('void');
  const [reason, setReason] = useState('');
  const [disposition, setDisposition] = useState<'restock' | 'damaged'>('restock');
  const [refundMethod, setRefundMethod] = useState<'cash' | 'transfer' | 'pos_card'>('cash');
  const [returnItemId, setReturnItemId] = useState('');
  const [returnQty, setReturnQty] = useState('1');
  const [actionError, setActionError] = useState<string | null>(null);
  const [processingAction, setProcessingAction] = useState(false);

  useEffect(() => {
    if (!accessToken || !activeMembership) return;
    let cancelled = false;

    void Promise.all([
      fetchSales(accessToken, activeMembership.businessId, {
        search,
        status: statusFilter || undefined,
        paymentStatus: paymentFilter || undefined,
        limit: 50,
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
      if (bizRes.success && bizRes.data?.business) {
        setReceiptFooter(bizRes.data.business.receiptFooter ?? null);
      }
      setErrorMessage(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, search, statusFilter, paymentFilter, reloadTick]);

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

  const openActionModal = async (sale: SaleRecord, mode: 'void' | 'return') => {
    const fresh = await loadFreshSale(sale);
    setActionSale(fresh);
    setActionMode(mode);
    setReason('');
    setDisposition('restock');
    setRefundMethod('cash');
    const firstReturnable =
      fresh.items.find((i) => Number(i.quantity) - Number(i.quantityReturned) > 0) ??
      fresh.items[0];
    setReturnItemId(firstReturnable?.id ?? '');
    setReturnQty('1');
    setActionError(null);
  };

  const handleSubmitVoidOrReturn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership || !actionSale) return;
    setActionError(null);

    if (!isOnline) {
      setActionError('Voids and returns require an active online connection (D-15).');
      return;
    }
    if (reason.trim().length < 5) {
      setActionError('Provide a detailed reason (at least 5 characters) for the audit ledger.');
      return;
    }

    setProcessingAction(true);
    const res =
      actionMode === 'void'
        ? await voidSale(accessToken, activeMembership.businessId, actionSale.id, {
            reason: reason.trim(),
            disposition,
            refundMethod,
          })
        : await returnSaleItems(accessToken, activeMembership.businessId, actionSale.id, {
            reason: reason.trim(),
            refundMethod,
            items: [
              {
                saleItemId: returnItemId,
                quantity: Number(returnQty).toFixed(3),
                disposition,
              },
            ],
          });
    setProcessingAction(false);

    if (!res.success) {
      setActionError(getFriendlyApiError(res.error, 'Unable to process sale correction.'));
      return;
    }

    setActionSale(null);
    pushToast(
      actionMode === 'void'
        ? 'Sale voided with non-destructive reversal and audit log.'
        : 'Item return processed (debt reduced first, remainder refunded).',
      'success',
    );
    setReloadTick((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Sales & Receipts"
        description="Inspect completed counter sales, print 58mm/80mm/A4 receipts, and manage Owner/Manager voids or returns."
      />

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-12">
          <div className="relative md:col-span-6">
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

          <div className="md:col-span-3">
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

          <div className="md:col-span-3">
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
          description="Completed sales and immutable receipts will appear here once transactions are recorded in Point of Sale."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7]/60 text-xs text-[#52525B]">
                <tr>
                  <th className="px-5 py-3 font-medium">Receipt & Time</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Paid</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-5 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-[#F4F5F7]/40">
                    <td className="px-5 py-3">
                      <p className="font-mono-tabular text-xs font-semibold text-[#18181B]">
                        {sale.receipt?.receiptNumber ?? sale.saleNumber}
                      </p>
                      <p className="font-mono-tabular text-[11px] text-[#52525B]">
                        {formatDateTime(sale.soldAt)} · {sale.items.length} item
                        {sale.items.length === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-[#52525B]">
                      {sale.status.replace('_', ' ')} · {sale.paymentStatus}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-xs text-[#52525B]">
                      {formatMoney(sale.amountPaid)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#18181B]">
                      {formatMoney(sale.totalAmount)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
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
        </Card>
      )}

      <ReceiptModal
        open={Boolean(selectedReceiptSale)}
        onClose={() => setSelectedReceiptSale(null)}
        businessName={activeMembership?.businessName ?? 'Festola Store'}
        sale={selectedReceiptSale}
        receiptFooter={receiptFooter}
      />

      {/* Owner/Manager Online-Only Void / Return Modal (D-15) */}
      <Modal
        open={Boolean(actionSale)}
        onClose={() => setActionSale(null)}
        title="Process Sale Return or Full Void"
        description="Online-only Owner/Manager action. Reversals reduce open customer debt first before issuing cash/transfer refunds."
      >
        {actionSale && (
          <form onSubmit={(e) => void handleSubmitVoidOrReturn(e)} className="space-y-4" noValidate>
            {actionError && <AlertBanner tone="error">{actionError}</AlertBanner>}

            <div className="inline-flex gap-2">
              <button
                type="button"
                onClick={() => setActionMode('return')}
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
                onClick={() => setActionMode('void')}
                className={`min-h-[40px] rounded-lg border px-3.5 py-2 text-xs font-medium disabled:opacity-50 ${
                  actionMode === 'void'
                    ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                    : 'border-[#E4E4E7] bg-white text-[#52525B]'
                }`}
              >
                Full Void
              </button>
            </div>

            {actionMode === 'return' && (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <FormField id="ret-item" label="Item to return" required>
                    <Select
                      id="ret-item"
                      value={returnItemId}
                      onChange={(e) => setReturnItemId(e.target.value)}
                    >
                      {actionSale.items.map((item) => {
                        const remaining = Math.max(
                          0,
                          Number(item.quantity) - Number(item.quantityReturned),
                        );
                        return (
                          <option key={item.id} value={item.id} disabled={remaining <= 0}>
                            {item.productNameSnapshot} (Remaining: {formatQty(remaining)} of{' '}
                            {formatQty(item.quantity)})
                          </option>
                        );
                      })}
                    </Select>
                  </FormField>
                </div>
                <FormField id="ret-qty" label="Qty" required>
                  <Input
                    id="ret-qty"
                    type="number"
                    mono
                    step="0.001"
                    min="0.001"
                    value={returnQty}
                    onChange={(e) => setReturnQty(e.target.value)}
                  />
                </FormField>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <FormField id="ret-disp" label="Stock disposition" required>
                <Select
                  id="ret-disp"
                  value={disposition}
                  onChange={(e) => setDisposition(e.target.value as 'restock' | 'damaged')}
                >
                  <option value="restock">Restock to sellable inventory</option>
                  <option value="damaged">Damaged / write-off (do not restock)</option>
                </Select>
              </FormField>

              <FormField id="ret-method" label="Refund method" required>
                <Select
                  id="ret-method"
                  value={refundMethod}
                  onChange={(e) =>
                    setRefundMethod(e.target.value as 'cash' | 'transfer' | 'pos_card')
                  }
                >
                  <option value="cash">Cash</option>
                  <option value="transfer">Bank Transfer</option>
                  <option value="pos_card">POS Card</option>
                </Select>
              </FormField>
            </div>

            <FormField id="ret-reason" label="Audit reason" required>
              <Input
                id="ret-reason"
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
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
