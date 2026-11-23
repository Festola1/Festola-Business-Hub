import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  Play,
  ShieldCheck,
  ShoppingBag,
} from 'lucide-react';
import { DashboardPreviewSection } from '../components/marketing/DashboardPreviewSection';
import { DemoPreviewModal } from '../components/marketing/DemoPreviewModal';
import { HeroBackgroundLayer, HeroMobilePhoto } from '../components/marketing/HeroProductShowcase';
import {
  FAQ_ITEMS,
  FEATURE_CARDS,
  HOW_IT_WORKS_STEPS,
  SUPPORTED_INDUSTRIES,
  TRUST_BENEFITS,
} from '../components/marketing/marketing-data';
import { PublicFooter } from '../components/marketing/PublicFooter';
import { PublicNavbar } from '../components/marketing/PublicNavbar';
import {
  formatNairaCompact,
  PUBLIC_PRICING_PLANS,
  type BillingCycle,
} from '../components/marketing/pricing-catalog';

const HERO_BENEFITS = [
  'POS & Sales Management',
  'Inventory Control',
  'Financial Reports',
  'Customer & Supplier Management',
  'Offline Access',
  'Affordable Subscription Plans',
] as const;

const TESTIMONIAL_PLACEHOLDERS = [
  {
    slot: 'Placeholder Slot 01',
    focus: 'Daily Profit & Cashbook Clarity',
    placeholderQuote:
      'Placeholder for verified merchant feedback: How a retail shop owner replaced paper notebooks with accurate daily sales, expense, and net profit tracking.',
    attribution: 'Verified Business Owner — Coming Soon',
    businessType: 'Retail / Provision Store (Placeholder)',
  },
  {
    slot: 'Placeholder Slot 02',
    focus: 'Uninterrupted Offline Sales',
    placeholderQuote:
      'Placeholder for verified merchant feedback: How a busy counter team continued issuing receipts during network downtime and synced automatically once back online.',
    attribution: 'Verified Business Owner — Coming Soon',
    businessType: 'Supermarket / Pharmacy (Placeholder)',
  },
  {
    slot: 'Placeholder Slot 03',
    focus: 'Stock Control & Staff Accountability',
    placeholderQuote:
      'Placeholder for verified merchant feedback: How a growing multi-staff business reduced stock shortages and tracked customer credit repayments cleanly.',
    attribution: 'Verified Business Owner — Coming Soon',
    businessType: 'Wholesale / Multi-Location Store (Placeholder)',
  },
] as const;

