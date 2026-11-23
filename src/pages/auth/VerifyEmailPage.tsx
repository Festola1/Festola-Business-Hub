import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyAuthError } from '../../lib/error-messages';
import { getSupabaseBrowserClient } from '../../lib/supabase-browser';

/**
 * Email verification holding screen paired with Stage 07 EMAIL_NOT_VERIFIED enforcement.
 */
export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { supabaseConfigured, session, profile, refreshAccount, signOut } = useAuth();
  const [email, setEmail] = useState(
    searchParams.get('email') ?? session?.user?.email ?? profile?.email ?? '',
  );
  const [resending, setResending] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleResend = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes('@')) {
      setErrorMessage('Enter the email address you registered with to resend verification.');
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setErrorMessage(
        'Email verification requires live Supabase Auth configuration (VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY).',
      );
      return;
    }

    setResending(true);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/login` },
    });
    setResending(false);

    if (error) {
      setErrorMessage(getFriendlyAuthError(error.message));
      return;
    }

    setSuccessMessage(
      'A fresh verification link has been sent. Open the link in your email, then continue to your workspace.',
    );
  };

  const handleCheckStatus = async () => {
    setChecking(true);
    setErrorMessage(null);
    await refreshAccount();
    setChecking(false);
    navigate('/app/dashboard', { replace: true });
  };

  return (
    <AuthLayout
      title="Verify your email address"
      subtitle="Festola requires a verified email before you can create a business or access tenant records."
      supabaseNotice={!supabaseConfigured}
      headerAction={
        session ? (
          <button
            type="button"
            onClick={() => void signOut()}
            className="text-sm font-medium text-[#991B1B] hover:text-[#7F1D1D]"
          >
            Sign out
          </button>
        ) : (
          <Link to="/login" className="text-sm font-medium text-[#52525B] hover:text-[#18181B]">
            Sign in
          </Link>
        )
      }
      footer={
        <>
          Entered the wrong email?{' '}
          <Link to="/register" className="font-medium text-[#991B1B] hover:text-[#7F1D1D]">
            Register with another address
          </Link>
        </>
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

      <div className="space-y-4">
        <FormField id="verify-email" label="Account email">
          <Input
            id="verify-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@yourbusiness.ng"
          />
        </FormField>

        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Button
            variant="primary"
            fullWidth
            loading={resending}
            loadingLabel="Sending link..."
            onClick={() => void handleResend()}
          >
            Resend verification email
          </Button>
          {session && (
            <Button
              variant="secondary"
              fullWidth
              loading={checking}
              loadingLabel="Checking..."
              onClick={() => void handleCheckStatus()}
            >
              I have verified
            </Button>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
