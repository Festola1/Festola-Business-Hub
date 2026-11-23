import { BellRing, CheckCircle2, Copy, CreditCard, History, Search, Wallet } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import {
  collectCustomerDebtPayment,
  fetchCustomerDetail,
  fetchCustomers,
  fetchDebtorsAging,
  type CustomerItem,
  type DebtPaymentRecord,
  type DebtorsAgingReport,
  type SaleRecord,
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import { formatDateTime, formatMoney } from '../../lib/format';
import { canRoleAccess } from '../../lib/permissions';

type DebtFilter = 'open' | 'overdue' | 'all';

export default function DebtsPage() {
  const { accessToken, activeMembership } = useAuth();
  const { pushToast } = useToast();
  const businessId = activeMembership?.businessId ?? '';
  const role = activeMembership?.role ?? 'cashier';
  const canViewAging = canRoleAccess(role, 'reports.view_basic');

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [aging, setAging] = useState<DebtorsAgingReport | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DebtFilter>('open');

  // Collect Repayment Modal
  const [collectTarget, setCollectTarget] = useState<CustomerItem | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<'cash' | 'transfer' | 'pos_card'>('cash');
  const [referenceNote, setReferenceNote] = useState('');
  const [collectError, setCollectError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Payment History Modal
  const [historyTarget, setHistoryTarget] = useState<CustomerItem | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySales, setHistorySales] = useState<SaleRecord[]>([]);
  const [historyPayments, setHistoryPayments] = useState<DebtPaymentRecord[]>([]);

  // Reminder Modal
  const [reminderTarget, setReminderTarget] = useState<CustomerItem | null>(null);

  // Immutable Receipt Modal after repayment
  const [issuedDebtPayment, setIssuedDebtPayment] = useState<DebtPaymentRecord | null>(null);
  const [receiptCustomerName, setReceiptCustomerName] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !businessId) return;
    let cancelled = false;

    const agingPromise = canViewAging
      ? fetchDebtorsAging(accessToken, businessId)
      : Promise.resolve(null);

    void Promise.all([fetchCustomers(accessToken, businessId, { limit: 100 }), agingPromise]).then(
      ([custRes, agingRes]) => {
        if (cancelled) return;
        if (!custRes.success) {
          setErrorMessage(
            getFriendlyApiError(custRes.error, 'Unable to load customer credit ledger.'),
          );
          setLoading(false);
          return;
        }
        setCustomers(custRes.data?.customers ?? []);
        setAging(agingRes?.success && agingRes.data ? agingRes.data.aging : null);
        setErrorMessage(null);
        setLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [accessToken, businessId, canViewAging, reloadTick]);

  const totalOutstanding = useMemo(
    () => customers.reduce((sum, c) => sum + (Number(c.outstandingBalance) || 0), 0),
    [customers],
  );

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((customer) => {
      const bal = Number(customer.outstandingBalance) || 0;
      const limit = Number(customer.creditLimit ?? 0);
      const isOverLimit = limit > 0 && bal >= limit * 0.8;
      if (filter === 'open' && bal <= 0) return false;
      if (filter === 'overdue' && !(bal > 0 && (isOverLimit || bal >= 10000))) return false;
      if (!q) return true;
      return (
        customer.fullName.toLowerCase().includes(q) ||
        (customer.phone ?? '').toLowerCase().includes(q)
      );
    });
  }, [customers, filter, search]);

  const openHistoryModal = async (customer: CustomerItem) => {
    if (!accessToken || !businessId) return;
    setHistoryTarget(customer);
    setHistoryLoading(true);
    const res = await fetchCustomerDetail(accessToken, businessId, customer.id);
    setHistoryLoading(false);
    if (res.success && res.data) {
      setHistorySales(res.data.openCreditSales ?? []);
      setHistoryPayments(res.data.debtPayments ?? []);
    } else {
      setHistorySales([]);
      setHistoryPayments([]);
    }
  };

  const handleCollectPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !businessId || !collectTarget) return;
    setCollectError(null);

    const parsed = Number(amount);
    const balance = Number(collectTarget.outstandingBalance) || 0;
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setCollectError('Enter a repayment amount greater than zero.');
      return;
    }
    if (parsed > balance) {
      setCollectError(
        `Amount cannot exceed the customer's verified balance of ${formatMoney(balance)}.`,
      );
      return;
    }

    setSubmitting(true);
    const res = await collectCustomerDebtPayment(accessToken, businessId, collectTarget.id, {
      amount: parsed.toFixed(2),
      method,
      referenceNote: referenceNote.trim() || null,
    });
    setSubmitting(false);

    if (!res.success || !res.data) {
      setCollectError(getFriendlyApiError(res.error, 'Could not record debt repayment.'));
      return;
    }

    pushToast('Customer repayment recorded and balance updated.', 'success');
    setIssuedDebtPayment(res.data.debtPayment);
    setReceiptCustomerName(collectTarget.fullName);
    setCollectTarget(null);
    setAmount('');
    setReferenceNote('');
    setReloadTick((n) => n + 1);
  };

  const buildReminderText = (customer: CustomerItem) =>
    `Hello ${customer.fullName}, this is a polite reminder from ${activeMembership?.businessName ?? 'our store'} regarding your outstanding credit balance of ${formatMoney(customer.outstandingBalance)}. Thank you for your continued patronage.`;

  const handleCopyReminder = async (customer: CustomerItem) => {
    try {
      await navigator.clipboard.writeText(buildReminderText(customer));
      pushToast('Payment reminder copied to clipboard.', 'success');
    } catch {
      pushToast('Select and copy the reminder message manually.', 'info');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumb={activeMembership?.businessName}
          title="Debts & Credit Management"
          description="Monitor customer credit balances, overdue accounts, and verified repayments."
        />
        <LoadingSkeleton rows={5} label="Loading debt accounts..." />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumb={activeMembership?.businessName} title="Debts & Credit Management" />
        <ErrorState
          message={errorMessage}
          onRetry={() => {
            setLoading(true);
            setReloadTick((n) => n + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Debts & Credit Management"
        description="Track outstanding customer credit balances, collect verified repayments, and send payment reminders. Unpaid balances are never marked paid automatically."
      />

      {/* Aging & Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Total Outstanding Debt</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#D90000]">
            {formatMoney(totalOutstanding)}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Verified server receivables</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">0 – 30 Days</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#151B2B]">
            {aging ? formatMoney(aging.buckets.days0to30) : '—'}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Current credit window</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">31 – 60 Days</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#F59E0B]">
            {aging ? formatMoney(aging.buckets.days31to60) : '—'}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Follow-up recommended</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">61 – 90+ Days</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#DC2626]">
            {aging
              ? formatMoney(
                  (Number(aging.buckets.days61to90) || 0) + (Number(aging.buckets.days90Plus) || 0),
                )
              : '—'}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Overdue priority accounts</p>
        </Card>
      </div>

      {/* Filters & Debt Table */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['open', 'Open Debts'],
                ['overdue', 'Overdue / High Exposure'],
                ['all', 'All Credit Accounts'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors ${
                  filter === key
                    ? 'bg-[#D90000] text-white'
                    : 'border border-[#E5E7EB] bg-white text-[#4B5565] hover:bg-[#F8F8FA]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search customer or phone..."
              aria-label="Search customer debts"
              className="pl-9"
            />
          </div>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No matching debt accounts"
              description="Credit sales recorded in POS will appear here automatically until paid in full."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F8F8FA] text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                <tr>
                  <th className="px-5 py-3">Customer</th>
                  <th className="px-4 py-3">Account Ref</th>
                  <th className="px-4 py-3 text-right">Credit Limit</th>
                  <th className="px-4 py-3 text-right">Outstanding Balance</th>
                  <th className="px-4 py-3">Payment Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredCustomers.map((customer) => {
                  const balance = Number(customer.outstandingBalance) || 0;
                  const limit = Number(customer.creditLimit ?? 0);
                  const isOverLimit = limit > 0 && balance >= limit;
                  const statusLabel =
                    balance <= 0 ? 'Paid' : isOverLimit ? 'Over Limit' : 'Unpaid Balance';

                  return (
                    <tr key={customer.id} className="hover:bg-[#F8F8FA]/70">
                      <td className="px-5 py-3.5">
                        <p className="font-bold text-[#151B2B]">{customer.fullName}</p>
                        <p className="text-xs text-[#6B7280]">{customer.phone ?? 'No phone'}</p>
                      </td>
                      <td className="px-4 py-3.5 font-mono-tabular text-xs text-[#6B7280]">
                        ACC-{customer.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-tabular text-xs text-[#4B5565]">
                        {customer.creditLimit ? formatMoney(customer.creditLimit) : 'Not set'}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono-tabular font-bold text-[#D90000]">
                        {formatMoney(customer.outstandingBalance)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            balance <= 0
                              ? 'bg-emerald-50 text-emerald-700'
                              : isOverLimit
                                ? 'bg-[#FFF1F1] text-[#DC2626]'
                                : 'bg-amber-50 text-amber-800'
                          }`}
                        >
                          {balance <= 0 && <CheckCircle2 className="h-3 w-3" aria-hidden="true" />}
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex justify-end gap-1.5">
                          <Button
                            variant="secondary"
                            onClick={() => void openHistoryModal(customer)}
                          >
                            <History className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>History</span>
                          </Button>
                          {balance > 0 && (
                            <>
                              <Button
                                variant="secondary"
                                onClick={() => setReminderTarget(customer)}
                              >
                                <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Remind</span>
                              </Button>
                              <Button
                                variant="primary"
                                onClick={() => {
                                  setCollectTarget(customer);
                                  setAmount('');
                                  setReferenceNote('');
                                  setCollectError(null);
                                }}
                              >
                                <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Record Payment</span>
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Record Repayment Modal */}
      <Modal
        open={Boolean(collectTarget)}
        onClose={() => setCollectTarget(null)}
        title={`Record Payment — ${collectTarget?.fullName ?? ''}`}
        description="Post a verified repayment to reduce this customer's debt and issue an immutable receipt."
      >
        <form onSubmit={(e) => void handleCollectPayment(e)} className="space-y-4">
          {collectError && <AlertBanner tone="error">{collectError}</AlertBanner>}
          {collectTarget && (
            <div className="rounded-xl bg-[#FFF5F5] p-3 text-xs text-[#7F1D1D]">
              Verified outstanding balance:{' '}
              <strong className="font-mono-tabular">
                {formatMoney(collectTarget.outstandingBalance)}
              </strong>
            </div>
          )}

          <FormField id="debt-amount" label="Amount Received (NGN)" required>
            <Input
              id="debt-amount"
              type="number"
              min="1"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </FormField>

          <FormField id="debt-method" label="Payment Method" required>
            <Select
              id="debt-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as 'cash' | 'transfer' | 'pos_card')}
            >
              <option value="cash">Cash</option>
              <option value="transfer">Bank Transfer</option>
              <option value="pos_card">POS Card</option>
            </Select>
          </FormField>

          <FormField id="debt-ref" label="Reference Note (Optional)">
            <Input
              id="debt-ref"
              value={referenceNote}
              onChange={(e) => setReferenceNote(e.target.value)}
              placeholder="Transfer reference or receipt note"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCollectTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              loadingLabel="Posting repayment..."
            >
              Post Payment &amp; Issue Receipt
            </Button>
          </div>
        </form>
      </Modal>

      {/* Payment History Modal */}
      <Modal
        open={Boolean(historyTarget)}
        onClose={() => setHistoryTarget(null)}
        title={`Credit & Payment History — ${historyTarget?.fullName ?? ''}`}
        description="Open credit invoices and recorded debt repayments."
      >
        {historyLoading ? (
          <LoadingSkeleton rows={3} label="Loading customer debt ledger..." />
        ) : (
          <div className="space-y-4">
            <div>
              <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                <CreditCard className="h-3.5 w-3.5 text-[#D90000]" aria-hidden="true" />
                Open Credit Sales ({historySales.length})
              </h3>
              {historySales.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-[#E5E7EB] p-3 text-xs text-[#6B7280]">
                  No open credit invoices.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-[#F1F5F9] rounded-xl border border-[#E5E7EB]">
                  {historySales.map((sale) => (
                    <li key={sale.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="font-mono-tabular text-xs font-bold text-[#151B2B]">
                          {sale.saleNumber}
                        </p>
                        <p className="font-mono-tabular text-[11px] text-[#6B7280]">
                          {formatDateTime(sale.soldAt)} · Total {formatMoney(sale.totalAmount)}
                        </p>
                      </div>
                      <span className="font-mono-tabular text-xs font-bold text-[#D90000]">
                        Due {formatMoney(sale.creditRemaining)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wide text-[#6B7280]">
                Recorded Repayments ({historyPayments.length})
              </h3>
              {historyPayments.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-[#E5E7EB] p-3 text-xs text-[#6B7280]">
                  No repayments recorded yet.
                </p>
              ) : (
                <ul className="mt-2 divide-y divide-[#F1F5F9] rounded-xl border border-[#E5E7EB]">
                  {historyPayments.map((pay) => (
                    <li key={pay.id} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <p className="text-xs font-semibold text-[#151B2B]">
                          {pay.referenceNote || pay.method.replace('_', ' ')}
                        </p>
                        <p className="font-mono-tabular text-[11px] text-[#6B7280]">
                          {formatDateTime(pay.paidAt)} · {pay.status}
                        </p>
                      </div>
                      <span className="font-mono-tabular text-xs font-bold text-[#16A34A]">
                        {formatMoney(pay.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Send Reminder Modal (Honest messaging-integration readiness) */}
      <Modal
        open={Boolean(reminderTarget)}
        onClose={() => setReminderTarget(null)}
        title={`Send Payment Reminder — ${reminderTarget?.fullName ?? ''}`}
        description="Automated SMS/WhatsApp dispatch requires an approved messaging provider. Copy this formatted reminder to send directly."
      >
        {reminderTarget && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#E5E7EB] bg-[#F8F8FA] p-4 text-sm leading-relaxed text-[#151B2B]">
              {buildReminderText(reminderTarget)}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setReminderTarget(null)}>
                Close
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={() => void handleCopyReminder(reminderTarget)}
              >
                <Copy className="h-4 w-4" aria-hidden="true" />
                <span>Copy Reminder Message</span>
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Immutable Debt Repayment Receipt */}
      <ReceiptModal
        open={Boolean(issuedDebtPayment)}
        onClose={() => setIssuedDebtPayment(null)}
        businessName={activeMembership?.businessName ?? 'Festola Business Hub'}
        debtPayment={issuedDebtPayment}
        customerName={receiptCustomerName}
      />
    </div>
  );
}
