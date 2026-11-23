import { Link } from 'react-router';
import { ArrowRight, Globe2, ShieldCheck, Smartphone, Store, Target } from 'lucide-react';
import { PublicFooter } from '../../components/marketing/PublicFooter';
import { PublicNavbar } from '../../components/marketing/PublicNavbar';

const PILLARS = [
  {
    title: 'Built for Everyday Retail Reality',
    description:
      'Designed around how Nigerian shops, pharmacies, supermarkets, and wholesalers actually operate—supporting fast counter sales, Naira pricing, credit ledgers, and mixed payment methods.',
    icon: Store,
  },
  {
    title: 'Offline-First Reliability',
    description:
      'Internet disruptions should never stop a sale. Festola Business Hub works as an installable Progressive Web App across Web, Android, and iOS with resilient offline queuing and automatic sync.',
    icon: Smartphone,
  },
  {
    title: 'Security & Business Separation',
    description:
      'Every business workspace is strictly isolated with role-based permissions, audit records for sensitive actions, and NDPA-aligned data protection practices.',
    icon: ShieldCheck,
  },
  {
    title: 'From Nigeria to Africa and Beyond',
    description:
      'Starting with Nigerian SMEs and engineered to scale across Africa and international markets as businesses grow from one counter to multi-branch operations.',
    icon: Globe2,
  },
] as const;

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-[#F8F8FA] text-[#151B2B]">
      <PublicNavbar />

      <main>
        {/* Hero Banner */}
        <section className="border-b border-[#EAECF0] bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
              About Festola Business Hub
            </p>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-5xl">
              Helping Small and Growing Businesses{' '}
              <span className="text-[#D90000]">Manage, Grow &amp; Succeed</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#4B5565] sm:text-lg">
              Festola Business Hub was created to give everyday business owners a dependable,
              affordable, and easy-to-use platform to replace scattered notebooks and spreadsheets
              with real operational clarity.
            </p>
          </div>
        </section>

        {/* Mission Section */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="rounded-2xl border border-[#EAECF0] bg-white p-8 shadow-2xs sm:p-10">
              <div className="flex items-start gap-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D90000]">
                  <Target className="h-6 w-6" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="text-2xl font-extrabold text-[#151B2B]">Our Mission</h2>
                  <p className="mt-3 text-base leading-relaxed text-[#4B5565]">
                    Too many hardworking shop owners lose profits to untracked expenses, missing
                    stock, forgotten customer debts, and complicated software that fails whenever
                    the internet slows down. Our mission is to make modern Point of Sale, inventory
                    control, and financial reporting accessible to every small and medium-sized
                    business—first across Nigeria, then across Africa and international markets.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
              {PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <article
                    key={pillar.title}
                    className="rounded-2xl border border-[#EAECF0] bg-white p-6 shadow-2xs"
                  >
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D90000]">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <h3 className="mt-4 text-lg font-bold text-[#151B2B]">{pillar.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-[#4B5565]">
                      {pillar.description}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="mt-12 rounded-2xl bg-[#D90000] p-8 text-center text-white sm:p-10">
              <h2 className="text-2xl font-extrabold sm:text-3xl">
                Ready to organise your business?
              </h2>
              <p className="mx-auto mt-3 max-w-xl text-sm text-red-50 sm:text-base">
                Start your free account today or reach out to our team if you have questions about
                onboarding your store or branches.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  to="/register"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-white px-6 text-sm font-bold text-[#D90000] transition-colors hover:bg-[#FFF1F1]"
                >
                  Get Started Free
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  to="/contact"
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-white/40 bg-white/10 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/20"
                >
                  Contact Us
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
