import {
  BarChart3,
  Boxes,
  Building2,
  CreditCard,
  FileText,
  Globe,
  Laptop,
  Lightbulb,
  Pill,
  Receipt,
  ShieldCheck,
  Shirt,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Truck,
  UserCheck,
  Users,
  Utensils,
  Wallet,
  WifiOff,
  Zap,
  type LucideIcon,
} from 'lucide-react';

export type FeatureCategory =
  'all' | 'sales-pos' | 'inventory' | 'customers-credit' | 'finance-team';

export interface FeatureItem {
  title: string;
  description: string;
  highlights: readonly string[];
  category: Exclude<FeatureCategory, 'all'>;
  icon: LucideIcon;
  accent: string;
}

export const TRUST_BENEFITS = [
  {
    title: 'Secure & Reliable',
    description: 'Your business data is protected.',
    icon: ShieldCheck,
  },
  {
    title: 'Works Offline',
    description: 'Keep working even without internet access.',
    icon: WifiOff,
  },
  {
    title: 'Easy to Use',
    description: 'Manage your business without unnecessary complexity.',
    icon: Zap,
  },
  {
    title: 'Affordable Plans',
    description: 'Choose a plan that fits your business.',
    icon: Tag,
  },
] as const;

export const FEATURE_CARDS: readonly FeatureItem[] = [
  {
    title: 'Point of Sale (POS)',
    description:
      'Process counter checkouts quickly with support for Cash, POS Card, and Bank Transfer payments.',
    highlights: [
      'Split and multi-method tender recording',
      'Instant item search & barcode scanning',
      'Works seamlessly offline at the counter',
    ],
    category: 'sales-pos',
    icon: ShoppingCart,
    accent: 'bg-[#FFF1F1] text-[#D90000]',
  },
  {
    title: 'Inventory Management',
    description:
      'Track stock levels automatically as you sell, receive restocks, and get alerts before items run out.',
    highlights: [
      'Automatic stock deduction on every sale',
      'Reorder threshold alerts & stock valuation',
      'Weighted average cost (WAC) tracking',
    ],
    category: 'inventory',
    icon: Boxes,
    accent: 'bg-emerald-50 text-emerald-700',
  },
  {
    title: 'Sales Management',
    description:
      'Review daily sales logs, monitor payment splits, and keep an accurate record of every completed order.',
    highlights: [
      'Searchable order history by receipt number',
      'Audit-logged voiding with stock restoration',
      'Daily payment method breakdowns',
    ],
    category: 'sales-pos',
    icon: Receipt,
    accent: 'bg-blue-50 text-blue-700',
  },
  {
    title: 'Financial Reports',
    description:
      'See your revenue, total expenses, and true net profit clearly across daily, weekly, and monthly periods.',
    highlights: [
      'Revenue, COGS, expense, and net profit views',
      'Top-selling products & daily sales trends',
      'Exportable summaries for business reviews',
    ],
    category: 'finance-team',
    icon: BarChart3,
    accent: 'bg-indigo-50 text-indigo-700',
  },
  {
    title: 'Customer Management',
    description:
      'Build a reliable customer directory with purchase histories so you can serve repeat buyers better.',
    highlights: [
      'Centralised phone, address, and spend history',
      'Configurable credit limits per customer',
      'Fast customer lookup right at checkout',
    ],
    category: 'customers-credit',
    icon: Users,
    accent: 'bg-amber-50 text-amber-700',
  },
  {
    title: 'Supplier Management',
    description:
      'Keep supplier contacts, purchase records, and restock costs organised in one central workspace.',
    highlights: [
      'Wholesaler & distributor directory per store',
      'Linked restock batches and purchase costs',
      'Supplier payment and balance tracking',
    ],
    category: 'inventory',
    icon: Truck,
    accent: 'bg-teal-50 text-teal-700',
  },
  {
    title: 'Debt & Credit Control',
    description:
      'Record credit sales, track partial repayments, and monitor outstanding customer balances with clarity.',
    highlights: [
      'Aging buckets (0–30, 31–60, 61–90, 90+ days)',
      'Overpayment guards & verified repayment receipts',
      'Ready-to-send WhatsApp/SMS payment reminders',
    ],
    category: 'customers-credit',
    icon: CreditCard,
    accent: 'bg-rose-50 text-rose-700',
  },
  {
    title: 'Expense Tracking',
    description:
      'Log rent, fuel, logistics, utilities, and daily store expenses so profit figures stay honest.',
    highlights: [
      'Pre-built Nigerian SME expense categories',
      'Monthly category totals & audit trails',
      'Direct integration into net profit reports',
    ],
    category: 'finance-team',
    icon: Wallet,
    accent: 'bg-orange-50 text-orange-700',
  },
  {
    title: 'Receipt & Invoice Generation',
    description:
      'Generate crisp digital and printable receipts or customer invoices immediately after every transaction.',
    highlights: [
      'Immutable numbered sales & debt receipts',
      'Thermal/A4 print layout support',
      'One-tap WhatsApp receipt sharing',
    ],
    category: 'sales-pos',
    icon: FileText,
    accent: 'bg-sky-50 text-sky-700',
  },
  {
    title: 'Staff Management',
    description:
      'Invite cashiers and managers with role-based permissions and audit visibility across your store.',
    highlights: [
      'Owner, Manager, and Cashier role boundaries',
      'Protect profit margins & cost prices from cashiers',
      'Full activity audit log for sensitive actions',
    ],
    category: 'finance-team',
    icon: UserCheck,
    accent: 'bg-violet-50 text-violet-700',
  },
  {
    title: 'Multi-Location Management',
    description:
      'Oversee stock, staff, and sales performance across multiple branches from a single owner account.',
    highlights: [
      'Switch between authorized businesses seamlessly',
      'Strict tenant data isolation per business',
      'Branch-level reporting and operational control',
    ],
    category: 'inventory',
    icon: Building2,
    accent: 'bg-cyan-50 text-cyan-700',
  },
  {
    title: 'Smart Business Insights',
    description:
      'Spot top-selling products, slow-moving stock, and profit trends to make confident daily decisions.',
    highlights: [
      'Interactive sales trend charts (7D–12M)',
      'Low-stock restock priority indicators',
      'Real-time margin and cash collection metrics',
    ],
    category: 'finance-team',
    icon: Lightbulb,
    accent: 'bg-yellow-50 text-yellow-700',
  },
];

