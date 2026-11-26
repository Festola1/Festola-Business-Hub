import {
  AlertTriangle,
  BarChart3,
  Boxes,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Crown,
  LogIn,
  PackagePlus,
  Plus,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  WifiOff,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button } from '../../components/ui/Button';
import { DataTable, type DataTableColumn } from '../../components/ui/DataTable';
import {
  AlertBanner,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PermissionDeniedState,
  StatCard,
} from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import type { ApiResponse } from '../../lib/api-client';
import {
  createStockAdjustment,
  fetchBusinessDebtPayments,
  fetchCurrentSubscription,
  fetchCustomers,
  fetchFinancialSummary,
  fetchInventoryValuation,
  fetchProductCategories,
  fetchProducts,
  fetchSales,
  fetchSalesByCategory,
  fetchSalesByDay,
  type BusinessDebtPaymentItem,
  type CurrentSubscriptionSummary,
  type CustomerItem,
  type FinancialSummaryReport,
  type InventoryValuationReport,
  type ProductCategory,
  type ProductItem,
  type SaleRecord,
  type SalesByCategoryRow,
  type SalesByDayPoint,
} from '../../lib/commerce-api';
import { getFriendlyApiError } from '../../lib/error-messages';
import {
  daysAgoIsoDate,
  formatDateOnly,
  formatDateTime,
  formatMoney,
  formatQty,
} from '../../lib/format';
import {
  listQueuedOfflineCreditPayments,
  listQueuedOfflineExpenses,
  listQueuedOfflineSales,
  loadDashboardSnapshot,
  saveDashboardSnapshot,
  type DashboardCachedSnapshot,
} from '../../lib/offline-store';
import { canRoleAccess } from '../../lib/permissions';
import { MODULE_INTEGRATION_REGISTRY, useWorkspaceEventTick } from '../../lib/workspace-events';

type RangeKey = '7d' | '30d' | '90d' | '12m';
type ChartMetric = 'revenue' | 'orders';
type PaymentFilter = 'all' | 'paid' | 'partial' | 'unpaid';
type DashboardViewState =
  | 'loading'
  | 'ready'
  | 'offline_cached'
  | 'offline_no_cache'
  | 'error'
  | 'forbidden'
  | 'session_expired';

const RANGE_OPTIONS: Array<{ key: RangeKey; label: string; days: number }> = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: '12m', label: '12M', days: 365 },
];

const PAYMENT_FILTER_OPTIONS: Array<{ key: PaymentFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'paid', label: 'Paid' },
  { key: 'partial', label: 'Partial' },
  { key: 'unpaid', label: 'Unpaid' },
];

const CATEGORY_PALETTE = [
  '#2563EB',
  '#E11D48',
  '#F59E0B',
  '#10B981',
  '#8B5CF6',
  '#06B6D4',
  '#64748B',
] as const;

interface CategorySlice {
  name: string;
  value: number;
  color: string;
  sharePct: number;
}

interface LowStockEntry {
  id: string;
  name: string;
  category: string;
  onHand: string;
  reorderLevel: string;
  unit: string;
}

interface RecentSaleRow {
  id: string;
  label: string;
  customerName: string;
  receiptNumber: string;
  soldAt: string;
  paymentStatus: string;
  totalAmount: string;
  amountPaid: string;
  creditRemaining: string;
  categories: string[];
  rawSale: SaleRecord | null;
}

/**
 * Generates a smooth Catmull-Rom cubic Bezier SVG path through chart points,
 * matching the soft spline area curve in the approved dashboard reference.
 */
