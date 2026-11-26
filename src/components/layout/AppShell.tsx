import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Crown,
  FileClock,
  Home,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Receipt,
  RefreshCw,
  Search,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Smartphone,
  Truck,
  UserCog,
  Users,
  Wallet,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../contexts/AuthContext';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { fetchNotifications } from '../../lib/notifications-api';
import { getTotalQueuedOfflineCount } from '../../lib/offline-store';
import { canRoleAccess, getVisibleNavItems, type NavIconKey } from '../../lib/permissions';
import { useWorkspaceEventTick } from '../../lib/workspace-events';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Modal } from '../ui/Modal';

const NAV_ICON_MAP: Record<NavIconKey, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  pos: ShoppingCart,
  sales: Receipt,
  inventory: Boxes,
  products: Package,
  purchases: ShoppingBag,
  customers: Users,
  suppliers: Truck,
  expenses: Wallet,
  debts: CreditCard,
  reports: BarChart3,
  staff: UserCog,
  notifications: Bell,
  settings: Settings,
  subscription: Crown,
  sync: RefreshCw,
  devices: Smartphone,
  audit: FileClock,
};

function getInitials(fullName?: string | null): string {
  if (!fullName) return 'FB';
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'FB';
  const first = parts[0]?.[0] ?? 'F';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : (parts[0]?.[1] ?? '');
  return `${first}${last}`.toUpperCase();
}

