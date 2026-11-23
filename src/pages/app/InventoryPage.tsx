import { Plus, Trash2 } from 'lucide-react';
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
  createStockAdjustment,
  fetchProducts,
  fetchRestocks,
  fetchStockMovements,
  type ProductItem,
  type RestockBatch,
  type StockMovementItem,
  type StockMovementType,
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import { formatDateTime, formatMoney, formatQty } from '../../lib/format';

interface RestockDraftLine {
  productId: string;
  quantityReceived: string;
  unitCost: string;
}

/**
 * Inventory Ledger, Multi-Item Restock Receiving (D-11), and Audited Stock Adjustments (D-04).
 * Strictly omits Release 2 Stock Counts (C-02).
 */
export default function InventoryPage() {
  const { accessToken, activeMembership } = useAuth();
  const { pushToast } = useToast();

  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const [tab, setTab] = useState<'movements' | 'restocks'>('movements');
  const [movementFilter, setMovementFilter] = useState<StockMovementType | ''>('');
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [restocks, setRestocks] = useState<RestockBatch[]>([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Restock modal state
  const [restockOpen, setRestockOpen] = useState(false);
  const [supplierNote, setSupplierNote] = useState('');
  const [restockNotes, setRestockNotes] = useState('');
  const [lines, setLines] = useState<RestockDraftLine[]>([
    { productId: '', quantityReceived: '1', unitCost: '' },
  ]);
  const [restockError, setRestockError] = useState<string | null>(null);
  const [savingRestock, setSavingRestock] = useState(false);

  // Adjustment modal state
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [adjProductId, setAdjProductId] = useState('');
  const [adjDirection, setAdjDirection] = useState<'in' | 'out'>('out');
  const [adjQty, setAdjQty] = useState('1');
  const [adjReason, setAdjReason] = useState('');
  const [adjError, setAdjError] = useState<string | null>(null);
  const [savingAdj, setSavingAdj] = useState(false);

  const productNameById = useMemo(
    () => new Map(products.map((p) => [p.id, `${p.name} (${p.unit})`])),
    [products],
  );

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;

    void Promise.all([
      fetchProducts(accessToken, activeMembership.businessId, { limit: 200 }),
      fetchStockMovements(accessToken, activeMembership.businessId, {
        movementType: movementFilter || undefined,
        limit: 60,
      }),
      fetchRestocks(accessToken, activeMembership.businessId, 30),
    ]).then(([prodRes, movRes, restockRes]) => {
      if (cancelled) return;
      if (!movRes.success || !movRes.data) {
        setErrorMessage(getFriendlyApiError(movRes.error, 'Unable to load inventory ledger.'));
        setLoading(false);
        return;
      }
      if (prodRes.success && prodRes.data) setProducts(prodRes.data.products);
      setMovements(movRes.data.movements);
      if (restockRes.success && restockRes.data) setRestocks(restockRes.data.restocks);
      setErrorMessage(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, movementFilter, reloadTick]);

  const restockEstimatedTotal = lines.reduce((sum, l) => {
    const qty = Number(l.quantityReceived);
    const cost = Number(l.unitCost);
    return sum + (Number.isFinite(qty) && Number.isFinite(cost) ? qty * cost : 0);
  }, 0);

  const handleCreateRestock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) return;
    setRestockError(null);

    const validLines = lines.filter(
      (l) => l.productId && Number(l.quantityReceived) > 0 && Number(l.unitCost) > 0,
    );
    if (validLines.length === 0) {
      setRestockError('Add at least one product line with positive quantity and unit cost.');
      return;
    }

    setSavingRestock(true);
    const res = await createRestockBatch(accessToken, activeMembership.businessId, {
      supplierNote: supplierNote.trim() || null,
      notes: restockNotes.trim() || null,
      items: validLines.map((l) => ({
        productId: l.productId,
        quantityReceived: Number(l.quantityReceived).toFixed(3),
        unitCost: Number(l.unitCost).toFixed(2),
      })),
    });
    setSavingRestock(false);

    if (!res.success) {
      setRestockError(getFriendlyApiError(res.error, 'Unable to record restock batch.'));
      return;
    }

    setRestockOpen(false);
    setSupplierNote('');
    setRestockNotes('');
    setLines([{ productId: '', quantityReceived: '1', unitCost: '' }]);
    pushToast('Restock batch received and moving WAC updated.', 'success');
    setReloadTick((n) => n + 1);
  };

  const handleCreateAdjustment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) return;
    setAdjError(null);

    if (!adjProductId) {
      setAdjError('Select a product to adjust.');
      return;
    }
    if (!Number.isFinite(Number(adjQty)) || Number(adjQty) <= 0) {
      setAdjError('Enter a valid quantity greater than 0.');
      return;
    }
    if (adjReason.trim().length < 3) {
      setAdjError('Provide a clear audit reason (at least 3 characters).');
      return;
    }

    setSavingAdj(true);
    const res = await createStockAdjustment(accessToken, activeMembership.businessId, {
      productId: adjProductId,
      direction: adjDirection,
      quantity: Number(adjQty).toFixed(3),
      reason: adjReason.trim(),
    });
    setSavingAdj(false);

    if (!res.success) {
      setAdjError(getFriendlyApiError(res.error, 'Unable to post stock adjustment.'));
      return;
    }

    setAdjustOpen(false);
    setAdjReason('');
    setAdjQty('1');
    pushToast('Audited stock adjustment recorded.', 'success');
    setReloadTick((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Inventory & Restock"
        description="Receive multi-item supplier restocks (recalculating moving WAC) and record audited stock adjustments."
        actions={
          <>
            <Button
              variant="secondary"
              size="sm"
              disabled={isReadOnly || products.length === 0}
              onClick={() => {
                setAdjError(null);
                setAdjProductId(products[0]?.id ?? '');
                setAdjustOpen(true);
              }}
            >
              Stock Adjustment
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={isReadOnly || products.length === 0}
              onClick={() => {
                setRestockError(null);
                setLines([
                  { productId: products[0]?.id ?? '', quantityReceived: '1', unitCost: '' },
                ]);
                setRestockOpen(true);
              }}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>Receive Restock</span>
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Inventory views" className="inline-flex gap-2">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'movements'}
            onClick={() => setTab('movements')}
            className={`min-h-[40px] rounded-lg border px-4 py-2 text-xs font-medium ${
              tab === 'movements'
                ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#E4E4E7] bg-white text-[#52525B]'
            }`}
          >
            Stock Ledger
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'restocks'}
            onClick={() => setTab('restocks')}
            className={`min-h-[40px] rounded-lg border px-4 py-2 text-xs font-medium ${
              tab === 'restocks'
                ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#E4E4E7] bg-white text-[#52525B]'
            }`}
          >
            Restock Batches (<span className="font-mono-tabular">{restocks.length}</span>)
          </button>
        </div>

        {tab === 'movements' && (
          <div className="w-full sm:w-56">
            <label htmlFor="mov-filter" className="sr-only">
              Filter by movement type
            </label>
            <Select
              id="mov-filter"
              value={movementFilter}
              onChange={(e) => setMovementFilter(e.target.value as StockMovementType | '')}
            >
              <option value="">All movement types</option>
              <option value="opening_stock">Opening stock</option>
              <option value="restock_in">Restock received</option>
              <option value="sale_out">Sale deduction</option>
              <option value="return_restock">Return (restocked)</option>
              <option value="return_damaged">Return (damaged)</option>
              <option value="adjustment_in">Adjustment (+)</option>
              <option value="adjustment_out">Adjustment (-)</option>
            </Select>
          </div>
        )}
      </div>

      {loading ? (
        <LoadingSkeleton rows={5} label="Loading inventory..." />
      ) : errorMessage ? (
        <ErrorState
          message={errorMessage}
          onRetry={() => {
            setLoading(true);
            setReloadTick((n) => n + 1);
          }}
        />
      ) : tab === 'movements' ? (
        movements.length === 0 ? (
          <EmptyState
            title="No stock movements yet"
            description="Stock movements are recorded automatically when you add opening stock, receive restocks, make sales, or log adjustments."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7]/60 text-xs text-[#52525B]">
                  <tr>
                    <th className="px-5 py-3 font-medium">Product & Reason</th>
                    <th className="px-4 py-3 font-medium">Type</th>
                    <th className="px-4 py-3 text-right font-medium">Delta</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                    <th className="px-5 py-3 text-right font-medium">Unit Cost Snapshot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7]">
                  {movements.map((m) => {
                    const deltaNum = Number(m.quantityDelta);
                    return (
                      <tr key={m.id} className="hover:bg-[#F4F5F7]/40">
                        <td className="px-5 py-3">
                          <p className="font-medium text-[#18181B]">
                            {productNameById.get(m.productId) ?? m.productId.slice(0, 8)}
                          </p>
                          <p className="text-xs text-[#52525B]">
                            {m.reason ? `${m.reason} · ` : ''}
                            <span className="font-mono-tabular">{formatDateTime(m.createdAt)}</span>
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs capitalize text-[#52525B]">
                          {m.movementType.replaceAll('_', ' ')}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono-tabular font-semibold ${
                            deltaNum >= 0 ? 'text-[#16A34A]' : 'text-[#DC2626]'
                          }`}
                        >
                          {deltaNum >= 0 ? '+' : ''}
                          {formatQty(m.quantityDelta)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular text-[#18181B]">
                          {formatQty(m.balanceAfter)}
                        </td>
                        <td className="px-5 py-3 text-right font-mono-tabular text-xs text-[#52525B]">
                          {formatMoney(m.unitCostSnapshot)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )
      ) : restocks.length === 0 ? (
        <EmptyState
          title="No restock batches recorded"
          description="Use Receive Restock to log incoming supplier stock and update moving weighted average cost."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7]/60 text-xs text-[#52525B]">
                <tr>
                  <th className="px-5 py-3 font-medium">Batch</th>
                  <th className="px-4 py-3 font-medium">Supplier / Notes</th>
                  <th className="px-4 py-3 text-right font-medium">Items</th>
                  <th className="px-5 py-3 text-right font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {restocks.map((batch) => (
                  <tr key={batch.id} className="hover:bg-[#F4F5F7]/40">
                    <td className="px-5 py-3">
                      <p className="font-mono-tabular text-xs font-semibold text-[#18181B]">
                        {batch.batchNumber}
                      </p>
                      <p className="font-mono-tabular text-[11px] text-[#52525B]">
                        {formatDateTime(batch.receivedAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-[#52525B]">
                      {batch.supplierNote || 'Direct restock'}
                      {batch.notes ? ` · ${batch.notes}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-xs text-[#18181B]">
                      {batch.items.length}
                    </td>
                    <td className="px-5 py-3 text-right font-mono-tabular font-semibold text-[#18181B]">
                      {formatMoney(batch.totalCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Multi-Item Restock Modal (D-11) */}
      <Modal
        open={restockOpen}
        onClose={() => setRestockOpen(false)}
        title="Receive Supplier Restock"
        description="Add one or more received items. Moving weighted average cost recalculates automatically."
      >
        <form onSubmit={(e) => void handleCreateRestock(e)} className="space-y-4" noValidate>
          {restockError && <AlertBanner tone="error">{restockError}</AlertBanner>}

          <FormField id="restock-supplier" label="Supplier note (optional)">
            <Input
              id="restock-supplier"
              value={supplierNote}
              onChange={(e) => setSupplierNote(e.target.value)}
              placeholder="Balogun Wholesale Distributors"
            />
          </FormField>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-[#18181B]">Received items</p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { productId: products[0]?.id ?? '', quantityReceived: '1', unitCost: '' },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Add line</span>
              </Button>
            </div>

            {lines.map((line, idx) => (
              <div key={idx} className="space-y-2 rounded-lg border border-[#E4E4E7] p-3">
                <div className="flex items-center justify-between gap-2">
                  <Select
                    aria-label={`Product line ${idx + 1}`}
                    value={line.productId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, productId: e.target.value } : l)),
                      )
                    }
                  >
                    <option value="">Select product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({formatQty(p.onHand)} {p.unit})
                      </option>
                    ))}
                  </Select>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      aria-label={`Remove line ${idx + 1}`}
                      onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-[#52525B] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    mono
                    step="0.001"
                    min="0.001"
                    aria-label={`Quantity line ${idx + 1}`}
                    placeholder="Qty"
                    value={line.quantityReceived}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) =>
                          i === idx ? { ...l, quantityReceived: e.target.value } : l,
                        ),
                      )
                    }
                  />
                  <Input
                    type="number"
                    mono
                    step="0.01"
                    min="0.01"
                    aria-label={`Unit cost line ${idx + 1}`}
                    placeholder="Unit cost (₦)"
                    value={line.unitCost}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, i) => (i === idx ? { ...l, unitCost: e.target.value } : l)),
                      )
                    }
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-[#E4E4E7] pt-3 text-sm">
            <span className="text-[#52525B]">Estimated batch cost</span>
            <span className="font-mono-tabular font-bold text-[#18181B]">
              {formatMoney(restockEstimatedTotal)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRestockOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={savingRestock}
              loadingLabel="Receiving..."
            >
              Confirm restock
            </Button>
          </div>
        </form>
      </Modal>

      {/* Stock Adjustment Modal */}
      <Modal
        open={adjustOpen}
        onClose={() => setAdjustOpen(false)}
        title="Audited Stock Adjustment"
        description="Log shrinkage, breakage, or manual count corrections with a mandatory audit reason."
      >
        <form onSubmit={(e) => void handleCreateAdjustment(e)} className="space-y-4" noValidate>
          {adjError && <AlertBanner tone="error">{adjError}</AlertBanner>}

          <FormField id="adj-product" label="Product" required>
            <Select
              id="adj-product"
              value={adjProductId}
              onChange={(e) => setAdjProductId(e.target.value)}
            >
              <option value="">Select product</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (On hand: {formatQty(p.onHand)} {p.unit})
                </option>
              ))}
            </Select>
          </FormField>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="adj-dir" label="Direction" required>
              <Select
                id="adj-dir"
                value={adjDirection}
                onChange={(e) => setAdjDirection(e.target.value as 'in' | 'out')}
              >
                <option value="out">Decrease stock (-)</option>
                <option value="in">Increase stock (+)</option>
              </Select>
            </FormField>
            <FormField id="adj-qty" label="Quantity" required>
              <Input
                id="adj-qty"
                type="number"
                mono
                step="0.001"
                min="0.001"
                value={adjQty}
                onChange={(e) => setAdjQty(e.target.value)}
              />
            </FormField>
          </div>

          <FormField id="adj-reason" label="Audit reason" required>
            <Input
              id="adj-reason"
              required
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Damaged during shelf unloading"
            />
          </FormField>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAdjustOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={savingAdj} loadingLabel="Posting...">
              Post adjustment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