export default function LandingPage() {
  const location = useLocation();
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);
  const [demoModalOpen, setDemoModalOpen] = useState(false);

  // Smoothly scroll to section when navigated via /#features, /#pricing, etc.
  useEffect(() => {
    if (!location.hash) return;
    const targetId = location.hash.replace('#', '');
    const element = document.getElementById(targetId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.hash]);

  return (
    <div id="top" className="min-h-screen overflow-x-clip bg-[#F8F8FA] text-[#151B2B]">
      {/* SECTION A: NAVIGATION BAR */}
      <PublicNavbar />

      <main>
        {/* SECTION B: HERO SECTION */}
        <section className="relative overflow-hidden bg-white pb-14 pt-10 sm:pb-16 sm:pt-14 lg:min-h-[640px] lg:pb-24 lg:pt-20">
          {/* Full-bleed unobstructed hero background photography on desktop */}
          <HeroBackgroundLayer />

          <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 items-center lg:grid-cols-12">
              {/* Left Column */}
              <div className="lg:col-span-7 xl:col-span-6">
                {/* Small Badge */}
                <div className="inline-flex items-center gap-2 rounded-full bg-[#D90000] px-4 py-1.5 text-xs font-semibold tracking-wide text-white shadow-xs">
                  <ShoppingBag className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>The Complete Business Management Solution</span>
                </div>

                {/* Main Headline */}
                <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-[#151B2B] sm:text-5xl lg:text-[54px] lg:leading-[1.08]">
                  <span className="text-[#D90000]">Festola</span> Business Hub
                </h1>

                {/* Supporting Headline */}
                <p className="mt-2.5 text-2xl font-bold tracking-tight text-[#151B2B] sm:text-3xl">
                  Manage. Grow. Succeed.
                </p>

                {/* Description */}
                <p className="mt-4 max-w-xl text-base leading-relaxed text-[#334155] sm:text-lg">
                  A powerful and easy-to-use platform to manage your sales, inventory, customers,
                  expenses and business finances — all in one place.
                </p>

                {/* 6 Benefits with Check Icons */}
                <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
                  {HERO_BENEFITS.map((benefit) => (
                    <li
                      key={benefit}
                      className="flex items-center gap-2.5 text-sm font-medium text-[#151B2B]"
                    >
                      <span
                        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#D90000] text-white"
                        aria-hidden="true"
                      >
                        <Check className="h-3 w-3 stroke-[3]" />
                      </span>
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>

                {/* Primary & Secondary CTA Buttons */}
                <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Link
                    to="/register"
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D90000] px-7 text-sm font-semibold text-white shadow-md shadow-[#D90000]/20 transition-all hover:bg-[#B30000] hover:shadow-lg"
                  >
                    Start Free Trial
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDemoModalOpen(true)}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#D90000] bg-white/95 px-6 text-sm font-semibold text-[#D90000] transition-colors hover:bg-[#FFF1F1]"
                  >
                    <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                    Watch Demo
                  </button>
                </div>

                {/* Honest Trust Statement (Zero fabricated counts or fake testimonials) */}
                <div className="mt-7 flex items-start gap-2.5 border-t border-[#EAECF0] pt-5 text-xs leading-relaxed text-[#475569] sm:text-sm">
                  <ShieldCheck
                    className="mt-0.5 h-5 w-5 shrink-0 text-[#D90000]"
                    aria-hidden="true"
                  />
                  <p>
                    Purpose-built for Nigerian SMEs and growing African businesses — accessible on
                    Web, Android, and iOS with offline-first counter support and secure cloud
                    storage.
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile & tablet unobstructed hero photography */}
            <HeroMobilePhoto />
          </div>
        </section>

        {/* SECTION C: TRUST AND BENEFITS BAR */}
        <section aria-label="Core platform benefits" className="bg-white pb-16 sm:pb-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-[#F4DADA] bg-[#FFF6F6] p-6 shadow-xs sm:p-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-[#F0D1D1]">
                {TRUST_BENEFITS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex items-start gap-4 lg:pl-6 lg:first:pl-0">
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#D90000] shadow-xs ring-1 ring-[#F4DADA]">
                        <Icon className="h-6 w-6" aria-hidden="true" />
                      </span>
                      <div>
                        <h2 className="text-base font-bold text-[#151B2B]">{item.title}</h2>
                        <p className="mt-1 text-sm leading-snug text-[#4B5565]">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* SECTION D: FEATURES SECTION */}
        <section id="features" className="scroll-mt-20 bg-[#F8F8FA] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Platform Capabilities
              </p>
              <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
                Powerful Features to Supercharge Your Business
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#4B5565] sm:text-lg">
                Everything you need to run a more organised and profitable business.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {FEATURE_CARDS.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="group rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-2xs transition-all duration-200 hover:-translate-y-1 hover:border-[#D90000]/35 hover:shadow-md"
                  >
                    <span
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${feature.accent}`}
                    >
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-base font-bold text-[#151B2B]">{feature.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#4B5565]">
                      {feature.description}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="mt-10 text-center">
              <Link
                to="/features"
                className="inline-flex items-center gap-2 rounded-xl border border-[#D90000] bg-white px-6 py-3 text-sm font-semibold text-[#D90000] transition-colors hover:bg-[#D90000] hover:text-white"
              >
                Explore All Features in Detail
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* SECTION E: HOW IT WORKS */}
        <section id="how-it-works" className="scroll-mt-20 bg-white py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Simple Onboarding
              </p>
              <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
                Get Started in Three Simple Steps
              </h2>
              <p className="mt-3 text-base text-[#4B5565]">
                Move from manual notebooks to organised digital operations in minutes.
              </p>
            </div>

            <div className="relative mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
              {/* Connecting line on desktop */}
              <div
                className="pointer-events-none absolute left-[16%] right-[16%] top-9 hidden h-0.5 border-t-2 border-dashed border-[#E8C5C5] md:block"
                aria-hidden="true"
              />

              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <div
                  key={step.number}
                  className="relative flex flex-col items-center rounded-2xl border border-[#EAECF0] bg-[#F8F8FA] p-7 text-center transition-colors hover:border-[#D90000]/30 hover:bg-white hover:shadow-sm"
                >
                  <span className="relative z-10 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#D90000] font-mono-tabular text-xl font-extrabold text-white shadow-md shadow-[#D90000]/20">
                    {step.number}
                  </span>
                  <span className="mt-4 text-xs font-bold uppercase tracking-wider text-[#D90000]">
                    Step {index + 1}
                  </span>
                  <h3 className="mt-1.5 text-xl font-bold text-[#151B2B]">{step.title}</h3>
                  <p className="mt-2 text-sm font-semibold text-[#151B2B]">{step.description}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#4B5565]">{step.detail}</p>
                </div>
              ))}
            </div>

            <div className="mt-10 text-center">
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#D90000] transition-colors hover:text-[#B30000]"
              >
                See Full Setup &amp; Offline Walkthrough
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* SECTION F: PRODUCT PREVIEW */}
        <DashboardPreviewSection />

        {/* SECTION G: INDUSTRIES WE SUPPORT */}
        <section className="bg-[#F8F8FA] py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Industries We Support
              </p>
              <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
                Designed for Different Types of Businesses
              </h2>
              <p className="mt-3 text-base text-[#4B5565]">
                Flexible workflows built for everyday Nigerian retail, wholesale, hospitality, and
                online commerce.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SUPPORTED_INDUSTRIES.map((industry) => {
                const Icon = industry.icon;
                return (
                  <div
                    key={industry.name}
                    className="flex items-start gap-4 rounded-2xl border border-[#E5E7EB] bg-white p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-[#D90000]/35 hover:shadow-sm"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D90000]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-[#151B2B]">{industry.name}</h3>
                      <p className="mt-1 text-sm leading-relaxed text-[#4B5565]">
                        {industry.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION H: PRICING SECTION */}
        <section
          id="pricing"
          className="scroll-mt-20 border-t border-[#EAECF0] bg-white py-20 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Subscription Plans
              </p>
              <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
                Simple and Affordable Pricing
              </h2>
              <p className="mt-3 text-base text-[#4B5565]">
                Transparent Naira plans built to fit your stage of business. Start free and upgrade
                anytime.
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

            {/* Pricing Cards Grid */}
            <div className="mt-12 grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-stretch">
              {PUBLIC_PRICING_PLANS.map((plan) => {
                const isBusiness = Boolean(plan.highlighted);
                const displayedPrice =
                  billingCycle === 'monthly'
                    ? `${formatNairaCompact(plan.monthlyPriceNgn)}`
                    : `${formatNairaCompact(plan.annualPriceNgn)}`;
                const periodUnit = billingCycle === 'monthly' ? '/month' : '/year';
                const monthlyEquivalent = Math.round(plan.annualPriceNgn / 12);

                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col rounded-2xl p-7 transition-all ${
                      isBusiness
                        ? 'border-2 border-[#D90000] bg-white shadow-[0_24px_50px_-18px_rgba(217,0,0,0.22)] lg:-translate-y-2'
                        : 'border border-[#E5E7EB] bg-[#F8F8FA]/60 shadow-2xs hover:border-[#D90000]/35 hover:bg-white'
                    }`}
                  >
                    {plan.badgeText && (
                      <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-[#D90000] px-4 py-1 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
                        {plan.badgeText}
                      </span>
                    )}

                    <div>
                      <h3 className="text-lg font-extrabold uppercase tracking-wide text-[#151B2B]">
                        {plan.name}
                      </h3>
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

            <div className="mt-8 flex flex-col items-center gap-3 text-center">
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#D90000] transition-colors hover:text-[#B30000]"
              >
                View Full Plan Comparison Matrix
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <p className="text-xs text-[#64748B]">
                Final plan entitlements and active billing terms are loaded directly from your
                workspace subscription settings when activating a paid plan.
              </p>
            </div>
          </div>
        </section>

        {/* SECTION I: TESTIMONIALS (CLEARLY LABELLED PLACEHOLDERS — ZERO FABRICATED CUSTOMERS) */}
        <section
          id="testimonials"
          className="scroll-mt-20 border-t border-[#EAECF0] bg-[#F8F8FA] py-20 sm:py-24"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Merchant Perspectives
              </p>
              <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
                What Business Owners Want from Their Business Software
              </h2>
              <p className="mt-3 text-base text-[#4B5565]">
                Verified customer testimonials will be published here as merchants share their
                results. The cards below are clearly marked placeholder slots.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-3">
              {TESTIMONIAL_PLACEHOLDERS.map((item) => (
                <article
                  key={item.slot}
                  className="flex flex-col justify-between rounded-2xl border border-dashed border-[#D6DBE5] bg-white p-6 shadow-2xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded-md bg-[#FFF1F1] px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-[#D90000]">
                        Testimonial Placeholder
                      </span>
                      <span className="font-mono-tabular text-xs font-medium text-[#64748B]">
                        {item.slot}
                      </span>
                    </div>

                    <h3 className="mt-4 text-base font-bold text-[#151B2B]">{item.focus}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-[#4B5565]">
                      &ldquo;{item.placeholderQuote}&rdquo;
                    </p>
                  </div>

                  <div className="mt-6 flex items-center gap-3 border-t border-[#EAECF0] pt-4">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F1F5F9] text-xs font-bold text-[#64748B]"
                      aria-hidden="true"
                    >
                      FB
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[#151B2B]">
                        {item.attribution}
                      </p>
                      <p className="truncate text-xs text-[#64748B]">{item.businessType}</p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION J: FREQUENTLY ASKED QUESTIONS */}
        <section
          id="faq"
          className="scroll-mt-20 border-t border-[#EAECF0] bg-white py-20 sm:py-24"
        >
          <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Common Questions
              </p>
              <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
                Frequently Asked Questions
              </h2>
              <p className="mt-3 text-base text-[#4B5565]">
                Clear answers about running your shop with Festola Business Hub.
              </p>
            </div>

            <div className="mt-10 divide-y divide-[#EAECF0] overflow-hidden rounded-2xl border border-[#EAECF0] bg-[#F8F8FA]/50">
              {FAQ_ITEMS.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                const panelId = `faq-panel-${idx}`;
                const buttonId = `faq-button-${idx}`;

                return (
                  <div key={faq.question} className="bg-white">
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

        {/* SECTION K: FINAL CALL TO ACTION */}
        <section className="relative overflow-hidden bg-[#D90000] py-20 text-white sm:py-24">
          {/* Subtle architectural background geometry */}
          <div
            className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-2xl"
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-black/15 blur-2xl"
            aria-hidden="true"
          />

          <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
              Ready to Grow Your Business?
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-red-50 sm:text-lg">
              Take control of your sales, inventory and finances with Festola Business Hub.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-8 text-sm font-bold text-[#D90000] shadow-lg transition-colors hover:bg-[#FFF1F1]"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/contact"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/40 bg-white/10 px-7 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                Talk to Our Team
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* SECTION L: FOOTER */}
      <PublicFooter />

      {/* Interactive Demo Walkthrough Modal */}
      <DemoPreviewModal open={demoModalOpen} onClose={() => setDemoModalOpen(false)} />
    </div>
  );
}