export const HOW_IT_WORKS_STEPS = [
  {
    number: '01',
    title: 'Create Your Account',
    description: 'Register and set up your business.',
    detail:
      'Sign up in minutes, enter your store details, configure Naira pricing, and add your initial products.',
    checklist: [
      'Create your owner account with email verification',
      'Configure business name, branch location, and currency (₦)',
      'Add your opening products, cost prices, and reorder alerts',
    ],
  },
  {
    number: '02',
    title: 'Manage Your Business',
    description: 'Record sales, track inventory, manage expenses and monitor customers.',
    detail:
      'Run daily counter operations online or offline while stock quantities and customer balances stay organised.',
    checklist: [
      'Record Cash, POS Card, Transfer, or Credit sales from any device',
      'Log supplier restocks and daily operating expenses cleanly',
      'Issue digital receipts and collect customer credit repayments',
    ],
  },
  {
    number: '03',
    title: 'Track Your Growth',
    description: 'View reports, monitor profits and make better business decisions.',
    detail:
      'Review clear profit summaries, identify top-selling items, and expand confidently across staff and locations.',
    checklist: [
      'Monitor true net profit after stock cost and operating expenses',
      'Review debtor aging reports and best-performing products',
      'Invite cashiers and managers with role-based permissions',
    ],
  },
] as const;

