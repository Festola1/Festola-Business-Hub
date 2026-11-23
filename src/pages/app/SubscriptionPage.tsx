import { CheckCircle2, CreditCard, ExternalLink, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchSubscriptionInvoices,
  fetchSubscriptionPlans,
  initiateSubscriptionCheckout,
  verifySubscriptionPayment,
  type SubscriptionInvoiceItem,
  type SubscriptionPlanCatalogItem,
} from '../../lib/commerce-api';
import { formatDateOnly, formatDateTime, formatMoney } from '../../lib/format';
import { fetchCurrentSubscription, type SubscriptionUsageSummary } from '../../lib/identity-api';

export default function SubscriptionPage() {
  const { accessToken, activeMembership, refreshAccount, tenantEpoch } = useAuth();
  const { pushToast } = useToast();
  const [searchParams] = useSearchParams();

  const [usage, setUsage] = useState<SubscriptionUsageSummary | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlanCatalogItem[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoiceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [checkoutPlanCode, setCheckoutPlanCode] = useState<string | null>(null);
  const [pendingCheckout, setPendingCheckout] = useState<{
    checkoutUrl: string;
    reference: string;
  } | null>(null);

  const [verifyRef, setVerifyRef] = useState(
    () => searchParams.get('reference') ?? searchParams.get('trxref') ?? '',
  );
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;

    void Promise.all([
      fetchCurrentSubscription(accessToken, activeMembership.businessId),
      fetchSubscriptionPlans(accessToken),
      fetchSubscriptionInvoices(accessToken, activeMembership.businessId),
    ]).then(([subRes, plansRes, invRes]) => {
      if (cancelled) {
        return;
      }
      if (!subRes.success || !subRes.data) {
        setError(subRes.error?.message ?? 'Unable to load subscription details.');
        setLoading(false);
        return;
      }
      setUsage(subRes.data);
      setPlans(plansRes.success && plansRes.data ? plansRes.data.plans : []);
      setInvoices(invRes.success && invRes.data ? invRes.data.invoices : []);
      setError(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, reloadTick, tenantEpoch]);

  const handleCheckout = async (planCode: string) => {
    if (!accessToken || !activeMembership) {
      return;
    }
    setCheckoutPlanCode(planCode);
    const res = await initiateSubscriptionCheckout(
      accessToken,
      activeMembership.businessId,
      planCode,
    );
    setCheckoutPlanCode(null);

    if (!res.success || !res.data) {
      pushToast(res.error?.message ?? 'Unable to initiate Paystack checkout.', 'error');
      return;
    }

    setPendingCheckout({
      checkoutUrl: res.data.checkoutUrl,
      reference: res.data.reference,
    });
    setVerifyRef(res.data.reference);
    pushToast(
      'Paystack checkout session created. Continue to Paystack to complete payment.',
      'success',
    );
    setLoading(true);
    setReloadTick((n) => n + 1);
  };

  const handleVerify = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership || !verifyRef.trim()) {
      return;
    }
    setVerifying(true);
    const res = await verifySubscriptionPayment(
      accessToken,
      activeMembership.businessId,
      verifyRef.trim(),
    );
    setVerifying(false);

    if (!res.success) {
      pushToast(res.error?.message ?? 'Payment reference could not be verified.', 'error');
      return;
    }

    pushToast('Subscription payment verified and business plan activated.', 'success');
    setPendingCheckout(null);
    await refreshAccount();
    setLoading(true);
    setReloadTick((n) => n + 1);
  };

  const paidPlans = plans.filter((p) => p.isActive && p.billingInterval !== 'trial');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription & Billing"
        description="Server-verified NGN subscriptions (Paystack checkout integrated; Flutterwave gateway ready), capacity usage, and invoice history. Real payments are never simulated."
      />

      {loading ? (
        <LoadingSkeleton rows={5} label="Loading subscription and billing catalog..." />
      ) : error ? (
        <ErrorState
          message={error}
          onRetry={() => {
            setLoading(true);
            setReloadTick((n) => n + 1);
          }}
        />
      ) : usage ? (
        <>
          {usage.status === 'grace_period' && (
            <AlertBanner tone="warning" title="Subscription in 7-day grace period">
              Renew now to prevent automatic switch to Read-Only mode
              {usage.subscription?.graceEndsAt
                ? ` on ${formatDateOnly(usage.subscription.graceEndsAt)}.`
                : '.'}
            </AlertBanner>
          )}
          {(usage.status === 'read_only' || usage.status === 'cancelled') && (
            <AlertBanner tone="error" title="Workspace is in Read-Only mode">
              Your data and financial reports remain accessible for viewing and CSV export. Complete
              a renewal below to restore POS checkout and writes immediately.
            </AlertBanner>
          )}

          {/* Current Plan & Usage */}
          <Card className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#E4E4E7] pb-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-[#52525B]">
                  Current Plan
                </p>
                <h2 className="mt-1 text-xl font-bold text-[#18181B]">
                  {usage.subscription?.limits.displayName ??
                    activeMembership?.limits.displayName ??
                    'Active Plan'}
                </h2>
                <p className="mt-1 text-xs text-[#52525B]">
                  Status:{' '}
                  <span className="font-semibold capitalize text-[#18181B]">
                    {usage.status.replace('_', ' ')}
                  </span>
                  {usage.subscription?.currentPeriodEnd && (
                    <>
                      {' · '}Current period ends{' '}
                      <span className="font-mono-tabular">
                        {formatDateOnly(usage.subscription.currentPeriodEnd)}
                      </span>
                    </>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-[#52525B]">
                <ShieldCheck className="h-4 w-4 text-[#16A34A]" aria-hidden="true" />
                <span>Server-verified Paystack billing</span>
              </div>
            </div>

            <dl className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-[#52525B]">Staff Accounts</dt>
                <dd className="mt-1 font-mono-tabular text-lg font-bold text-[#18181B]">
                  {usage.staffCount} /{' '}
                  {usage.subscription?.limits.maxStaff ?? activeMembership?.limits.maxStaff ?? '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#52525B]">Catalog Products</dt>
                <dd className="mt-1 font-mono-tabular text-lg font-bold text-[#18181B]">
                  {usage.productCount} /{' '}
                  {usage.subscription?.limits.maxProducts ??
                    activeMembership?.limits.maxProducts ??
                    '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-[#52525B]">Offline Counter Devices</dt>
                <dd className="mt-1 font-mono-tabular text-lg font-bold text-[#18181B]">
                  {usage.activeDeviceCount} /{' '}
                  {usage.subscription?.limits.maxOfflineDevices ??
                    activeMembership?.limits.maxOfflineDevices ??
                    '—'}
                </dd>
              </div>
            </dl>
          </Card>

          {pendingCheckout && (
            <AlertBanner
              tone="info"
              title="Paystack checkout ready"
              action={
                <a
                  href={pendingCheckout.checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#991B1B] px-4 py-2 text-xs font-medium text-white hover:bg-[#7F1D1D]"
                >
                  <span>Open Paystack Checkout</span>
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              }
            >
              Reference{' '}
              <span className="font-mono-tabular font-semibold">{pendingCheckout.reference}</span>.
              After completing payment on Paystack, click Verify Payment below.
            </AlertBanner>
          )}

          {/* Server-owned Plan Catalog (D-01: never invent commercial names or prices client-side) */}
          <section className="space-y-3">
            <h2 className="text-base font-semibold text-[#18181B]">Available Plans</h2>
            {paidPlans.length === 0 ? (
              <EmptyState
                title="No paid plans returned by server"
                description="Commercial plan tiers and NGN prices are configured exclusively in the server billing catalog (GET /api/v1/plans)."
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {paidPlans.map((plan) => {
                  const isCurrent = usage.subscription?.limits.planCode === plan.planCode;
                  return (
                    <Card key={plan.id} className="flex flex-col justify-between p-5">
                      <div>
                        <div className="flex items-baseline justify-between gap-2">
                          <h3 className="text-base font-bold text-[#18181B]">{plan.displayName}</h3>
                          <span className="text-xs font-medium capitalize text-[#52525B]">
                            {plan.billingInterval}
                          </span>
                        </div>
                        <p className="mt-2 font-mono-tabular text-2xl font-bold text-[#991B1B]">
                          {formatMoney(plan.priceAmount, plan.currencyCode)}
                        </p>
                        <ul className="mt-4 space-y-1.5 text-xs text-[#52525B]">
                          <li className="flex items-center gap-2">
                            <CheckCircle2
                              className="h-3.5 w-3.5 text-[#16A34A]"
                              aria-hidden="true"
                            />
                            <span>Up to {plan.maxStaff} staff accounts</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2
                              className="h-3.5 w-3.5 text-[#16A34A]"
                              aria-hidden="true"
                            />
                            <span>Up to {plan.maxProducts} active products</span>
                          </li>
                          <li className="flex items-center gap-2">
                            <CheckCircle2
                              className="h-3.5 w-3.5 text-[#16A34A]"
                              aria-hidden="true"
                            />
                            <span>Up to {plan.maxOfflineDevices} registered offline devices</span>
                          </li>
                        </ul>
                      </div>
                      <div className="mt-5">
                        <Button
                          variant={isCurrent ? 'secondary' : 'primary'}
                          fullWidth
                          loading={checkoutPlanCode === plan.planCode}
                          onClick={() => void handleCheckout(plan.planCode)}
                        >
                          <CreditCard className="h-4 w-4" aria-hidden="true" />
                          <span>{isCurrent ? 'Renew current plan' : 'Subscribe via Paystack'}</span>
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* Verify Paystack Payment Reference */}
          <Card className="p-5">
            <h2 className="text-base font-semibold text-[#18181B]">Verify Paystack Payment</h2>
            <p className="mt-1 text-xs text-[#52525B]">
              Returning from Paystack? Verify your transaction reference to confirm server
              activation.
            </p>
            <form
              onSubmit={(e) => void handleVerify(e)}
              className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            >
              <div className="flex-1">
                <FormField id="paystack-ref" label="Paystack payment reference">
                  <Input
                    id="paystack-ref"
                    mono
                    value={verifyRef}
                    onChange={(e) => setVerifyRef(e.target.value)}
                    placeholder="FEST-..."
                  />
                </FormField>
              </div>
              <Button
                type="submit"
                variant="primary"
                loading={verifying}
                disabled={!verifyRef.trim()}
              >
                Verify payment
              </Button>
            </form>
          </Card>

          {/* Invoice History */}
          <Card className="overflow-hidden">
            <div className="border-b border-[#E4E4E7] px-5 py-3.5">
              <h2 className="text-base font-semibold text-[#18181B]">Billing Invoices</h2>
            </div>
            {invoices.length === 0 ? (
              <p className="p-5 text-sm text-[#52525B]">No billing invoices generated yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7] text-xs font-semibold text-[#52525B]">
                    <tr>
                      <th className="px-4 py-2.5">Reference</th>
                      <th className="px-4 py-2.5">Created</th>
                      <th className="px-4 py-2.5 text-right">Amount</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E4E4E7]">
                    {invoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="px-4 py-3 font-mono-tabular text-xs font-medium text-[#18181B]">
                          {inv.providerReference}
                        </td>
                        <td className="px-4 py-3 font-mono-tabular text-xs text-[#52525B]">
                          {formatDateTime(inv.createdAt)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono-tabular text-xs font-semibold text-[#18181B]">
                          {formatMoney(inv.amount, inv.currencyCode)}
                        </td>
                        <td className="px-4 py-3 text-xs font-medium capitalize">
                          <span
                            className={
                              inv.status === 'paid'
                                ? 'text-[#16A34A]'
                                : inv.status === 'failed'
                                  ? 'text-[#DC2626]'
                                  : 'text-[#D97706]'
                            }
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {inv.status === 'pending' && inv.checkoutUrl ? (
                            <a
                              href={inv.checkoutUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-medium text-[#991B1B] underline"
                            >
                              Resume checkout
                            </a>
                          ) : (
                            <span className="font-mono-tabular text-xs text-[#52525B]">
                              {inv.paidAt ? formatDateOnly(inv.paidAt) : '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
