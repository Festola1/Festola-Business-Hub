import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Boxes,
  Calendar,
  Crown,
  MapPin,
  PackagePlus,
  Receipt,
  Settings,
  ShoppingBag,
  ShoppingCart,
  TrendingUp,
  Trophy,
  UserPlus,
  Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import heroShopOwnerImg from '../../assets/images/hero_nigerian_shop_owner_1795177263576.jpg';
import { Card, EmptyState, ErrorState, LoadingSkeleton } from '../../components/ui/Feedback';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchFinancialSummary,
  fetchInventoryValuation,
  fetchProducts,
  fetchSales,
  fetchSalesByDay,
  fetchTopProducts,
  type FinancialSummaryReport,
  type InventoryValuationReport,
  type ProductItem,
  type SaleRecord,
  type SalesByDayPoint,
  type TopProductRow,
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import { daysAgoIsoDate, formatDateTime, formatMoney, formatQty } from '../../lib/format';
import { listQueuedOfflineSales } from '../../lib/offline-store';
import { canRoleAccess } from '../../lib/permissions';

type RangeKey = '7d' | '30d' | '90d' | '12m';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: '12m', label: '12M', days: 365 },
];

const DEMO_SERIES: Record<RangeKey, Array<{ label: string; value: number }>> = {
  '7d': [
    { label: 'Mon', value: 42000 },
    { label: 'Tue', value: 58500 },
    { label: 'Wed', value: 49200 },
    { label: 'Thu', value: 71000 },
    { label: 'Fri', value: 64800 },
    { label: 'Sat', value: 89500 },
    { label: 'Sun', value: 75000 },
  ],
  '30d': [
    { label: 'Day 1', value: 68000 },
    { label: 'Day 6', value: 94000 },
    { label: 'Day 12', value: 86000 },
    { label: 'Day 18', value: 118000 },
    { label: 'Day 22', value: 155000 },
    { label: 'Day 26', value: 124000 },
    { label: 'Day 30', value: 102000 },
  ],
  '90d': [
    { label: 'Wk 2', value: 210000 },
    { label: 'Wk 4', value: 265000 },
    { label: 'Wk 6', value: 248000 },
    { label: 'Wk 8', value: 315000 },
    { label: 'Wk 10', value: 352000 },
    { label: 'Wk 12', value: 388000 },
  ],
  '12m': [
    { label: 'Q1', value: 980000 },
    { label: 'Q2', value: 1240000 },
    { label: 'Q3', value: 1480000 },
    { label: 'Q4', value: 1850000 },
  ],
};

