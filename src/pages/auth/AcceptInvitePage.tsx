import { Loader2, LogOut } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebase } from '../../contexts/FirebaseContext';
import { getFriendlyApiError } from '../../lib/error-messages';
import { acceptStaffInvitation } from '../../lib/identity-api';
import { AcceptInviteSchema, validateWithSchema, type FieldErrorMap } from '../../lib/validation';

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { pushToast } = useToast();
  const { accessToken, isLoading, profile, refreshAccount, selectBusiness, signOut } = useAuth();
  const { signInWithGoogle } = useFirebase();

  const urlToken = (searchParams.get('token') ?? '').trim();
  const [manualToken, setManualToken] = useState(urlToken);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<{ token: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const attemptedKeyRef = useRef<string | null>(null);

  const inviteRedirectParam = urlToken
    ? `?redirect=${encodeURIComponent(`/accept-invite?token=${encodeURIComponent(urlToken)}`)}`
    : '';

  // Automatically redeem URL invitation token as soon as the invited user is authenticated
  useEffect(() => {
    if (!urlToken || !accessToken || isLoading || accepted) {
      return;
    }

    const attemptKey = `${accessToken}:${urlToken}`;
    if (attemptedKeyRef.current === attemptKey) {
      return;
    }
    attemptedKeyRef.current = attemptKey;

    let cancelled = false;
    void acceptStaffInvitation(accessToken, urlToken).then(async (res) => {
      if (cancelled) {
        return;
      }
      if (!res.success || !res.data) {
        setErrorMessage(
          getFriendlyApiError(
            res.error,
            'Unable to accept invitation automatically. Make sure you signed in with the invited email address.',
          ),
        );
        return;
      }

      selectBusiness(res.data.membership.businessId, { allowPendingRefresh: true });
      await refreshAccount();
      if (cancelled) {
        return;
      }
      setAccepted(true);
      pushToast('Invitation accepted. Welcome to your business workspace.', 'success');
      navigate('/app/dashboard', { replace: true });
    });

    return () => {
      cancelled = true;
    };
  }, [
    urlToken,
    accessToken,
    isLoading,
    accepted,
    selectBusiness,
    refreshAccount,
    pushToast,
    navigate,
  ]);

  const isAutoAccepting = Boolean(
    urlToken && accessToken && !isLoading && !errorMessage && !accepted,
  );

  const handleGoogleSignInAndAccept = async () => {
    setErrorMessage(null);
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
      // Once AuthContext hydrates accessToken, the useEffect above accepts the invite automatically.
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

  const handleSwitchAccount = async () => {
    setSwitchingAccount(true);
    setErrorMessage(null);
    attemptedKeyRef.current = null;
    try {
      await signOut();
    } finally {
      setSwitchingAccount(false);
    }
  };

  const handleManualSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    if (!accessToken) {
      setErrorMessage('Sign in with the invited email address first, then accept your invite.');
      return;
    }

    const validation = validateWithSchema(AcceptInviteSchema, { token: manualToken });
    if (!validation.ok) {
      setFieldErrors(validation.fieldErrors);
      setErrorMessage(validation.summary);
      return;
    }

    setSubmitting(true);
    const res = await acceptStaffInvitation(accessToken, validation.data.token);
    setSubmitting(false);

    if (!res.success || !res.data) {
      setErrorMessage(getFriendlyApiError(res.error, 'Unable to accept invitation.'));
      return;
    }

    selectBusiness(res.data.membership.businessId, { allowPendingRefresh: true });
    await refreshAccount();
    setAccepted(true);
    pushToast('Invitation accepted. Welcome to your business workspace.', 'success');
    navigate('/app/dashboard', { replace: true });
  };

  return (
    <AuthLayout
      title={urlToken ? 'Joining your business workspace' : 'Accept staff invitation'}
      subtitle={
        urlToken
          ? 'Your one-time invitation link is ready. As soon as you are signed in with your invited email, your access activates automatically.'
          : 'Join an existing Festola business workspace using the invitation from your Business Owner.'
      }
      headerAction={
        !accessToken ? (
          <Link
            to={`/login${inviteRedirectParam}`}
            className="text-sm font-medium text-[#52525B] hover:text-[#18181B]"
          >
            Sign in
          </Link>
        ) : undefined
      }
    >
      {errorMessage && (
        <AlertBanner tone="error" className="mb-5">
          <div className="space-y-3">
            <p>{errorMessage}</p>
            {accessToken && (
              <div className="flex flex-wrap items-center gap-2">
                {profile?.email && (
                  <span className="text-xs text-[#52525B]">
                    Signed in as <strong>{profile.email}</strong>.
                  </span>
                )}
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={switchingAccount}
                  loadingLabel="Signing out..."
                  onClick={() => void handleSwitchAccount()}
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Sign out & switch account</span>
                </Button>
              </div>
            )}
          </div>
        </AlertBanner>
      )}

      {urlToken ? (
        isLoading || isAutoAccepting ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-[#E4E4E7] bg-[#F4F5F7] px-5 py-8 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#991B1B]" aria-hidden="true" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[#18181B]">
                {isLoading ? 'Checking your session...' : 'Accepting your invitation...'}
              </p>
              <p className="text-xs text-[#52525B]">
                You will be redirected to your business dashboard automatically in a moment.
              </p>
            </div>
          </div>
        ) : !accessToken ? (
          <div className="space-y-4">
            <AlertBanner tone="info" title="Sign in to join automatically">
              Continue with your invited email address below. Your staff membership will be
              activated automatically right after sign-in.
            </AlertBanner>

            <Button
              type="button"
              variant="primary"
              fullWidth
              loading={googleSubmitting}
              loadingLabel="Connecting to Google..."
              onClick={() => void handleGoogleSignInAndAccept()}
            >
              <svg
                className="h-4 w-4 rounded-full bg-white p-0.5"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
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
              <span>Continue with Google & accept automatically</span>
            </Button>

            <div className="flex flex-wrap items-center justify-center gap-4 pt-1 text-xs text-[#52525B]">
              <Link
                to={`/login${inviteRedirectParam}`}
                className="font-semibold text-[#991B1B] hover:text-[#7F1D1D]"
              >
                Sign in with email
              </Link>
              <span aria-hidden="true">·</span>
              <Link
                to={`/register${inviteRedirectParam}`}
                className="font-semibold text-[#991B1B] hover:text-[#7F1D1D]"
              >
                Create an account
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="primary"
              fullWidth
              loading={submitting}
              loadingLabel="Retrying..."
              onClick={() => {
                attemptedKeyRef.current = null;
                setErrorMessage(null);
              }}
            >
              Try accepting again
            </Button>
          </div>
        )
      ) : (
        <>
          {!accessToken && (
            <AlertBanner tone="warning" title="Sign in required" className="mb-5">
              Sign in or create an account with your invited email first, then return here to redeem
              your invitation.{' '}
              <Link to="/login" className="font-semibold text-[#991B1B] underline">
                Go to sign in
              </Link>
            </AlertBanner>
          )}

          <form onSubmit={(e) => void handleManualSubmit(e)} className="space-y-4" noValidate>
            <FormField
              id="invite-token"
              label="Invitation token"
              required
              error={fieldErrors.token}
            >
              <Input
                id="invite-token"
                type="text"
                mono
                required
                hasError={Boolean(fieldErrors.token)}
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                placeholder="Paste invitation token"
              />
            </FormField>

            <Button
              type="submit"
              variant="primary"
              fullWidth
              disabled={!accessToken}
              loading={submitting}
              loadingLabel="Joining business..."
            >
              Accept invitation
            </Button>
          </form>
        </>
      )}
    </AuthLayout>
  );
}
