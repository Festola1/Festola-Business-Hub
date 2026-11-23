import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, BarChart3, Boxes, CheckCircle2, ShoppingCart, WifiOff, X } from 'lucide-react';

interface DemoPreviewModalProps {
  open: boolean;
  onClose: () => void;
}

const DEMO_STEPS = [
  {
    id: 'pos',
    title: 'Fast Point of Sale (POS)',
    icon: ShoppingCart,
    summary:
      'Ring up walk-in or credit customers in seconds using Cash, POS Card, or Bank Transfer, and issue clean digital or printable receipts immediately.',
    highlights: [
      'Instant barcode or item search across your product list',
      'Automatic total calculation and payment method tracking',
      'Digital receipts ready to print or share with customers',
    ],
  },
  {
    id: 'inventory',
    title: 'Real-Time Inventory Control',
    icon: Boxes,
    summary:
      'Every completed sale updates stock quantities automatically so you know what is selling fast and what needs restocking before shelves run empty.',
    highlights: [
      'Automatic stock deduction on every checkout',
      'Low-stock alerts based on your reorder thresholds',
      'Full stock movement history for restocks and adjustments',
    ],
  },
  {
    id: 'offline',
    title: 'Offline-Ready Reliability',
    icon: WifiOff,
    summary:
      'Keep serving customers during network drops or power disruptions. Sales queue safely on your device and sync automatically once internet returns.',
    highlights: [
      'Installable PWA on Android, iOS, and desktop browsers',
      'Protected local queue with conflict-safe cloud sync',
      'Clear sync status indicator when reconnecting',
    ],
  },
  {
    id: 'reports',
    title: 'Clear Profit & Expense Reports',
    icon: BarChart3,
    summary:
      'Track daily expenses alongside sales revenue so you always know your true net profit, top-selling products, and outstanding customer balances.',
    highlights: [
      'Daily, weekly, and monthly profit summaries in Naira (₦)',
      'Expense tracking categorised by rent, fuel, restock, and utilities',
      'Customer credit ledger showing paid and outstanding balances',
    ],
  },
] as const;

export function DemoPreviewModal({ open, onClose }: DemoPreviewModalProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const activeStep = DEMO_STEPS[activeIndex] ?? DEMO_STEPS[0];
  const ActiveIcon = activeStep.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#151B2B]/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="demo-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl border border-[#EAECF0] bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#EAECF0] px-6 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#D90000]">
              Interactive Platform Walkthrough
            </p>
            <h3 id="demo-modal-title" className="text-lg font-bold text-[#151B2B]">
              See How Festola Business Hub Works
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close demo preview"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#4B5565] transition-colors hover:bg-[#F8F8FA] hover:text-[#151B2B]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Step Tabs */}
        <div className="grid grid-cols-2 gap-2 border-b border-[#EAECF0] bg-[#F8F8FA] p-4 sm:grid-cols-4">
          {DEMO_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isSelected = idx === activeIndex;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setActiveIndex(idx)}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-all ${
                  isSelected
                    ? 'border-[#D90000] bg-[#D90000] text-white shadow-xs'
                    : 'border-[#E5E7EB] bg-white text-[#151B2B] hover:border-[#D90000]/40'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{step.title.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>

        {/* Active Step Content */}
        <div className="p-6">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#FFF1F1] text-[#D90000]">
              <ActiveIcon className="h-6 w-6" aria-hidden="true" />
            </span>
            <div>
              <h4 className="text-xl font-bold text-[#151B2B]">{activeStep.title}</h4>
              <p className="mt-2 text-sm leading-relaxed text-[#4B5565]">{activeStep.summary}</p>
            </div>
          </div>

          <ul className="mt-6 space-y-2.5 rounded-xl border border-[#EAECF0] bg-[#F8F8FA] p-4">
            {activeStep.highlights.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-[#151B2B]">
                <CheckCircle2
                  className="mt-0.5 h-4 w-4 shrink-0 text-[#D90000]"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>

          {/* Footer Actions */}
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-[#E5E7EB] bg-white px-4 text-sm font-semibold text-[#151B2B] transition-colors hover:bg-[#F8F8FA]"
            >
              Back to Overview
            </button>
            <div className="flex flex-col gap-2 sm:flex-row">
              <a
                href="#product-preview"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#D90000] bg-white px-4 text-sm font-semibold text-[#D90000] transition-colors hover:bg-[#FFF1F1]"
              >
                View Live Dashboard Preview
              </a>
              <Link
                to="/register"
                onClick={onClose}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-[#D90000] px-5 text-sm font-semibold text-white transition-colors hover:bg-[#B30000]"
              >
                Start Free Trial
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
