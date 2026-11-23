import { Plus, Search, ShoppingBag, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
  createRestockBatch,
  fetchProducts,
  fetchRestocks,
  type ProductItem,
  type RestockBatch,
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import { formatDateTime, formatMoney, formatQty, todayIsoDate } from '../../lib/format';
import {
  listWorkspaceSuppliers,
  saveWorkspaceSuppliers,
  type SupplierRecord,
} from '../../lib/offline-store';

interface PurchaseLineDraft {
  id: string;
  productId: string;
  quantity: string;
  unitCost: string;
}

type PurchasePaymentStatus = 'paid' | 'partial' | 'unpaid';

export default function PurchasesPage() {
  const { accessToken, activeMembership } = useAuth();
  const { pushToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const businessId = activeMembership?.businessId ?? '';
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [restocks, setRestocks] = useState<RestockBatch[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(() =>
    businessId ? listWorkspaceSuppliers(businessId) : [],
  );
  const [search, setSearch] = useState('');

  // Create Purchase Modal
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [customSupplierName, setCustomSupplierName] = useState('');
  const [invoiceReference, setInvoiceReference] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(todayIsoDate());
  const [paymentStatus, setPaymentStatus] = useState<PurchasePaymentStatus>('paid');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PurchaseLineDraft[]>([
    { id: 'line-1', productId: '', quantity: '1', unitCost: '' },
  ]);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!accessToken || !businessId) return;
    let cancelled = false;

    void Promise.all([
      fetchProducts(accessToken, businessId, { isActive: true, limit: 200 }),
      fetchRestocks(accessToken, businessId, 50),
    ]).then(([prodRes, restockRes]) => {
      if (cancelled) return;
      setSuppliers(listWorkspaceSuppliers(businessId));
      if (!prodRes.success) {
        setErrorMessage(getFriendlyApiError(prodRes.error, 'Unable to load products.'));
        setLoading(false);
        return;
      }
      if (!restockRes.success) {
        setErrorMessage(getFriendlyApiError(restockRes.error, 'Unable to load purchase history.'));
        setLoading(false);
        return;
      }
      setProducts(prodRes.data?.products ?? []);
      setRestocks(restockRes.data?.restocks ?? []);
      setErrorMessage(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, businessId, reloadTick]);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const filteredPurchases = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return restocks;
    return restocks.filter(
      (batch) =>
        batch.batchNumber.toLowerCase().includes(q) ||
        (batch.supplierNote ?? '').toLowerCase().includes(q) ||
        (batch.notes ?? '').toLowerCase().includes(q),
    );
  }, [restocks, search]);

  const totalPurchaseSpend = useMemo(
    () => restocks.reduce((sum, r) => sum + (Number(r.totalCost) || 0), 0),
    [restocks],
  );

  const estimatedDraftTotal = useMemo(() => {
    return lines.reduce((sum, line) => {
      const qty = Number(line.quantity);
      const cost = Number(line.unitCost);
      if (Number.isFinite(qty) && Number.isFinite(cost) && qty > 0 && cost >= 0) {
        return sum + qty * cost;
      }
      return sum;
    }, 0);
  }, [lines]);

  const handleAddLine = () => {
    setLines((prev) => [
      ...prev,
      { id: `line-${Date.now()}-${prev.length}`, productId: '', quantity: '1', unitCost: '' },
    ]);
  };

  const handleRemoveLine = (id: string) => {
    setLines((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  };

  const handleLineChange = (id: string, field: keyof PurchaseLineDraft, value: string) => {
    setLines((prev) =>
      prev.map((line) => {
        if (line.id !== id) return line;
        if (field === 'productId') {
          const prod = productMap.get(value);
          return {
            ...line,
            productId: value,
            unitCost: line.unitCost || prod?.weightedAvgCost || prod?.costPrice || '',
          };
        }
        return { ...line, [field]: value };
      }),
    );
  };

  const handleCreatePurchase = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !businessId) return;
    setFormError(null);

    const validItems: Array<{ productId: string; quantityReceived: string; unitCost: string }> = [];
    for (const line of lines) {
      if (!line.productId) {
        setFormError('Select a product on every purchase line.');
        return;
      }
      const qty = Number(line.quantity);
      const cost = Number(line.unitCost);
      if (!Number.isFinite(qty) || qty <= 0) {
        setFormError('Purchase quantity must be greater than zero.');
        return;
      }
      if (!Number.isFinite(cost) || cost < 0) {
        setFormError('Unit purchase cost must be zero or positive.');
        return;
      }
      validItems.push({
        productId: line.productId,
        quantityReceived: qty.toFixed(3).replace(/\.?0+$/, ''),
        unitCost: cost.toFixed(2),
      });
    }

    const chosenSupplier = suppliers.find((s) => s.id === selectedSupplierId);
    const supplierLabel = chosenSupplier?.name ?? (customSupplierName.trim() || 'Direct Supplier');
    const composedNotes = [
      invoiceReference.trim() ? `Invoice: ${invoiceReference.trim()}` : null,
      `Date: ${purchaseDate}`,
      `Payment: ${paymentStatus.toUpperCase()}`,
      notes.trim() || null,
    ]
      .filter(Boolean)
      .join(' · ');

    setSubmitting(true);
    const res = await createRestockBatch(accessToken, businessId, {
      supplierNote: supplierLabel,
      notes: composedNotes,
      items: validItems,
    });
    setSubmitting(false);

    if (!res.success || !res.data) {
      setFormError(getFriendlyApiError(res.error, 'Could not confirm purchase batch.'));
      return;
    }

    // Update linked local supplier totals/balance if a directory supplier was selected
    if (chosenSupplier) {
      const serverTotal = Number(res.data.restock.totalCost) || estimatedDraftTotal;
      const updatedSuppliers = suppliers.map((s) =>
        s.id === chosenSupplier.id
          ? {
              ...s,
              totalPurchases: s.totalPurchases + serverTotal,
              outstandingBalance:
                paymentStatus === 'paid'
                  ? s.outstandingBalance
                  : s.outstandingBalance + serverTotal,
            }
          : s,
      );
      saveWorkspaceSuppliers(businessId, updatedSuppliers);
      setSuppliers(updatedSuppliers);
    }

    pushToast('Purchase confirmed and stock updated atomically on server.', 'success');
    setCreateOpen(false);
    setSelectedSupplierId('');
    setCustomSupplierName('');
    setInvoiceReference('');
    setNotes('');
    setPaymentStatus('paid');
    setLines([{ id: 'line-1', productId: '', quantity: '1', unitCost: '' }]);
    setReloadTick((n) => n + 1);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumb={activeMembership?.businessName}
          title="Purchases"
          description="Record supplier stock purchases and update inventory quantities atomically."
        />
        <LoadingSkeleton rows={5} label="Loading purchase history..." />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-6">
        <PageHeader breadcrumb={activeMembership?.businessName} title="Purchases" />
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
        title="Purchase Management"
        description="Create supplier purchase orders and post validated restock batches directly to inventory."
        actions={
          <Button variant="primary" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Create Purchase</span>
          </Button>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Total Purchase Batches</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#151B2B]">
            {restocks.length}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Verified server stock receipts</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Total Purchase Cost</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#D90000]">
            {formatMoney(totalPurchaseSpend)}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Committed Moving WAC inventory cost</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Directory Suppliers</p>
          <p className="mt-2 font-mono-tabular text-2xl font-extrabold text-[#151B2B]">
            {suppliers.length}
          </p>
          <p className="mt-1 text-xs text-[#6B7280]">Available for quick purchase assignment</p>
        </Card>
      </div>

      {/* Purchase History Table */}
      <Card>
        <div className="flex flex-col gap-3 border-b border-[#E5E7EB] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="h-4 w-4 text-[#D90000]" aria-hidden="true" />
            <h2 className="text-base font-bold text-[#151B2B]">Purchase History</h2>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search batch, supplier, invoice..."
              aria-label="Search purchase history"
              className="pl-9"
            />
          </div>
        </div>

        {filteredPurchases.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No purchases recorded yet"
              description="Record your first supplier purchase to automatically increase product quantities and recalculate weighted average cost."
              action={
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  Create Purchase
                </Button>
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F8F8FA] text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
                <tr>
                  <th className="px-5 py-3">Purchase Ref</th>
                  <th className="px-4 py-3">Supplier</th>
                  <th className="px-4 py-3">Date Received</th>
                  <th className="px-4 py-3">Invoice &amp; Payment</th>
                  <th className="px-4 py-3 text-right">Line Items</th>
                  <th className="px-5 py-3 text-right">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {filteredPurchases.map((batch) => (
                  <tr key={batch.id} className="hover:bg-[#F8F8FA]/70">
                    <td className="px-5 py-3.5 font-mono-tabular text-xs font-bold text-[#151B2B]">
                      {batch.batchNumber}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-[#151B2B]">
                      {batch.supplierNote ?? 'Direct Supplier'}
                    </td>
                    <td className="px-4 py-3.5 font-mono-tabular text-xs text-[#6B7280]">
                      {formatDateTime(batch.receivedAt)}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#6B7280]">
                      {batch.notes ?? 'Stock batch received'}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-tabular text-xs font-semibold text-[#151B2B]">
                      {batch.items.length} item{batch.items.length === 1 ? '' : 's'}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono-tabular font-bold text-[#151B2B]">
                      {formatMoney(batch.totalCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Create Purchase Order Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Purchase"
        description="Confirmed purchases commit atomically through the server restock transaction to update inventory."
      >
        <form onSubmit={(e) => void handleCreatePurchase(e)} className="space-y-4">
          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField id="pur-supplier" label="Select Supplier">
              <Select
                id="pur-supplier"
                value={selectedSupplierId}
                onChange={(e) => setSelectedSupplierId(e.target.value)}
              >
                <option value="">-- Enter supplier name manually --</option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </Select>
            </FormField>

            {!selectedSupplierId && (
              <FormField id="pur-supplier-manual" label="Supplier Name">
                <Input
                  id="pur-supplier-manual"
                  value={customSupplierName}
                  onChange={(e) => setCustomSupplierName(e.target.value)}
                  placeholder="e.g. Alaba Wholesale Depot"
                />
              </FormField>
            )}

            <FormField id="pur-invoice" label="Supplier Invoice Reference">
              <Input
                id="pur-invoice"
                value={invoiceReference}
                onChange={(e) => setInvoiceReference(e.target.value)}
                placeholder="e.g. INV-2026-0412"
              />
            </FormField>

            <FormField id="pur-date" label="Purchase Date" required>
              <Input
                id="pur-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                required
              />
            </FormField>

            <FormField id="pur-payment-status" label="Payment Status" required>
              <Select
                id="pur-payment-status"
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value as PurchasePaymentStatus)}
              >
                <option value="paid">Paid in Full</option>
                <option value="partial">Partially Paid</option>
                <option value="unpaid">Unpaid / Supplier Credit</option>
              </Select>
            </FormField>
          </div>

          {/* Purchased Products Line Items */}
          <div className="space-y-2.5 rounded-xl border border-[#E5E7EB] bg-[#F8F8FA] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-[#151B2B]">
                Purchased Products
              </p>
              <button
                type="button"
                onClick={handleAddLine}
                className="text-xs font-semibold text-[#D90000] hover:underline"
              >
                + Add Line
              </button>
            </div>

            {lines.map((line, index) => (
              <div
                key={line.id}
                className="grid grid-cols-1 gap-2 rounded-lg border border-[#E5E7EB] bg-white p-3 sm:grid-cols-12 sm:items-end"
              >
                <div className="sm:col-span-5">
                  <label
                    htmlFor={`pur-prod-${index}`}
                    className="block text-[11px] font-semibold text-[#6B7280]"
                  >
                    Product
                  </label>
                  <Select
                    id={`pur-prod-${index}`}
                    value={line.productId}
                    onChange={(e) => handleLineChange(line.id, 'productId', e.target.value)}
                    className="mt-1"
                  >
                    <option value="">Choose product...</option>
                    {products.map((prod) => (
                      <option key={prod.id} value={prod.id}>
                        {prod.name} (On hand: {formatQty(prod.onHand)})
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor={`pur-qty-${index}`}
                    className="block text-[11px] font-semibold text-[#6B7280]"
                  >
                    Quantity
                  </label>
                  <Input
                    id={`pur-qty-${index}`}
                    type="number"
                    min="0.001"
                    step="any"
                    value={line.quantity}
                    onChange={(e) => handleLineChange(line.id, 'quantity', e.target.value)}
                    className="mt-1"
                  />
                </div>

                <div className="sm:col-span-3">
                  <label
                    htmlFor={`pur-cost-${index}`}
                    className="block text-[11px] font-semibold text-[#6B7280]"
                  >
                    Unit Cost (₦)
                  </label>
                  <Input
                    id={`pur-cost-${index}`}
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.unitCost}
                    onChange={(e) => handleLineChange(line.id, 'unitCost', e.target.value)}
                    placeholder="0.00"
                    className="mt-1"
                  />
                </div>

                <div className="flex justify-end sm:col-span-1">
                  <button
                    type="button"
                    onClick={() => handleRemoveLine(line.id)}
                    aria-label="Remove product line"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-[#6B7280] hover:bg-[#FFF1F1] hover:text-[#DC2626]"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}

            <div className="flex items-center justify-between border-t border-[#E5E7EB] pt-3 text-sm">
              <span className="font-semibold text-[#6B7280]">
                Estimated Purchase Total (server recalculates authoritatively)
              </span>
              <span className="font-mono-tabular font-extrabold text-[#151B2B]">
                {formatMoney(estimatedDraftTotal)}
              </span>
            </div>
          </div>

          <FormField id="pur-notes" label="Notes (Optional)">
            <Input
              id="pur-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery driver, freight fee, or batch notes"
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={submitting}
              loadingLabel="Confirming purchase..."
            >
              Confirm Purchase &amp; Update Stock
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
