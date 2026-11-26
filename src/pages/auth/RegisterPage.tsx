import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { CheckboxField, FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebase } from '../../contexts/FirebaseContext';
import { getFriendlyAuthError } from '../../lib/error-messages';
import { updateProfile } from '../../lib/identity-api';
import { getSafeRedirectPath } from '../../lib/redirect';
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
  const [searchParams] = useSearchParams();
  const redirectTarget = getSafeRedirectPath(searchParams.get('redirect'));
  const { supabaseConfigured, refreshAccount } = useAuth();
  const { signInWithGoogle } = useFirebase();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<RegisterFields>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [confirmationMessage, setConfirmationMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleGoogleSignUp = async () => {
    setErrorMessage(null);
    setConfirmationMessage(null);
    setGoogleSubmitting(true);
    try {
      const user = await signInWithGoogle();
      if (user) {
        navigate(redirectTarget ?? '/app/dashboard', { replace: true });
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Unable to continue with Google right now. Please try again.',
      );
    } finally {
      setGoogleSubmitting(false);
    }
  };

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
        'Email/password registration requires Supabase configuration. Use "Continue with Google" above to create your Firebase workspace immediately.',
      );
      return;
    }

    setSubmitting(true);
    const { data, error } = await supabase.auth.signUp({
      email: validation.data.email.toLowerCase(),
      password: validation.data.password,
      options: {
        emailRedirectTo: redirectTarget
          ? `${window.location.origin}/login?redirect=${encodeURIComponent(redirectTarget)}`
          : `${window.location.origin}/login`,
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
      navigate(redirectTarget ?? '/onboarding', { replace: true });
      return;
    }

    setSubmitting(false);
    setConfirmationMessage(
      'Account created. Check your email inbox for the verification link, then sign in to complete your business setup.',
    );
  };

  const loginLink = redirectTarget
    ? `/login?redirect=${encodeURIComponent(redirectTarget)}`
    : '/login';

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start your 14-day free trial and set up your store in minutes."
      supabaseNotice={!supabaseConfigured}
      headerAction={
        <Link to={loginLink} className="text-sm font-medium text-[#52525B] hover:text-[#18181B]">
          Sign in
        </Link>
      }
      footer={
        <>
          Already have an account?{' '}
          <Link to={loginLink} className="font-medium text-[#991B1B] hover:text-[#7F1D1D]">
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

      <div className="mb-5">
        <Button
          type="button"
          variant="secondary"
          fullWidth
          loading={googleSubmitting}
          loadingLabel="Connecting to Google..."
          onClick={() => void handleGoogleSignUp()}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.56-5.15 3.56-8.65Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.07 7.93-2.9l-3.87-3c-1.07.72-2.45 1.15-4.06 1.15-3.12 0-5.77-2.11-6.71-4.95H1.29v3.1A12 12 0 0 0 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.29a12 12 0 0 0 0 10.8l4-3.1Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.29 6.6l4 3.1c.94-2.84 3.59-4.95 6.71-4.95Z"
            />
          </svg>
          <span>Continue with Google</span>
        </Button>

        <div className="relative my-5 flex items-center justify-center">
          <div className="w-full border-t border-[#E4E4E7]" />
          <span className="bg-white px-3 text-xs font-medium text-[#6B7280]">or email</span>
          <div className="w-full border-t border-[#E4E4E7]" />
        </div>
      </div>

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
