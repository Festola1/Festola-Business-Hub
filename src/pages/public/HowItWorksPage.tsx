import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  ArrowRight,
  CheckCircle2,
  CloudUpload,
  Play,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  WifiOff,
} from 'lucide-react';
import { DashboardPreviewSection } from '../../components/marketing/DashboardPreviewSection';
import { DemoPreviewModal } from '../../components/marketing/DemoPreviewModal';
import { HOW_IT_WORKS_STEPS, TRUST_BENEFITS } from '../../components/marketing/marketing-data';
import { PublicFooter } from '../../components/marketing/PublicFooter';
import { PublicNavbar } from '../../components/marketing/PublicNavbar';

const OFFLINE_FLOW_STEPS = [
  {
    title: 'Install Once on Any Device',
    description:
      'Open Festola Business Hub on Chrome, Safari, Android, or iOS and install it directly to your home screen as a fast Progressive Web App.',
    icon: Smartphone,
  },
  {
    title: 'Keep Selling Without Internet',
    description:
      'When network service drops, your counter continues processing sales and queuing transactions securely inside local IndexedDB storage.',
    icon: WifiOff,
  },
  {
    title: 'Automatic Cloud Synchronisation',
    description:
      'As soon as connectivity returns, queued sales sync cleanly to your cloud business ledger with idempotent duplicate protection.',
    icon: CloudUpload,
  },
  {
    title: 'Role-Safe Team Accountability',
    description:
      'Every device session, voided sale, stock adjustment, and debt collection is tracked under strict Owner, Manager, and Cashier permissions.',
    icon: ShieldCheck,
  },
] as const;

export default function HowItWorksPage() {
  const location = useLocation();
  const [demoModalOpen, setDemoModalOpen] = useState(false);

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
        {/* Hero Banner */}
        <section className="border-b border-[#EAECF0] bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#FFF1F1] px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[#D90000]">
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Simple Onboarding</span>
            </div>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-5xl">
              Get Started in <span className="text-[#D90000]">Three Simple Steps</span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#4B5565] sm:text-lg">
              Move from paper notebooks and scattered spreadsheets to organised daily sales, stock
              control, and real profit visibility in minutes.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#D90000] px-7 text-sm font-semibold text-white shadow-md shadow-[#D90000]/20 transition-colors hover:bg-[#B30000]"
              >
                Create Free Account
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={() => setDemoModalOpen(true)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border-2 border-[#D90000] bg-white px-6 text-sm font-semibold text-[#D90000] transition-colors hover:bg-[#FFF1F1]"
              >
                <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                Watch Demo
              </button>
            </div>
          </div>
        </section>

        {/* Detailed 3-Step Walkthrough */}
        <section className="py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {HOW_IT_WORKS_STEPS.map((step, index) => (
                <article
                  key={step.number}
                  className="flex flex-col rounded-2xl border border-[#EAECF0] bg-white p-7 shadow-2xs transition-colors hover:border-[#D90000]/35"
                >
                  <div className="flex items-center justify-between">
                    <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D90000] font-mono-tabular text-lg font-extrabold text-white shadow-md shadow-[#D90000]/20">
                      {step.number}
                    </span>
                    <span className="rounded-md bg-[#FFF1F1] px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[#D90000]">
                      Step {index + 1}
                    </span>
                  </div>

                  <h2 className="mt-5 text-xl font-bold text-[#151B2B]">{step.title}</h2>
                  <p className="mt-2 text-sm font-semibold text-[#151B2B]">{step.description}</p>
                  <p className="mt-2 text-sm leading-relaxed text-[#4B5565]">{step.detail}</p>

                  <ul className="mt-5 flex-1 space-y-2.5 border-t border-[#F1F5F9] pt-5">
                    {step.checklist.map((item) => (
                      <li
                        key={item}
                        className="flex items-start gap-2.5 text-xs font-medium leading-relaxed text-[#334155]"
                      >
                        <CheckCircle2
                          className="mt-0.5 h-4 w-4 shrink-0 text-[#D90000]"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Offline-First PWA Architecture Section */}
        <section className="border-y border-[#EAECF0] bg-white py-16 sm:py-20">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-[#D90000]">
                Built for Real Connectivity
              </p>
              <h2 className="mt-2.5 text-3xl font-extrabold tracking-tight text-[#151B2B] sm:text-4xl">
                How Offline-First Operations Keep Your Counter Moving
              </h2>
              <p className="mt-3 text-base text-[#4B5565]">
                Designed specifically for shops where mobile data or broadband can fluctuate during
                busy trading hours.
              </p>
            </div>

            <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
              {OFFLINE_FLOW_STEPS.map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.title}
                    className="flex items-start gap-4 rounded-2xl border border-[#EAECF0] bg-[#F8F8FA] p-6"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white text-[#D90000] shadow-xs ring-1 ring-[#F4DADA]">
                      <Icon className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-base font-bold text-[#151B2B]">{item.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[#4B5565]">
                        {item.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Trust strip */}
            <div className="mt-10 rounded-2xl border border-[#F4DADA] bg-[#FFF6F6] p-6 sm:p-8">
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {TRUST_BENEFITS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="flex items-start gap-3">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#D90000]" aria-hidden="true" />
                      <div>
                        <p className="text-sm font-bold text-[#151B2B]">{item.title}</p>
                        <p className="mt-0.5 text-xs text-[#4B5565]">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Product Dashboard Preview */}
        <DashboardPreviewSection />

        {/* Bottom CTA */}
        <section className="bg-[#D90000] py-16 text-white sm:py-20">
          <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
              Ready to Launch Your Business Workspace?
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-base text-red-50">
              Set up your store in minutes or reach out if you would like guidance onboarding your
              team.
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
                to="/contact"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/40 bg-white/10 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/20"
              >
                Talk to Our Team
              </Link>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
      <DemoPreviewModal open={demoModalOpen} onClose={() => setDemoModalOpen(false)} />
    </div>
  );
}