function formatRoleLabel(role: string): string {
  if (role === 'owner') return 'Business Owner';
  if (role === 'manager') return 'Manager';
  if (role === 'cashier') return 'Cashier';
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOnline = useOnlineStatus();
  const {
    accessToken,
    profile,
    memberships,
    activeMembership,
    tenantEpoch,
    selectBusiness,
    signOut,
  } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [announcement, setAnnouncement] = useState<string>('');
  const profileMenuRef = useRef<HTMLDivElement>(null);

  const activeBusinessId = activeMembership?.businessId ?? null;
  const syncEventTick = useWorkspaceEventTick(activeBusinessId, [
    'sync',
    'sales',
    'expenses',
    'debts',
  ]);
  const notificationEventTick = useWorkspaceEventTick(activeBusinessId, [
    'notifications',
    'sales',
    'inventory',
  ]);

  useEffect(() => {
    if (!accessToken || !activeBusinessId) {
      return;
    }

    let cancelled = false;
    void fetchNotifications(accessToken, activeBusinessId, {
      unreadOnly: true,
      limit: 1,
      offset: 0,
    }).then((res) => {
      if (cancelled) {
        return;
      }
      if (res.success && res.data) {
        setUnreadCount(res.data.unreadCount ?? 0);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeBusinessId, location.pathname, tenantEpoch, notificationEventTick]);

  useEffect(() => {
    if (!profileMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setProfileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [profileMenuOpen]);

  if (!activeMembership) {
    return null;
  }

  const visibleNav = getVisibleNavItems(activeMembership.role);
  const primaryNav = visibleNav.filter((item) => item.section !== 'system');
  const systemNav = visibleNav.filter((item) => item.section === 'system');
  const canManageBilling = canRoleAccess(activeMembership.role, 'billing.manage');
  const canManageSettings = canRoleAccess(activeMembership.role, 'settings.manage');
  // Re-evaluate queued operations reactively whenever syncEventTick increments
  const queuedOfflineCount =
    syncEventTick >= 0 ? getTotalQueuedOfflineCount(activeMembership.businessId) : 0;

  const primaryMobile = visibleNav.filter((item) => item.mobilePrimary);
  const customersFallback = visibleNav.find((item) => item.path === '/app/customers');
  const mobileBottomNav =
    primaryMobile.length < 4 &&
    customersFallback &&
    !primaryMobile.some((i) => i.path === customersFallback.path)
      ? [...primaryMobile, customersFallback].slice(0, 4)
      : primaryMobile.slice(0, 4);

  const handleSignOut = async () => {
    setMobileMenuOpen(false);
    setProfileMenuOpen(false);
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleBusinessChange = (nextBusinessId: string) => {
    const target = memberships.find((m) => m.businessId === nextBusinessId);
    const switched = selectBusiness(nextBusinessId);
    if (switched && target) {
      setAnnouncement(`Switched workspace to ${target.businessName} (${target.role}).`);
    }
  };

  const handleGlobalSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const term = searchQuery.trim();
    if (!term) return;
    if (term.toUpperCase().startsWith('SL-') || term.toUpperCase().startsWith('REC-')) {
      navigate(`/app/sales?q=${encodeURIComponent(term)}`);
    } else {
      navigate(`/app/products?q=${encodeURIComponent(term)}`);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="min-h-screen bg-[#F8F8FA] text-[#151B2B]">
      {/* Skip-to-main-content keyboard landmark */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-[#D90000] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Skip to main content
      </a>

      {/* Polite live region for workspace switch announcements */}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>

      {/* Desktop Fixed Crimson Red Sidebar (>= lg), Collapsible */}
      <aside
        aria-label="Workspace navigation"
        className={`fixed inset-y-0 left-0 z-20 hidden flex-col bg-gradient-to-b from-[#D90000] via-[#C60000] to-[#A60000] text-white shadow-xl transition-[width] duration-200 lg:flex ${
          sidebarCollapsed ? 'w-[78px]' : 'w-[254px]'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 items-center justify-between border-b border-white/15 px-4">
          <Link
            to="/app/dashboard"
            className="flex min-w-0 items-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="Festola Business Hub — Dashboard"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[#D90000] shadow-xs"
              aria-hidden="true"
            >
              <svg width="20" height="20" viewBox="0 0 28 28" fill="none">
                <path
                  d="M7 6.5C7 5.67157 7.67157 5 8.5 5H21.5C22.3284 5 23 5.67157 23 6.5V7.75C23 8.57843 22.3284 9.25 21.5 9.25H11.5V12.5H19.25C20.0784 12.5 20.75 13.1716 20.75 14V15C20.75 15.8284 20.0784 16.5 19.25 16.5H11.5V21.5C11.5 22.3284 10.8284 23 10 23H8.5C7.67157 23 7 22.3284 7 21.5V6.5Z"
                  fill="currentColor"
                />
                <circle cx="20.5" cy="20.5" r="2.25" fill="currentColor" fillOpacity="0.9" />
              </svg>
            </span>
            {!sidebarCollapsed && (
              <span className="truncate leading-tight">
                <span className="block text-[15px] font-extrabold tracking-tight text-white">
                  Festola
                </span>
                <span className="block text-[11px] font-medium text-red-100/90">Business Hub</span>
              </span>
            )}
          </Link>

          <button
            type="button"
            onClick={() => setSidebarCollapsed((prev) => !prev)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/90 transition-colors hover:bg-white/20"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>

        {/* Navigation Items */}
        <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {primaryNav.map((item) => {
              const Icon = NAV_ICON_MAP[item.icon];
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    title={sidebarCollapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `group flex min-h-[38px] items-center justify-between rounded-xl px-3 py-2 text-[13px] font-medium transition-colors ${
                        isActive
                          ? 'bg-white/20 font-semibold text-white shadow-xs ring-1 ring-white/20'
                          : 'text-red-50/90 hover:bg-white/10 hover:text-white'
                      }`
                    }
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                    </span>
                    {!sidebarCollapsed && item.path === '/app/notifications' && unreadCount > 0 && (
                      <span className="rounded-full bg-white px-2 py-0.5 font-mono-tabular text-[11px] font-bold text-[#D90000]">
                        {unreadCount}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>

          {systemNav.length > 0 && (
            <div className="mt-4 border-t border-white/15 pt-3">
              {!sidebarCollapsed && (
                <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-red-100/70">
                  Sync &amp; Security
                </p>
              )}
              <ul className="space-y-0.5">
                {systemNav.map((item) => {
                  const Icon = NAV_ICON_MAP[item.icon];
                  return (
                    <li key={item.path}>
                      <NavLink
                        to={item.path}
                        title={sidebarCollapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          `flex min-h-[36px] items-center justify-between rounded-xl px-3 py-1.5 text-[13px] font-medium transition-colors ${
                            isActive
                              ? 'bg-white/20 font-semibold text-white'
                              : 'text-red-50/85 hover:bg-white/10 hover:text-white'
                          }`
                        }
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
                        </span>
                        {!sidebarCollapsed &&
                          item.path === '/app/sync' &&
                          queuedOfflineCount > 0 && (
                            <span className="rounded-full bg-amber-300 px-1.5 py-0.5 font-mono-tabular text-[10px] font-bold text-[#151B2B]">
                              {queuedOfflineCount}
                            </span>
                          )}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <div className="mt-4 border-t border-white/15 pt-3">
            <Link
              to="/"
              title={sidebarCollapsed ? 'Landing Page' : undefined}
              className="flex min-h-[38px] items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium text-red-50/90 transition-colors hover:bg-white/15 hover:text-white"
            >
              <Home className="h-4 w-4 shrink-0" aria-hidden="true" />
              {!sidebarCollapsed && <span className="truncate">Landing Page</span>}
            </Link>
          </div>
        </nav>

        {/* Bottom Subscription Plan Card (matching dashboard visual reference) */}
        {!sidebarCollapsed ? (
          <div className="p-3">
            <div className="rounded-2xl bg-white p-3.5 text-center text-[#151B2B] shadow-md">
              <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-amber-50 text-amber-500">
                <Crown className="h-4 w-4" aria-hidden="true" />
              </div>
              <p className="mt-1.5 truncate text-xs font-bold text-[#151B2B]">
                {activeMembership.limits.displayName}
              </p>
              <p className="mt-0.5 text-[11px] capitalize text-[#6B7280]">
                {activeMembership.subscriptionStatus.replace('_', ' ')} ·{' '}
                {isOnline ? 'Online' : 'Offline'}
              </p>
              {canManageBilling && (
                <Link
                  to="/app/subscription"
                  className="mt-2.5 inline-flex h-8 w-full items-center justify-center rounded-lg border border-[#D90000] bg-white px-3 text-xs font-semibold text-[#D90000] transition-colors hover:bg-[#D90000] hover:text-white"
                >
                  Manage Plan
                </Link>
              )}
            </div>
            <p className="mt-2.5 text-center text-[10px] text-red-100/80">
              &copy; {currentYear} Festola Business Hub
            </p>
          </div>
        ) : (
          <div className="border-t border-white/15 p-3 text-center">
            <span
              className={`mx-auto block h-2.5 w-2.5 rounded-full ${
                isOnline ? 'bg-emerald-300' : 'bg-amber-300'
              }`}
              title={isOnline ? 'Online' : 'Offline'}
            />
          </div>
        )}
      </aside>

      {/* Mobile & Tablet Accessible Focus-Trapped Navigation Drawer (< lg) */}
      <Modal
        open={mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        title="Festola Business Hub"
        description="Workspace navigation menu"
        variant="drawer-left"
      >
        <nav aria-label="Drawer navigation" className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-1">
            {visibleNav.map((item) => {
              const Icon = NAV_ICON_MAP[item.icon];
              return (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex min-h-[42px] items-center justify-between rounded-xl px-3 py-2 text-sm font-medium ${
                        isActive ? 'bg-[#D90000] text-white' : 'text-[#151B2B] hover:bg-[#F8F8FA]'
                      }`
                    }
                  >
                    <span className="flex items-center gap-3">
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{item.label}</span>
                    </span>
                    {item.path === '/app/notifications' && unreadCount > 0 && (
                      <span className="rounded-full bg-[#FFF1F1] px-2 py-0.5 font-mono-tabular text-xs font-bold text-[#D90000]">
                        {unreadCount}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-[#E5E7EB] p-4">
          <p className="mb-3 truncate text-xs text-[#6B7280]">
            <span className="font-semibold text-[#151B2B]">{profile?.fullName}</span> ·{' '}
            <span>{formatRoleLabel(activeMembership.role)}</span>
          </p>
          <div className="space-y-2">
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-[#F8F8FA] px-3 py-2 text-sm font-semibold text-[#151B2B] hover:border-[#D90000]/30 hover:bg-[#FFF1F1] hover:text-[#D90000]"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              <span>Landing Page</span>
            </Link>
            <button
              type="button"
              onClick={() => void handleSignOut()}
              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#151B2B] hover:bg-[#F8F8FA]"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span>Sign out</span>
            </button>
          </div>
        </div>
      </Modal>

      {/* Main Content Wrapper */}
      <div
        className={`transition-[padding] duration-200 ${
          sidebarCollapsed ? 'lg:pl-[78px]' : 'lg:pl-[254px]'
        }`}
      >
        {/* Commercial Top Navigation Bar */}
        <header className="sticky top-0 z-10 border-b border-[#E5E7EB] bg-white/95 backdrop-blur-xs">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
            {/* Left: Mobile Menu Trigger + Global Search + Active Business Switcher */}
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                aria-label="Open navigation menu"
                aria-expanded={mobileMenuOpen}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[#151B2B] hover:bg-[#F8F8FA] lg:hidden"
              >
                <Menu className="h-5 w-5" aria-hidden="true" />
              </button>

              {/* Global Search Bar */}
              <form
                onSubmit={handleGlobalSearch}
                className="relative hidden w-full max-w-md md:block"
                role="search"
              >
                <Search
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B7280]"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products, customers, or transactions..."
                  aria-label="Search products, customers, or transactions"
                  className="h-10 w-full rounded-xl border border-[#E5E7EB] bg-[#F8F8FA] pl-10 pr-4 text-sm text-[#151B2B] placeholder:text-[#6B7280] focus:border-[#D90000] focus:bg-white focus:outline-none"
                />
              </form>

              {/* Authorized Multi-Business / Branch Switcher */}
              {memberships.length > 1 ? (
                <label className="flex min-w-0 items-center gap-2 text-sm">
                  <span className="sr-only">Active business</span>
                  <select
                    aria-label="Switch active business"
                    value={activeMembership.businessId}
                    onChange={(e) => handleBusinessChange(e.target.value)}
                    className="min-h-[40px] max-w-[220px] truncate rounded-xl border border-[#E5E7EB] bg-white px-3 py-1.5 text-sm font-semibold text-[#151B2B] focus:border-[#D90000] focus:outline-none"
                  >
                    {memberships.map((m) => (
                      <option key={m.businessId} value={m.businessId}>
                        {m.businessName} ({m.role})
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="min-w-0 md:hidden">
                  <p className="truncate text-sm font-bold text-[#151B2B]">
                    {activeMembership.businessName}
                  </p>
                </div>
              )}
            </div>

            {/* Right: Online/Sync status, Landing Page, Notifications, Install PWA, User Profile Dropdown */}
            <div className="flex shrink-0 items-center gap-2">
              <Link
                to="/app/sync"
                aria-label={
                  !isOnline
                    ? `Offline mode, ${queuedOfflineCount} queued`
                    : queuedOfflineCount > 0
                      ? `Online, ${queuedOfflineCount} pending sync`
                      : 'Online and synced'
                }
                title="Connectivity & offline sync status"
                className={`inline-flex h-10 items-center gap-1.5 rounded-xl border px-2.5 text-xs font-semibold whitespace-nowrap transition-colors ${
                  !isOnline
                    ? 'border-[#F59E0B] bg-[#FFFBEB] text-[#92400E]'
                    : queuedOfflineCount > 0
                      ? 'border-[#FECACA] bg-[#FEF2F2] text-[#991B1B]'
                      : 'border-[#E4E4E7] bg-white text-[#18181B] hover:bg-[#F4F5F7]'
                }`}
              >
                {!isOnline ? (
                  <WifiOff className="h-3.5 w-3.5 shrink-0 text-[#D97706]" aria-hidden="true" />
                ) : queuedOfflineCount > 0 ? (
                  <RefreshCw className="h-3.5 w-3.5 shrink-0 text-[#991B1B]" aria-hidden="true" />
                ) : (
                  <Wifi className="h-3.5 w-3.5 shrink-0 text-[#16A34A]" aria-hidden="true" />
                )}
                <span className="hidden md:inline">
                  {!isOnline
                    ? queuedOfflineCount > 0
                      ? `Offline · ${queuedOfflineCount} queued`
                      : 'Offline'
                    : queuedOfflineCount > 0
                      ? `Sync pending (${queuedOfflineCount})`
                      : 'Online · Synced'}
                </span>
              </Link>

              <Link
                to="/"
                aria-label="Go to landing page"
                title="Go to landing page"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E5E7EB] bg-white px-3 text-xs font-semibold whitespace-nowrap text-[#151B2B] transition-colors hover:border-[#D90000]/30 hover:bg-[#FFF1F1] hover:text-[#D90000]"
              >
                <Home className="h-4 w-4 shrink-0 text-[#D90000]" aria-hidden="true" />
                <span className="hidden lg:inline">Landing Page</span>
              </Link>

              <div className="hidden xl:block">
                <PWAInstallButton variant="secondary" />
              </div>

              <Link
                to="/app/notifications"
                aria-label={
                  unreadCount > 0 ? `Notifications (${unreadCount} unread)` : 'Notifications'
                }
                className="relative inline-flex h-10 min-w-[40px] items-center justify-center rounded-xl border border-[#E5E7EB] bg-white px-2.5 text-[#151B2B] transition-colors hover:bg-[#F8F8FA]"
              >
                <Bell className="h-4 w-4 text-[#4B5565]" aria-hidden="true" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#D90000] px-1 font-mono-tabular text-[10px] font-bold text-white shadow-xs">
                    {unreadCount}
                  </span>
                )}
              </Link>

              {/* Profile Dropdown */}
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setProfileMenuOpen((prev) => !prev)}
                  aria-expanded={profileMenuOpen}
                  aria-haspopup="menu"
                  className="flex items-center gap-2.5 rounded-xl border border-transparent px-2 py-1 text-left transition-colors hover:border-[#E5E7EB] hover:bg-[#F8F8FA]"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#D90000] text-xs font-bold text-white shadow-xs">
                    {getInitials(profile?.fullName)}
                  </span>
                  <span className="hidden min-w-0 sm:block">
                    <span className="block max-w-[130px] truncate text-xs font-bold text-[#151B2B]">
                      {profile?.fullName ?? 'Account'}
                    </span>
                    <span className="block truncate text-[11px] text-[#6B7280]">
                      {formatRoleLabel(activeMembership.role)}
                    </span>
                  </span>
                  <ChevronDown
                    className="hidden h-4 w-4 text-[#6B7280] sm:block"
                    aria-hidden="true"
                  />
                </button>

                {profileMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-56 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white py-1.5 shadow-xl"
                  >
                    <div className="border-b border-[#F1F5F9] px-4 py-2.5">
                      <p className="truncate text-xs font-bold text-[#151B2B]">
                        {profile?.fullName}
                      </p>
                      <p className="truncate text-[11px] text-[#6B7280]">{profile?.email}</p>
                      <p className="mt-1 truncate text-[11px] font-medium text-[#D90000]">
                        {activeMembership.businessName}
                      </p>
                    </div>
                    {canManageSettings && (
                      <Link
                        to="/app/settings"
                        role="menuitem"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[#151B2B] hover:bg-[#F8F8FA]"
                      >
                        <Settings className="h-4 w-4 text-[#6B7280]" aria-hidden="true" />
                        <span>Business Settings</span>
                      </Link>
                    )}
                    <Link
                      to="/app/sync"
                      role="menuitem"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[#151B2B] hover:bg-[#F8F8FA]"
                    >
                      <RefreshCw className="h-4 w-4 text-[#6B7280]" aria-hidden="true" />
                      <span>Offline Sync ({queuedOfflineCount})</span>
                    </Link>
                    {canManageBilling && (
                      <Link
                        to="/app/subscription"
                        role="menuitem"
                        onClick={() => setProfileMenuOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[#151B2B] hover:bg-[#F8F8FA]"
                      >
                        <Crown className="h-4 w-4 text-[#6B7280]" aria-hidden="true" />
                        <span>Subscription &amp; Billing</span>
                      </Link>
                    )}
                    <Link
                      to="/"
                      role="menuitem"
                      onClick={() => setProfileMenuOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-xs font-medium text-[#151B2B] hover:bg-[#F8F8FA]"
                    >
                      <Home className="h-4 w-4 text-[#6B7280]" aria-hidden="true" />
                      <span>Landing Page</span>
                    </Link>
                    <div className="my-1 border-t border-[#F1F5F9]" />
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => void handleSignOut()}
                      className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-xs font-semibold text-[#DC2626] hover:bg-[#FFF1F1]"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      <span>Sign out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Main Application Content Viewport */}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[1360px] px-4 py-6 pb-24 focus:outline-none sm:px-6 md:pb-10"
        >
          {/* D-01 Subscription Grace / Read-Only Notice */}
          {(activeMembership.subscriptionStatus === 'grace_period' ||
            activeMembership.subscriptionStatus === 'read_only' ||
            activeMembership.subscriptionStatus === 'cancelled') && (
            <div
              role="status"
              className={`mb-6 flex items-start gap-3 rounded-xl border bg-white p-4 text-sm shadow-2xs ${
                activeMembership.subscriptionStatus === 'grace_period'
                  ? 'border-[#F59E0B]'
                  : 'border-[#DC2626]'
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 h-4 w-4 shrink-0 ${
                  activeMembership.subscriptionStatus === 'grace_period'
                    ? 'text-[#F59E0B]'
                    : 'text-[#DC2626]'
                }`}
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-[#151B2B]">
                  {activeMembership.subscriptionStatus === 'grace_period'
                    ? 'Subscription in 7-day grace period'
                    : 'Subscription read-only mode'}
                </p>
                <p className="mt-0.5 text-xs text-[#6B7280]">
                  {activeMembership.subscriptionStatus === 'grace_period'
                    ? 'Renew your plan before the grace window ends to avoid switching to read-only mode.'
                    : 'Your business records are safely preserved for viewing and export, but creating or editing records is paused until renewal.'}
                </p>
              </div>
            </div>
          )}

          {/* Remount child outlet cleanly whenever tenant switches or route changes */}
          <ErrorBoundary
            compact
            resetKey={`${location.pathname}:${activeMembership.businessId}:${tenantEpoch}`}
          >
            <div key={`${activeMembership.businessId}:${tenantEpoch}`}>
              <Outlet />
            </div>
          </ErrorBoundary>
        </main>
      </div>

      {/* Mobile Bottom Quick Navigation (< md) */}
      <nav
        aria-label="Mobile quick navigation"
        className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-[#E5E7EB] bg-white shadow-lg md:hidden"
      >
        <div className={`grid ${mobileBottomNav.length === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
          {mobileBottomNav.map((item) => {
            const Icon = NAV_ICON_MAP[item.icon];
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `flex min-h-[54px] flex-col items-center justify-center gap-0.5 px-2 text-[11px] font-medium ${
                    isActive ? 'text-[#D90000]' : 'text-[#6B7280]'
                  }`
                }
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span className="truncate">{item.shortLabel}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
