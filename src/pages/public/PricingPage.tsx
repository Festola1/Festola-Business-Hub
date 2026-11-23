import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { ArrowRight, Check, CheckCircle2, ChevronDown, Tag } from 'lucide-react';
import { FAQ_ITEMS } from '../../components/marketing/marketing-data';
import {
  formatNairaCompact,
  PUBLIC_PRICING_PLANS,
  type BillingCycle,
} from '../../components/marketing/pricing-catalog';
import { PublicFooter } from '../../components/marketing/PublicFooter';
import { PublicNavbar } from '../../components/marketing/PublicNavbar';

const PLAN_COMPARISON_ROWS = [
  {
    capability: 'Point of Sale (Cash, Card, Transfer, Credit)',
    starter: 'Included',
    business: 'Included',
    premium: 'Included',
  },
  {
    capability: 'Product Catalog & Stock Tracking',
    starter: 'Up to 300 products',
    business: 'Up to 2,000 products',
    premium: 'Up to 10,000 products',
  },
  {
    capability: 'Staff Accounts & Role Permissions',
    starter: '1 Owner + 1 Staff',
    business: 'Up to 10 Staff',
    premium: 'Up to 30 Staff',
  },
  {
    capability: 'Offline Counter Access & Auto-Sync',
    starter: '1 Offline Device',
    business: 'Up to 5 Offline Devices',
    premium: 'Up to 15 Offline Devices',
  },
  {
    capability: 'Customer Debt & Aging Ledger',
    starter: 'Included',
    business: 'Included',
    premium: 'Included',
  },
  {
    capability: 'Expense Tracking & Net Profit Reports',
    starter: 'Core Summaries',
    business: 'Full P&L + Exports',
    premium: 'Advanced + Multi-Branch',
  },
  {
    capability: 'Multi-Location Management',
    starter: 'Single Store',
    business: 'Single Store + Warehouse',
    premium: 'Multi-Location Ready',
  },
] as const;

