import { useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CheckCircle2, Layers } from 'lucide-react';
import { DashboardPreviewSection } from '../../components/marketing/DashboardPreviewSection';
import {
  FEATURE_CARDS,
  SUPPORTED_INDUSTRIES,
  type FeatureCategory,
} from '../../components/marketing/marketing-data';
import { PublicFooter } from '../../components/marketing/PublicFooter';
import { PublicNavbar } from '../../components/marketing/PublicNavbar';

const CATEGORY_TABS: readonly { id: FeatureCategory; label: string }[] = [
  { id: 'all', label: 'All Features (12)' },
  { id: 'sales-pos', label: 'Sales & POS' },
  { id: 'inventory', label: 'Inventory & Stock' },
  { id: 'customers-credit', label: 'Customers & Credit' },
  { id: 'finance-team', label: 'Finance & Team' },
];

export default function FeaturesPage() {
  const [selectedCategory, setSelectedCategory] = useState<FeatureCategory>('all');

  const visibleFeatures =
    selectedCategory === 'all'
      ? FEATURE_CARDS
      : FEATURE_CARDS.filter((item) => item.category === selectedCategory);

  return (
    <div className="min-h-screen overflow-x-clip bg-[#F8F8FA] text-[#151B2B]">
      <PublicNavbar />

      <main>
        {/* Hero Banner */}
        <section className="border-b border-[#EAECF0] bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF1F1] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#D90000]">
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Platform Capabilities</span>
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-5xl">
              Powerful Features to <span className="text-[#D90000]">Supercharge Your Business</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#4B5565] sm:text-lg">
              Everything you need to manage counter sales, inventory, customer debts, suppliers,
              daily expenses, staff permissions, and financial reports — online or offline.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D90000] px-7 text-sm font-semibold text-white shadow-md shadow-[#D90000]/20 transition-colors hover:bg-[#B30000]"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/how-it-works"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-[#D90000] bg-white px-6 text-sm font-semibold text-[#D90000] transition-colors hover:bg-[#FFF1F1]"
              >
                See How It Works
              </Link>
            </div>
          </div>
        </section>

        {/* Interactive Feature Catalogue */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div
              className="flex flex-wrap items-center justify-center gap-2"
              role="tablist"
              aria-label="Filter platform features by category"
            >
              {CATEGORY_TABS.map((tab) => {
                const active = selectedCategory === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setSelectedCategory(tab.id)}
                    className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                      active
                        ? 'bg-[#D90000] text-white shadow-sm'
                        : 'border border-[#E5E7EB] bg-white text-[#4B5565] hover:border-[#D90000]/40 hover:text-[#151B2B]'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {visibleFeatures.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="group flex flex-col rounded-2xl border border-[#E5E7EB] bg-white p-6 shadow-2xs transition-all duration-200 hover:-translate-y-1 hover:border-[#D90000]/35 hover:shadow-md"
                  >
                    <span
                      className={`inline-flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${feature.accent}`}
                    >
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-lg font-bold text-[#151B2B]">{feature.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-[#4B5565]">
                      {feature.description}
                    </p>
                    <ul className="mt-4 space-y-2 border-t border-[#F1F5F9] pt-4">
                      {feature.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className="flex items-start gap-2 text-xs font-medium text-[#334155]"
                        >
                          <CheckCircle2
                            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#D90000]"
                            aria-hidden="true"
                          />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Interactive Dashboard Preview */}
        <DashboardPreviewSection />

        {/* Supported Industries */}
        <section className="bg-[#F8F8FA] py-16 sm:py-20">
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

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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

        {/* Bottom CTA */}
        <section className="bg-[#D90000] py-16 text-white sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Put Every Feature to Work in Your Store
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-red-50">
              Start free today and explore plans designed for single shops and multi-branch teams.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-7 text-sm font-bold text-[#D90000] shadow-md transition-colors hover:bg-[#FFF1F1]"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                to="/pricing"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/40 bg-white/10 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                Compare Pricing Plans
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
