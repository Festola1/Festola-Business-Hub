import { Download } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { Card, ErrorState, LoadingSkeleton, PageHeader } from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import {
  downloadCsvReport,
  fetchDebtorsAging,
  fetchFinancialSummary,
  fetchInventoryValuation,
  fetchSalesByDay,
  fetchTopProducts,
  type DebtorsAgingReport,
  type FinancialSummaryReport,
  type InventoryValuationReport,
  type SalesByDayPoint,
  type TopProductRow,
} from '../../lib/commerce-api';
import {
  daysAgoIsoDate,
  formatDateOnly,
  formatMoney,
  formatQty,
  todayIsoDate,
} from '../../lib/format';

export default function ReportsPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const { pushToast } = useToast();

  const [fromInput, setFromInput] = useState(() => daysAgoIsoDate(30));
  const [toInput, setToInput] = useState(() => todayIsoDate());
  const [appliedRange, setAppliedRange] = useState(() => ({
    from: daysAgoIsoDate(30),
    to: todayIsoDate(),
  }));

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<FinancialSummaryReport | null>(null);
  const [salesByDay, setSalesByDay] = useState<SalesByDayPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [valuation, setValuation] = useState<InventoryValuationReport | null>(null);
  const [aging, setAging] = useState<DebtorsAgingReport | null>(null);
  const [exportingType, setExportingType] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;
    const range = {
      from: `${appliedRange.from}T00:00:00.000Z`,
      to: `${appliedRange.to}T23:59:59.999Z`,
    };

    void Promise.all([
      fetchFinancialSummary(accessToken, activeMembership.businessId, range),
      fetchSalesByDay(accessToken, activeMembership.businessId, range),
      fetchTopProducts(accessToken, activeMembership.businessId, { ...range, limit: 10 }),
      fetchInventoryValuation(accessToken, activeMembership.businessId),
      fetchDebtorsAging(accessToken, activeMembership.businessId),
    ]).then(([sumRes, dayRes, topRes, valRes, ageRes]) => {
      if (cancelled) {
        return;
      }
      if (!sumRes.success || !sumRes.data) {
        setError(sumRes.error?.message ?? 'Unable to load financial reports.');
        setLoading(false);
        return;
      }
      setSummary(sumRes.data.summary);
      setSalesByDay(dayRes.success && dayRes.data ? dayRes.data.series : []);
      setTopProducts(topRes.success && topRes.data ? topRes.data.products : []);
      setValuation(valRes.success && valRes.data ? valRes.data.valuation : null);
      setAging(ageRes.success && ageRes.data ? ageRes.data.aging : null);
      setError(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, appliedRange, reloadTick, tenantEpoch]);

  const handleApplyRange = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setAppliedRange({ from: fromInput, to: toInput });
  };

  const applyPreset = (days: number) => {
    const nextFrom = daysAgoIsoDate(days);
    const nextTo = todayIsoDate();
    setFromInput(nextFrom);
    setToInput(nextTo);
    setLoading(true);
    setAppliedRange({ from: nextFrom, to: nextTo });
  };

  const handleExport = async (type: 'sales' | 'expenses' | 'inventory' | 'debtors') => {
    if (!accessToken || !activeMembership) {
      return;
    }
    setExportingType(type);
    const result = await downloadCsvReport(accessToken, activeMembership.businessId, type, {
      from: `${appliedRange.from}T00:00:00.000Z`,
      to: `${appliedRange.to}T23:59:59.999Z`,
    });
    setExportingType(null);
    if (result.ok) {
      pushToast(`Downloaded ${type} CSV report.`, 'success');
    } else {
      pushToast(result.errorMessage ?? 'Unable to export CSV.', 'error');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Financial Reports"
        description="Server-calculated P&L, daily sales trend, top products, WAC inventory valuation, debtors aging, and CSV exports."
      />

      <Card className="p-4">
        <form
          onSubmit={handleApplyRange}
          className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-end">
            <FormField id="rep-from" label="From date">
              <Input
                id="rep-from"
                type="date"
                value={fromInput}
                onChange={(e) => setFromInput(e.target.value)}
              />
            </FormField>
            <FormField id="rep-to" label="To date">
              <Input
                id="rep-to"
                type="date"
                value={toInput}
                onChange={(e) => setToInput(e.target.value)}
              />
            </FormField>
            <Button type="submit" variant="primary">
              Apply range
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => applyPreset(7)}>
              Last 7 days
            </Button>
            <Button variant="secondary" size="sm" onClick={() => applyPreset(30)}>
              Last 30 days
            </Button>
            <Button variant="secondary" size="sm" onClick={() => applyPreset(90)}>
              Last 90 days
            </Button>
          </div>
        </form>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#E4E4E7] pt-3">
          <span className="text-xs font-medium text-[#52525B]">Export CSV:</span>
          {(['sales', 'expenses', 'inventory', 'debtors'] as const).map((type) => (
            <Button
              key={type}
              variant="secondary"
              size="sm"
              loading={exportingType === type}
              onClick={() => void handleExport(type)}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="capitalize">{type}</span>
            </Button>
          ))}
        </div>
      </Card>

      {loading ? (
        <LoadingSkeleton rows={6} label="Calculating financial reports..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            setReloadTick((n) => n + 1);
          }}
        />
      ) : summary ? (
        <>
          {/* Profit & Loss Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium text-[#52525B]">Net Sales ({summary.salesCount})</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-[#18181B]">
                {formatMoney(summary.netSales)}
              </p>
              <p className="mt-1 font-mono-tabular text-xs text-[#52525B]">
                Gross {formatMoney(summary.grossSales)} · Returns{' '}
                {formatMoney(summary.returnsAndVoids)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-[#52525B]">Gross Profit</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-[#16A34A]">
                {formatMoney(summary.grossProfit)}
              </p>
              <p className="mt-1 font-mono-tabular text-xs text-[#52525B]">
                COGS (WAC): {formatMoney(summary.cogs)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-[#52525B]">Net Operating Profit</p>
              <p
                className={`mt-1 font-mono-tabular text-xl font-bold ${
                  Number(summary.netOperatingProfit) >= 0 ? 'text-[#18181B]' : 'text-[#DC2626]'
                }`}
              >
                {formatMoney(summary.netOperatingProfit)}
              </p>
              <p className="mt-1 font-mono-tabular text-xs text-[#52525B]">
                Operating Expenses: {formatMoney(summary.operatingExpenses)}
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-[#52525B]">Cash &amp; Receivables</p>
              <p className="mt-1 font-mono-tabular text-xl font-bold text-[#991B1B]">
                {formatMoney(summary.outstandingReceivables)}
              </p>
              <p className="mt-1 font-mono-tabular text-xs text-[#52525B]">
                Collected {formatMoney(summary.cashCollectedOnSales)} · Tax{' '}
                {formatMoney(summary.taxCollected)}
              </p>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Sales by Day */}
            <Card className="overflow-hidden">
              <div className="border-b border-[#E4E4E7] px-5 py-3.5">
                <h2 className="text-base font-semibold text-[#18181B]">Sales by Day</h2>
              </div>
              {salesByDay.length === 0 ? (
                <p className="p-5 text-sm text-[#52525B]">No sales recorded in this date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7] text-xs font-semibold text-[#52525B]">
                      <tr>
                        <th className="px-4 py-2.5">Date</th>
                        <th className="px-4 py-2.5 text-right">Sales</th>
                        <th className="px-4 py-2.5 text-right">Gross</th>
                        <th className="px-4 py-2.5 text-right">Net</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4E4E7]">
                      {salesByDay.map((row) => (
                        <tr key={row.date}>
                          <td className="px-4 py-2.5 font-mono-tabular text-xs text-[#18181B]">
                            {formatDateOnly(row.date)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-xs text-[#52525B]">
                            {row.salesCount}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-xs text-[#52525B]">
                            {formatMoney(row.grossSales)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-xs font-semibold text-[#18181B]">
                            {formatMoney(row.netSales)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Top Products */}
            <Card className="overflow-hidden">
              <div className="border-b border-[#E4E4E7] px-5 py-3.5">
                <h2 className="text-base font-semibold text-[#18181B]">Top Products</h2>
              </div>
              {topProducts.length === 0 ? (
                <p className="p-5 text-sm text-[#52525B]">No product sales in this date range.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7] text-xs font-semibold text-[#52525B]">
                      <tr>
                        <th className="px-4 py-2.5">Product</th>
                        <th className="px-4 py-2.5 text-right">Units</th>
                        <th className="px-4 py-2.5 text-right">Revenue</th>
                        <th className="px-4 py-2.5 text-right">COGS</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#E4E4E7]">
                      {topProducts.map((row) => (
                        <tr key={row.productId}>
                          <td className="px-4 py-2.5 text-xs font-medium text-[#18181B]">
                            {row.productName}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-xs text-[#52525B]">
                            {formatQty(row.unitsSold)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-xs font-semibold text-[#18181B]">
                            {formatMoney(row.revenue)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono-tabular text-xs text-[#52525B]">
                            {row.cogs ? formatMoney(row.cogs) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Inventory Valuation */}
            {valuation && (
              <Card className="p-5">
                <h2 className="text-base font-semibold text-[#18181B]">
                  Inventory Valuation (Moving WAC)
                </h2>
                <dl className="mt-3 grid grid-cols-3 gap-3 border-b border-[#E4E4E7] pb-4 text-xs">
                  <div>
                    <dt className="text-[#52525B]">Active SKUs</dt>
                    <dd className="mt-1 font-mono-tabular text-base font-bold text-[#18181B]">
                      {valuation.activeProductCount}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52525B]">Cost Value</dt>
                    <dd className="mt-1 font-mono-tabular text-base font-bold text-[#18181B]">
                      {formatMoney(valuation.totalCostValuation)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52525B]">Retail Value</dt>
                    <dd className="mt-1 font-mono-tabular text-base font-bold text-[#16A34A]">
                      {formatMoney(valuation.totalRetailValue)}
                    </dd>
                  </div>
                </dl>
                <p className="mt-3 text-xs font-semibold text-[#52525B]">
                  Low-Stock Items ({valuation.lowStockCount})
                </p>
                {valuation.lowStockItems.length === 0 ? (
                  <p className="mt-1.5 text-xs text-[#52525B]">
                    All items are above reorder level.
                  </p>
                ) : (
                  <ul className="mt-2 divide-y divide-[#E4E4E7]">
                    {valuation.lowStockItems.slice(0, 6).map((item) => (
                      <li
                        key={item.productId}
                        className="flex items-center justify-between py-2 text-xs"
                      >
                        <span className="font-medium text-[#18181B]">{item.name}</span>
                        <span className="font-mono-tabular text-[#D97706]">
                          {formatQty(item.onHand)} / min {formatQty(item.reorderLevel)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}

            {/* Debtors Aging */}
            {aging && (
              <Card className="p-5">
                <h2 className="text-base font-semibold text-[#18181B]">Debtors Aging</h2>
                <dl className="mt-3 grid grid-cols-2 gap-3 border-b border-[#E4E4E7] pb-4 text-xs sm:grid-cols-4">
                  <div>
                    <dt className="text-[#52525B]">0–30 days</dt>
                    <dd className="mt-1 font-mono-tabular font-bold text-[#18181B]">
                      {formatMoney(aging.buckets.days0to30)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52525B]">31–60 days</dt>
                    <dd className="mt-1 font-mono-tabular font-bold text-[#D97706]">
                      {formatMoney(aging.buckets.days31to60)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52525B]">61–90 days</dt>
                    <dd className="mt-1 font-mono-tabular font-bold text-[#991B1B]">
                      {formatMoney(aging.buckets.days61to90)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[#52525B]">90+ days</dt>
                    <dd className="mt-1 font-mono-tabular font-bold text-[#DC2626]">
                      {formatMoney(aging.buckets.days90Plus)}
                    </dd>
                  </div>
                </dl>
                {aging.debtors.length === 0 ? (
                  <p className="mt-3 text-xs text-[#52525B]">No outstanding customer debt.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-[#E4E4E7]">
                    {aging.debtors.slice(0, 6).map((d) => (
                      <li
                        key={d.customerId}
                        className="flex items-center justify-between py-2 text-xs"
                      >
                        <div>
                          <p className="font-medium text-[#18181B]">{d.fullName}</p>
                          <p className="text-[#52525B]">
                            {d.openInvoiceCount} open invoice{d.openInvoiceCount === 1 ? '' : 's'}
                          </p>
                        </div>
                        <span className="font-mono-tabular font-semibold text-[#991B1B]">
                          {formatMoney(d.outstandingBalance)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
