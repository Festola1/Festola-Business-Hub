/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { lazy, Suspense, useEffect, type ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { PWAUpdateBanner } from './components/pwa/PWAUpdateBanner';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { PageSkeleton } from './components/ui/Feedback';
import { ToastProvider } from './components/ui/ToastProvider';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { canRoleAccess, type ClientPermission } from './lib/permissions';
import LandingPage from './pages/LandingPage';

const FeaturesPage = lazy(() => import('./pages/public/FeaturesPage'));
const HowItWorksPage = lazy(() => import('./pages/public/HowItWorksPage'));
const PricingPage = lazy(() => import('./pages/public/PricingPage'));
const AboutPage = lazy(() => import('./pages/public/AboutPage'));
const ContactPage = lazy(() => import('./pages/public/ContactPage'));
const PrivacyPage = lazy(() =>
  import('./pages/public/LegalPages').then((mod) => ({ default: mod.PrivacyPage })),
);
const TermsPage = lazy(() =>
  import('./pages/public/LegalPages').then((mod) => ({ default: mod.TermsPage })),
);
const HelpSupportPage = lazy(() =>
  import('./pages/public/LegalPages').then((mod) => ({ default: mod.HelpSupportPage })),
);
const LoginPage = lazy(() => import('./pages/auth/LoginPage'));
const RegisterPage = lazy(() => import('./pages/auth/RegisterPage'));
const VerifyEmailPage = lazy(() => import('./pages/auth/VerifyEmailPage'));
const ForgotPasswordPage = lazy(() => import('./pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./pages/auth/ResetPasswordPage'));
const AcceptInvitePage = lazy(() => import('./pages/auth/AcceptInvitePage'));
const BusinessSetupPage = lazy(() => import('./pages/onboarding/BusinessSetupPage'));
const DashboardPage = lazy(() => import('./pages/app/DashboardPage'));
const PosPage = lazy(() => import('./pages/app/PosPage'));
const SalesPage = lazy(() => import('./pages/app/SalesPage'));
const ProductsPage = lazy(() => import('./pages/app/ProductsPage'));
const InventoryPage = lazy(() => import('./pages/app/InventoryPage'));
const PurchasesPage = lazy(() => import('./pages/app/PurchasesPage'));
const CustomersPage = lazy(() => import('./pages/app/CustomersPage'));
const SuppliersPage = lazy(() => import('./pages/app/SuppliersPage'));
const DebtsPage = lazy(() => import('./pages/app/DebtsPage'));
const ExpensesPage = lazy(() => import('./pages/app/ExpensesPage'));
const ReportsPage = lazy(() => import('./pages/app/ReportsPage'));
const SyncPage = lazy(() => import('./pages/app/SyncPage'));
const SubscriptionPage = lazy(() => import('./pages/app/SubscriptionPage'));
const NotificationsPage = lazy(() => import('./pages/app/NotificationsPage'));
const SettingsPage = lazy(() => import('./pages/app/SettingsPage'));
const StaffPage = lazy(() => import('./pages/app/StaffPage'));
const DevicesPage = lazy(() => import('./pages/app/DevicesPage'));
const AuditLogsPage = lazy(() => import('./pages/app/AuditLogsPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

const DIRECT_APP_ROUTE_ALIASES = [
  'dashboard',
  'pos',
  'sales',
  'inventory',
  'products',
  'purchases',
  'customers',
  'suppliers',
  'expenses',
  'debts',
  'reports',
  'staff',
  'notifications',
  'settings',
  'subscription',
] as const;

function RequireAuthenticated({ children }: { children: ReactNode }) {
  const { isLoading, session, emailNotVerified } = useAuth();
  if (isLoading) {
    return <PageSkeleton />;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (emailNotVerified) {
    return <Navigate to="/verify-email" replace />;
  }
  return <>{children}</>;
}

function RequireActiveBusiness({ children }: { children: ReactNode }) {
  const { isLoading, session, emailNotVerified, activeMembership } = useAuth();
  if (isLoading) {
    return <PageSkeleton />;
  }
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  if (emailNotVerified) {
    return <Navigate to="/verify-email" replace />;
  }
  if (!activeMembership) {
    return <Navigate to="/onboarding" replace />;
  }
  return <>{children}</>;
}

function RequireClientPermission({
  permission,
  children,
}: {
  permission: ClientPermission;
  children: ReactNode;
}) {
  const { activeMembership } = useAuth();
  if (!activeMembership || !canRoleAccess(activeMembership.role, permission)) {
    return <Navigate to="/app/dashboard" replace />;
  }
  return <>{children}</>;
}

function ScrollToTopOnRouteChange() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash && typeof window.scrollTo === 'function') {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [pathname, hash]);
  return null;
}

export function AppRoutes() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ScrollToTopOnRouteChange />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/how-it-works" element={<HowItWorksPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/help" element={<HelpSupportPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/verify-email" element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/accept-invite" element={<AcceptInvitePage />} />

        <Route
          path="/onboarding"
          element={
            <RequireAuthenticated>
              <BusinessSetupPage />
            </RequireAuthenticated>
          }
        />

        {/* Protected Section 21 direct module aliases redirecting to canonical /app/* workspace */}
        {DIRECT_APP_ROUTE_ALIASES.map((segment) => (
          <Route
            key={segment}
            path={`/${segment}`}
            element={
              <RequireActiveBusiness>
                <Navigate to={`/app/${segment}`} replace />
              </RequireActiveBusiness>
            }
          />
        ))}

        <Route
          path="/app"
          element={
            <RequireActiveBusiness>
              <AppShell />
            </RequireActiveBusiness>
          }
        >
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="pos" element={<PosPage />} />
          <Route path="sales" element={<SalesPage />} />
          <Route path="products" element={<ProductsPage />} />
          <Route
            path="inventory"
            element={
              <RequireClientPermission permission="inventory.receive_and_adjust">
                <InventoryPage />
              </RequireClientPermission>
            }
          />
          <Route
            path="purchases"
            element={
              <RequireClientPermission permission="inventory.receive_and_adjust">
                <PurchasesPage />
              </RequireClientPermission>
            }
          />
          <Route path="customers" element={<CustomersPage />} />
          <Route
            path="suppliers"
            element={
              <RequireClientPermission permission="inventory.receive_and_adjust">
                <SuppliersPage />
              </RequireClientPermission>
            }
          />
          <Route
            path="debts"
            element={
              <RequireClientPermission permission="debts.collect">
                <DebtsPage />
              </RequireClientPermission>
            }
          />
          <Route
            path="expenses"
            element={
              <RequireClientPermission permission="expenses.manage">
                <ExpensesPage />
              </RequireClientPermission>
            }
          />
          <Route
            path="reports"
            element={
              <RequireClientPermission permission="reports.view_basic">
                <ReportsPage />
              </RequireClientPermission>
            }
          />
          <Route path="sync" element={<SyncPage />} />
          <Route
            path="staff"
            element={
              <RequireClientPermission permission="staff.view">
                <StaffPage />
              </RequireClientPermission>
            }
          />
          <Route path="devices" element={<DevicesPage />} />
          <Route
            path="subscription"
            element={
              <RequireClientPermission permission="billing.manage">
                <SubscriptionPage />
              </RequireClientPermission>
            }
          />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route
            path="settings"
            element={
              <RequireClientPermission permission="settings.manage">
                <SettingsPage />
              </RequireClientPermission>
            }
          />
          <Route
            path="audit-logs"
            element={
              <RequireClientPermission permission="audit_logs.view">
                <AuditLogsPage />
              </RequireClientPermission>
            }
          />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <OfflineIndicator />
      <PWAUpdateBanner />
    </Suspense>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
