import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { CheckboxField, FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyAuthError } from '../../lib/error-messages';
import { updateProfile } from '../../lib/identity-api';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { RegisterFormSchema, validateWithSchema, type FieldErrorMap } from '../../lib/validation';

interface RegisterFields {
  fullName: string;
  email: string;
  password: string;
  acceptedTerms: boolean;
}

export default function RegisterPage() {
  const navigate = useNavigate();
  const { supabaseConfigured, refreshAccount } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<RegisterFields>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setConfirmationMessage(null);
    setFieldErrors({});

    const validation = validateWithSchema(RegisterFormSchema, {
      fullName,
      email,
      password,
      acceptedTerms,
    });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setErrorMessage(validation.summary);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage(
        'Authentication service is not configured for this environment. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to register.',
      );
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: validation.data.email.toLowerCase(),
      password: validation.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          full_name: validation.data.fullName,
          accepted_terms: true,
        },
      },
    });

    if (error) {
      setSubmitting(false);
      setErrorMessage(getFriendlyAuthError(error.message));
      return;
    }

    if (data.session?.access_token) {
      await updateProfile(data.session.access_token, {
        fullName: validation.data.fullName,
        acceptTerms: true,
      });
      await refreshAccount();
      setSubmitting(false);
      navigate('/onboarding', { replace: true });
      return;
    }

    setSubmitting(false);
    setConfirmationMessage(
      'Account created. Check your email inbox for the verification link, then sign in to complete your business setup.',
    );
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your 14-day free trial and set up your store in minutes."
      supabaseNotice={!supabaseConfigured}
      headerAction={
        <Link to="/login" className="text-sm font-medium text-[#52525B] hover:text-[#18181B]">
          Sign in
        </Link>
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-medium text-[#991B1B] hover:text-[#7F1D1D]">
            Sign in
          </Link>
        </>
      }
    >
      {errorMessage && (
        <AlertBanner tone="error" className="mb-5">
          {errorMessage}
        </AlertBanner>
      )}

      {confirmationMessage && (
        <AlertBanner tone="success" title="Verify your email" className="mb-5">
          {confirmationMessage}
        </AlertBanner>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <FormField id="reg-name" label="Full name" required error={fieldErrors.fullName}>
          <Input
            id="reg-name"
            type="text"
            autoComplete="name"
            required
            hasError={Boolean(fieldErrors.fullName)}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Adaeze Okafor"
          />
        </FormField>

        <FormField id="reg-email" label="Work email" required error={fieldErrors.email}>
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            required
            hasError={Boolean(fieldErrors.email)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@yourbusiness.ng"
          />
        </FormField>

        <FormField
          id="reg-password"
          label="Password"
          required
          hint="Use at least 8 characters."
          error={fieldErrors.password}
        >
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            hasError={Boolean(fieldErrors.password)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
          />
        </FormField>

        {/* D-08 NDPA explicit consent capture */}
        <CheckboxField
          id="reg-terms"
          checked={acceptedTerms}
          onChange={(e) => setAcceptedTerms(e.target.checked)}
          label="Terms of Service & NDPA Privacy Policy"
          description="I agree to the Festola Business Hub Terms of Service and NDPA-aligned Privacy Policy for business data storage and audit records."
          error={fieldErrors.acceptedTerms}
        />

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          loadingLabel="Creating account..."
        >
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}
