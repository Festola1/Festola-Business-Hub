import { FolderPlus, Plus, RotateCcw } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
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
  createExpense,
  createExpenseCategory,
  fetchExpenseCategories,
  fetchExpenses,
  reverseExpense,
  type ExpenseCategory,
  type ExpenseItem,
} from '../../lib/commerce-api';
import { formatDateOnly, formatMoney, todayIsoDate } from '../../lib/format';

export default function ExpensesPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const { pushToast } = useToast();

  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'' | 'posted' | 'reversed'>('');
  const [reloadTick, setReloadTick] = useState(0);

  // Add category modal
  const [catOpen, setCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Record expense modal
  const [expOpen, setExpOpen] = useState(false);
  const [expCategoryId, setExpCategoryId] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expMethod, setExpMethod] = useState<'cash' | 'transfer' | 'pos_card'>('cash');
  const [expDate, setExpDate] = useState(() => todayIsoDate());
  const [expDescription, setExpDescription] = useState('');
  const [savingExp, setSavingExp] = useState(false);

  // Reverse expense modal
  const [reverseTarget, setReverseTarget] = useState<ExpenseItem | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reversing, setReversing] = useState(false);

  const [formError, setFormError] = useState<string | null>(null);

  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;

    void Promise.all([
      fetchExpenseCategories(accessToken, activeMembership.businessId),
      fetchExpenses(accessToken, activeMembership.businessId, {
        categoryId: categoryFilter || undefined,
        status: statusFilter || undefined,
        limit: 100,
      }),
    ]).then(([catRes, expRes]) => {
      if (cancelled) {
        return;
      }
      if (catRes.success && catRes.data) {
        setCategories(catRes.data.categories);
      }
      if (expRes.success && expRes.data) {
        setExpenses(expRes.data.expenses);
        setError(null);
      } else {
        setError(expRes.error?.message ?? 'Unable to load operating expenses.');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, categoryFilter, statusFilter, reloadTick, tenantEpoch]);

  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));

  const handleCreateCategory = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) {
      return;
    }
    if (newCatName.trim().length < 2) {
      setFormError('Enter a category name (at least 2 characters).');
      return;
    }
    setSavingCat(true);
    setFormError(null);
    const res = await createExpenseCategory(
      accessToken,
      activeMembership.businessId,
      newCatName.trim(),
    );
    setSavingCat(false);
    if (!res.success || !res.data) {
      setFormError(res.error?.message ?? 'Unable to create expense category.');
      return;
    }
    pushToast(`Category "${res.data.category.name}" created.`, 'success');
    setNewCatName('');
    setCatOpen(false);
    setLoading(true);
    setReloadTick((n) => n + 1);
  };

  const handleCreateExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) {
      return;
    }
    const amt = Number(expAmount);
    if (!expCategoryId) {
      setFormError('Select an expense category first.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Enter a valid amount greater than zero.');
      return;
    }
    if (expDescription.trim().length < 2) {
      setFormError('Enter a brief description for this expense.');
      return;
    }

    setSavingExp(true);
    setFormError(null);
    const res = await createExpense(accessToken, activeMembership.businessId, {
      categoryId: expCategoryId,
      amount: amt.toFixed(2),
      paymentMethod: expMethod,
      description: expDescription.trim(),
      incurredOn: expDate,
    });
    setSavingExp(false);

    if (!res.success) {
      setFormError(res.error?.message ?? 'Unable to record operating expense.');
      return;
    }

    pushToast('Operating expense recorded.', 'success');
    setExpOpen(false);
    setExpAmount('');
    setExpDescription('');
    setLoading(true);
    setReloadTick((n) => n + 1);
  };

  const handleReverseExpense = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership || !reverseTarget) {
      return;
    }
    if (reverseReason.trim().length < 4) {
      setFormError('Provide a reason (at least 4 characters).');
      return;
    }

    setReversing(true);
    setFormError(null);
    const res = await reverseExpense(
      accessToken,
      activeMembership.businessId,
      reverseTarget.id,
      reverseReason.trim(),
    );
    setReversing(false);
    if (!res.success) {
      setFormError(res.error?.message ?? 'Unable to reverse expense.');
      return;
    }
    pushToast('Expense reversed in the audit ledger.', 'success');
    setReverseTarget(null);
    setReverseReason('');
    setLoading(true);
    setReloadTick((n) => n + 1);
  };

  const postedExpenses = expenses.filter((e) => e.status === 'posted');
  const postedTotal = postedExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operating Expenses"
        description="Track shop rent, fuel, power, and staff costs separately from inventory Cost of Goods Sold (COGS)."
        actions={
          <>
            <Button
              variant="secondary"
              disabled={isReadOnly}
              onClick={() => {
                setFormError(null);
                setCatOpen(true);
              }}
            >
              <FolderPlus className="h-4 w-4" aria-hidden="true" />
              <span>New category</span>
            </Button>
            <Button
              variant="primary"
              disabled={isReadOnly}
              onClick={() => {
                setFormError(null);
                setExpCategoryId(categories[0]?.id ?? '');
                setExpDate(todayIsoDate());
                setExpOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Record expense</span>
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs font-medium text-[#52525B]">Posted Operating Expenses</p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-[#18181B]">
            {formatMoney(postedTotal)}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-[#52525B]">Posted Entries</p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-[#18181B]">
            {postedExpenses.length}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium text-[#52525B]">Active Categories</p>
          <p className="mt-1 font-mono-tabular text-xl font-bold text-[#18181B]">
            {categories.length}
          </p>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            aria-label="Filter by expense category"
            value={categoryFilter}
            onChange={(e) => {
              setLoading(true);
              setCategoryFilter(e.target.value);
            }}
          >
            <option value="">All expense categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by expense status"
            value={statusFilter}
            onChange={(e) => {
              setLoading(true);
              setStatusFilter(e.target.value as '' | 'posted' | 'reversed');
            }}
          >
            <option value="">All statuses</option>
            <option value="posted">Posted</option>
            <option value="reversed">Reversed</option>
          </Select>
        </div>
      </Card>

      {loading ? (
        <LoadingSkeleton rows={5} label="Loading operating expenses..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            setReloadTick((n) => n + 1);
          }}
        />
      ) : expenses.length === 0 ? (
        <EmptyState
          title="No operating expenses recorded"
          description="Record shop utilities, rent, transport, or generator fuel here so your Net Operating Profit stays accurate."
          action={
            !isReadOnly ? (
              <Button
                variant="primary"
                onClick={() => {
                  setFormError(null);
                  setExpCategoryId(categories[0]?.id ?? '');
                  setExpOpen(true);
                }}
              >
                Record first expense
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
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3 text-right">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {expenses.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 font-mono-tabular text-xs text-[#52525B]">
                      {formatDateOnly(item.incurredOn)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium text-[#18181B]">
                      {categoryNameById.get(item.categoryId) ?? 'General'}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#18181B]">
                      <p>{item.description}</p>
                      {item.reversalReason && (
                        <p className="mt-0.5 text-[#DC2626]">Reversed: {item.reversalReason}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-[#52525B]">
                      {item.paymentMethod.replace('_', ' ')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular font-semibold text-[#18181B]">
                      {formatMoney(item.amount)}
                    </td>
                    <td className="px-4 py-3 text-xs font-medium capitalize">
                      <span
                        className={item.status === 'reversed' ? 'text-[#DC2626]' : 'text-[#16A34A]'}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.status === 'posted' && !isReadOnly ? (
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => {
                            setFormError(null);
                            setReverseReason('');
                            setReverseTarget(item);
                          }}
                        >
                          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Reverse</span>
                        </Button>
                      ) : (
                        <span className="text-xs text-[#52525B]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* New Category Modal */}
      <Modal
        open={catOpen}
        onClose={() => setCatOpen(false)}
        title="New Expense Category"
        description="Group operating costs such as Fuel & Power, Rent, Salaries, or Delivery."
      >
        <form onSubmit={(e) => void handleCreateCategory(e)} className="space-y-4">
          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
          <FormField id="exp-cat-name" label="Category name" required>
            <Input
              id="exp-cat-name"
              required
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              placeholder="e.g. Rent, Electricity, Salaries"
            />
          </FormField>
          <div>
            <p className="mb-2 text-xs font-medium text-[#6B7280]">
              Quick-fill standard categories:
            </p>
            <div className="flex flex-wrap gap-1.5">
              {[
                'Rent',
                'Electricity',
                'Transportation',
                'Salaries',
                'Utilities',
                'Maintenance',
                'Marketing',
                'Internet',
                'Other expenses',
              ].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setNewCatName(preset)}
                  className="rounded-lg border border-[#E5E7EB] bg-[#F8F8FA] px-2.5 py-1 text-xs font-medium text-[#151B2B] transition-colors hover:border-[#D90000] hover:bg-[#FFF1F1] hover:text-[#D90000]"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setCatOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingCat}>
              Create category
            </Button>
          </div>
        </form>
      </Modal>

      {/* Record Expense Modal */}
      <Modal
        open={expOpen}
        onClose={() => setExpOpen(false)}
        title="Record Operating Expense"
        description="Do not enter inventory restocks here — record stock purchases in Inventory so COGS stays accurate."
      >
        <form onSubmit={(e) => void handleCreateExpense(e)} className="space-y-4">
          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
          {categories.length === 0 && (
            <AlertBanner tone="warning">
              Create an expense category first before recording an expense.
            </AlertBanner>
          )}
          <FormField id="exp-cat" label="Expense category" required>
            <Select
              id="exp-cat"
              required
              value={expCategoryId}
              onChange={(e) => setExpCategoryId(e.target.value)}
            >
              <option value="">Select category...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="exp-amount" label="Amount (NGN)" required>
              <Input
                id="exp-amount"
                type="number"
                min="0.01"
                step="0.01"
                mono
                required
                value={expAmount}
                onChange={(e) => setExpAmount(e.target.value)}
              />
            </FormField>
            <FormField id="exp-date" label="Date incurred" required>
              <Input
                id="exp-date"
                type="date"
                required
                value={expDate}
                onChange={(e) => setExpDate(e.target.value)}
              />
            </FormField>
          </div>
          <FormField id="exp-method" label="Payment method" required>
            <Select
              id="exp-method"
              value={expMethod}
              onChange={(e) => setExpMethod(e.target.value as 'cash' | 'transfer' | 'pos_card')}
            >
              <option value="cash">Cash</option>
              <option value="transfer">Bank Transfer</option>
              <option value="pos_card">POS Card</option>
            </Select>
          </FormField>
          <FormField id="exp-desc" label="Description" required>
            <Input
              id="exp-desc"
              required
              value={expDescription}
              onChange={(e) => setExpDescription(e.target.value)}
              placeholder="e.g. 25L petrol for shop generator"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setExpOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={savingExp}
              disabled={categories.length === 0}
            >
              Save expense
            </Button>
          </div>
        </form>
      </Modal>

      {/* Reverse Expense Modal */}
      <Modal
        open={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        title="Reverse Operating Expense"
        description="Reversing keeps a full audit record while excluding the entry from Net Operating Profit."
      >
        <form onSubmit={(e) => void handleReverseExpense(e)} className="space-y-4">
          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
          <FormField id="exp-rev-reason" label="Audit reason" required>
            <Input
              id="exp-rev-reason"
              required
              minLength={4}
              value={reverseReason}
              onChange={(e) => setReverseReason(e.target.value)}
              placeholder="e.g. Duplicate entry"
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
    </div>
  );
}