export default function PricingPage() {
  const location = useLocation();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  useEffect(() => {
    if (!location.hash) return;
    const target = document.getElementById(location.hash.replace('#', ''));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#F8F8FA] text-[#151B2B]">
      <PublicNavbar />

      <main>
        {/* Hero Banner + Billing Toggle */}
        <section className="border-b border-[#EAECF0] bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF1F1] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#D90000]">
              <Tag className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Subscription Plans</span>
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-5xl">
              Simple and <span className="text-[#D90000]">Affordable Pricing</span>
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[#4B5565] sm:text-lg">
              Transparent Naira plans built to fit your stage of business. Start free and upgrade
              anytime without losing your sales, stock, or customer history.
            </p>

            {/* Billing Cycle Toggle */}
            <div className="mt-8 inline-flex items-center rounded-xl border border-[#E5E7EB] bg-[#F8F8FA] p-1">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                aria-pressed={billingCycle === 'monthly'}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  billingCycle === 'monthly'
                    ? 'bg-[#D90000] text-white shadow-2xs'
                    : 'text-[#4B5565] hover:text-[#151B2B]'
                }`}
              >
                Monthly Billing
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                aria-pressed={billingCycle === 'annual'}
                className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                  billingCycle === 'annual'
                    ? 'bg-[#D90000] text-white shadow-2xs'
                    : 'text-[#4B5565] hover:text-[#151B2B]'
                }`}
              >
                <span>Annual Billing</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    billingCycle === 'annual'
                      ? 'bg-white/20 text-white'
                      : 'bg-[#FFF1F1] text-[#D90000]'
                  }`}
                >
                  2 Months Free
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-stretch">
              {PUBLIC_PRICING_PLANS.map((plan) => {
                const isBusiness = Boolean(plan.highlighted);
                const displayedPrice =
                  billingCycle === 'monthly'
                    ? formatNairaCompact(plan.monthlyPriceNgn)
                    : formatNairaCompact(plan.annualPriceNgn);
                const periodUnit = billingCycle === 'monthly' ? '/month' : '/year';
                const monthlyEquivalent = Math.round(plan.annualPriceNgn / 12);

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-2xl p-7 transition-all ${
                      isBusiness
                        ? 'border-2 border-[#D90000] bg-white shadow-[0_24px_50px_-18px_rgba(217,0,0,0.22)] lg:-translate-y-2'
                        : 'border border-[#E5E7EB] bg-white shadow-2xs hover:border-[#D90000]/35'
                    }`}
                  >
                    {plan.badgeText && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#D90000] px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
                        {plan.badgeText}
                      </span>
                    )}

                    <div>
                      <h2 className="text-lg font-extrabold uppercase tracking-wide text-[#151B2B]">
                        {plan.name}
                      </h2>
                      <p className="mt-2 text-xs font-semibold text-[#D90000]">
                        {plan.suitableFor}
                      </p>

                      <div className="mt-5 flex items-baseline gap-1">
                        <span className="font-mono-tabular text-4xl font-extrabold tracking-tight text-[#151B2B]">
                          {displayedPrice}
                        </span>
                        <span className="text-sm font-medium text-[#64748B]">{periodUnit}</span>
                      </div>

                      {billingCycle === 'annual' ? (
                        <p className="mt-1 text-xs font-medium text-emerald-700">
                          Equivalent to {formatNairaCompact(monthlyEquivalent)}/month billed
                          annually
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-[#64748B]">
                          Or {formatNairaCompact(plan.annualPriceNgn)}/year with annual billing
                        </p>
                      )}

                      <p className="mt-4 text-sm leading-relaxed text-[#4B5565]">{plan.summary}</p>
                    </div>

                    <ul className="mt-6 flex-1 space-y-3 border-t border-[#EAECF0] pt-6">
                      {plan.features.map((feature) => (
                        <li
                          key={feature}
                          className="flex items-start gap-2.5 text-sm text-[#151B2B]"
                        >
                          <CheckCircle2
                            className="mt-0.5 h-4 w-4 shrink-0 text-[#D90000]"
                            aria-hidden="true"
                          />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Link
                      to={`/register?plan=${plan.code}&billing=${billingCycle}`}
                      className={`mt-8 inline-flex h-12 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold transition-colors ${
                        isBusiness
                          ? 'bg-[#D90000] text-white shadow-md shadow-[#D90000]/20 hover:bg-[#B30000]'
                          : 'border border-[#D90000] bg-white text-[#D90000] hover:bg-[#D90000] hover:text-white'
                      }`}
                    >
                      {plan.ctaLabel}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                );
              })}
            </div>

            <p className="mt-8 text-center text-xs text-[#64748B]">
              Final plan entitlements and active billing terms are loaded directly from your
              workspace subscription settings when activating a paid plan.
            </p>
          </div>
        </section>

        {/* Feature Comparison Matrix */}
        <section className="border-t border-[#EAECF0] bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Compare Plans
              </p>
              <h2 className="mt-2.5 text-2xl font-extrabold tracking-tight text-[#151B2B] sm:text-3xl">
                Plan Limits &amp; Capabilities at a Glance
              </h2>
            </div>

            <div className="mt-10 overflow-x-auto rounded-2xl border border-[#EAECF0] bg-white shadow-2xs">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-[#EAECF0] bg-[#F8F8FA] text-xs font-bold uppercase tracking-wide text-[#4B5565]">
                  <tr>
                    <th className="px-6 py-4">Capability</th>
                    <th className="px-5 py-4 text-center">Starter</th>
                    <th className="bg-[#FFF5F5] px-5 py-4 text-center text-[#D90000]">Business</th>
                    <th className="px-5 py-4 text-center">Premium</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F1F5F9]">
                  {PLAN_COMPARISON_ROWS.map((row) => (
                    <tr key={row.capability} className="hover:bg-[#F8F8FA]/60">
                      <td className="px-6 py-4 font-semibold text-[#151B2B]">{row.capability}</td>
                      <td className="px-5 py-4 text-center text-xs font-medium text-[#4B5565]">
                        {row.starter === 'Included' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Check className="h-4 w-4" aria-hidden="true" /> Included
                          </span>
                        ) : (
                          row.starter
                        )}
                      </td>
                      <td className="bg-[#FFF9F9] px-5 py-4 text-center text-xs font-semibold text-[#151B2B]">
                        {row.business === 'Included' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Check className="h-4 w-4" aria-hidden="true" /> Included
                          </span>
                        ) : (
                          row.business
                        )}
                      </td>
                      <td className="px-5 py-4 text-center text-xs font-medium text-[#4B5565]">
                        {row.premium === 'Included' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700">
                            <Check className="h-4 w-4" aria-hidden="true" /> Included
                          </span>
                        ) : (
                          row.premium
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQs */}
        <section
          id="faq"
          className="scroll-mt-20 border-t border-[#EAECF0] bg-[#F8F8FA] py-16 sm:py-20"
        >
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Common Questions
              </p>
              <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
                Frequently Asked Questions
              </h2>
            </div>

            <div className="mt-10 divide-y divide-[#EAECF0] overflow-hidden rounded-2xl border border-[#EAECF0] bg-white">
              {FAQ_ITEMS.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                const panelId = `pricing-faq-panel-${idx}`;
                const buttonId = `pricing-faq-button-${idx}`;

                return (
                  <div key={faq.question}>
                    <h3>
                      <button
                        id={buttonId}
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={panelId}
                        onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                        className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-[#FFF9F9]"
                      >
                        <span className="text-sm font-bold text-[#151B2B] sm:text-base">
                          {faq.question}
                        </span>
                        <ChevronDown
                          className={`h-5 w-5 shrink-0 text-[#D90000] transition-transform duration-200 ${
                            isOpen ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        />
                      </button>
                    </h3>
                    {isOpen && (
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={buttonId}
                        className="px-6 pb-5 pt-0 text-sm leading-relaxed text-[#4B5565]"
                      >
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
