import { useState } from 'react';
import { Link } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  Info,
  Receipt,
  ShoppingBag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

type PreviewPeriod = '7d' | '30d' | '90d';

interface DashboardDemoDataset {
  label: string;
  totalSales: string;
  totalExpenses: string;
  netProfit: string;
  stockValue: string;
  chartPoints: number[];
  chartLabels: string[];
  topProducts: Array<{
    name: string;
    category: string;
    units: number;
    revenue: string;
    pct: number;
  }>;
  recentTransactions: Array<{
    receipt: string;
    customer: string;
    method: 'Cash' | 'POS Card' | 'Transfer';
    time: string;
    amount: string;
  }>;
  lowStockAlerts: Array<{
    item: string;
    sku: string;
    remaining: number;
    reorderLevel: number;
  }>;
}

const DEMO_DATASETS: Record<PreviewPeriod, DashboardDemoDataset> = {
  '7d': {
    label: 'Last 7 Days',
    totalSales: '₦450,750',
    totalExpenses: '₦120,000',
    netProfit: '₦330,750',
    stockValue: '₦1,840,500',
    chartPoints: [42, 54, 49, 66, 61, 78, 88],
    chartLabels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    topProducts: [
      {
        name: 'Instant Noodles (Carton)',
        category: 'Provisions',
        units: 25,
        revenue: '₦137,500',
        pct: 92,
      },
      {
        name: 'Vegetable Cooking Oil 5L',
        category: 'Groceries',
        units: 14,
        revenue: '₦112,000',
        pct: 76,
      },
      { name: 'Evaporated Milk Pack', category: 'Dairy', units: 19, revenue: '₦76,000', pct: 58 },
      {
        name: 'Bottled Water (Pack)',
        category: 'Beverages',
        units: 32,
        revenue: '₦64,000',
        pct: 48,
      },
    ],
    recentTransactions: [
      {
        receipt: 'RCP-1048',
        customer: 'Walk-in Customer',
        method: 'Transfer',
        time: '14:22',
        amount: '₦18,500',
      },
      {
        receipt: 'RCP-1047',
        customer: 'Retail Credit Account',
        method: 'POS Card',
        time: '13:45',
        amount: '₦42,000',
      },
      {
        receipt: 'RCP-1046',
        customer: 'Walk-in Customer',
        method: 'Cash',
        time: '12:18',
        amount: '₦9,250',
      },
      {
        receipt: 'RCP-1045',
        customer: 'Wholesale Buyer #04',
        method: 'Transfer',
        time: '11:05',
        amount: '₦85,000',
      },
    ],
    lowStockAlerts: [
      { item: 'Golden Morn Cereal 900g', sku: 'PRV-204', remaining: 3, reorderLevel: 12 },
      { item: 'Paracetamol 500mg Strip', sku: 'PHM-118', remaining: 5, reorderLevel: 20 },
      { item: 'Detergent Powder 1kg', sku: 'HHD-089', remaining: 4, reorderLevel: 15 },
    ],
  },
  '30d': {
    label: 'Last 30 Days',
    totalSales: '₦1,925,400',
    totalExpenses: '₦485,000',
    netProfit: '₦1,440,400',
    stockValue: '₦1,840,500',
    chartPoints: [48, 52, 61, 58, 72, 81, 92],
    chartLabels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Now'],
    topProducts: [
      {
        name: 'Instant Noodles (Carton)',
        category: 'Provisions',
        units: 98,
        revenue: '₦539,000',
        pct: 95,
      },
      {
        name: 'Vegetable Cooking Oil 5L',
        category: 'Groceries',
        units: 52,
        revenue: '₦416,000',
        pct: 78,
      },
      { name: 'Long Grain Rice 50kg', category: 'Staples', units: 6, revenue: '₦390,000', pct: 70 },
      { name: 'Evaporated Milk Pack', category: 'Dairy', units: 74, revenue: '₦296,000', pct: 55 },
    ],
    recentTransactions: [
      {
        receipt: 'RCP-1048',
        customer: 'Walk-in Customer',
        method: 'Transfer',
        time: 'Today',
        amount: '₦18,500',
      },
      {
        receipt: 'RCP-1044',
        customer: 'Store Regular #12',
        method: 'Cash',
        time: 'Yesterday',
        amount: '₦27,400',
      },
      {
        receipt: 'RCP-1041',
        customer: 'Wholesale Buyer #04',
        method: 'Transfer',
        time: '2d ago',
        amount: '₦145,000',
      },
      {
        receipt: 'RCP-1039',
        customer: 'Walk-in Customer',
        method: 'POS Card',
        time: '3d ago',
        amount: '₦15,800',
      },
    ],
    lowStockAlerts: [
      { item: 'Golden Morn Cereal 900g', sku: 'PRV-204', remaining: 3, reorderLevel: 12 },
      { item: 'Paracetamol 500mg Strip', sku: 'PHM-118', remaining: 5, reorderLevel: 20 },
      { item: 'Detergent Powder 1kg', sku: 'HHD-089', remaining: 4, reorderLevel: 15 },
    ],
  },
  '90d': {
    label: 'This Quarter',
    totalSales: '₦5,640,200',
    totalExpenses: '₦1,390,000',
    netProfit: '₦4,250,200',
    stockValue: '₦2,120,000',
    chartPoints: [40, 49, 57, 64, 70, 84, 94],
    chartLabels: ['M1', 'M1 Mid', 'M2', 'M2 Mid', 'M3', 'M3 Mid', 'Now'],
    topProducts: [
      {
        name: 'Instant Noodles (Carton)',
        category: 'Provisions',
        units: 280,
        revenue: '₦1,540,000',
        pct: 96,
      },
      {
        name: 'Long Grain Rice 50kg',
        category: 'Staples',
        units: 19,
        revenue: '₦1,235,000',
        pct: 80,
      },
      {
        name: 'Vegetable Cooking Oil 5L',
        category: 'Groceries',
        units: 138,
        revenue: '₦1,104,000',
        pct: 71,
      },
      { name: 'Soft Drink Crate', category: 'Beverages', units: 175, revenue: '₦700,000', pct: 49 },
    ],
    recentTransactions: [
      {
        receipt: 'RCP-1048',
        customer: 'Walk-in Customer',
        method: 'Transfer',
        time: 'Today',
        amount: '₦18,500',
      },
      {
        receipt: 'RCP-1045',
        customer: 'Wholesale Buyer #04',
        method: 'Transfer',
        time: 'Today',
        amount: '₦85,000',
      },
      {
        receipt: 'RCP-1031',
        customer: 'Regional Distributor',
        method: 'Transfer',
        time: 'This week',
        amount: '₦210,000',
      },
      {
        receipt: 'RCP-1028',
        customer: 'Walk-in Customer',
        method: 'POS Card',
        time: 'This week',
        amount: '₦31,500',
      },
    ],
    lowStockAlerts: [
      { item: 'Golden Morn Cereal 900g', sku: 'PRV-204', remaining: 3, reorderLevel: 12 },
      { item: 'Paracetamol 500mg Strip', sku: 'PHM-118', remaining: 5, reorderLevel: 20 },
      { item: 'Detergent Powder 1kg', sku: 'HHD-089', remaining: 4, reorderLevel: 15 },
    ],
  },
};