export const SUPPORTED_INDUSTRIES = [
  {
    name: 'Supermarkets',
    description: 'High-volume checkout, barcode speed, and aisle-by-aisle stock control.',
    icon: ShoppingCart,
  },
  {
    name: 'Provision Stores',
    description: 'Fast daily sales, pack-to-unit stock tracking, and cashbook clarity.',
    icon: Store,
  },
  {
    name: 'Pharmacies',
    description: 'Organised medicine inventory, low-stock alerts, and receipt history.',
    icon: Pill,
  },
  {
    name: 'Fashion and Clothing Stores',
    description: 'Manage seasonal styles, customer orders, and daily margin reports.',
    icon: Shirt,
  },
  {
    name: 'Cosmetics Shops',
    description: 'Track fast-moving beauty products, suppliers, and repeat customer purchases.',
    icon: Sparkles,
  },
  {
    name: 'Electronics Dealers',
    description: 'Issue clean invoices, manage high-value items, and monitor credit balances.',
    icon: Laptop,
  },
  {
    name: 'Restaurants',
    description: 'Speed up counter billing, log ingredient expenses, and watch daily profit.',
    icon: Utensils,
  },
  {
    name: 'Wholesale and Distribution Businesses',
    description: 'Handle bulk orders, customer credit limits, and multi-branch stock.',
    icon: Truck,
  },
  {
    name: 'Online Vendors',
    description: 'Keep inventory accurate, send digital receipts, and track delivery expenses.',
    icon: Globe,
  },
] as const;

export const FAQ_ITEMS = [
  {
    question: 'What is Festola Business Hub?',
    answer:
      'Festola Business Hub is an all-in-one business management and Point of Sale (POS) SaaS platform built for Nigerian SMEs and growing businesses across Africa. It brings sales recording, inventory control, customer credit tracking, expense management, receipts, staff permissions, and profit reporting into one workspace.',
  },
  {
    question: 'Can I use it on my phone?',
    answer:
      'Yes. Festola Business Hub is delivered as a responsive Progressive Web Application (PWA) that runs smoothly on Web browsers, Android phones, iPhones, tablets, and desktop computers—and you can install it directly to your home screen.',
  },
  {
    question: 'Can I manage my inventory?',
    answer:
      'Yes. You can add products with cost and selling prices, receive stock, record stock adjustments, view total stock value, and receive low-stock alerts automatically as sales are recorded.',
  },
  {
    question: 'Can I record sales without internet access?',
    answer:
      'Yes. Festola Business Hub is designed with offline support so your counter can continue recording sales even when internet connectivity drops. Queued transactions sync automatically once your connection returns.',
  },
  {
    question: 'Can I track customer debts?',
    answer:
      'Yes. You can link credit sales to customer profiles, record partial or full repayments over time, and review outstanding customer balances from your Customer Management ledger.',
  },
  {
    question: 'Can I generate receipts?',
    answer:
      'Yes. Every completed transaction generates a clear digital receipt with itemised totals and payment details that you can print or share with customers immediately.',
  },
  {
    question: 'Can I monitor my business profit?',
    answer:
      'Yes. By recording your product costs, sales revenue, and daily operating expenses in Festola Business Hub, your dashboard and financial reports calculate your net profit clearly.',
  },
  {
    question: 'Does it support multiple staff members?',
    answer:
      'Yes. Business owners can invite staff members and assign appropriate roles and permissions—such as Cashier, Manager, or Owner—so each team member only accesses what they need.',
  },
  {
    question: 'How do I subscribe?',
    answer:
      'Create your free account, set up your business profile, and select your preferred plan (Starter, Business, or Premium) from the Subscription section inside your workspace when you are ready to subscribe.',
  },
  {
    question: 'Can I upgrade or downgrade my subscription?',
    answer:
      'Yes. As your business grows or your operational needs change, you can switch between Starter, Business, and Premium plans from your account subscription settings without losing your business records.',
  },
] as const;