function MiniSparkline({ color, points }: { color: string; points: number[] }) {
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const d = points
    .map((val, idx) => {
      const x = (idx / Math.max(points.length - 1, 1)) * 120;
      const y = 26 - ((val - min) / span) * 20;
      return `${idx === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg viewBox="0 0 120 30" className="h-7 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export default function DashboardPage() {
  const { accessToken, activeMembership, profile } = useAuth();
  const [range, setRange] = useState<RangeKey>('30d');
  const [reloadTick, setReloadTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<FinancialSummaryReport | null>(null);
  const [valuation, setValuation] = useState<InventoryValuationReport | null>(null);
  const [salesSeries, setSalesSeries] = useState<SalesByDayPoint[]>([]);
  const [topProducts, setTopProducts] = useState<TopProductRow[]>([]);
  const [lowStock, setLowStock] = useState<ProductItem[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const role = activeMembership?.role ?? 'cashier';
  const canViewReports = canRoleAccess(role, 'reports.view_basic');
  const canManageInventory = canRoleAccess(role, 'inventory.receive_and_adjust');
  const canManageExpenses = canRoleAccess(role, 'expenses.manage');
  const canManageSettings = canRoleAccess(role, 'settings.manage');
  const canManageBilling = canRoleAccess(role, 'billing.manage');

  const queuedCount = activeMembership
    ? listQueuedOfflineSales(activeMembership.businessId).length
    : 0;

  const firstName = (profile?.fullName ?? 'Business Owner').trim().split(/\s+/)[0] || 'Owner';

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;
    const selectedRange = RANGE_OPTIONS.find((item) => item.key === range) ?? RANGE_OPTIONS[1];
    const fromIso = `${daysAgoIsoDate(selectedRange?.days ?? 30)}T00:00:00.000Z`;

    const summaryPromise = canViewReports
      ? fetchFinancialSummary(accessToken, activeMembership.businessId, { from: fromIso })
      : Promise.resolve(null);
    const valuationPromise = canViewReports
      ? fetchInventoryValuation(accessToken, activeMembership.businessId)
      : Promise.resolve(null);
    const seriesPromise = canViewReports
      ? fetchSalesByDay(accessToken, activeMembership.businessId, { from: fromIso })
      : Promise.resolve(null);
    const topPromise = canViewReports
      ? fetchTopProducts(accessToken, activeMembership.businessId, { from: fromIso, limit: 5 })
      : Promise.resolve(null);

    void Promise.all([
      summaryPromise,
      valuationPromise,
      seriesPromise,
      topPromise,
      fetchProducts(accessToken, activeMembership.businessId, { lowStockOnly: true, limit: 6 }),
      fetchSales(accessToken, activeMembership.businessId, { limit: 6 }),
    ]).then(([sumRes, valRes, serRes, topRes, lowRes, salesRes]) => {
      if (cancelled) {
        return;
      }

      if (salesRes && !salesRes.success) {
        setErrorMessage(getFriendlyApiError(salesRes.error, 'Unable to load workspace overview.'));
        setLoading(false);
        return;
      }

      setSummary(sumRes?.success && sumRes.data ? sumRes.data.summary : null);
      setValuation(valRes?.success && valRes.data ? valRes.data.valuation : null);
      setSalesSeries(serRes?.success && serRes.data ? (serRes.data.series ?? []) : []);
      setTopProducts(topRes?.success && topRes.data ? (topRes.data.products ?? []) : []);
      setLowStock(lowRes.success && lowRes.data ? (lowRes.data.products ?? []) : []);
      setRecentSales(salesRes.success && salesRes.data ? (salesRes.data.sales ?? []) : []);
      setErrorMessage(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, canViewReports, range, reloadTick]);

  const handleRetry = () => {
    setLoading(true);
    setErrorMessage(null);
    setReloadTick((n) => n + 1);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#151B2B]">
            Welcome back, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>
        <LoadingSkeleton rows={6} label="Loading dashboard overview..." />
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#151B2B]">
          Welcome back, {firstName}!
        </h1>
        <ErrorState message={errorMessage} onRetry={handleRetry} />
      </div>
    );
  }

  // Build Sales Overview chart points (prefer live server series, explicitly flag demo fallback when empty)
  const hasLiveChart = salesSeries.length > 0;
  const chartData = hasLiveChart
    ? salesSeries.slice(-12).map((point) => ({
        label: point.date.slice(5),
        value: Number(point.netSales) || 0,
      }))
    : DEMO_SERIES[range];

  const maxChartValue = Math.max(...chartData.map((p) => p.value), 1);
  const svgW = 540;
  const svgH = 190;
  const padX = 28;
  const padTop = 24;
  const padBottom = 28;
  const usableW = svgW - padX * 2;
  const usableH = svgH - padTop - padBottom;

  const chartCoords = chartData.map((pt, idx) => {
    const x =
      chartData.length === 1 ? padX + usableW / 2 : padX + (idx / (chartData.length - 1)) * usableW;
    const y = padTop + usableH - (pt.value / maxChartValue) * usableH;
    return { ...pt, x, y };
  });

  const linePath = chartCoords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const firstCoord = chartCoords[0];
  const lastCoord = chartCoords[chartCoords.length - 1];
  const areaPath =
    firstCoord && lastCoord
      ? `${linePath} L ${lastCoord.x.toFixed(1)} ${(svgH - padBottom).toFixed(1)} L ${firstCoord.x.toFixed(1)} ${(svgH - padBottom).toFixed(1)} Z`
      : '';

  const activePoint =
    hoveredIdx !== null
      ? (chartCoords[hoveredIdx] ?? chartCoords[chartCoords.length - 1])
      : chartCoords[chartCoords.length - 1];

  // Derived performance metrics (strictly from live summary if sales exist, otherwise clearly labelled demo)
  const netSalesNum = Number(summary?.netSales ?? 0);
  const grossProfitNum = Number(summary?.grossProfit ?? 0);
  const netProfitNum = Number(summary?.netOperatingProfit ?? 0);
  const hasLivePerformance = canViewReports && netSalesNum > 0;
  const profitMarginPct = hasLivePerformance
    ? Math.max(0, Math.min(100, Math.round((grossProfitNum / netSalesNum) * 100)))
    : 52;
  const operatingRatioPct = hasLivePerformance
    ? Math.max(0, Math.min(100, Math.round((netProfitNum / netSalesNum) * 100)))
    : 68;
  const collectionRatioPct = hasLivePerformance
    ? Math.max(
        0,
        Math.min(100, Math.round((Number(summary?.cashCollectedOnSales ?? 0) / netSalesNum) * 100)),
      )
    : 45;

  const quickActions = [
    {
      label: 'New Sale (POS)',
      to: '/app/pos',
      icon: ShoppingCart,
      tint: 'bg-[#FFF1F1] text-[#D90000]',
      visible: true,
    },
    {
      label: 'Add Product',
      to: '/app/products',
      icon: PackagePlus,
      tint: 'bg-blue-50 text-blue-600',
      visible: true,
    },
    {
      label: 'Add Customer',
      to: '/app/customers',
      icon: UserPlus,
      tint: 'bg-violet-50 text-violet-600',
      visible: true,
    },
    {
      label: 'Record Purchase',
      to: '/app/purchases',
      icon: ShoppingBag,
      tint: 'bg-emerald-50 text-emerald-600',
      visible: canManageInventory,
    },
    {
      label: 'Add Expense',
      to: '/app/expenses',
      icon: Wallet,
      tint: 'bg-amber-50 text-amber-600',
      visible: canManageExpenses,
    },
    {
      label: 'View Reports',
      to: '/app/reports',
      icon: BarChart3,
      tint: 'bg-sky-50 text-sky-600',
      visible: canViewReports,
    },
    {
      label: 'Manage Settings',
      to: '/app/settings',
      icon: Settings,
      tint: 'bg-purple-50 text-purple-600',
      visible: canManageSettings,
    },
    {
      label: 'Upgrade Plan',
      to: '/app/subscription',
      icon: Crown,
      tint: 'bg-rose-50 text-[#D90000]',
      visible: canManageBilling,
    },
  ].filter((item) => item.visible);

  return (
    <div className="space-y-6">
      {/* Welcome Row + Date & Branch Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#151B2B] sm:text-[26px]">
            Welcome back, {firstName}!
          </h1>
          <p className="mt-1 text-sm text-[#6B7280]">
            Here&apos;s what&apos;s happening with your business today.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#151B2B] shadow-2xs">
            <Calendar className="h-3.5 w-3.5 text-[#D90000]" aria-hidden="true" />
            <label htmlFor="dashboard-range" className="sr-only">
              Reporting period
            </label>
            <select
              id="dashboard-range"
              value={range}
              onChange={(e) => setRange(e.target.value as RangeKey)}
              className="bg-transparent pr-1 text-xs font-semibold text-[#151B2B] focus:outline-none"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
              <option value="12m">Last 12 Months</option>
            </select>
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold text-[#151B2B] shadow-2xs">
            <MapPin className="h-3.5 w-3.5 text-[#D90000]" aria-hidden="true" />
            <span className="max-w-[160px] truncate">
              {activeMembership?.businessName ?? 'Main Branch'}
            </span>
          </div>
        </div>
      </div>

      {/* Offline Queue Banner if pending operations exist */}
      {queuedCount > 0 && (
        <Card className="flex flex-col gap-3 border-[#F59E0B] bg-amber-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-[#151B2B]">
              {queuedCount} offline sale{queuedCount === 1 ? '' : 's'} queued on this device
            </p>
            <p className="text-xs text-[#6B7280]">
              Open Offline Sync to push queued counter receipts to the server with idempotency
              protection.
            </p>
          </div>
          <Link
            to="/app/sync"
            className="inline-flex min-h-[38px] items-center justify-center rounded-xl bg-[#D90000] px-4 py-2 text-xs font-semibold text-white hover:bg-[#B80000]"
          >
            Review Offline Sync
          </Link>
        </Card>
      )}

      {/* A. FOUR MAJOR KPI CARDS (Owner / Manager only per D-09 — zero profit/COGS leakage to Cashiers) */}
      {canViewReports && summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {/* Total Sales */}
          <div className="rounded-2xl border border-[#F5D6D6] bg-gradient-to-br from-[#FFF5F5] to-white p-5 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#D90000] text-white shadow-xs">
                <ShoppingCart className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#6B7280]">Total Sales</p>
                <p className="mt-1 font-mono-tabular text-xl font-extrabold text-[#151B2B]">
                  {formatMoney(summary.netSales)}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-[#16A34A]">
                  <span className="font-mono-tabular">{summary.salesCount}</span> completed orders
                </p>
              </div>
            </div>
            <div className="mt-3">
              <MiniSparkline color="#D90000" points={[22, 34, 29, 48, 42, 58, 66]} />
            </div>
          </div>

          {/* Total Expenses */}
          <div className="rounded-2xl border border-blue-200/80 bg-gradient-to-br from-blue-50/75 to-white p-5 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                <Wallet className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#6B7280]">Total Expenses</p>
                <p className="mt-1 font-mono-tabular text-xl font-extrabold text-[#151B2B]">
                  {formatMoney(summary.operatingExpenses)}
                </p>
                <p className="mt-0.5 text-[11px] text-[#6B7280]">
                  COGS <span className="font-mono-tabular">{formatMoney(summary.cogs)}</span>
                </p>
              </div>
            </div>
            <div className="mt-3">
              <MiniSparkline color="#2563EB" points={[30, 26, 34, 28, 40, 35, 44]} />
            </div>
          </div>

          {/* Net Profit (includes Gross Profit (30 days) for Owner/Manager visibility) */}
          <div className="rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/75 to-white p-5 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#16A34A] text-white shadow-xs">
                <TrendingUp className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#6B7280]">Net Profit</p>
                <p className="mt-1 font-mono-tabular text-xl font-extrabold text-[#151B2B]">
                  {formatMoney(summary.netOperatingProfit)}
                </p>
                <p className="mt-0.5 text-[11px] font-medium text-[#16A34A]">
                  Gross Profit (30 days):{' '}
                  <span className="font-mono-tabular">{formatMoney(summary.grossProfit)}</span>
                </p>
              </div>
            </div>
            <div className="mt-3">
              <MiniSparkline color="#16A34A" points={[18, 28, 32, 41, 49, 55, 68]} />
            </div>
          </div>

          {/* Stock Value */}
          <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/75 to-white p-5 shadow-2xs">
            <div className="flex items-start justify-between gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#F59E0B] text-white shadow-xs">
                <Boxes className="h-5 w-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-[#6B7280]">Stock Value</p>
                <p className="mt-1 font-mono-tabular text-xl font-extrabold text-[#151B2B]">
                  {valuation ? formatMoney(valuation.totalRetailValue) : formatMoney(0)}
                </p>
                <p className="mt-0.5 text-[11px] text-[#6B7280]">
                  Receivables:{' '}
                  <Link
                    to="/app/debts"
                    className="font-mono-tabular font-semibold text-[#D90000] hover:underline"
                  >
                    {formatMoney(summary.outstandingReceivables)}
                  </Link>
                </p>
              </div>
            </div>
            <div className="mt-3">
              <MiniSparkline color="#D97706" points={[45, 48, 44, 52, 56, 54, 62]} />
            </div>
          </div>
        </div>
      )}

      {/* B + C + D: SALES OVERVIEW CHART | TOP-SELLING PRODUCTS | RECENT TRANSACTIONS */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* B. Sales Overview */}
        {canViewReports && (
          <Card className="p-5 xl:col-span-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-[#D90000]" aria-hidden="true" />
                  <h2 className="text-base font-bold text-[#151B2B]">Sales Overview</h2>
                </div>
                {!hasLiveChart && (
                  <p className="mt-0.5 text-[11px] font-medium text-amber-700">
                    Demo chart preview — record sales to replace with verified live figures
                  </p>
                )}
              </div>

              <div
                className="inline-flex rounded-xl border border-[#E5E7EB] bg-[#F8F8FA] p-0.5"
                role="group"
                aria-label="Sales overview chart period"
              >
                {RANGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setRange(opt.key);
                      setHoveredIdx(null);
                    }}
                    aria-pressed={range === opt.key}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${
                      range === opt.key
                        ? 'bg-[#D90000] text-white shadow-2xs'
                        : 'text-[#6B7280] hover:text-[#151B2B]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Active Point Pill */}
            {activePoint && (
              <div className="mt-3 flex items-center justify-between rounded-xl bg-[#F8F8FA] px-3.5 py-2 text-xs">
                <span className="font-medium text-[#6B7280]">
                  Selected period: <strong className="text-[#151B2B]">{activePoint.label}</strong>
                </span>
                <span className="font-mono-tabular font-bold text-[#D90000]">
                  {formatMoney(activePoint.value)}
                </span>
              </div>
            )}

            <div className="mt-3">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="h-52 w-full"
                role="img"
                aria-label="Sales overview performance chart"
              >
                <defs>
                  <linearGradient id="dashSalesArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#D90000" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#D90000" stopOpacity="0.01" />
                  </linearGradient>
                </defs>
                {[38, 78, 118, 162].map((y) => (
                  <line
                    key={y}
                    x1={padX}
                    y1={y}
                    x2={svgW - padX}
                    y2={y}
                    stroke="#E5E7EB"
                    strokeDasharray="4 4"
                    strokeWidth="1"
                  />
                ))}
                {areaPath && <path d={areaPath} fill="url(#dashSalesArea)" />}
                <path
                  d={linePath}
                  fill="none"
                  stroke="#D90000"
                  strokeWidth="2.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {chartCoords.map((pt, idx) => (
                  <g
                    key={`${pt.label}-${idx}`}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    className="cursor-pointer"
                  >
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={hoveredIdx === idx ? '6' : '4'}
                      fill="#FFFFFF"
                      stroke="#D90000"
                      strokeWidth="2.5"
                    />
                    <text x={pt.x} y={svgH - 6} textAnchor="middle" fontSize="10.5" fill="#6B7280">
                      {pt.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
          </Card>
        )}

        {/* C. Top-Selling Products */}
        {canViewReports && (
          <Card className="p-5 xl:col-span-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#D90000]" aria-hidden="true" />
                <h2 className="text-base font-bold text-[#151B2B]">Top-Selling</h2>
              </div>
              <Link
                to="/app/reports"
                className="text-xs font-semibold text-[#D90000] hover:underline"
              >
                View All →
              </Link>
            </div>

            {topProducts.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-[#E5E7EB] bg-[#F8F8FA] p-4 text-center">
                <p className="text-xs font-semibold text-[#151B2B]">No ranked sales yet</p>
                <p className="mt-1 text-[11px] text-[#6B7280]">
                  Complete sales in POS to rank your top-selling items automatically.
                </p>
              </div>
            ) : (
              <ul className="mt-4 space-y-3">
                {topProducts.slice(0, 4).map((product, index) => (
                  <li
                    key={product.productId}
                    className="flex items-center gap-3 rounded-xl border border-[#F1F5F9] bg-[#F8F8FA]/70 p-2.5"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFF1F1] font-mono-tabular text-xs font-bold text-[#D90000]">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-[#151B2B]">
                        {product.productName}
                      </p>
                      <p className="mt-0.5 font-mono-tabular text-[11px] text-[#6B7280]">
                        {formatMoney(product.revenue)} · {formatQty(product.unitsSold)} sold
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {/* D. Recent Transactions */}
        <Card className={`p-5 ${canViewReports ? 'xl:col-span-3' : 'xl:col-span-12'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-[#D90000]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#151B2B]">Recent Transactions</h2>
            </div>
            <Link to="/app/sales" className="text-xs font-semibold text-[#D90000] hover:underline">
              View All →
            </Link>
          </div>

          {recentSales.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                title="No sales recorded yet"
                description="Ring up your first counter sale in POS to view transactions here."
                action={
                  <Link
                    to="/app/pos"
                    className="inline-flex h-9 items-center rounded-xl bg-[#D90000] px-4 text-xs font-semibold text-white hover:bg-[#B80000]"
                  >
                    Start a Sale
                  </Link>
                }
              />
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {recentSales.slice(0, 5).map((sale) => (
                <li
                  key={sale.id}
                  className="flex items-center justify-between gap-2.5 rounded-xl border border-[#F1F5F9] bg-[#F8F8FA]/70 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate font-mono-tabular text-xs font-bold text-[#151B2B]">
                      {sale.receipt?.receiptNumber ?? sale.saleNumber}
                    </p>
                    <p className="truncate font-mono-tabular text-[11px] text-[#6B7280]">
                      {formatDateTime(sale.soldAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono-tabular text-xs font-bold text-[#151B2B]">
                      {formatMoney(sale.totalAmount)}
                    </p>
                    <span
                      className={`mt-0.5 inline-block rounded-md px-1.5 py-0.5 text-[10px] font-semibold capitalize ${
                        sale.paymentStatus === 'paid'
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {sale.paymentStatus}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* E + PROMO BANNER + F: LOW STOCK ALERTS | FESTOLA GROWTH CARD | BUSINESS PERFORMANCE */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* E. Low Stock Alerts */}
        <Card className="p-5 lg:col-span-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#DC2626]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#151B2B]">Low Stock Alerts</h2>
            </div>
            <Link
              to="/app/inventory"
              className="text-xs font-semibold text-[#D90000] hover:underline"
            >
              View All →
            </Link>
          </div>

          {lowStock.length === 0 ? (
            <p className="mt-4 rounded-xl bg-emerald-50/70 p-4 text-xs font-medium text-emerald-800">
              All active products are currently above their minimum reorder level.
            </p>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {lowStock.slice(0, 4).map((product) => (
                <li
                  key={product.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-[#F1F5F9] bg-[#F8F8FA]/70 px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-[#151B2B]">{product.name}</p>
                    <p className="font-mono-tabular text-[11px] text-[#6B7280]">
                      {formatQty(product.onHand)} {product.unit} left · Min{' '}
                      {formatQty(product.reorderLevel)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#FFF1F1] px-2.5 py-1 text-[10px] font-bold text-[#DC2626]">
                    Low Stock
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Center Brand Growth Card (matching visual reference) */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#B80000] via-[#D90000] to-[#990000] p-6 text-white shadow-md lg:col-span-4">
          <img
            src={heroShopOwnerImg}
            alt=""
            aria-hidden="true"
            referrerPolicy="no-referrer"
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[85%_18%] opacity-35 mix-blend-luminosity"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#B80000]/95 via-[#D90000]/80 to-transparent" />
          <div className="relative z-10 flex h-full flex-col justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-100">
                Manage. Grow. Succeed.
              </p>
              <h2 className="mt-1.5 text-xl font-extrabold leading-snug text-white">
                Grow Your Business with Festola Business Hub
              </h2>
              <p className="mt-2 max-w-[240px] text-xs leading-relaxed text-red-50">
                Manage sales, track inventory, control debts, and unlock multi-branch insights.
              </p>
            </div>
            <div className="mt-5">
              <Link
                to={canManageBilling ? '/app/subscription' : '/app/pos'}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-white px-4 text-xs font-bold text-[#D90000] shadow-sm transition-colors hover:bg-[#FFF1F1]"
              >
                <span>{canManageBilling ? 'Upgrade Now' : 'Open POS'}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>

        {/* F. Business Performance Visual Indicators */}
        <Card className="p-5 lg:col-span-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#D90000]" aria-hidden="true" />
              <h2 className="text-base font-bold text-[#151B2B]">Business Performance</h2>
            </div>
            {!hasLivePerformance && (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                Demo data
              </span>
            )}
          </div>

          <div className="mt-4 flex items-center gap-5">
            {/* Clean Multi-Segment SVG Donut */}
            <div className="relative flex h-28 w-28 shrink-0 items-center justify-center">
              <svg viewBox="0 0 100 100" className="h-28 w-28 -rotate-90" aria-hidden="true">
                <circle cx="50" cy="50" r="38" fill="none" stroke="#F1F5F9" strokeWidth="12" />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="#16A34A"
                  strokeWidth="12"
                  strokeDasharray={`${(operatingRatioPct / 100) * 238} 238`}
                  strokeLinecap="round"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="38"
                  fill="none"
                  stroke="#D90000"
                  strokeWidth="12"
                  strokeDasharray={`${(profitMarginPct / 100) * 110} 238`}
                  strokeDashoffset={`-${(operatingRatioPct / 100) * 120}`}
                />
              </svg>
              <div className="absolute text-center">
                <span className="block font-mono-tabular text-lg font-extrabold text-[#151B2B]">
                  {operatingRatioPct}%
                </span>
                <span className="block text-[9px] font-semibold uppercase text-[#6B7280]">
                  Health
                </span>
              </div>
            </div>

            <div className="flex-1 space-y-2.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#4B5565]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#16A34A]" />
                  Sales Growth
                </span>
                <span className="font-mono-tabular font-bold text-[#16A34A]">
                  {operatingRatioPct}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#4B5565]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#D90000]" />
                  Profit Margin
                </span>
                <span className="font-mono-tabular font-bold text-[#151B2B]">
                  {profitMarginPct}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[#4B5565]">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#F59E0B]" />
                  Cash Collection
                </span>
                <span className="font-mono-tabular font-bold text-[#151B2B]">
                  {collectionRatioPct}%
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* G. QUICK ACTIONS SHORTCUT STRIP */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-[#6B7280]">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                to={action.to}
                className="group flex flex-col items-center justify-center rounded-2xl border border-[#E5E7EB] bg-white p-4 text-center shadow-2xs transition-all hover:-translate-y-0.5 hover:border-[#D90000]/35 hover:shadow-md"
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-xl transition-transform group-hover:scale-105 ${action.tint}`}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="mt-2.5 text-xs font-semibold text-[#151B2B]">{action.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