function buildChartSvgPaths(values: number[]) {
  const width = 560;
  const height = 180;
  const padX = 24;
  const padTop = 18;
  const padBottom = 26;
  const usableW = width - padX * 2;
  const usableH = height - padTop - padBottom;

  const coords = values.map((val, idx) => {
    const x = padX + (idx / (values.length - 1)) * usableW;
    const y = padTop + usableH - (val / 100) * usableH;
    return { x, y };
  });

  const linePath = coords
    .map((pt, idx) => `${idx === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
    .join(' ');
  const first = coords[0];
  const last = coords[coords.length - 1];
  const areaPath =
    first && last
      ? `${linePath} L ${last.x.toFixed(1)} ${(height - padBottom).toFixed(1)} L ${first.x.toFixed(1)} ${(height - padBottom).toFixed(1)} Z`
      : '';

  return { coords, linePath, areaPath, width, height, padBottom };
}

export function DashboardPreviewSection() {
  const { session } = useAuth();
  const [period, setPeriod] = useState<PreviewPeriod>('7d');
  const data = DEMO_DATASETS[period];
  const chart = buildChartSvgPaths(data.chartPoints);

  return (
    <section
      id="product-preview"
      className="scroll-mt-20 border-y border-[#EAECF0] bg-white py-20 sm:py-24"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
            Product Preview
          </p>
          <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
            Everything You Need in One Dashboard
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#4B5565]">
            Monitor daily sales, expenses, real net profit, stock value, and urgent restock alerts
            from one clear business workspace.
          </p>
        </div>

        {/* Explicit Demonstration Data Disclosure */}
        <div className="mx-auto mt-6 flex max-w-2xl items-center justify-center gap-2 rounded-xl border border-[#F5DADA] bg-[#FFF5F5] px-4 py-2.5 text-center text-xs font-medium text-[#7F1D1D]">
          <Info className="h-4 w-4 shrink-0 text-[#D90000]" aria-hidden="true" />
          <span>
            Illustrative demonstration data — all figures, products, and transactions below are
            sample data shown to preview the interface.
          </span>
        </div>

        {/* Interactive Dashboard Preview Frame */}
        <div className="mt-8 overflow-hidden rounded-2xl border border-[#E2E6EE] bg-[#F8F8FA] shadow-[0_20px_50px_-24px_rgba(21,27,43,0.18)]">
          {/* Simulated App Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E2E6EE] bg-white px-5 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#D90000] text-sm font-extrabold text-white">
                F
              </span>
              <div>
                <p className="text-sm font-bold text-[#151B2B]">
                  Sample Retail Store — Operations Overview
                </p>
                <p className="text-xs text-[#64748B]">Demo Workspace · NGN (₦)</p>
              </div>
            </div>

            {/* Period Switcher */}
            <div
              className="inline-flex rounded-lg border border-[#E2E6EE] bg-[#F8F8FA] p-1"
              role="group"
              aria-label="Preview reporting timeframe"
            >
              {(
                [
                  ['7d', '7 Days'],
                  ['30d', '30 Days'],
                  ['90d', 'Quarter'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setPeriod(key)}
                  aria-pressed={period === key}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    period === key
                      ? 'bg-[#D90000] text-white shadow-2xs'
                      : 'text-[#4B5565] hover:text-[#151B2B]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Dashboard Body */}
          <div className="space-y-6 p-5 sm:p-6">
            {/* 4 KPI Cards */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-[#E6E8EE] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Total Sales
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#FFF1F1] text-[#D90000]">
                    <ShoppingBag className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-3 font-mono-tabular text-2xl font-bold text-[#151B2B]">
                  {data.totalSales}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">{data.label} · Sample</p>
              </div>

              <div className="rounded-xl border border-[#E6E8EE] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Total Expenses
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-3 font-mono-tabular text-2xl font-bold text-[#151B2B]">
                  {data.totalExpenses}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">Operating &amp; restock costs</p>
              </div>

              <div className="rounded-xl border border-[#E6E8EE] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Net Profit
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <TrendingUp className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-3 font-mono-tabular text-2xl font-bold text-emerald-700">
                  {data.netProfit}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">Sales minus expenses</p>
              </div>

              <div className="rounded-xl border border-[#E6E8EE] bg-white p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                    Stock Value
                  </span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                    <Boxes className="h-4 w-4" aria-hidden="true" />
                  </span>
                </div>
                <p className="mt-3 font-mono-tabular text-2xl font-bold text-[#151B2B]">
                  {data.stockValue}
                </p>
                <p className="mt-1 text-xs text-[#64748B]">Current inventory valuation</p>
              </div>
            </div>

            {/* Middle Row: Sales Overview Chart + Top-Selling Products */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Sales Overview Chart */}
              <div className="rounded-xl border border-[#E6E8EE] bg-white p-5 lg:col-span-7">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#151B2B]">Sales Overview Chart</h3>
                    <p className="text-xs text-[#64748B]">
                      Illustrative revenue trend ({data.label})
                    </p>
                  </div>
                  <span className="rounded-md bg-[#FFF1F1] px-2.5 py-1 text-xs font-semibold text-[#D90000]">
                    Sample Data
                  </span>
                </div>

                <div className="mt-4">
                  <svg
                    viewBox={`0 0 ${chart.width} ${chart.height}`}
                    className="h-48 w-full"
                    role="img"
                    aria-label={`Illustrative sales overview chart for ${data.label}`}
                  >
                    <defs>
                      <linearGradient id="previewChartFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#D90000" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="#D90000" stopOpacity="0.01" />
                      </linearGradient>
                    </defs>
                    {[36, 76, 116, 154].map((y) => (
                      <line
                        key={y}
                        x1="20"
                        y1={y}
                        x2={chart.width - 20}
                        y2={y}
                        stroke="#E2E8F0"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                    ))}
                    <path d={chart.areaPath} fill="url(#previewChartFill)" />
                    <path
                      d={chart.linePath}
                      fill="none"
                      stroke="#D90000"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    {chart.coords.map((pt, idx) => (
                      <g key={data.chartLabels[idx]}>
                        <circle
                          cx={pt.x}
                          cy={pt.y}
                          r="4.5"
                          fill="#FFFFFF"
                          stroke="#D90000"
                          strokeWidth="2.5"
                        />
                        <text
                          x={pt.x}
                          y={chart.height - 6}
                          textAnchor="middle"
                          fontSize="11"
                          fill="#64748B"
                        >
                          {data.chartLabels[idx]}
                        </text>
                      </g>
                    ))}
                  </svg>
                </div>
              </div>

              {/* Top-Selling Products */}
              <div className="rounded-xl border border-[#E6E8EE] bg-white p-5 lg:col-span-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-[#151B2B]">Top-Selling Products</h3>
                    <p className="text-xs text-[#64748B]">Fastest-moving items by sales</p>
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  {data.topProducts.map((product) => (
                    <div key={product.name}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#151B2B]">{product.name}</p>
                          <p className="text-xs text-[#64748B]">
                            {product.category} · {product.units} units sold
                          </p>
                        </div>
                        <span className="shrink-0 font-mono-tabular text-sm font-bold text-[#151B2B]">
                          {product.revenue}
                        </span>
                      </div>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[#F1F5F9]">
                        <div
                          className="h-full rounded-full bg-[#D90000] transition-all duration-300"
                          style={{ width: `${product.pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bottom Row: Recent Transactions + Low-Stock Alerts */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Recent Transactions */}
              <div className="rounded-xl border border-[#E6E8EE] bg-white p-5 lg:col-span-7">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-[#D90000]" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-[#151B2B]">Recent Transactions</h3>
                  </div>
                  <span className="text-xs text-[#64748B]">Sample Receipts</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[440px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-[#EAECF0] text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                        <th className="pb-2.5">Receipt</th>
                        <th className="pb-2.5">Customer</th>
                        <th className="pb-2.5">Payment</th>
                        <th className="pb-2.5 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#F1F5F9]">
                      {data.recentTransactions.map((tx) => (
                        <tr key={tx.receipt} className="text-sm">
                          <td className="py-2.5 font-mono-tabular text-xs font-semibold text-[#151B2B]">
                            {tx.receipt}
                          </td>
                          <td className="py-2.5 text-[#334155]">
                            <div>{tx.customer}</div>
                            <div className="text-xs text-[#64748B]">{tx.time}</div>
                          </td>
                          <td className="py-2.5">
                            <span className="inline-flex rounded-md bg-[#F8F8FA] px-2 py-0.5 text-xs font-medium text-[#334155] ring-1 ring-[#E2E8F0]">
                              {tx.method}
                            </span>
                          </td>
                          <td className="py-2.5 text-right font-mono-tabular font-bold text-[#151B2B]">
                            {tx.amount}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Low-Stock Alerts */}
              <div className="rounded-xl border border-[#E6E8EE] bg-white p-5 lg:col-span-5">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-[#151B2B]">Low-Stock Alerts</h3>
                  </div>
                  <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    3 Attention Needed
                  </span>
                </div>
                <div className="space-y-3">
                  {data.lowStockAlerts.map((alert) => (
                    <div
                      key={alert.sku}
                      className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-amber-50/50 px-3.5 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#151B2B]">
                          {alert.item}
                        </p>
                        <p className="font-mono-tabular text-xs text-[#64748B]">
                          SKU {alert.sku} · Min threshold: {alert.reorderLevel}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-md bg-[#D90000] px-2.5 py-1 font-mono-tabular text-xs font-bold text-white">
                        {alert.remaining} left
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Explore CTA */}
        <div className="mt-10 text-center">
          <Link
            to={session ? '/app/dashboard' : '/register'}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D90000] px-7 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#B30000]"
          >
            Explore the Platform
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
