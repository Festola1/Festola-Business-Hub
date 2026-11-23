import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyAuthError } from '../../lib/error-messages';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { ResetPasswordSchema, validateWithSchema, type FieldErrorMap } from '../../lib/validation';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { supabaseConfigured, session } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<
    FieldErrorMap<{ password: string; confirmPassword: string }>
  >({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    const validation = validateWithSchema(ResetPasswordSchema, { password, confirmPassword });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setErrorMessage(validation.summary);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage(
        'Password reset requires live Supabase Auth configuration (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).',
      );
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({
      password: validation.data.password,
    });
    setSubmitting(false);

    if (error) {
      setErrorMessage(getFriendlyAuthError(error.message));
      return;
    }

    setSuccessMessage('Your password has been updated. Redirecting you to sign in...');
    setTimeout(() => {
      navigate('/login', { replace: true });
    }, 1200);
  };

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle="Complete your password recovery by setting a strong new password."
      supabaseNotice={!supabaseConfigured}
      headerAction={
        <Link to="/login" className="text-sm font-medium text-[#52525B] hover:text-[#18181B]">
          Back to sign in
        </Link>
      }
    >
      {supabaseConfigured && !session && (
        <AlertBanner tone="warning" title="Recovery link required" className="mb-5">
          Open this page directly from the recovery link sent to your email address. Need a new
          link?{' '}
          <Link to="/forgot-password" className="font-semibold text-[#991B1B] underline">
            Request password reset
          </Link>
          .
        </AlertBanner>
      )}

      {errorMessage && (
        <AlertBanner tone="error" className="mb-5">
          {errorMessage}
        </AlertBanner>
      )}

      {successMessage && (
        <AlertBanner tone="success" className="mb-5">
          {successMessage}
        </AlertBanner>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <FormField
          id="new-password"
          label="New password"
          required
          hint="Use at least 8 characters."
          error={fieldErrors.password}
        >
          <Input
            id="new-password"
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

        <FormField
          id="confirm-password"
          label="Confirm new password"
          required
          error={fieldErrors.confirmPassword}
        >
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            required
            hasError={Boolean(fieldErrors.confirmPassword)}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter your new password"
          />
        </FormField>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          loadingLabel="Updating password..."
        >
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
