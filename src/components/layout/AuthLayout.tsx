import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { AlertBanner } from '../ui/Feedback';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  maxWidth?: 'md' | 'xl';
  headerAction?: ReactNode;
  showInstallButton?: boolean;
  supabaseNotice?: boolean;
  footer?: ReactNode;
  children: ReactNode;
}

/**
 * Shared responsive authentication & onboarding container with approved Festola
 * brand styling, skip-to-content navigation, and explicit configuration notices.
 */
export function AuthLayout({
  title,
  subtitle,
  maxWidth = 'md',
  headerAction,
  showInstallButton = false,
  supabaseNotice = false,
  footer,
  children,
}: AuthLayoutProps) {
  const widthClass = maxWidth === 'xl' ? 'max-w-xl' : 'max-w-md';

  return (
    <div className="min-h-screen bg-[#F4F5F7] px-4 py-8 text-[#18181B] sm:px-6 sm:py-10">
      <a
        href="#auth-main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-[#991B1B] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      <div className={`mx-auto ${widthClass}`}>
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link to="/" className="text-xl font-bold tracking-tight text-[#991B1B]">
            Festola
          </Link>
          <div className="flex items-center gap-3">
            {showInstallButton && <PWAInstallButton variant="secondary" />}
            {headerAction}
          </div>
        </header>

        <main
          id="auth-main"
          tabIndex={-1}
          className="rounded-lg border border-[#E4E4E7] bg-white p-6 focus:outline-none sm:p-8"
        >
          <h1 className="text-2xl font-bold tracking-tight text-[#18181B]">{title}</h1>
          <p className="mt-1.5 text-sm text-[#52525B]">{subtitle}</p>

          {supabaseNotice && (
            <AlertBanner tone="warning" title="Supabase Auth not connected yet" className="mt-5">
              Set <code className="font-mono">VITE_SUPABASE_URL</code> and{' '}
              <code className="font-mono">VITE_SUPABASE_ANON_KEY</code> to enable live
              authentication. Forms below still validate input locally and will not fake a sign-in.
            </AlertBanner>
          )}

          <div className="mt-6">{children}</div>

          {footer && (
            <div className="mt-6 border-t border-[#E4E4E7] pt-5 text-center text-sm text-[#52525B]">
              {footer}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
