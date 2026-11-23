import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyAuthError } from '../../lib/error-messages';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';
import { ForgotPasswordSchema, validateWithSchema, type FieldErrorMap } from '../../lib/validation';

export default function ForgotPasswordPage() {
  const { supabaseConfigured } = useAuth();
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<{ email: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setFieldErrors({});

    const validation = validateWithSchema(ForgotPasswordSchema, { email });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setErrorMessage(validation.summary);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage(
        'Password recovery requires live Supabase Auth configuration (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).',
      );
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(
      validation.data.email.toLowerCase(),
      {
        redirectTo: `${window.location.origin}/reset-password`,
      },
    );
    setSubmitting(false);

    if (error) {
      setErrorMessage(getFriendlyAuthError(error.message));
      return;
    }

    setSuccessMessage(
      'If an account matches that email address, a password recovery link has been sent.',
    );
  };

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your account email and we will send a secure recovery link."
      supabaseNotice={!supabaseConfigured}
      headerAction={
        <Link to="/login" className="text-sm font-medium text-[#52525B] hover:text-[#18181B]">
          Back to sign in
        </Link>
      }
    >
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
        <FormField id="reset-email" label="Email address" required error={fieldErrors.email}>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            required
            hasError={Boolean(fieldErrors.email)}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@yourbusiness.ng"
          />
        </FormField>

        <Button
          type="submit"
          variant="primary"
          fullWidth
          loading={submitting}
          loadingLabel="Sending link..."
        >
          Send recovery link
        </Button>
      </form>
    </AuthLayout>
  );
}
