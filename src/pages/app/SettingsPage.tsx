import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { CheckboxField, FormField, Input, Select } from '../../components/ui/FormControls';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { extractFieldErrors, getFriendlyApiError } from '../../lib/error-messages';
import {
  fetchCurrentBusiness,
  fetchCurrentSubscription,
  fetchLocations,
  updateBusinessSettings,
  updateLocation,
  type BusinessDetails,
  type BusinessLocation,
  type SubscriptionUsageSummary,
} from '../../lib/identity-api';
import {
  BusinessSettingsSchema,
  LocationSettingsSchema,
  validateWithSchema,
  type FieldErrorMap,
} from '../../lib/validation';

interface SettingsFormFields {
  name: string;
  phone: string;
  address: string;
  taxId: string;
  taxEnabled: boolean;
  taxMode: 'exclusive' | 'inclusive';
  taxRate: string;
  allowNegativeStock: boolean;
  receiptFooter: string;
}

interface LocationFormFields {
  name: string;
  phone: string;
  address: string;
}

export default function SettingsPage() {
  const { accessToken, activeMembership, refreshAccount } = useAuth();
  const { pushToast } = useToast();

  const [business, setBusiness] = useState<BusinessDetails | null>(null);
  const [primaryLocation, setPrimaryLocation] = useState<BusinessLocation | null>(null);
  const [usage, setUsage] = useState<SubscriptionUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Business form state
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxId, setTaxId] = useState('');
  const [taxEnabled, setTaxEnabled] = useState(false);
  const [taxMode, setTaxMode] = useState<'exclusive' | 'inclusive'>('exclusive');
  const [taxRate, setTaxRate] = useState('0');
  const [allowNegativeStock, setAllowNegativeStock] = useState(false);
  const [receiptFooter, setReceiptFooter] = useState('');
  const [savingBusiness, setSavingBusiness] = useState(false);
  const [businessErrors, setBusinessErrors] = useState<FieldErrorMap<SettingsFormFields>>({});
  const [businessErrorBanner, setBusinessErrorBanner] = useState<string | null>(null);
  const [businessSuccess, setBusinessSuccess] = useState<string | null>(null);

  // Location form state (D-02 single active location)
  const [locName, setLocName] = useState('');
  const [locPhone, setLocPhone] = useState('');
  const [locAddress, setLocAddress] = useState('');
  const [savingLocation, setSavingLocation] = useState(false);
  const [locationErrors, setLocationErrors] = useState<FieldErrorMap<LocationFormFields>>({});
  const [locationErrorBanner, setLocationErrorBanner] = useState<string | null>(null);
  const [locationSuccess, setLocationSuccess] = useState<string | null>(null);

  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;

    void Promise.all([
      fetchCurrentBusiness(accessToken, activeMembership.businessId),
      fetchLocations(accessToken, activeMembership.businessId),
      fetchCurrentSubscription(accessToken, activeMembership.businessId),
    ]).then(([bizRes, locRes, subRes]) => {
      if (cancelled) {
        return;
      }

      if (!bizRes.success || !bizRes.data) {
        setLoadError(getFriendlyApiError(bizRes.error, 'Unable to load business settings.'));
        setLoading(false);
        return;
      }

      const b = bizRes.data.business;
      setBusiness(b);
      setName(b.name);
      setPhone(b.phone ?? '');
      setAddress(b.address ?? '');
      setTaxId(b.taxId ?? '');
      setTaxEnabled(b.taxEnabled);
      setTaxMode(b.taxMode);
      setTaxRate(String(Number(b.taxRate)));
      setAllowNegativeStock(b.allowNegativeStock);
      setReceiptFooter(b.receiptFooter ?? '');

      const resolvedLocation =
        (locRes.success && locRes.data?.locations.find((l) => l.isDefault)) ||
        (locRes.success ? locRes.data?.locations[0] : undefined) ||
        bizRes.data.defaultLocation;

      if (resolvedLocation) {
        setPrimaryLocation(resolvedLocation);
        setLocName(resolvedLocation.name);
        setLocPhone(resolvedLocation.phone ?? '');
        setLocAddress(resolvedLocation.address ?? '');
      }

      if (subRes.success && subRes.data) {
        setUsage(subRes.data);
      }

      setLoadError(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, reloadTick]);

  const handleRetryLoad = () => {
    setLoading(true);
    setLoadError(null);
    setReloadTick((prev) => prev + 1);
  };

  const handleSaveBusiness = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) {
      return;
    }
    setBusinessErrorBanner(null);
    setBusinessSuccess(null);
    setBusinessErrors({});

    const validation = validateWithSchema(BusinessSettingsSchema, {
      name,
      phone,
      address,
      taxId,
      taxEnabled,
      taxMode,
      taxRate,
      allowNegativeStock,
      receiptFooter,
    });
    if (!validation.ok) {
      setBusinessErrors(validation.fieldErrors);
      setBusinessErrorBanner(validation.summary);
      return;
    }

    setSavingBusiness(true);
    const res = await updateBusinessSettings(accessToken, activeMembership.businessId, {
      name: validation.data.name,
      phone: validation.data.phone ? validation.data.phone : null,
      address: validation.data.address ? validation.data.address : null,
      taxId: validation.data.taxId ? validation.data.taxId : null,
      taxEnabled: validation.data.taxEnabled,
      taxMode: validation.data.taxMode,
      taxRate: validation.data.taxEnabled ? Number(validation.data.taxRate) : 0,
      allowNegativeStock: validation.data.allowNegativeStock,
      receiptFooter: validation.data.receiptFooter ? validation.data.receiptFooter : null,
    });
    setSavingBusiness(false);

    if (!res.success || !res.data) {
      setBusinessErrors(extractFieldErrors(res.error) as FieldErrorMap<SettingsFormFields>);
      setBusinessErrorBanner(getFriendlyApiError(res.error, 'Unable to save business settings.'));
      return;
    }

    setBusiness(res.data.business);
    const message = 'Business settings saved and recorded in the audit log.';
    setBusinessSuccess(message);
    pushToast(message, 'success');
    await refreshAccount();
  };

  const handleSaveLocation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership || !primaryLocation) {
      return;
    }
    setLocationErrorBanner(null);
    setLocationSuccess(null);
    setLocationErrors({});

    const validation = validateWithSchema(LocationSettingsSchema, {
      name: locName,
      phone: locPhone,
      address: locAddress,
    });
    if (!validation.ok) {
      setLocationErrors(validation.fieldErrors);
      setLocationErrorBanner(validation.summary);
      return;
    }

    setSavingLocation(true);
    const res = await updateLocation(accessToken, activeMembership.businessId, primaryLocation.id, {
      name: validation.data.name,
      phone: validation.data.phone ? validation.data.phone : null,
      address: validation.data.address ? validation.data.address : null,
    });
    setSavingLocation(false);

    if (!res.success || !res.data) {
      setLocationErrors(extractFieldErrors(res.error) as FieldErrorMap<LocationFormFields>);
      setLocationErrorBanner(getFriendlyApiError(res.error, 'Unable to update store location.'));
      return;
    }

    setPrimaryLocation(res.data.location);
    const message = 'Primary store location details updated.';
    setLocationSuccess(message);
    pushToast(message, 'success');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Business Settings"
          description="Configure store profile, tax rules, negative-stock policy, and primary store location."
        />
        <LoadingSkeleton rows={5} label="Loading business settings..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title="Business Settings" />
        <ErrorState message={loadError} onRetry={handleRetryLoad} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Business Settings"
        description="Configure store details, optional tax rules, negative-stock policy, and your primary location. Owner access only."
      />

      {isReadOnly && (
        <AlertBanner tone="warning" title="Read-only subscription mode">
          Settings cannot be edited while your subscription is in read-only mode. Renew your plan to
          re-enable edits.
        </AlertBanner>
      )}

      {/* Business Profile, Tax & Inventory Policy */}
      <Card>
        <form
          onSubmit={(e) => void handleSaveBusiness(e)}
          className="divide-y divide-[#E4E4E7]"
          noValidate
        >
          <div className="space-y-4 p-6">
            <h2 className="text-base font-semibold text-[#18181B]">
              Store Profile & Receipt Header
            </h2>

            {businessErrorBanner && <AlertBanner tone="error">{businessErrorBanner}</AlertBanner>}
            {businessSuccess && <AlertBanner tone="success">{businessSuccess}</AlertBanner>}

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="set-name" label="Business name" required error={businessErrors.name}>
                <Input
                  id="set-name"
                  type="text"
                  required
                  disabled={isReadOnly}
                  hasError={Boolean(businessErrors.name)}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </FormField>

              <FormField id="set-phone" label="Phone number" error={businessErrors.phone}>
                <Input
                  id="set-phone"
                  type="tel"
                  disabled={isReadOnly}
                  hasError={Boolean(businessErrors.phone)}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </FormField>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField id="set-address" label="Store address" error={businessErrors.address}>
                <Input
                  id="set-address"
                  type="text"
                  disabled={isReadOnly}
                  hasError={Boolean(businessErrors.address)}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </FormField>

              <FormField id="set-tin" label="Tax ID / TIN (optional)" error={businessErrors.taxId}>
                <Input
                  id="set-tin"
                  type="text"
                  mono
                  disabled={isReadOnly}
                  hasError={Boolean(businessErrors.taxId)}
                  value={taxId}
                  onChange={(e) => setTaxId(e.target.value)}
                />
              </FormField>
            </div>

            <FormField
              id="set-footer"
              label="Receipt footer note (optional)"
              error={businessErrors.receiptFooter}
            >
              <Input
                id="set-footer"
                type="text"
                disabled={isReadOnly}
                hasError={Boolean(businessErrors.receiptFooter)}
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                placeholder="Thank you for shopping with us."
              />
            </FormField>

            {business && (
              <p className="text-xs text-[#52525B]">
                Currency:{' '}
                <span className="font-mono-tabular text-[#18181B]">{business.currencyCode}</span> ·
                Timezone: <span className="font-mono text-[#18181B]">{business.timezone}</span>
              </p>
            )}
          </div>

          {/* D-03 Configurable Tax Rules */}
          <div className="space-y-4 p-6">
            <h2 className="text-base font-semibold text-[#18181B]">Tax Rules</h2>
            <CheckboxField
              id="set-tax-enabled"
              disabled={isReadOnly}
              checked={taxEnabled}
              onChange={(e) => setTaxEnabled(e.target.checked)}
              label="Enable flat sales tax on receipts"
              description="Off by default. When enabled, each sale records an immutable tax rate and tax amount snapshot separate from net revenue."
            />

            {taxEnabled && (
              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="set-tax-mode" label="Tax calculation mode">
                  <Select
                    id="set-tax-mode"
                    disabled={isReadOnly}
                    value={taxMode}
                    onChange={(e) => setTaxMode(e.target.value as 'exclusive' | 'inclusive')}
                  >
                    <option value="exclusive">Tax-exclusive (added at checkout)</option>
                    <option value="inclusive">Tax-inclusive (included in shelf price)</option>
                  </Select>
                </FormField>

                <FormField
                  id="set-tax-rate"
                  label="Flat tax rate (%)"
                  required
                  error={businessErrors.taxRate}
                >
                  <Input
                    id="set-tax-rate"
                    type="number"
                    mono
                    step="0.01"
                    min="0.01"
                    max="100"
                    disabled={isReadOnly}
                    hasError={Boolean(businessErrors.taxRate)}
                    value={taxRate}
                    onChange={(e) => setTaxRate(e.target.value)}
                  />
                </FormField>
              </div>
            )}
          </div>

          {/* D-04 Negative Stock Override */}
          <div className="space-y-4 p-6">
            <h2 className="text-base font-semibold text-[#18181B]">Inventory Policy</h2>
            <CheckboxField
              id="set-negative-stock"
              disabled={isReadOnly}
              checked={allowNegativeStock}
              onChange={(e) => setAllowNegativeStock(e.target.checked)}
              label="Allow negative stock on online POS sales"
              description="Blocked by default to prevent overselling. Enabling this flags negative-stock sales in your inventory ledger for later reconciliation."
            />
          </div>

          <div className="flex items-center justify-end px-6 py-4">
            <Button
              type="submit"
              variant="primary"
              disabled={isReadOnly}
              loading={savingBusiness}
              loadingLabel="Saving changes..."
            >
              Save settings
            </Button>
          </div>
        </form>
      </Card>

      {/* D-02 Single Active Location Settings */}
      {primaryLocation && (
        <Card>
          <form
            onSubmit={(e) => void handleSaveLocation(e)}
            className="divide-y divide-[#E4E4E7]"
            noValidate
          >
            <div className="space-y-4 p-6">
              <div>
                <h2 className="text-base font-semibold text-[#18181B]">Primary Store Location</h2>
                <p className="mt-1 text-xs text-[#52525B]">
                  Single active location mode. Multi-branch creation and inter-branch stock
                  transfers are scheduled for Release 2.
                </p>
              </div>

              {locationErrorBanner && <AlertBanner tone="error">{locationErrorBanner}</AlertBanner>}
              {locationSuccess && <AlertBanner tone="success">{locationSuccess}</AlertBanner>}

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField id="loc-name" label="Location name" required error={locationErrors.name}>
                  <Input
                    id="loc-name"
                    type="text"
                    required
                    disabled={isReadOnly}
                    hasError={Boolean(locationErrors.name)}
                    value={locName}
                    onChange={(e) => setLocName(e.target.value)}
                  />
                </FormField>

                <FormField
                  id="loc-phone"
                  label="Location phone (optional)"
                  error={locationErrors.phone}
                >
                  <Input
                    id="loc-phone"
                    type="tel"
                    disabled={isReadOnly}
                    hasError={Boolean(locationErrors.phone)}
                    value={locPhone}
                    onChange={(e) => setLocPhone(e.target.value)}
                  />
                </FormField>
              </div>

              <FormField
                id="loc-address"
                label="Location street address (optional)"
                error={locationErrors.address}
              >
                <Input
                  id="loc-address"
                  type="text"
                  disabled={isReadOnly}
                  hasError={Boolean(locationErrors.address)}
                  value={locAddress}
                  onChange={(e) => setLocAddress(e.target.value)}
                />
              </FormField>
            </div>

            <div className="flex items-center justify-end px-6 py-4">
              <Button
                type="submit"
                variant="secondary"
                disabled={isReadOnly}
                loading={savingLocation}
                loadingLabel="Updating location..."
              >
                Save location
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Read-only Subscription Capacity Summary (D-01: commercial tier prices TBD until P-07) */}
      {activeMembership && (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-[#18181B]">Plan Capacity Summary</h2>
          <p className="mt-1 text-xs text-[#52525B]">
            Current plan limits enforced on the server. Commercial billing upgrades will open in the
            Subscription stage.
          </p>

          <dl className="mt-4 grid gap-4 border-t border-[#E4E4E7] pt-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-[#52525B]">Plan & Status</dt>
              <dd className="mt-1 font-medium text-[#18181B]">
                {activeMembership.limits.displayName} ·{' '}
                <span className="capitalize">
                  {(usage?.status ?? activeMembership.subscriptionStatus).replace('_', ' ')}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#52525B]">Staff Seats</dt>
              <dd className="mt-1 font-mono-tabular font-medium text-[#18181B]">
                {usage ? `${usage.staffCount} / ` : ''}
                {activeMembership.limits.maxStaff}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#52525B]">Products</dt>
              <dd className="mt-1 font-mono-tabular font-medium text-[#18181B]">
                {usage ? `${usage.productCount} / ` : ''}
                {activeMembership.limits.maxProducts}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#52525B]">Offline Devices</dt>
              <dd className="mt-1 font-mono-tabular font-medium text-[#18181B]">
                {usage ? `${usage.activeDeviceCount} / ` : ''}
                {activeMembership.limits.maxOfflineDevices}
              </dd>
            </div>
          </dl>
        </Card>
      )}
    </div>
  );
}
