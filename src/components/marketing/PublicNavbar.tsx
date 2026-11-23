import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { FestolaLogo } from './FestolaLogo';

interface NavLinkItem {
  label: string;
  to: string;
}

const NAV_ITEMS: readonly NavLinkItem[] = [
  { label: 'Home', to: '/' },
  { label: 'Features', to: '/features' },
  { label: 'How It Works', to: '/how-it-works' },
  { label: 'Pricing', to: '/pricing' },
  { label: 'About Us', to: '/about' },
  { label: 'Contact', to: '/contact' },
];

export function PublicNavbar() {
  const { session } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const isActiveLink = (item: NavLinkItem): boolean => location.pathname === item.to;

  return (
    <header className="sticky top-0 z-40 border-b border-[#EAECF0] bg-white/95 backdrop-blur-md">
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Left: Brand Logo */}
        <FestolaLogo onClick={() => setMobileMenuOpen(false)} />

        {/* Centre: Navigation Links (Desktop) */}
        <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
          {NAV_ITEMS.map((item) => {
            const active = isActiveLink(item);
            return (
              <Link
                key={item.label}
                to={item.to}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
                    ? 'bg-[#D90000] text-white'
                    : 'text-[#151B2B] hover:bg-[#FFF1F1] hover:text-[#D90000]'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: Auth / Primary Actions (Desktop) */}
        <div className="hidden items-center gap-3 lg:flex">
          {session ? (
            <Link
              to="/app/dashboard"
              className="inline-flex h-10 items-center justify-center rounded-lg bg-[#D90000] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#B30000]"
            >
              Open Dashboard
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#D90000] bg-white px-4 text-sm font-semibold text-[#D90000] transition-colors hover:bg-[#FFF1F1]"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#D90000] px-5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#B30000]"
              >
                Get Started Free
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Trigger */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen((prev) => !prev)}
          aria-expanded={mobileMenuOpen}
          aria-controls="public-mobile-menu"
          aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#E5E7EB] text-[#151B2B] transition-colors hover:bg-[#F8F8FA] lg:hidden"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div
          id="public-mobile-menu"
          className="border-t border-[#EAECF0] bg-white px-4 pb-6 pt-3 shadow-lg lg:hidden"
        >
          <nav className="flex flex-col space-y-1" aria-label="Mobile navigation">
            {NAV_ITEMS.map((item) => {
              const active = isActiveLink(item);
              return (
                <Link
                  key={item.label}
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#FFF1F1] font-semibold text-[#D90000]'
                      : 'text-[#151B2B] hover:bg-[#F8F8FA]'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 flex flex-col gap-2.5 border-t border-[#EAECF0] pt-4">
            {session ? (
              <Link
                to="/app/dashboard"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex h-11 items-center justify-center rounded-lg bg-[#D90000] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B30000]"
              >
                Open Dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-[#D90000] bg-white px-4 text-sm font-semibold text-[#D90000] transition-colors hover:bg-[#FFF1F1]"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex h-11 items-center justify-center rounded-lg bg-[#D90000] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#B30000]"
                >
                  Get Started Free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
