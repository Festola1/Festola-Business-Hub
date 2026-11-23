import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyAuthError } from '../../lib/error-messages';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { LoginFormSchema, validateWithSchema, type FieldErrorMap } from '../../lib/validation';

export default function LoginPage() {
  const navigate = useNavigate();
  const { supabaseConfigured, refreshAccount } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrorMap<{ email: string; password: string }>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
        'Authentication service is not configured for this environment. Configure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to sign in.',
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
    navigate('/app/dashboard', { replace: true });
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
          <Link to="/register" className="font-medium text-[#991B1B] hover:text-[#7F1D1D]">
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
