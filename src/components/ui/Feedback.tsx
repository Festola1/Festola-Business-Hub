import { AlertCircle, AlertTriangle, CheckCircle2, Info, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from './Button';

export type BannerTone = 'info' | 'success' | 'warning' | 'error';

export interface AlertBannerProps {
  tone: BannerTone;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}

const TONE_STYLES: Record<
  BannerTone,
  { border: string; bg: string; iconColor: string; role: 'alert' | 'status' }
> = {
  info: {
    border: 'border-[#E4E4E7]',
    bg: 'bg-white',
    iconColor: 'text-[#52525B]',
    role: 'status',
  },
  success: {
    border: 'border-[#16A34A]',
    bg: 'bg-[#F0FDF4]',
    iconColor: 'text-[#16A34A]',
    role: 'status',
  },
  warning: {
    border: 'border-[#D97706]',
    bg: 'bg-[#FFFBEB]',
    iconColor: 'text-[#D97706]',
    role: 'status',
  },
  error: {
    border: 'border-[#DC2626]',
    bg: 'bg-[#FEF2F2]',
    iconColor: 'text-[#DC2626]',
    role: 'alert',
  },
};

export function AlertBanner({ tone, title, children, action, className = '' }: AlertBannerProps) {
  const style = TONE_STYLES[tone];
  const Icon =
    tone === 'error'
      ? AlertCircle
      : tone === 'warning'
        ? AlertTriangle
        : tone === 'success'
          ? CheckCircle2
          : Info;

  return (
    <div
      role={style.role}
      className={`flex flex-col gap-3 rounded-lg border p-4 text-sm sm:flex-row sm:items-start sm:justify-between ${style.border} ${style.bg} ${className}`}
    >
      <div className="flex items-start gap-2.5">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${style.iconColor}`} aria-hidden="true" />
        <div className="min-w-0 text-xs leading-relaxed text-[#18181B]">
          {title && <p className="font-semibold text-[#18181B]">{title}</p>}
          <div className={title ? 'mt-0.5 text-[#52525B]' : 'text-[#18181B]'}>{children}</div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-[#E4E4E7] bg-white ${className}`}>
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
}: {
  title: string;
  description?: string;
  breadcrumb?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumb && <p className="text-xs font-medium text-[#52525B]">{breadcrumb}</p>}
        <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">{title}</h1>
        {description && <p className="mt-1 text-sm text-[#52525B]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

export function LoadingSkeleton({
  rows = 4,
  label = 'Loading content...',
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="rounded-lg border border-[#E4E4E7] bg-white p-6"
    >
      <span className="sr-only">{label}</span>
      <div className="h-5 w-44 rounded bg-[#F4F5F7]" />
      <div className="mt-4 space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div key={idx} className="h-10 w-full rounded bg-[#F4F5F7]" />
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ label = 'Loading Festola Business Hub...' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-[#F4F5F7] p-6"
    >
      <div className="w-full max-w-md rounded-lg border border-[#E4E4E7] bg-white p-6">
        <p className="text-sm font-semibold text-[#991B1B]">Festola Business Hub</p>
        <p className="mt-1 text-xs text-[#52525B]">{label}</p>
        <div className="mt-4 space-y-2.5">
          <div className="h-3 w-3/4 rounded bg-[#F4F5F7]" />
          <div className="h-3 w-1/2 rounded bg-[#F4F5F7]" />
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[#E4E4E7] bg-white px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-[#18181B]">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm text-[#52525B]">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Unable to load this section',
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-lg border border-[#DC2626] bg-white p-6">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#DC2626]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-[#18181B]">{title}</h2>
          <p className="mt-1 text-sm text-[#52525B]">{message}</p>
          {onRetry && (
            <div className="mt-4">
              <Button variant="secondary" size="sm" onClick={onRetry}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Try again</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
