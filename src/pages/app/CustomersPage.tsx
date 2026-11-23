import { Plus, Receipt, RotateCcw, Search, Wallet } from 'lucide-react';
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
import { CheckboxField, FormField, Input, Select } from '../../components/ui/FormControls';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import {
  collectCustomerDebtPayment,
  createCustomer,
  fetchCustomerDetail,
  fetchCustomers,
  reverseCustomerDebtPayment,
  type CustomerItem,
  type DebtPaymentRecord,
  type SaleRecord,
} from '../../lib/commerce-api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { canRoleAccess } from '../../lib/permissions';

export default function CustomersPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const { pushToast } = useToast();

  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hasDebtOnly, setHasDebtOnly] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Create customer modal
  const [createOpen, setCreateOpen] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Detail modal
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<CustomerItem | null>(null);
  const [openCreditSales, setOpenCreditSales] = useState<SaleRecord[]>([]);
  const [debtPayments, setDebtPayments] = useState<DebtPaymentRecord[]>([]);

  // Collect debt payment modal
  const [collectOpen, setCollectOpen] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'cash' | 'transfer' | 'pos_card'>('cash');
  const [payReference, setPayReference] = useState('');
  const [collecting, setCollecting] = useState(false);

  // Reverse debt payment modal (Owner/Manager)
  const [reverseTarget, setReverseTarget] = useState<DebtPaymentRecord | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  // Debt receipt modal
  const [receiptPayment, setReceiptPayment] = useState<DebtPaymentRecord | null>(null);
  const [receiptCustomerName, setReceiptCustomerName] = useState<string | null>(null);

  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const canReverseDebt = activeMembership
    ? canRoleAccess(activeMembership.role, 'sales.void_or_return')
    : false;

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;

    void fetchCustomers(accessToken, activeMembership.businessId, {
      search: search.trim() || undefined,
      hasDebtOnly: hasDebtOnly || undefined,
      limit: 100,
    }).then((res) => {
      if (cancelled) {
        return;
      }
      if (res.success && res.data) {
        setCustomers(res.data.customers);
        setError(null);
      } else {
        setError(res.error?.message ?? 'Unable to load customers.');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, search, hasDebtOnly, reloadTick, tenantEpoch]);

  const openCustomerDetail = async (customerId: string) => {
    if (!accessToken || !activeMembership) {
      return;
    }
    setSelectedCustomerId(customerId);
    setDetailLoading(true);
    setDetailError(null);
    const res = await fetchCustomerDetail(accessToken, activeMembership.businessId, customerId);
    setDetailLoading(false);
    if (!res.success || !res.data) {
      setDetailError(res.error?.message ?? 'Unable to load customer ledger.');
      return;
    }
    setDetailCustomer(res.data.customer);
    setOpenCreditSales(res.data.openCreditSales);
    setDebtPayments(res.data.debtPayments);
  };

  const handleCreateCustomer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) {
      return;
    }
    if (fullName.trim().length < 2) {
      setFormError('Enter the customer full name.');
      return;
    }
    setSavingCustomer(true);
    setFormError(null);
    const res = await createCustomer(accessToken, activeMembership.businessId, {
      fullName: fullName.trim(),
      phone: phone.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      creditLimit: creditLimit.trim() ? Number(creditLimit).toFixed(2) : null,
    });
    setSavingCustomer(false);

    if (!res.success || !res.data) {
      setFormError(res.error?.message ?? 'Unable to save customer.');
      return;
    }

    pushToast(`${res.data.customer.fullName} added to customer directory.`, 'success');
    setCreateOpen(false);
    setFullName('');
    setPhone('');
    setEmail('');
    setAddress('');
    setCreditLimit('');
    setLoading(true);
    setReloadTick((n) => n + 1);
  };

  const openCollectModal = (customer: CustomerItem) => {
    setDetailCustomer(customer);
    setPayAmount(Number(customer.outstandingBalance) > 0 ? customer.outstandingBalance : '');
    setPayMethod('cash');
    setPayReference('');
    setFormError(null);
    setCollectOpen(true);
  };

  const handleCollectPayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership || !detailCustomer) {
      return;
    }
    const amt = Number(payAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Enter a valid repayment amount greater than zero.');
      return;
    }

    setCollecting(true);
    setFormError(null);
    const res = await collectCustomerDebtPayment(
      accessToken,
      activeMembership.businessId,
      detailCustomer.id,
      {
        amount: amt.toFixed(2),
        method: payMethod,
        referenceNote: payReference.trim() || null,
      },
    );
    setCollecting(false);

    if (!res.success || !res.data) {
      setFormError(res.error?.message ?? 'Unable to record debt repayment.');
      return;
    }

    pushToast('Debt repayment posted and receipt issued.', 'success');
    setCollectOpen(false);
    setReceiptPayment(res.data.debtPayment);
    setReceiptCustomerName(detailCustomer.fullName);
    setLoading(true);
    setReloadTick((n) => n + 1);
    if (selectedCustomerId === detailCustomer.id) {
      void openCustomerDetail(detailCustomer.id);
    }
  };

  const handleReversePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership || !detailCustomer || !reverseTarget) {
      return;
    }
    if (reverseReason.trim().length < 4) {
      setFormError('Provide a clear audit reason (at least 4 characters).');
      return;
    }

    setReversing(true);
    setFormError(null);
    const res = await reverseCustomerDebtPayment(
      accessToken,
      activeMembership.businessId,
      detailCustomer.id,
      reverseTarget.id,
      reverseReason.trim(),
    );
    setReversing(false);

    if (!res.success) {
      setFormError(res.error?.message ?? 'Unable to reverse debt payment.');
      return;
    }

    pushToast('Debt repayment reversed and customer balance restored.', 'success');
    setReverseTarget(null);
    setReverseReason('');
    setLoading(true);
    setReloadTick((n) => n + 1);
    void openCustomerDetail(detailCustomer.id);
  };

  const totalOutstanding = customers.reduce((sum, c) => sum + Number(c.outstandingBalance || 0), 0);
  const debtorCount = customers.filter((c) => Number(c.outstandingBalance || 0) > 0).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers & Debt"
        description="Track customer credit balances, collect partial or full repayments, and issue repayment receipts."
        actions={
          <Button
            variant="primary"
            disabled={isReadOnly}
            onClick={() => {
              setFormError(null);
              setCreateOpen(true);
            }}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add customer</span>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-[#52525B]">Customers Listed</p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-[#18181B]">
            {customers.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-[#52525B]">Customers with Open Debt</p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-[#18181B]">{debtorCount}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-[#52525B]">Total Outstanding Receivables</p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-[#991B1B]">
            {formatMoney(totalOutstanding)}
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#52525B]"
              aria-hidden="true"
            />
            <Input
              aria-label="Search customers"
              value={search}
              onChange={(e) => {
                setLoading(true);
                setSearch(e.target.value);
              }}
              placeholder="Search by customer name or phone..."
              className="pl-9"
            />
          </div>
          <CheckboxField
            id="filter-has-debt"
            label="With open debt only"
            checked={hasDebtOnly}
            onChange={(e) => {
              setLoading(true);
              setHasDebtOnly(e.target.checked);
            }}
          />
        </div>
      </Card>

      {loading ? (
        <LoadingSkeleton rows={5} label="Loading customers..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            setReloadTick((n) => n + 1);
          }}
        />
      ) : customers.length === 0 ? (
        <EmptyState
          title={hasDebtOnly ? 'No open customer debts' : 'No customers found'}
          description={
            hasDebtOnly
              ? 'All listed customers are currently settled.'
              : 'Add walk-in or credit customers so you can assign credit sales and collect repayments.'
          }
          action={
            !hasDebtOnly && !isReadOnly ? (
              <Button variant="primary" onClick={() => setCreateOpen(true)}>
                Add first customer
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7] text-xs font-semibold text-[#52525B]">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Phone / Email</th>
                  <th className="px-4 py-3 text-right">Credit Limit</th>
                  <th className="px-4 py-3 text-right">Outstanding Debt</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {customers.map((customer) => {
                  const balance = Number(customer.outstandingBalance || 0);
                  return (
                    <tr key={customer.id}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-[#18181B]">{customer.fullName}</p>
                        {customer.address && (
                          <p className="text-xs text-[#52525B]">{customer.address}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#52525B]">
                        <p className="font-mono-tabular text-[#18181B]">{customer.phone || '—'}</p>
                        {customer.email && <p>{customer.email}</p>}
                      </td>
                      <td className="px-4 py-3 text-right font-mono-tabular text-xs text-[#52525B]">
                        {customer.creditLimit ? formatMoney(customer.creditLimit) : 'No limit'}
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-mono-tabular font-semibold ${
                          balance > 0 ? 'text-[#991B1B]' : 'text-[#16A34A]'
                        }`}
                      >
                        {formatMoney(customer.outstandingBalance)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex flex-wrap justify-end gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => void openCustomerDetail(customer.id)}
                          >
                            Ledger
                          </Button>
                          {balance > 0 && (
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={isReadOnly}
                              onClick={() => openCollectModal(customer)}
                            >
                              <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Collect</span>
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Create Customer Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add Customer"
        description="Save a customer profile for credit tracking and receipt history."
      >
        <form onSubmit={(e) => void handleCreateCustomer(e)} className="space-y-4">
          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
          <FormField id="cust-name" label="Full name" required>
            <Input
              id="cust-name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Chinedu Okafor"
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="cust-phone" label="Phone number">
              <Input
                id="cust-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+234 803 000 0000"
              />
            </FormField>
            <FormField id="cust-limit" label="Credit limit (NGN)">
              <Input
                id="cust-limit"
                type="number"
                min="0"
                step="0.01"
                mono
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="Optional"
              />
            </FormField>
          </div>
          <FormField id="cust-email" label="Email address">
            <Input
              id="cust-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="optional@example.com"
            />
          </FormField>
          <FormField id="cust-address" label="Address">
            <Input
              id="cust-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Shop or street address"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingCustomer}>
              Save customer
            </Button>
          </div>
        </form>
      </Modal>

      {/* Customer Detail & Debt Ledger Modal */}
      <Modal
        open={Boolean(selectedCustomerId)}
        onClose={() => {
          setSelectedCustomerId(null);
          setDetailCustomer(null);
        }}
        title={detailCustomer?.fullName ?? 'Customer Ledger'}
        description={
          detailCustomer
            ? `Outstanding balance: ${formatMoney(detailCustomer.outstandingBalance)}`
            : undefined
        }
      >
        {detailLoading ? (
          <LoadingSkeleton rows={3} label="Loading customer ledger..." />
        ) : detailError ? (
          <AlertBanner tone="error">{detailError}</AlertBanner>
        ) : detailCustomer ? (
          <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
            <div className="flex items-center justify-between rounded-lg border border-[#E4E4E7] bg-[#F4F5F7]/60 p-3.5">
              <div>
                <p className="text-xs text-[#52525B]">Outstanding Balance</p>
                <p className="font-mono-tabular text-lg font-bold text-[#991B1B]">
                  {formatMoney(detailCustomer.outstandingBalance)}
                </p>
              </div>
              {Number(detailCustomer.outstandingBalance) > 0 && (
                <Button
                  variant="primary"
                  size="sm"
                  disabled={isReadOnly}
                  onClick={() => openCollectModal(detailCustomer)}
                >
                  Collect Payment
                </Button>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#52525B]">
                Open Credit Sales ({openCreditSales.length})
              </h3>
              {openCreditSales.length === 0 ? (
                <p className="mt-2 text-xs text-[#52525B]">No unpaid credit invoices.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[#E4E4E7] rounded-lg border border-[#E4E4E7]">
                  {openCreditSales.map((sale) => (
                    <li
                      key={sale.id}
                      className="flex items-center justify-between px-3 py-2 text-xs"
                    >
                      <div>
                        <p className="font-mono-tabular font-medium text-[#18181B]">
                          {sale.saleNumber}
                        </p>
                        <p className="text-[#52525B]">{formatDateTime(sale.soldAt)}</p>
                      </div>
                      <p className="font-mono-tabular font-semibold text-[#991B1B]">
                        {formatMoney(sale.creditRemaining)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#52525B]">
                Debt Repayment History ({debtPayments.length})
              </h3>
              {debtPayments.length === 0 ? (
                <p className="mt-2 text-xs text-[#52525B]">No debt repayments recorded yet.</p>
              ) : (
                <ul className="mt-2 divide-y divide-[#E4E4E7] rounded-lg border border-[#E4E4E7]">
                  {debtPayments.map((payment) => (
                    <li
                      key={payment.id}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-xs"
                    >
                      <div>
                        <p className="font-mono-tabular font-semibold text-[#18181B]">
                          {formatMoney(payment.amount)} ·{' '}
                          <span className="font-sans capitalize text-[#52525B]">
                            {payment.method.replace('_', ' ')}
                          </span>
                        </p>
                        <p className="text-[#52525B]">
                          {formatDateTime(payment.paidAt)} ·{' '}
                          <span
                            className={
                              payment.status === 'reversed'
                                ? 'font-medium text-[#DC2626]'
                                : 'text-[#16A34A]'
                            }
                          >
                            {payment.status}
                          </span>
                        </p>
                        {payment.reversalReason && (
                          <p className="mt-0.5 text-[#DC2626]">Reason: {payment.reversalReason}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setReceiptPayment(payment);
                            setReceiptCustomerName(detailCustomer.fullName);
                          }}
                        >
                          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Receipt</span>
                        </Button>
                        {canReverseDebt && payment.status === 'posted' && !isReadOnly && (
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              setFormError(null);
                              setReverseReason('');
                              setReverseTarget(payment);
                            }}
                          >
                            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Reverse</span>
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Collect Debt Payment Modal */}
      <Modal
        open={collectOpen}
        onClose={() => setCollectOpen(false)}
        title="Collect Debt Repayment"
        description={
          detailCustomer
            ? `${detailCustomer.fullName} · Current debt ${formatMoney(detailCustomer.outstandingBalance)}`
            : undefined
        }
      >
        <form onSubmit={(e) => void handleCollectPayment(e)} className="space-y-4">
          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
          <FormField id="debt-pay-amount" label="Amount received (NGN)" required>
            <Input
              id="debt-pay-amount"
              type="number"
              min="0.01"
              step="0.01"
              mono
              required
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
            />
          </FormField>
          <FormField id="debt-pay-method" label="Payment method" required>
            <Select
              id="debt-pay-method"
              value={payMethod}
              onChange={(e) => setPayMethod(e.target.value as 'cash' | 'transfer' | 'pos_card')}
            >
              <option value="cash">Cash</option>
              <option value="transfer">Bank Transfer</option>
              <option value="pos_card">POS Card</option>
            </Select>
          </FormField>
          <FormField id="debt-pay-ref" label="Reference / Note">
            <Input
              id="debt-pay-ref"
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              placeholder="e.g. GTBank transfer ref"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCollectOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={collecting}>
              Post repayment &amp; issue receipt
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reverse Debt Payment Modal (Owner/Manager) */}
      <Modal
        open={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title="Reverse Debt Repayment"
        description="Non-destructive audited reversal restores the customer's unpaid credit balance."
      >
        <form onSubmit={(e) => void handleReversePayment(e)} className="space-y-4">
          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
          <FormField id="reverse-debt-reason" label="Audit reason" required>
            <Input
              id="reverse-debt-reason"
              required
              minLength={4}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="e.g. Transfer bounced / posted to wrong customer"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setReverseTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={reversing}>
              Confirm reversal
            </Button>
          </div>
        </form>
      </Modal>

      <ReceiptModal
        open={Boolean(receiptPayment)}
        onClose={() => setReceiptPayment(null)}
        businessName={activeMembership?.businessName ?? 'Festola Business'}
        debtPayment={receiptPayment}
        customerName={receiptCustomerName}
      />
    </div>
  );
}
