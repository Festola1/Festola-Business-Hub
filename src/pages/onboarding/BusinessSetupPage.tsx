import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { FormField, Input, Select } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { extractFieldErrors, getFriendlyApiError } from '../../lib/error-messages';
import { createBusiness } from '../../lib/identity-api';
import {
  OnboardingBusinessSchema,
  validateWithSchema,
  type FieldErrorMap,
} from '../../lib/validation';

const CURRENCIES = [
  { code: 'NGN', label: 'NGN (₦) — Nigerian Naira' },
  { code: 'GHS', label: 'GHS (₵) — Ghanaian Cedi' },
  { code: 'KES', label: 'KES (KSh) — Kenyan Shilling' },
  { code: 'USD', label: 'USD ($) — US Dollar' },
];

interface OnboardingFields {
  name: string;
  currencyCode: 'NGN' | 'GHS' | 'KES' | 'USD';
  timezone: string;
  locationName: string;
  phone: string;
  address: string;
}

export default function BusinessSetupPage() {
  const navigate = useNavigate();
  const { accessToken, profile, selectBusiness, refreshAccount, signOut } = useAuth();
  const [name, setName] = useState('');
  const [currencyCode, setCurrencyCode] = useState<'NGN' | 'GHS' | 'KES' | 'USD'>('NGN');
  const [timezone, setTimezone] = useState('Africa/Lagos');
  const [locationName, setLocationName] = useState('Main Store');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<OnboardingFields>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    if (!accessToken) {
      setErrorMessage('Sign in first before setting up a business.');
      return;
    }

    const validation = validateWithSchema(OnboardingBusinessSchema, {
      name,
      currencyCode,
      timezone,
      locationName,
      phone,
      address,
    });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setErrorMessage(validation.summary);
      return;
    }

    setSubmitting(true);
    const res = await createBusiness(accessToken, {
      name: validation.data.name,
      currencyCode: validation.data.currencyCode,
      timezone: validation.data.timezone,
      locationName: validation.data.locationName,
      phone: validation.data.phone ? validation.data.phone : null,
      address: validation.data.address ? validation.data.address : null,
    });
    setSubmitting(false);

    if (!res.success || !res.data) {
      setFieldErrors(extractFieldErrors(res.error) as FieldErrorMap<OnboardingFields>);
      setErrorMessage(getFriendlyApiError(res.error, 'Unable to create your business.'));
      return;
    }

    selectBusiness(res.data.business.id, { allowPendingRefresh: true });
    await refreshAccount();
    navigate('/app/dashboard', { replace: true });
  };

  return (
    <AuthLayout
      title="Set up your business"
      subtitle="This initializes your 14-day free trial, primary store location, and Owner permissions. Tax and negative-stock policies stay safely off by default until you configure them in Settings."
      maxWidth="xl"
      headerAction={
        <div className="flex items-center gap-4 text-xs text-[#52525B]">
          {profile?.email && <span className="hidden sm:inline">{profile.email}</span>}
          <button
            type="button"
            onClick={() => void signOut()}
            className="font-medium text-[#991B1B] hover:text-[#7F1D1D]"
          >
            Sign out
          </button>
        </div>
      }
      footer={
        <>
          Were you invited by an existing business?{' '}
          <Link to="/accept-invite" className="font-medium text-[#991B1B] hover:text-[#7F1D1D]">
            Accept staff invitation
          </Link>
        </>
      }
    >
      {errorMessage && (
        <AlertBanner tone="error" className="mb-5">
          {errorMessage}
        </AlertBanner>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <FormField id="biz-name" label="Business name" required error={fieldErrors.name}>
          <Input
            id="biz-name"
            type="text"
            required
            hasError={Boolean(fieldErrors.name)}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Adaeze Supermarket Ltd"
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="biz-currency"
            label="Default currency"
            required
            error={fieldErrors.currencyCode}
          >
            <Select
              id="biz-currency"
              value={currencyCode}
              hasError={Boolean(fieldErrors.currencyCode)}
              onChange={(e) => setCurrencyCode(e.target.value as 'NGN' | 'GHS' | 'KES' | 'USD')}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField id="biz-timezone" label="Timezone" required error={fieldErrors.timezone}>
            <Input
              id="biz-timezone"
              type="text"
              mono
              required
              hasError={Boolean(fieldErrors.timezone)}
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </FormField>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="biz-location"
            label="Primary store location"
            required
            error={fieldErrors.locationName}
          >
            <Input
              id="biz-location"
              type="text"
              required
              hasError={Boolean(fieldErrors.locationName)}
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Main Store"
            />
          </FormField>

          <FormField id="biz-phone" label="Business phone (optional)" error={fieldErrors.phone}>
            <Input
              id="biz-phone"
              type="tel"
              hasError={Boolean(fieldErrors.phone)}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234 800 000 0000"
            />
          </FormField>
        </div>

        <FormField
          id="biz-address"
          label="Store address (printed on receipts, optional)"
          error={fieldErrors.address}
        >
          <Input
            id="biz-address"
            type="text"
            hasError={Boolean(fieldErrors.address)}
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="14 Allen Avenue, Ikeja, Lagos"
          />
        </FormField>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          loadingLabel="Creating business..."
        >
          Complete business setup
        </Button>
      </form>
    </AuthLayout>
  );
}
