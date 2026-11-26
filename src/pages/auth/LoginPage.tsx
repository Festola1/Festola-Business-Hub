import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebase } from '../../contexts/FirebaseContext';
import { getFriendlyAuthError } from '../../lib/error-messages';
import { getSafeRedirectPath } from '../../lib/redirect';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { LoginFormSchema, validateWithSchema, type FieldErrorMap } from '../../lib/validation';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirectTarget = getSafeRedirectPath(searchParams.get('redirect'));
  const { supabaseConfigured, refreshAccount } = useAuth();
  const { signInWithGoogle } = useFirebase();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrorMap<{ email: string; password: string }>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  const handleGoogleSignIn = async () => {
    setErrorMessage(null);
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
          : 'Unable to sign in with Google right now. Please try again.',
      );
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    const validation = validateWithSchema(LoginFormSchema, { email, password });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setErrorMessage(validation.summary);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage(
        'Email/password auth requires Supabase configuration. Use "Continue with Google" above to sign in with Firebase immediately.',
      );
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: validation.data.email.toLowerCase(),
      password: validation.data.password,
    });
    setSubmitting(false);

    if (error) {
      if (error.message.toLowerCase().includes('email not confirmed')) {
        navigate(`/verify-email?email=${encodeURIComponent(validation.data.email.toLowerCase())}`);
        return;
      }
      setErrorMessage(getFriendlyAuthError(error.message));
      return;
    }

    await refreshAccount();
    navigate(redirectTarget ?? '/app/dashboard', { replace: true });
  };

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your Festola Business Hub workspace."
      showInstallButton
      supabaseNotice={!supabaseConfigured}
      footer={
        <>
          New to Festola?{' '}
          <Link
            to={
              redirectTarget
                ? `/register?redirect=${encodeURIComponent(redirectTarget)}`
                : '/register'
            }
            className="font-medium text-[#991B1B] hover:text-[#7F1D1D]"
          >
            Create an account
          </Link>
        </>
      }
    >
      {errorMessage && (
        <AlertBanner tone="error" className="mb-5">
          {errorMessage}
        </AlertBanner>
      )}

      <div className="mb-5">
        <Button
          type="button"
          variant="secondary"
          fullWidth
          loading={googleSubmitting}
          loadingLabel="Connecting to Google..."
          onClick={() => void handleGoogleSignIn()}
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
        <FormField id="login-email" label="Email address" required error={fieldErrors.email}>
          <Input
            id="login-email"
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
          id="login-password"
          label="Password"
          required
          error={fieldErrors.password}
          labelAction={
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-[#991B1B] hover:text-[#7F1D1D]"
            >
              Forgot password?
            </Link>
          }
        >
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            required
            hasError={Boolean(fieldErrors.password)}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
          />
        </FormField>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          loadingLabel="Signing in..."
        >
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}
