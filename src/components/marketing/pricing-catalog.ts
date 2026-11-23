export type BillingCycle = 'monthly' | 'annual';

/**
 * Structured pricing catalog designed to mirror future `/api/v1/plans`
 * subscription database records without hardcoding unverified backend
 * entitlement keys.
 */
export interface PublicPricingPlan {
  id: 'starter' | 'business' | 'premium';
  code: string;
  name: string;
  currency: 'NGN';
  monthlyPriceNgn: number;
  /** Annual total billed upfront (2 months free compared to monthly billing) */
  annualPriceNgn: number;
  highlighted?: boolean;
  badgeText?: string;
  suitableFor: string;
  summary: string;
  features: string[];
  ctaLabel: string;
}

export const PUBLIC_PRICING_PLANS: readonly PublicPricingPlan[] = [
  {
    id: 'starter',
    code: 'starter',
    name: 'Starter',
    currency: 'NGN',
    monthlyPriceNgn: 3000,
    annualPriceNgn: 30000,
    suitableFor: 'Ideal for solo shop owners, kiosks, and small retail counters',
    summary:
      'Essential point of sale, stock tracking, and daily profit visibility for getting organised.',
    features: [
      'Point of Sale (POS) & fast checkout',
      'Product catalogue & stock tracking',
      'Digital receipts & sales history',
      'Expense tracking & daily profit summary',
      'Offline sales recording & automatic sync',
      'Customer directory & basic credit records',
    ],
    ctaLabel: 'Get Started',
  },
  {
    id: 'business',
    code: 'business',
    name: 'Business',
    currency: 'NGN',
    monthlyPriceNgn: 6000,
    annualPriceNgn: 60000,
    highlighted: true,
    badgeText: 'Most Popular',
    suitableFor: 'Ideal for growing shops, pharmacies, boutiques, and staff-run stores',
    summary:
      'Complete operational control for busy shops managing staff, suppliers, and customer credit.',
    features: [
      'Everything in Starter',
      'Staff accounts with role-based permissions',
      'Supplier records & stock replenishment tracking',
      'Customer debt & credit payment control',
      'Financial reports & profit margin insights',
      'Low-stock alerts & printable invoices',
    ],
    ctaLabel: 'Get Started',
  },
  {
    id: 'premium',
    code: 'premium',
    name: 'Premium',
    currency: 'NGN',
    monthlyPriceNgn: 10000,
    annualPriceNgn: 100000,
    suitableFor: 'Ideal for supermarkets, wholesalers, and multi-location operations',
    summary:
      'Advanced visibility and control for expanding businesses operating across branches and teams.',
    features: [
      'Everything in Business',
      'Multi-location management & branch reporting',
      'Expanded staff & device access management',
      'Smart business insights & performance trends',
      'Comprehensive audit trail for sensitive actions',
      'Priority onboarding & dedicated support channel',
    ],
    ctaLabel: 'Get Started',
  },
] as const;

export function formatNairaCompact(amountNgn: number): string {
  return `₦${amountNgn.toLocaleString('en-NG')}`;
}