function buildSmoothLinePath(points: Array<{ x: number; y: number }>): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return p ? `M ${p.x.toFixed(1)} ${p.y.toFixed(1)}` : '';
  }

  let d = `M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(points.length - 1, i + 2)]!;

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function formatClockTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatSubscriptionStatusLabel(status: string): string {
  switch (status) {
    case 'trialing':
      return 'Free Trial';
    case 'active':
      return 'Active';
    case 'grace_period':
      return 'Grace Period';
    case 'read_only':
      return 'Read-Only';
    case 'suspended':
      return 'Suspended';
    default:
      return status;
  }
}

function formatPaymentMethodLabel(method: string): string {
  switch (method) {
    case 'pos_card':
      return 'POS Card';
    case 'transfer':
      return 'Bank Transfer';
    case 'cash':
      return 'Cash';
    default:
      return method;
  }
}

function findFirstFailure(responses: Array<ApiResponse<unknown> | null>) {
  return responses.find((res) => res !== null && !res.success) ?? null;
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { accessToken, activeMembership, profile, refreshAccessToken, signOut } = useAuth();
  const isOnline = useOnlineStatus();
  const { pushToast } = useToast();

  const [range, setRange] = useState<RangeKey>('30d');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('revenue');
  const [reloadTick, setReloadTick] = useState(0);
  const [autoSync, setAutoSync] = useState(false);
  const [viewState, setViewState] = useState<DashboardViewState>('loading');
  const [loadedBusinessId, setLoadedBusinessId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [cachedSyncedAt, setCachedSyncedAt] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showIntegrations, setShowIntegrations] = useState(false);

  // Interactive cross-filters & table controls
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>('all');
  const [salesSearch, setSalesSearch] = useState('');
  const [pinnedPointIdx, setPinnedPointIdx] = useState<number | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [hoveredCategoryIdx, setHoveredCategoryIdx] = useState<number | null>(null);

  // In-context operational modals (Quick Restock + Sale Detail)
  const [restockTarget, setRestockTarget] = useState<LowStockEntry | null>(null);
  const [restockQty, setRestockQty] = useState('');
  const [restockReason, setRestockReason] = useState('Dashboard quick restock');
  const [restockSubmitting, setRestockSubmitting] = useState(false);
  const [restockError, setRestockError] = useState<string | null>(null);
  const [selectedSaleRow, setSelectedSaleRow] = useState<RecentSaleRow | null>(null);

  // Verified backend API datasets (zero hardcoded fixtures)
  const [summary, setSummary] = useState<FinancialSummaryReport | null>(null);
  const [valuation, setValuation] = useState<InventoryValuationReport | null>(null);
  const [salesSeries, setSalesSeries] = useState<SalesByDayPoint[]>([]);
  const [salesByCategory, setSalesByCategory] = useState<SalesByCategoryRow[]>([]);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [allProducts, setAllProducts] = useState<ProductItem[]>([]);
  const [lowStock, setLowStock] = useState<ProductItem[]>([]);
  const [recentSales, setRecentSales] = useState<SaleRecord[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [debtPayments, setDebtPayments] = useState<BusinessDebtPaymentItem[]>([]);
  const [subscription, setSubscription] = useState<CurrentSubscriptionSummary | null>(null);

  const lowStockSectionRef = useRef<HTMLDivElement | null>(null);
  const prevOnlineRef = useRef<boolean>(isOnline);

  const activeBusinessId = activeMembership?.businessId ?? null;
  const activeUserId = profile?.id ?? activeMembership?.userId ?? null;
  const role = activeMembership?.role ?? 'cashier';
  const canViewReports = canRoleAccess(role, 'reports.view_basic');
  const canManageInventory = canRoleAccess(role, 'inventory.receive_and_adjust');
  const canManageExpenses = canRoleAccess(role, 'expenses.manage');
  const canCollectDebt = canRoleAccess(role, 'debts.collect');
  const canManageSettings = canRoleAccess(role, 'settings.manage');
  const canManageBilling = canRoleAccess(role, 'billing.manage');

  // Subscribe reactively to all domain mutations in the active workspace
  const reactiveTick = useWorkspaceEventTick(activeBusinessId, [
    'sales',
    'inventory',
    'products',
    'customers',
    'debts',
    'expenses',
    'sync',
    'billing',
  ]);

  // Reactive offline queue totals (updates immediately when offline entries are queued)
  const offlineQueueSummary = useMemo(() => {
    if (!activeBusinessId || reactiveTick < 0) {
      return { totalCount: 0, salesCount: 0, salesAmount: 0, expensesCount: 0, creditsCount: 0 };
    }
    const qSales = listQueuedOfflineSales(activeBusinessId);
    const qExpenses = listQueuedOfflineExpenses(activeBusinessId);
    const qCredits = listQueuedOfflineCreditPayments(activeBusinessId);
    const salesAmount = qSales.reduce((acc, s) => acc + (Number(s.estimatedTotal) || 0), 0);
    return {
      totalCount: qSales.length + qExpenses.length + qCredits.length,
      salesCount: qSales.length,
      salesAmount,
      expensesCount: qExpenses.length,
      creditsCount: qCredits.length,
    };
  }, [activeBusinessId, reactiveTick]);

  // SWR-style revalidation on tab focus / visibility return
  useEffect(() => {
    if (!accessToken || !activeBusinessId) {
      return;
    }

    const triggerRevalidate = () => {
      if (document.visibilityState === 'visible' && navigator.onLine !== false) {
        setReloadTick((n) => n + 1);
      }
    };

    const handleFocus = () => {
      if (navigator.onLine !== false) {
        setReloadTick((n) => n + 1);
      }
    };

    document.addEventListener('visibilitychange', triggerRevalidate);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', triggerRevalidate);
      window.removeEventListener('focus', handleFocus);
    };
  }, [accessToken, activeBusinessId]);

  // Automatic silent refresh when returning online after an offline period
  useEffect(() => {
    const wasOffline = !prevOnlineRef.current;
    prevOnlineRef.current = isOnline;
    if (wasOffline && isOnline && accessToken && activeBusinessId) {
      const timer = window.setTimeout(() => {
        setReloadTick((n) => n + 1);
      }, 0);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [isOnline, accessToken, activeBusinessId]);

  // Optional 30s live auto-sync polling (pauses automatically when offline or hidden)
  useEffect(() => {
    if (!autoSync || !accessToken || !activeBusinessId || !isOnline) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        setReloadTick((n) => n + 1);
      }
    }, 30_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [autoSync, accessToken, activeBusinessId, isOnline]);

  // Apply an authorized cached snapshot (strictly tenant- and user-scoped)
  const applySnapshot = (snapshot: DashboardCachedSnapshot) => {
    setSummary(snapshot.summary);
    setValuation(snapshot.valuation);
    setSalesSeries(snapshot.salesSeries);
    setSalesByCategory(snapshot.salesByCategory);
    setCategories(snapshot.categories);
    setAllProducts(snapshot.allProducts);
    setLowStock(snapshot.lowStock);
    setRecentSales(snapshot.recentSales);
    setCustomers(snapshot.customers);
    setDebtPayments(snapshot.debtPayments);
    setSubscription(snapshot.subscription);
    setCachedSyncedAt(snapshot.syncedAt);
    setLastUpdatedAt(new Date(snapshot.syncedAt));
  };

  // Main live data loader handling all 8 states honestly (zero fake fallbacks)
  useEffect(() => {
    if (!activeMembership || !accessToken) {
      return;
    }

    const businessId = activeMembership.businessId;
    const userId = activeUserId ?? activeMembership.userId;

    let cancelled = false;
    const selectedRange = RANGE_OPTIONS.find((item) => item.key === range) ?? RANGE_OPTIONS[1];
    const fromIso = `${daysAgoIsoDate(selectedRange?.days ?? 30)}T00:00:00.000Z`;

    const fetchAll = async (token: string) => {
      const summaryPromise = canViewReports
        ? fetchFinancialSummary(token, businessId, { from: fromIso })
        : Promise.resolve(null);
      const valuationPromise = canViewReports
        ? fetchInventoryValuation(token, businessId)
        : Promise.resolve(null);
      const seriesPromise = canViewReports
        ? fetchSalesByDay(token, businessId, { from: fromIso })
        : Promise.resolve(null);
      const catSalesPromise = canViewReports
        ? fetchSalesByCategory(token, businessId, { from: fromIso, limit: 12 })
        : Promise.resolve(null);
      const debtPaymentsPromise = canCollectDebt
        ? fetchBusinessDebtPayments(token, businessId, { status: 'posted', limit: 6 })
        : Promise.resolve(null);

      return Promise.all([
        summaryPromise,
        valuationPromise,
        seriesPromise,
        catSalesPromise,
        fetchProductCategories(token, businessId),
        fetchProducts(token, businessId, { lowStockOnly: true, limit: 12 }),
        fetchProducts(token, businessId, { isActive: true, limit: 100 }),
        fetchSales(token, businessId, { limit: 25 }),
        fetchCustomers(token, businessId, { limit: 100 }),
        debtPaymentsPromise,
        fetchCurrentSubscription(token, businessId),
      ]);
    };

    const runLoad = async () => {
      if (!isOnline) {
        await Promise.resolve();
        if (cancelled) return;
        const cached = loadDashboardSnapshot(userId, businessId, range);
        if (cached) {
          applySnapshot(cached);
          setErrorMessage(null);
          setViewState('offline_cached');
        } else {
          setViewState('offline_no_cache');
          setErrorMessage(null);
        }
        setLoadedBusinessId(businessId);
        setIsRefreshing(false);
        return;
      }

      let results = await fetchAll(accessToken);
      if (cancelled) return;

      const coreResponses: Array<ApiResponse<unknown> | null> = canViewReports
        ? [results[0], results[2], results[6], results[7]]
        : [results[6], results[7]];

      let failure = findFirstFailure(coreResponses);

      // On 401 UNAUTHENTICATED, attempt one silent token refresh before entering session_expired state
      if (failure?.error?.code === 'UNAUTHENTICATED' && refreshAccessToken) {
        const refreshedToken = await refreshAccessToken();
        if (cancelled) return;
        if (refreshedToken) {
          results = await fetchAll(refreshedToken);
          if (cancelled) return;
          const retriedCore: Array<ApiResponse<unknown> | null> = canViewReports
            ? [results[0], results[2], results[6], results[7]]
            : [results[6], results[7]];
          failure = findFirstFailure(retriedCore);
        }
      }

      if (failure) {
        const code = failure.error?.code;
        if (code === 'UNAUTHENTICATED') {
          setViewState('session_expired');
          setErrorMessage(
            getFriendlyApiError(
              failure.error,
              'Your session has expired. Please sign in again to access your business records.',
            ),
          );
        } else if (code === 'PERMISSION_DENIED') {
          setViewState('forbidden');
          setErrorMessage(
            getFriendlyApiError(
              failure.error,
              'You do not have active permission to view dashboard data for this business.',
            ),
          );
        } else if (code === 'NETWORK_ERROR' && navigator.onLine === false) {
          const cached = loadDashboardSnapshot(userId, businessId, range);
          if (cached) {
            applySnapshot(cached);
            setViewState('offline_cached');
            setErrorMessage(null);
          } else {
            setViewState('offline_no_cache');
            setErrorMessage(null);
          }
        } else {
          // Never disguise a failed backend request with ₦0.00 figures
          setViewState('error');
          setErrorMessage(
            getFriendlyApiError(
              failure.error,
              'Unable to load live business data from the server. Please try again.',
            ),
          );
        }
        setLoadedBusinessId(businessId);
        setIsRefreshing(false);
        return;
      }

      const [
        sumRes,
        valRes,
        serRes,
        catSalesRes,
        catRes,
        lowRes,
        prodRes,
        salesRes,
        custRes,
        debtPayRes,
        subRes,
      ] = results;

      const nextSummary = sumRes?.success && sumRes.data?.summary ? sumRes.data.summary : null;
      const nextValuation =
        valRes?.success && valRes.data?.valuation ? valRes.data.valuation : null;
      const nextSeries = serRes?.success && serRes.data?.series ? serRes.data.series : [];
      const nextSalesByCategory =
        catSalesRes?.success && catSalesRes.data?.categories ? catSalesRes.data.categories : [];
      const nextCategories =
        catRes.success && catRes.data?.categories ? catRes.data.categories : [];
      const nextLowStock = lowRes.success && lowRes.data?.products ? lowRes.data.products : [];
      const nextAllProducts =
        prodRes.success && prodRes.data?.products ? prodRes.data.products : [];
      const nextRecentSales = salesRes.success && salesRes.data?.sales ? salesRes.data.sales : [];
      const nextCustomers =
        custRes.success && custRes.data?.customers ? custRes.data.customers : [];
      const nextDebtPayments =
        debtPayRes?.success && debtPayRes.data?.debtPayments ? debtPayRes.data.debtPayments : [];
      const nextSubscription =
        subRes?.success && subRes.data && 'status' in subRes.data ? subRes.data : null;

      const syncedAtIso = new Date().toISOString();

      setSummary(nextSummary);
      setValuation(nextValuation);
      setSalesSeries(nextSeries);
      setSalesByCategory(nextSalesByCategory);
      setCategories(nextCategories);
      setLowStock(nextLowStock);
      setAllProducts(nextAllProducts);
      setRecentSales(nextRecentSales);
      setCustomers(nextCustomers);
      setDebtPayments(nextDebtPayments);
      setSubscription(nextSubscription);
      setErrorMessage(null);
      setCachedSyncedAt(null);
      setViewState('ready');
      setLoadedBusinessId(businessId);
      setIsRefreshing(false);
      setLastUpdatedAt(new Date(syncedAtIso));

      saveDashboardSnapshot(userId, businessId, range, {
        syncedAt: syncedAtIso,
        range,
        summary: nextSummary,
        valuation: nextValuation,
        salesSeries: nextSeries,
        salesByCategory: nextSalesByCategory,
        categories: nextCategories,
        allProducts: nextAllProducts,
        lowStock: nextLowStock,
        recentSales: nextRecentSales,
        customers: nextCustomers,
        debtPayments: nextDebtPayments,
        subscription: nextSubscription,
      });
    };

    void runLoad();

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    activeMembership,
    activeUserId,
    canViewReports,
    canCollectDebt,
    isOnline,
    range,
    reloadTick,
    reactiveTick,
    refreshAccessToken,
  ]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    setReloadTick((n) => n + 1);
  };

  const handleSignInAgain = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // Lookup maps for category & customer attribution
  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const cat of categories) {
      map.set(cat.id, cat.name);
    }
    return map;
  }, [categories]);

  const productCategoryById = useMemo(() => {
    const map = new Map<string, string>();
    for (const prod of allProducts) {
      const name = prod.categoryId
        ? (categoryNameById.get(prod.categoryId) ?? 'Uncategorized')
        : 'Uncategorized';
      map.set(prod.id, name);
    }
    return map;
  }, [allProducts, categoryNameById]);

  const customerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of customers) {
      map.set(c.id, c.fullName);
    }
    return map;
  }, [customers]);

  // Live Sales by Category (from GET /api/v1/reports/sales-by-category; derives from live recentSales only if endpoint unavailable)
  const categorySlices: CategorySlice[] = useMemo(() => {
    if (salesByCategory.length > 0) {
      const top = salesByCategory.slice(0, CATEGORY_PALETTE.length);
      return top.map((row, idx) => ({
        name: row.categoryName,
        value: Number(row.revenue) || 0,
        color: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]!,
        sharePct: Math.max(1, row.sharePercent),
      }));
    }

    const totals = new Map<string, number>();
    for (const sale of recentSales) {
      if (sale.status === 'voided') continue;
      for (const item of sale.items ?? []) {
        const catName = productCategoryById.get(item.productId) ?? 'Uncategorized';
        totals.set(catName, (totals.get(catName) ?? 0) + (Number(item.lineTotal) || 0));
      }
    }

    const entries = [...totals.entries()]
      .filter(([, val]) => val > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, CATEGORY_PALETTE.length);

    const grandTotal = entries.reduce((sum, [, val]) => sum + val, 0);
    if (grandTotal <= 0) {
      return [];
    }

    return entries.map(([name, value], idx) => ({
      name,
      value,
      color: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length]!,
      sharePct: Math.max(1, Math.round((value / grandTotal) * 100)),
    }));
  }, [salesByCategory, productCategoryById, recentSales]);

  const activeProductsCount = valuation?.activeProductCount ?? allProducts.length;
  const activeCustomersCount = customers.length;
  const avgTicket =
    summary && summary.salesCount > 0 ? Number(summary.netSales) / summary.salesCount : 0;

  const netSalesNum = summary ? Number(summary.netSales) || 0 : 0;
  const grossSalesNum = summary ? Number(summary.grossSales) || 0 : 0;
  const netProfitNum = summary ? Number(summary.netOperatingProfit) || 0 : 0;
  const cashCollectedNum = summary ? Number(summary.cashCollectedOnSales) || 0 : 0;
  const creditExtendedNum = summary ? Number(summary.creditExtended) || 0 : 0;

  const netMarginPct = netSalesNum > 0 ? Math.round((netProfitNum / netSalesNum) * 100) : null;
  const cashCollectionPct =
    grossSalesNum > 0
      ? Math.min(100, Math.max(0, Math.round((cashCollectedNum / grossSalesNum) * 100)))
      : null;

  // Low stock list (cross-filtered when a category slice is locked)
  const allLowStockEntries: LowStockEntry[] = useMemo(
    () =>
      lowStock.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.categoryId
          ? (categoryNameById.get(p.categoryId) ?? 'Uncategorized')
          : 'Uncategorized',
        onHand: p.onHand,
        reorderLevel: p.reorderLevel,
        unit: p.unit,
      })),
    [lowStock, categoryNameById],
  );

  const filteredLowStock = useMemo(() => {
    if (!selectedCategory) {
      return allLowStockEntries;
    }
    return allLowStockEntries.filter((item) => item.category === selectedCategory);
  }, [allLowStockEntries, selectedCategory]);

  // Recent sales list (cross-filtered by selectedCategory + paymentFilter + search query)
  const allRecentSaleRows: RecentSaleRow[] = useMemo(
    () =>
      recentSales.map((sale) => {
        const customerName = sale.customerId
          ? (customerNameById.get(sale.customerId) ?? 'Customer')
          : 'Walk-in Customer';
        const refNo = sale.receipt?.receiptNumber ?? sale.saleNumber;
        const saleCategories = Array.from(
          new Set(
            (sale.items ?? []).map(
              (item) => productCategoryById.get(item.productId) ?? 'Uncategorized',
            ),
          ),
        );
        return {
          id: sale.id,
          label: sale.customerId ? `${customerName} · ${refNo}` : refNo,
          customerName,
          receiptNumber: refNo,
          soldAt: sale.soldAt,
          paymentStatus: sale.paymentStatus,
          totalAmount: sale.totalAmount,
          amountPaid: sale.amountPaid,
          creditRemaining: sale.creditRemaining,
          categories: saleCategories,
          rawSale: sale,
        };
      }),
    [recentSales, customerNameById, productCategoryById],
  );

  const filteredRecentSaleRows = useMemo(() => {
    const query = salesSearch.trim().toLowerCase();
    return allRecentSaleRows
      .filter((row) => {
        if (
          selectedCategory &&
          row.categories.length > 0 &&
          !row.categories.includes(selectedCategory)
        ) {
          return false;
        }
        if (paymentFilter !== 'all' && row.paymentStatus !== paymentFilter) {
          return false;
        }
        if (query && !row.label.toLowerCase().includes(query)) {
          return false;
        }
        return true;
      })
      .slice(0, 8);
  }, [allRecentSaleRows, selectedCategory, paymentFilter, salesSearch]);

  const recentSaleColumns: DataTableColumn<RecentSaleRow>[] = useMemo(
    () => [
      {
        key: 'label',
        header: 'Customer / Receipt',
        sortValue: (row) => row.label,
        render: (row) => <span className="font-medium text-[#18181B]">{row.label}</span>,
      },
      {
        key: 'soldAt',
        header: 'Date',
        sortValue: (row) => row.soldAt,
        render: (row) => (
          <span className="font-mono-tabular text-xs text-[#52525B]">
            {formatDateTime(row.soldAt)}
          </span>
        ),
      },
      {
        key: 'paymentStatus',
        header: 'Status',
        sortValue: (row) => row.paymentStatus,
        render: (row) => (
          <span
            className={`text-xs font-semibold capitalize ${
              row.paymentStatus === 'paid'
                ? 'text-[#16A34A]'
                : row.paymentStatus === 'partial'
                  ? 'text-[#D97706]'
                  : 'text-[#DC2626]'
            }`}
          >
            {row.paymentStatus}
          </span>
        ),
      },
      {
        key: 'totalAmount',
        header: 'Total',
        align: 'right',
        sortValue: (row) => Number(row.totalAmount) || 0,
        render: (row) => (
          <span className="font-mono-tabular font-semibold text-[#18181B]">
            {formatMoney(row.totalAmount)}
          </span>
        ),
      },
    ],
    [],
  );

  // Build smooth spline area chart coordinates from verified live salesSeries
  const chartData = useMemo(
    () =>
      salesSeries.slice(-14).map((point) => {
        const revenue = Number(point.netSales) || 0;
        const orders = Number(point.salesCount) || 0;
        return {
          label: point.date.slice(5),
          revenue,
          orders,
          value: chartMetric === 'revenue' ? revenue : orders,
        };
      }),
    [salesSeries, chartMetric],
  );

  const svgW = 640;
  const svgH = 230;
  const padLeft = 56;
  const padRight = 22;
  const padTop = 22;
  const padBottom = 32;
  const usableW = svgW - padLeft - padRight;
  const usableH = svgH - padTop - padBottom;
  const maxChartValue = Math.max(...chartData.map((p) => p.value), 1);

  const chartCoords = chartData.map((pt, idx) => {
    const x =
      chartData.length === 1
        ? padLeft + usableW / 2
        : padLeft + (idx / (chartData.length - 1)) * usableW;
    const y = padTop + usableH - (pt.value / maxChartValue) * usableH;
    return { ...pt, x, y };
  });

  const smoothLine = buildSmoothLinePath(chartCoords);
  const firstCoord = chartCoords[0];
  const lastCoord = chartCoords[chartCoords.length - 1];
  const smoothArea =
    firstCoord && lastCoord
      ? `${smoothLine} L ${lastCoord.x.toFixed(1)} ${(svgH - padBottom).toFixed(1)} L ${firstCoord.x.toFixed(1)} ${(svgH - padBottom).toFixed(1)} Z`
      : '';

  const effectivePointIdx =
    hoveredIdx !== null
      ? hoveredIdx
      : pinnedPointIdx !== null
        ? pinnedPointIdx
        : chartCoords.length - 1;
  const activePoint = chartCoords[effectivePointIdx] ?? chartCoords[chartCoords.length - 1];

  const yAxisTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
    y: padTop + usableH - ratio * usableH,
    value: Math.round(maxChartValue * ratio),
  }));

  // Donut geometry (r=42, circumference = 2 * pi * 42 ~= 263.89)
  const donutRadius = 42;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const donutSegments = useMemo(() => {
    const total = categorySlices.reduce((sum, s) => sum + s.value, 0);
    if (total <= 0) return [];
    let offset = 0;
    return categorySlices.map((slice) => {
      const length = (slice.value / total) * donutCircumference;
      const seg = {
        ...slice,
        dashArray: `${Math.max(0, length - 2).toFixed(2)} ${donutCircumference.toFixed(2)}`,
        dashOffset: (-offset).toFixed(2),
      };
      offset += length;
      return seg;
    });
  }, [categorySlices, donutCircumference]);

  const highlightedCategoryIdx = useMemo(() => {
    if (hoveredCategoryIdx !== null) {
      return hoveredCategoryIdx;
    }
    if (selectedCategory) {
      const idx = categorySlices.findIndex((slice) => slice.name === selectedCategory);
      return idx >= 0 ? idx : null;
    }
    return null;
  }, [hoveredCategoryIdx, selectedCategory, categorySlices]);

  const toggleCategoryFilter = (categoryName: string) => {
    setSelectedCategory((prev) => (prev === categoryName ? null : categoryName));
  };

  const openQuickRestock = (item: LowStockEntry) => {
    const deficit = Math.max(Math.ceil(Number(item.reorderLevel) - Number(item.onHand)), 1);
    setRestockTarget(item);
    setRestockQty(String(deficit));
    setRestockReason('Dashboard quick restock');
    setRestockError(null);
  };

  const handleQuickRestockSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!restockTarget) {
      return;
    }
    const qtyNum = Number(restockQty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setRestockError('Enter a restock quantity greater than zero.');
      return;
    }
    if (!restockReason.trim()) {
      setRestockError('Provide a short reason for this stock adjustment.');
      return;
    }
    if (!accessToken || !activeBusinessId) {
      setRestockError('Sign in to an active workspace session to post stock adjustments.');
      return;
    }
    if (!isOnline) {
      setRestockError('Reconnect to the internet to post inventory adjustments.');
      return;
    }

    setRestockSubmitting(true);
    setRestockError(null);
    const response = await createStockAdjustment(accessToken, activeBusinessId, {
      productId: restockTarget.id,
      direction: 'in',
      quantity: String(qtyNum),
      reason: restockReason.trim(),
    });
    setRestockSubmitting(false);

    if (!response.success) {
      setRestockError(getFriendlyApiError(response.error, 'Unable to post stock adjustment.'));
      return;
    }

    pushToast(`Added ${qtyNum} ${restockTarget.unit} to ${restockTarget.name}.`, 'success');
    setRestockTarget(null);
  };

  const quickActions = [
    { label: 'New Sale (POS)', to: '/app/pos', icon: ShoppingCart, visible: true },
    { label: 'Add Product', to: '/app/products', icon: PackagePlus, visible: true },
    { label: 'Add Customer', to: '/app/customers', icon: UserPlus, visible: true },
    { label: 'Collect Debt', to: '/app/debts', icon: CreditCard, visible: canCollectDebt },
    { label: 'Add Expense', to: '/app/expenses', icon: Wallet, visible: canManageExpenses },
    { label: 'View Reports', to: '/app/reports', icon: BarChart3, visible: canViewReports },
    { label: 'Settings', to: '/app/settings', icon: Settings, visible: canManageSettings },
    { label: 'Manage Plan', to: '/app/subscription', icon: Crown, visible: canManageBilling },
  ].filter((a) => a.visible);

  const selectedRangePeriodText =
    range === '7d'
      ? '7 days'
      : range === '30d'
        ? '30 days'
        : range === '90d'
          ? '90 days'
          : '12 months';
  const effectiveSubStatus =
    subscription?.status ?? activeMembership?.subscriptionStatus ?? 'trialing';
  const effectivePlanName =
    subscription?.subscription?.displayName ??
    activeMembership?.limits.displayName ??
    '14-Day Free Trial';
  const maxProductsLimit =
    subscription?.subscription?.maxProducts ?? activeMembership?.limits.maxProducts ?? 0;
  const maxStaffLimit =
    subscription?.subscription?.maxStaff ?? activeMembership?.limits.maxStaff ?? 0;
  const maxDevicesLimit =
    subscription?.subscription?.maxOfflineDevices ??
    activeMembership?.limits.maxOfflineDevices ??
    0;

  const effectiveViewState: DashboardViewState = !accessToken
    ? 'session_expired'
    : loadedBusinessId !== activeBusinessId
      ? 'loading'
      : viewState;

  // State 1: Loading (never flash ₦0.00 while fetching)
  if (effectiveViewState === 'loading') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5">
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">Dashboard</h1>
          <p className="mt-1 text-sm text-[#52525B]">
            Loading live business indicators, trends, and alerts...
          </p>
        </div>
        <LoadingSkeleton rows={6} label="Loading dashboard overview..." />
      </div>
    );
  }

  // State 5: Unauthorized / Permission Denied (403)
  if (effectiveViewState === 'forbidden') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5">
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">Dashboard</h1>
        </div>
        <PermissionDeniedState
          title="Unauthorized workspace access"
          description={
            errorMessage ??
            'Your account does not have active permission to view dashboard data for this business.'
          }
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={handleManualRefresh}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Retry</span>
              </Button>
              <Button variant="primary" size="sm" onClick={() => void handleSignInAgain()}>
                <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Switch account</span>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  // State 6: Expired or Missing Authentication Session (401)
  if (effectiveViewState === 'session_expired') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5">
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">Dashboard</h1>
        </div>
        <section role="alert" className="rounded-2xl border border-[#DC2626] bg-white p-6 sm:p-8">
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FEF2F2] text-[#DC2626]">
              <LogIn className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold tracking-tight text-[#18181B]">
                Session expired — sign in required
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[#52525B]">
                {errorMessage ??
                  'Your authentication session has expired. Sign in again to securely load your business dashboard.'}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => void handleSignInAgain()}>
                  <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sign in again</span>
                </Button>
                <Button variant="secondary" size="sm" onClick={handleManualRefresh}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Try again</span>
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // State 7b: Offline with no authorized cached snapshot for this business
  if (effectiveViewState === 'offline_no_cache') {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5">
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">Dashboard</h1>
          <p className="mt-1 text-xs text-[#52525B]">
            {activeMembership?.businessName ?? 'Workspace'} · Offline mode
          </p>
        </div>
        <section
          role="status"
          className="rounded-2xl border border-[#D97706] bg-[#FFFBEB] p-6 sm:p-8"
        >
          <div className="flex items-start gap-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#D97706]">
              <WifiOff className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-bold tracking-tight text-[#18181B]">
                Offline — no synced dashboard snapshot available
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-[#52525B]">
                No previously synchronized dashboard data is cached on this device for{' '}
                <strong className="text-[#18181B]">
                  {activeMembership?.businessName ?? 'this business'}
                </strong>
                . Reconnect to the internet to fetch verified business figures.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={handleManualRefresh}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Check connection</span>
                </Button>
                {offlineQueueSummary.totalCount > 0 && (
                  <Link
                    to="/app/sync"
                    className="inline-flex h-9 items-center rounded-xl bg-[#991B1B] px-3.5 text-xs font-semibold text-white hover:bg-[#7F1D1D]"
                  >
                    Review {offlineQueueSummary.totalCount} queued operation
                    {offlineQueueSummary.totalCount === 1 ? '' : 's'}
                  </Link>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  // State 4: Backend Connection Failure (NEVER disguise with ₦0.00 KPIs)
  if (effectiveViewState === 'error' && errorMessage) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-[#E4E4E7] bg-white p-5">
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">Dashboard</h1>
        </div>
        <ErrorState
          title="Unable to load live business data"
          message={errorMessage}
          onRetry={handleManualRefresh}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Top Reference-Style Dashboard Header Card */}
      <section className="flex flex-col gap-4 rounded-2xl border border-[#E4E4E7] bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">Dashboard</h1>
          <p className="mt-1 text-sm text-[#52525B]">
            Track sales, profit, inventory, debt, and daily operational performance in one place.
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[#52525B]">
            <span>{activeMembership?.businessName ?? 'Main Branch'}</span>
            <span aria-hidden="true">·</span>
            <span>{effectiveViewState === 'offline_cached' ? 'Offline (cached)' : 'Online'}</span>
            {lastUpdatedAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-tabular">
                  {effectiveViewState === 'offline_cached'
                    ? `Last synced ${formatDateTime(lastUpdatedAt.toISOString())}`
                    : `Updated ${formatClockTime(lastUpdatedAt)}`}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex items-center rounded-xl border border-[#E4E4E7] bg-[#F4F5F7] p-1"
            role="group"
            aria-label="Reporting period"
          >
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setRange(opt.key);
                  setHoveredIdx(null);
                  setPinnedPointIdx(null);
                  setIsRefreshing(true);
                }}
                aria-pressed={range === opt.key}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  range === opt.key
                    ? 'bg-[#991B1B] text-white'
                    : 'text-[#52525B] hover:text-[#18181B]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAutoSync((prev) => !prev)}
            aria-pressed={autoSync}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold whitespace-nowrap transition-colors ${
              autoSync
                ? 'border-[#991B1B] bg-[#FEF2F2] text-[#991B1B]'
                : 'border-[#E4E4E7] bg-white text-[#52525B] hover:bg-[#F4F5F7] hover:text-[#18181B]'
            }`}
          >
            <span>{autoSync ? 'Auto-sync on (30s)' : 'Auto-sync off'}</span>
          </button>

          <button
            type="button"
            onClick={handleManualRefresh}
            aria-label="Refresh dashboard data"
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E4E4E7] bg-white px-3 text-xs font-semibold whitespace-nowrap text-[#18181B] transition-colors hover:bg-[#F4F5F7]"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 text-[#52525B] ${isRefreshing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>{isRefreshing ? 'Syncing...' : 'Refresh'}</span>
          </button>
        </div>
      </section>

      {/* State 7a: Offline Mode Banner with Last Authorized Sync Timestamp */}
      {effectiveViewState === 'offline_cached' && cachedSyncedAt && (
        <AlertBanner
          tone="warning"
          title="Offline mode — displaying last synced workspace data"
          action={
            <Button variant="secondary" size="sm" onClick={handleManualRefresh}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Retry sync</span>
            </Button>
          }
        >
          <span>
            Last synchronized on{' '}
            <strong className="font-mono-tabular text-[#18181B]">
              {formatDateTime(cachedSyncedAt)}
            </strong>
            . Figures will refresh automatically once your connection is restored.
          </span>
        </AlertBanner>
      )}

      {/* State 8: Reactive Offline Pending Synchronization Banner */}
      {offlineQueueSummary.totalCount > 0 && (
        <AlertBanner
          tone="warning"
          title={`${offlineQueueSummary.totalCount} offline operation${offlineQueueSummary.totalCount === 1 ? '' : 's'} queued on this device`}
          action={
            <Link
              to="/app/sync"
              className="inline-flex h-9 items-center justify-center rounded-lg bg-[#991B1B] px-3.5 text-xs font-semibold whitespace-nowrap text-white hover:bg-[#7F1D1D]"
            >
              Review Offline Sync
            </Link>
          }
        >
          <span>
            {offlineQueueSummary.salesCount > 0
              ? `${offlineQueueSummary.salesCount} queued sale${offlineQueueSummary.salesCount === 1 ? '' : 's'} (${formatMoney(offlineQueueSummary.salesAmount)})`
              : 'Queued counter operations'}{' '}
            awaiting idempotent push to your workspace ledger.
          </span>
        </AlertBanner>
      )}

      {/* Active Cross-Filter Banner (when user locks a category from the donut chart) */}
      {selectedCategory && (
        <div
          role="region"
          aria-label="Active dashboard category filter"
          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#991B1B]/25 bg-[#FEF2F2] px-4 py-2.5 text-xs text-[#7F1D1D]"
        >
          <p>
            Cross-filtering Recent Sales &amp; Low Stock by category:{' '}
            <strong className="font-semibold text-[#991B1B]">{selectedCategory}</strong>
          </p>
          <button
            type="button"
            onClick={() => setSelectedCategory(null)}
            className="inline-flex items-center gap-1 rounded-lg border border-[#991B1B]/30 bg-white px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-[#991B1B] hover:bg-[#FEE2E2]"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Clear filter</span>
          </button>
        </div>
      )}

      {/* 6-Card Reference KPI Strip (Owner/Manager) OR 4-Card Operational Strip (Cashier — D-09 redaction) */}
      {canViewReports && summary ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Total Sales"
            value={formatMoney(summary.netSales)}
            caption={
              <Link to="/app/sales" className="text-[#52525B] hover:text-[#991B1B] hover:underline">
                <span className="font-mono-tabular font-semibold text-[#18181B]">
                  {summary.salesCount}
                </span>{' '}
                completed sale{summary.salesCount === 1 ? '' : 's'}
              </Link>
            }
            icon={<ShoppingCart className="h-4 w-4 text-[#52525B]" aria-hidden="true" />}
          />

          <StatCard
            label="Net Profit"
            value={formatMoney(summary.netOperatingProfit)}
            caption={
              <span>
                Gross Profit ({selectedRangePeriodText}):{' '}
                <span className="font-mono-tabular font-semibold text-[#16A34A]">
                  {formatMoney(summary.grossProfit)}
                </span>
                {netMarginPct !== null && (
                  <span className="font-mono-tabular text-[#52525B]"> · {netMarginPct}% net</span>
                )}
              </span>
            }
            icon={<TrendingUp className="h-4 w-4 text-[#16A34A]" aria-hidden="true" />}
          />

          <StatCard
            label="Expenses"
            value={formatMoney(summary.operatingExpenses)}
            caption={
              <Link
                to="/app/expenses"
                className="text-[#52525B] hover:text-[#991B1B] hover:underline"
              >
                COGS{' '}
                <span className="font-mono-tabular font-medium text-[#18181B]">
                  {formatMoney(summary.cogs)}
                </span>
              </Link>
            }
            icon={<Wallet className="h-4 w-4 text-[#52525B]" aria-hidden="true" />}
          />

          <StatCard
            label="Outstanding Debt"
            value={formatMoney(summary.outstandingReceivables)}
            caption={
              <Link to="/app/debts" className="font-medium text-[#991B1B] hover:underline">
                View credit ledger
              </Link>
            }
            icon={<CreditCard className="h-4 w-4 text-[#52525B]" aria-hidden="true" />}
          />

          <StatCard
            label="Low Stock"
            value={allLowStockEntries.length}
            tone={allLowStockEntries.length > 0 ? 'warning' : 'default'}
            caption={
              <button
                type="button"
                onClick={() =>
                  lowStockSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }
                className="font-medium text-[#92400E] hover:underline"
              >
                {allLowStockEntries.length > 0
                  ? 'Jump to restock alerts'
                  : activeProductsCount === 0
                    ? 'No inventory records'
                    : 'All items above minimum'}
              </button>
            }
            icon={<AlertTriangle className="h-4 w-4 text-[#D97706]" aria-hidden="true" />}
          />

          <StatCard
            label="Average Ticket"
            value={formatMoney(avgTicket)}
            caption={
              <span>
                <span className="font-mono-tabular">{activeProductsCount}</span> products ·{' '}
                <span className="font-mono-tabular">{activeCustomersCount}</span> customers
              </span>
            }
            icon={<Receipt className="h-4 w-4 text-[#52525B]" aria-hidden="true" />}
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Recent Orders"
            value={allRecentSaleRows.length}
            caption="Latest counter receipts"
            icon={<Receipt className="h-4 w-4 text-[#52525B]" aria-hidden="true" />}
          />
          <StatCard
            label="Active Products"
            value={activeProductsCount}
            caption={activeProductsCount === 0 ? 'No inventory records' : 'Catalog items available'}
            icon={<Boxes className="h-4 w-4 text-[#52525B]" aria-hidden="true" />}
          />
          <StatCard
            label="Customers"
            value={activeCustomersCount}
            caption="Active customer directory"
            icon={<Users className="h-4 w-4 text-[#52525B]" aria-hidden="true" />}
          />
          <StatCard
            label="Low Stock"
            value={allLowStockEntries.length}
            tone={allLowStockEntries.length > 0 ? 'warning' : 'default'}
            caption={activeProductsCount === 0 ? 'No inventory records' : 'Products below minimum'}
            icon={<AlertTriangle className="h-4 w-4 text-[#D97706]" aria-hidden="true" />}
          />
        </div>
      )}

      {/* Middle 2-Column Analytical Split: Sales Trends (8 cols) + Sales by Category Donut (4 cols) */}
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
        {/* Sales Trends Smooth Spline Area Chart */}
        {canViewReports && (
          <Card className="flex flex-col justify-between rounded-2xl p-5 xl:col-span-8">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#18181B]">Sales by Period</h2>
                <p className="mt-0.5 text-xs text-[#52525B]">
                  Click or focus any point to pin period revenue and order count
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="inline-flex items-center rounded-lg border border-[#E4E4E7] bg-[#F4F5F7] p-0.5"
                  role="group"
                  aria-label="Chart metric"
                >
                  <button
                    type="button"
                    onClick={() => setChartMetric('revenue')}
                    aria-pressed={chartMetric === 'revenue'}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
                      chartMetric === 'revenue'
                        ? 'bg-white text-[#18181B] shadow-2xs'
                        : 'text-[#52525B] hover:text-[#18181B]'
                    }`}
                  >
                    Revenue
                  </button>
                  <button
                    type="button"
                    onClick={() => setChartMetric('orders')}
                    aria-pressed={chartMetric === 'orders'}
                    className={`rounded-md px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
                      chartMetric === 'orders'
                        ? 'bg-white text-[#18181B] shadow-2xs'
                        : 'text-[#52525B] hover:text-[#18181B]'
                    }`}
                  >
                    Orders
                  </button>
                </div>

                {activePoint && chartData.length > 0 && (
                  <div className="text-right text-xs">
                    <span className="text-[#52525B]">{activePoint.label}</span>
                    <span className="mx-1.5 text-[#D4D4D8]" aria-hidden="true">
                      ·
                    </span>
                    <span className="font-mono-tabular font-bold text-[#18181B]">
                      {chartMetric === 'revenue'
                        ? formatMoney(activePoint.revenue)
                        : `${activePoint.orders} orders`}
                    </span>
                    {chartMetric === 'revenue' && (
                      <span className="font-mono-tabular text-[#52525B]">
                        {' '}
                        ({activePoint.orders} orders)
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {chartData.length === 0 ? (
              <div className="mt-6">
                <EmptyState
                  title="No sales data available"
                  description="Record sales in POS to plot real daily revenue trends automatically."
                  action={
                    <Link
                      to="/app/pos"
                      className="inline-flex h-9 items-center rounded-xl bg-[#991B1B] px-4 text-xs font-semibold text-white hover:bg-[#7F1D1D]"
                    >
                      Open POS
                    </Link>
                  }
                />
              </div>
            ) : (
              <div className="mt-4">
                <svg
                  viewBox={`0 0 ${svgW} ${svgH}`}
                  className="h-60 w-full"
                  role="img"
                  aria-label="Sales trends by period area chart"
                >
                  <defs>
                    <linearGradient id="festolaSalesSplineFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.34" />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.03" />
                    </linearGradient>
                  </defs>

                  {yAxisTicks.map((tick, idx) => (
                    <g key={idx}>
                      <line
                        x1={padLeft}
                        y1={tick.y}
                        x2={svgW - padRight}
                        y2={tick.y}
                        stroke="#E4E4E7"
                        strokeWidth="1"
                      />
                      <text
                        x={padLeft - 8}
                        y={tick.y + 3.5}
                        textAnchor="end"
                        fontSize="10"
                        fill="#71717A"
                        className="font-mono-tabular"
                      >
                        {chartMetric === 'revenue' && tick.value >= 1000
                          ? `${(tick.value / 1000).toFixed(tick.value >= 10000 ? 0 : 1)}k`
                          : tick.value}
                      </text>
                    </g>
                  ))}

                  {smoothArea && <path d={smoothArea} fill="url(#festolaSalesSplineFill)" />}
                  {smoothLine && (
                    <path
                      d={smoothLine}
                      fill="none"
                      stroke="#2563EB"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {chartCoords.map((pt, idx) => {
                    const isFocused = effectivePointIdx === idx;
                    return (
                      <g
                        key={`${pt.label}-${idx}`}
                        tabIndex={0}
                        role="button"
                        aria-label={`${pt.label}: ${formatMoney(pt.revenue)}, ${pt.orders} orders`}
                        aria-pressed={pinnedPointIdx === idx}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        onFocus={() => setHoveredIdx(idx)}
                        onBlur={() => setHoveredIdx(null)}
                        onClick={() => setPinnedPointIdx((prev) => (prev === idx ? null : idx))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setPinnedPointIdx((prev) => (prev === idx ? null : idx));
                          }
                        }}
                        className="cursor-pointer focus:outline-none"
                      >
                        {isFocused && (
                          <line
                            x1={pt.x}
                            y1={padTop}
                            x2={pt.x}
                            y2={svgH - padBottom}
                            stroke="#93C5FD"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                          />
                        )}
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r={isFocused ? '5.5' : '3.5'}
                          fill={pinnedPointIdx === idx ? '#2563EB' : '#FFFFFF'}
                          stroke="#2563EB"
                          strokeWidth="2.2"
                        />
                        <text
                          x={pt.x}
                          y={svgH - 8}
                          textAnchor="middle"
                          fontSize="10.5"
                          fill={isFocused ? '#18181B' : '#52525B'}
                          fontWeight={isFocused ? '600' : '400'}
                        >
                          {pt.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Real Cash Collected vs Credit Extended Health Bar */}
                {summary && cashCollectionPct !== null && (
                  <div className="mt-3 border-t border-[#F1F5F9] pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#52525B]">
                      <span>
                        Cash collected:{' '}
                        <strong className="font-mono-tabular font-semibold text-[#18181B]">
                          {formatMoney(cashCollectedNum)} ({cashCollectionPct}%)
                        </strong>
                      </span>
                      <span>
                        Credit extended:{' '}
                        <strong className="font-mono-tabular font-semibold text-[#D97706]">
                          {formatMoney(creditExtendedNum)}
                        </strong>
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[#F4F5F7]"
                      role="progressbar"
                      aria-valuenow={cashCollectionPct}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Cash collection ratio"
                    >
                      <div
                        className="h-full rounded-full bg-[#16A34A] transition-all duration-200"
                        style={{ width: `${cashCollectionPct}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Sales by Category Donut Chart with Interactive Cross-Filter */}
        <Card
          className={`flex flex-col justify-between rounded-2xl p-5 ${
            canViewReports ? 'xl:col-span-4' : 'xl:col-span-12'
          }`}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-[#18181B]">Sales by Category</h2>
              <p className="mt-0.5 text-xs text-[#52525B]">
                Click a category slice to filter Recent Sales &amp; Low Stock
              </p>
            </div>
            {selectedCategory && (
              <button
                type="button"
                onClick={() => setSelectedCategory(null)}
                className="text-xs font-semibold whitespace-nowrap text-[#991B1B] hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          {categorySlices.length === 0 ? (
            <div className="mt-6">
              <EmptyState
                title="No sales data available"
                description="Complete sales on categorized products to visualize category performance here."
                action={
                  <Link
                    to="/app/products"
                    className="inline-flex h-9 items-center rounded-xl border border-[#E4E4E7] bg-white px-3.5 text-xs font-semibold text-[#18181B] hover:bg-[#F4F5F7]"
                  >
                    Manage Products
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="mt-4 flex flex-1 flex-col items-center justify-between gap-4">
              {/* Interactive Multi-Color Legend Above Donut (click to cross-filter) */}
              <div className="flex flex-wrap items-center justify-center gap-x-3.5 gap-y-1.5 text-xs">
                {categorySlices.map((slice, idx) => {
                  const isLocked = selectedCategory === slice.name;
                  return (
                    <button
                      key={slice.name}
                      type="button"
                      aria-pressed={isLocked}
                      onClick={() => toggleCategoryFilter(slice.name)}
                      onMouseEnter={() => setHoveredCategoryIdx(idx)}
                      onFocus={() => setHoveredCategoryIdx(idx)}
                      onMouseLeave={() => setHoveredCategoryIdx(null)}
                      onBlur={() => setHoveredCategoryIdx(null)}
                      className={`inline-flex items-center gap-1.5 rounded px-1 py-0.5 text-left transition-opacity ${
                        isLocked
                          ? 'bg-[#FEF2F2] font-semibold text-[#991B1B]'
                          : highlightedCategoryIdx !== null && highlightedCategoryIdx !== idx
                            ? 'text-[#52525B] opacity-45'
                            : 'text-[#52525B] opacity-100 hover:text-[#18181B]'
                      }`}
                    >
                      <span
                        className="h-2.5 w-4 shrink-0 rounded-xs"
                        style={{ backgroundColor: slice.color }}
                        aria-hidden="true"
                      />
                      <span className="max-w-[120px] truncate">{slice.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Crisp Hollow Donut Ring */}
              <div className="relative flex h-44 w-44 items-center justify-center">
                <svg
                  viewBox="0 0 112 112"
                  className="h-44 w-44 -rotate-90"
                  role="img"
                  aria-label="Sales by category donut chart"
                >
                  <circle
                    cx="56"
                    cy="56"
                    r={donutRadius}
                    fill="none"
                    stroke="#F4F5F7"
                    strokeWidth="18"
                  />
                  {donutSegments.map((seg, idx) => (
                    <circle
                      key={seg.name}
                      cx="56"
                      cy="56"
                      r={donutRadius}
                      fill="none"
                      stroke={seg.color}
                      strokeWidth={highlightedCategoryIdx === idx ? '21' : '18'}
                      strokeDasharray={seg.dashArray}
                      strokeDashoffset={seg.dashOffset}
                      className="cursor-pointer transition-[stroke-width] duration-150"
                      onClick={() => toggleCategoryFilter(seg.name)}
                      onMouseEnter={() => setHoveredCategoryIdx(idx)}
                      onMouseLeave={() => setHoveredCategoryIdx(null)}
                    />
                  ))}
                </svg>
                <div className="pointer-events-none absolute px-3 text-center">
                  {highlightedCategoryIdx !== null && categorySlices[highlightedCategoryIdx] ? (
                    <>
                      <span className="block font-mono-tabular text-base font-bold text-[#18181B]">
                        {categorySlices[highlightedCategoryIdx]!.sharePct}%
                      </span>
                      <span className="block max-w-[84px] truncate text-[11px] text-[#52525B]">
                        {categorySlices[highlightedCategoryIdx]!.name}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="block font-mono-tabular text-base font-bold text-[#18181B]">
                        {categorySlices.length}
                      </span>
                      <span className="block text-[11px] text-[#52525B]">Categories</span>
                    </>
                  )}
                </div>
              </div>

              {valuation && canViewReports && (
                <p className="text-center text-xs text-[#52525B]">
                  Stock value:{' '}
                  <span className="font-mono-tabular font-semibold text-[#18181B]">
                    {formatMoney(valuation.totalRetailValue)}
                  </span>{' '}
                  <span className="font-mono-tabular text-[#71717A]">
                    (cost {formatMoney(valuation.totalCostValuation)})
                  </span>
                </p>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Bottom 2-Column Operational Split: Recent Sales Table (8 cols) + Actionable Low Stock Alerts (4 cols) */}
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
        {/* Recent Sales with Live Search, Payment Status Filter & Click-to-Inspect Modal */}
        <Card className="rounded-2xl p-5 xl:col-span-8">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[#18181B]">Recent Sales</h2>
              <p className="mt-0.5 text-xs text-[#52525B]">
                Click any order to inspect receipt details · {filteredRecentSaleRows.length} shown
              </p>
            </div>
            <Link
              to="/app/sales"
              className="inline-flex h-8 items-center self-start rounded-xl border border-[#E4E4E7] bg-white px-3 text-xs font-semibold whitespace-nowrap text-[#991B1B] transition-colors hover:bg-[#FEF2F2] sm:self-auto"
            >
              View all
            </Link>
          </div>

          {/* Live Reactive Filter Bar for Recent Sales */}
          <div className="mb-4 flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 sm:max-w-xs">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#71717A]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={salesSearch}
                onChange={(e) => setSalesSearch(e.target.value)}
                placeholder="Search customer or receipt..."
                aria-label="Filter recent sales"
                className="h-9 w-full rounded-xl border border-[#E4E4E7] bg-white pr-3 pl-8 text-xs text-[#18181B] placeholder:text-[#71717A] focus:border-[#991B1B] focus:outline-none"
              />
            </div>

            <div
              className="inline-flex items-center self-start rounded-xl border border-[#E4E4E7] bg-[#F4F5F7] p-0.5 sm:self-auto"
              role="group"
              aria-label="Filter sales by payment status"
            >
              {PAYMENT_FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPaymentFilter(opt.key)}
                  aria-pressed={paymentFilter === opt.key}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold whitespace-nowrap transition-colors ${
                    paymentFilter === opt.key
                      ? 'bg-white text-[#18181B] shadow-2xs'
                      : 'text-[#52525B] hover:text-[#18181B]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <DataTable
            columns={recentSaleColumns}
            rows={filteredRecentSaleRows}
            rowKey={(row) => row.id}
            caption="Recent sales transactions"
            initialSortKey="soldAt"
            initialSortDir="desc"
            onRowClick={(row) => setSelectedSaleRow(row)}
            emptyTitle={
              selectedCategory || paymentFilter !== 'all' || salesSearch.trim()
                ? 'No matching sales for current filters'
                : 'No recent transactions'
            }
            emptyDescription={
              selectedCategory || paymentFilter !== 'all' || salesSearch.trim()
                ? 'Clear your search or status filter to view all recent counter transactions.'
                : 'Complete your first counter sale in POS to see live transactions here.'
            }
            emptyAction={
              selectedCategory || paymentFilter !== 'all' || salesSearch.trim() ? (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory(null);
                    setPaymentFilter('all');
                    setSalesSearch('');
                  }}
                  className="inline-flex h-9 items-center rounded-xl border border-[#E4E4E7] bg-white px-4 text-xs font-semibold text-[#18181B] hover:bg-[#F4F5F7]"
                >
                  Reset filters
                </button>
              ) : (
                <Link
                  to="/app/pos"
                  className="inline-flex h-9 items-center rounded-xl bg-[#991B1B] px-4 text-xs font-semibold text-white hover:bg-[#7F1D1D]"
                >
                  Start a Sale
                </Link>
              )
            }
          />
        </Card>

        {/* Actionable Low Stock Alerts (with honest empty state when no inventory exists) */}
        <div ref={lowStockSectionRef} className="xl:col-span-4">
          <Card className="h-full rounded-2xl p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-[#18181B]">Low Stock</h2>
                <p className="mt-0.5 text-xs text-[#52525B]">
                  {selectedCategory
                    ? `${selectedCategory} items below minimum`
                    : 'Products requiring attention'}
                </p>
              </div>
              <Link
                to={canManageInventory ? '/app/inventory' : '/app/products'}
                className="inline-flex h-8 items-center rounded-xl border border-[#E4E4E7] bg-white px-3 text-xs font-semibold whitespace-nowrap text-[#991B1B] transition-colors hover:bg-[#FEF2F2]"
              >
                View products
              </Link>
            </div>

            {activeProductsCount === 0 ? (
              <div className="rounded-xl border border-[#E4E4E7] bg-[#F4F5F7]/60 p-4 text-xs text-[#52525B]">
                <p className="font-semibold text-[#18181B]">No inventory records</p>
                <p className="mt-1">
                  Add products and record opening stock to monitor stock balances and low-stock
                  alerts.
                </p>
                <Link
                  to="/app/products"
                  className="mt-3 inline-flex h-8 items-center rounded-lg border border-[#E4E4E7] bg-white px-3 text-xs font-semibold text-[#991B1B] hover:bg-[#FEF2F2]"
                >
                  Add Product
                </Link>
              </div>
            ) : filteredLowStock.length === 0 ? (
              <div className="rounded-xl border border-[#BBF7D0] bg-[#F0FDF4] p-4 text-xs font-medium text-[#166534]">
                {selectedCategory
                  ? `No low-stock products in ${selectedCategory}.`
                  : 'All active products are currently above their minimum reorder level.'}
              </div>
            ) : (
              <ul className="space-y-2.5">
                {filteredLowStock.slice(0, 6).map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl bg-[#F4F5F7]/80 px-3.5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#18181B]">{item.name}</p>
                      <p className="mt-0.5 truncate text-xs text-[#52525B]">
                        <span>{item.category}</span>
                        <span className="mx-1.5" aria-hidden="true">
                          ·
                        </span>
                        <span className="font-mono-tabular">
                          Min {formatQty(item.reorderLevel)} {item.unit}
                        </span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className="flex h-7 min-w-[28px] items-center justify-center rounded-full bg-[#FEE2E2] px-2 font-mono-tabular text-xs font-bold text-[#DC2626]"
                        aria-label={`${formatQty(item.onHand)} ${item.unit} remaining`}
                      >
                        {formatQty(item.onHand)}
                      </span>
                      {canManageInventory && (
                        <button
                          type="button"
                          onClick={() => openQuickRestock(item)}
                          aria-label={`Restock ${item.name}`}
                          className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#E4E4E7] bg-white px-2 text-xs font-semibold whitespace-nowrap text-[#991B1B] transition-colors hover:border-[#991B1B]/40 hover:bg-[#FEF2F2]"
                        >
                          <Plus className="h-3 w-3" aria-hidden="true" />
                          <span>Restock</span>
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {/* Customer Payments & Subscription Status Strip */}
      <div className="grid grid-cols-1 items-stretch gap-5 xl:grid-cols-12">
        {/* Recent Customer Debt Payments */}
        <Card className="rounded-2xl p-5 xl:col-span-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-[#18181B]">Customer Payments</h2>
              <p className="mt-0.5 text-xs text-[#52525B]">
                Recent credit settlements recorded against customer balances
              </p>
            </div>
            {canCollectDebt && (
              <Link
                to="/app/debts"
                className="inline-flex h-8 items-center rounded-xl border border-[#E4E4E7] bg-white px-3 text-xs font-semibold whitespace-nowrap text-[#991B1B] transition-colors hover:bg-[#FEF2F2]"
              >
                Open debt ledger
              </Link>
            )}
          </div>

          {debtPayments.length === 0 ? (
            <div className="rounded-xl border border-[#E4E4E7] bg-[#F4F5F7]/60 p-4 text-xs text-[#52525B]">
              No customer debt payments recorded yet. Payments collected from credit customers will
              appear here automatically.
            </div>
          ) : (
            <ul className="divide-y divide-[#F1F5F9]">
              {debtPayments.slice(0, 5).map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#18181B]">{payment.customerName}</p>
                    <p className="mt-0.5 text-[#52525B]">
                      <span>{formatPaymentMethodLabel(payment.method)}</span>
                      <span className="mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono-tabular">{formatDateTime(payment.paidAt)}</span>
                    </p>
                  </div>
                  <span className="font-mono-tabular text-sm font-semibold text-[#16A34A]">
                    +{formatMoney(payment.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Live Subscription Status & Plan Usage */}
        <Card className="flex flex-col justify-between rounded-2xl p-5 xl:col-span-4">
          <div>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-[#18181B]">Subscription Status</h2>
                <p className="mt-0.5 text-xs text-[#52525B]">{effectivePlanName}</p>
              </div>
              <span
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                  effectiveSubStatus === 'active'
                    ? 'bg-[#F0FDF4] text-[#166534]'
                    : effectiveSubStatus === 'trialing'
                      ? 'bg-[#FEF2F2] text-[#991B1B]'
                      : 'bg-[#FFFBEB] text-[#92400E]'
                }`}
              >
                {formatSubscriptionStatusLabel(effectiveSubStatus)}
              </span>
            </div>

            <dl className="mt-4 space-y-2.5 border-t border-[#F1F5F9] pt-3 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-[#52525B]">Active products</dt>
                <dd className="font-mono-tabular font-semibold text-[#18181B]">
                  {subscription?.productCount ?? activeProductsCount}
                  {maxProductsLimit > 0 ? ` / ${maxProductsLimit}` : ''}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#52525B]">Team members</dt>
                <dd className="font-mono-tabular font-semibold text-[#18181B]">
                  {subscription?.staffCount ?? 1}
                  {maxStaffLimit > 0 ? ` / ${maxStaffLimit}` : ''}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-[#52525B]">Offline devices</dt>
                <dd className="font-mono-tabular font-semibold text-[#18181B]">
                  {subscription?.activeDeviceCount ?? 0}
                  {maxDevicesLimit > 0 ? ` / ${maxDevicesLimit}` : ''}
                </dd>
              </div>
              {subscription?.subscription?.currentPeriodEnd && (
                <div className="flex items-center justify-between">
                  <dt className="text-[#52525B]">
                    {effectiveSubStatus === 'trialing' ? 'Trial ends' : 'Period ends'}
                  </dt>
                  <dd className="font-mono-tabular font-medium text-[#18181B]">
                    {formatDateOnly(
                      subscription.subscription.trialEndsAt ??
                        subscription.subscription.currentPeriodEnd,
                    )}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          {canManageBilling && (
            <div className="mt-4 pt-2">
              <Link
                to="/app/subscription"
                className="inline-flex h-9 w-full items-center justify-center rounded-xl border border-[#E4E4E7] bg-white px-3 text-xs font-semibold text-[#991B1B] transition-colors hover:bg-[#FEF2F2]"
              >
                Manage Subscription
              </Link>
            </div>
          )}
        </Card>
      </div>

      {/* Permitted Quick Actions Strip (filtered strictly by role permissions) */}
      <section
        aria-label="Quick actions"
        className="rounded-2xl border border-[#E4E4E7] bg-white p-5"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-[#18181B]">Quick Actions</h2>
            <p className="text-xs text-[#52525B]">
              Shortcuts scoped to your permitted workspace role
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.label}
                  to={action.to}
                  className="inline-flex h-9 items-center gap-2 rounded-xl border border-[#E4E4E7] bg-white px-3.5 text-xs font-semibold whitespace-nowrap text-[#18181B] transition-colors hover:border-[#991B1B]/40 hover:bg-[#FEF2F2] hover:text-[#991B1B]"
                >
                  <Icon className="h-3.5 w-3.5 text-[#991B1B]" aria-hidden="true" />
                  <span>{action.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* Transparent API & Pending Integrations Tracker (Collapsible) */}
      <section className="rounded-2xl border border-[#E4E4E7] bg-white p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setShowIntegrations((prev) => !prev)}
          aria-expanded={showIntegrations}
          className="flex w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-sm font-bold text-[#18181B]">
              Module API &amp; Pending Integrations Tracker
            </h2>
            <p className="mt-0.5 text-xs text-[#52525B]">
              {MODULE_INTEGRATION_REGISTRY.filter((m) => m.status === 'connected').length} connected
              · {MODULE_INTEGRATION_REGISTRY.filter((m) => m.status !== 'connected').length} partial
              or pending (Release 2 excluded from navigation)
            </p>
          </div>
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#E4E4E7] text-[#52525B]">
            {showIntegrations ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </span>
        </button>

        {showIntegrations && (
          <div className="mt-4 overflow-x-auto border-t border-[#E4E4E7] pt-3">
            <table className="w-full min-w-[560px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[#E4E4E7] text-[#52525B]">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Module
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Release
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Status
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    Backing &amp; Notes
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F1F5F9]">
                {MODULE_INTEGRATION_REGISTRY.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2.5 pr-3 font-semibold text-[#18181B]">{item.label}</td>
                    <td className="py-2.5 pr-3 font-mono-tabular text-[#52525B]">
                      R{item.release}
                    </td>
                    <td className="py-2.5 pr-3">
                      <span
                        className={`font-semibold capitalize ${
                          item.status === 'connected'
                            ? 'text-[#16A34A]'
                            : item.status === 'partial'
                              ? 'text-[#D97706]'
                              : 'text-[#52525B]'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2.5 text-[#52525B]">{item.notes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Inline Quick Restock Modal (Owner/Manager Only — Enforced in UI & Backend API) */}
      <Modal
        open={Boolean(restockTarget)}
        onClose={() => setRestockTarget(null)}
        title={restockTarget ? `Quick Restock · ${restockTarget.name}` : 'Quick Restock'}
        description={
          restockTarget
            ? `Currently ${formatQty(restockTarget.onHand)} ${restockTarget.unit} on hand (min ${formatQty(restockTarget.reorderLevel)}).`
            : undefined
        }
      >
        <form onSubmit={(e) => void handleQuickRestockSubmit(e)} className="space-y-4">
          {restockError && (
            <AlertBanner tone="error" title="Unable to restock">
              {restockError}
            </AlertBanner>
          )}
          <FormField
            id="dashboard-restock-qty"
            label={`Quantity to add (${restockTarget?.unit ?? 'units'})`}
            required
          >
            <Input
              id="dashboard-restock-qty"
              type="number"
              min="1"
              step="any"
              mono
              value={restockQty}
              onChange={(e) => setRestockQty(e.target.value)}
              required
            />
          </FormField>
          <FormField id="dashboard-restock-reason" label="Adjustment reason" required>
            <Input
              id="dashboard-restock-reason"
              type="text"
              value={restockReason}
              onChange={(e) => setRestockReason(e.target.value)}
              required
            />
          </FormField>
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRestockTarget(null)}
              disabled={restockSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={restockSubmitting}>
              Post Stock In
            </Button>
          </div>
        </form>
      </Modal>

      {/* Inline Sale Detail & Receipt Preview Modal */}
      <Modal
        open={Boolean(selectedSaleRow)}
        onClose={() => setSelectedSaleRow(null)}
        title={selectedSaleRow ? `Sale ${selectedSaleRow.receiptNumber}` : 'Sale Details'}
        description={
          selectedSaleRow
            ? `${selectedSaleRow.customerName} · ${formatDateTime(selectedSaleRow.soldAt)}`
            : undefined
        }
      >
        {selectedSaleRow && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-[#E4E4E7] bg-[#F4F5F7]/60 p-3">
              <div>
                <p className="text-[#52525B]">Total</p>
                <p className="mt-0.5 font-mono-tabular text-sm font-bold text-[#18181B]">
                  {formatMoney(selectedSaleRow.totalAmount)}
                </p>
              </div>
              <div>
                <p className="text-[#52525B]">Paid</p>
                <p className="mt-0.5 font-mono-tabular text-sm font-semibold text-[#16A34A]">
                  {formatMoney(selectedSaleRow.amountPaid)}
                </p>
              </div>
              <div>
                <p className="text-[#52525B]">Balance</p>
                <p className="mt-0.5 font-mono-tabular text-sm font-semibold text-[#D97706]">
                  {formatMoney(selectedSaleRow.creditRemaining)}
                </p>
              </div>
            </div>

            {selectedSaleRow.rawSale?.items && selectedSaleRow.rawSale.items.length > 0 ? (
              <div>
                <p className="mb-1.5 font-semibold text-[#18181B]">Line items</p>
                <ul className="divide-y divide-[#F1F5F9] rounded-xl border border-[#E4E4E7]">
                  {selectedSaleRow.rawSale.items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2">
                      <span className="truncate text-[#18181B]">
                        {item.productNameSnapshot}{' '}
                        <span className="font-mono-tabular text-[#52525B]">
                          × {formatQty(item.quantity)}
                        </span>
                      </span>
                      <span className="font-mono-tabular font-semibold text-[#18181B]">
                        {formatMoney(item.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-[#52525B]">
                Open full Sales History to view printable receipts, returns, or tender notes for
                this transaction.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              {Number(selectedSaleRow.creditRemaining) > 0 && canCollectDebt && (
                <Link
                  to="/app/debts"
                  onClick={() => setSelectedSaleRow(null)}
                  className="inline-flex h-9 items-center rounded-lg border border-[#E4E4E7] bg-white px-3 text-xs font-semibold text-[#991B1B] hover:bg-[#FEF2F2]"
                >
                  Collect Balance
                </Link>
              )}
              <Link
                to="/app/sales"
                onClick={() => setSelectedSaleRow(null)}
                className="inline-flex h-9 items-center rounded-lg bg-[#991B1B] px-3.5 text-xs font-semibold text-white hover:bg-[#7F1D1D]"
              >
                Open Sales History
              </Link>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
