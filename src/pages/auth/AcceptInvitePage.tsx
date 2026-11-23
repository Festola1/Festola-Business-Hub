import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Button } from '../../components/ui/Button';
import { AlertBanner } from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { getFriendlyApiError } from '../../lib/error-messages';
import { acceptStaffInvitation } from '../../lib/identity-api';
import { AcceptInviteSchema, validateWithSchema, type FieldErrorMap } from '../../lib/validation';

export default function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { accessToken, refreshAccount, selectBusiness } = useAuth();
  const [token, setToken] = useState(searchParams.get('token') ?? '');
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap<{ token: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setFieldErrors({});

    if (!accessToken) {
      setErrorMessage('Sign in with the invited email address first, then accept your invite.');
      return;
    }

    const validation = validateWithSchema(AcceptInviteSchema, { token });
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
    navigate('/app/dashboard', { replace: true });
  };

  return (
    <AuthLayout
      title="Accept staff invitation"
      subtitle="Join an existing Festola business workspace using the invite token from your Business Owner."
      headerAction={
        <Link to="/login" className="text-sm font-medium text-[#52525B] hover:text-[#18181B]">
          Sign in
        </Link>
      }
    >
      {!accessToken && (
        <AlertBanner tone="warning" title="Sign in required" className="mb-5">
          Sign in or create an account with your invited email first, then return here to redeem the
          token.{' '}
          <Link to="/login" className="font-semibold text-[#991B1B] underline">
            Go to sign in
          </Link>
        </AlertBanner>
      )}

      {errorMessage && (
        <AlertBanner tone="error" className="mb-5">
          {errorMessage}
        </AlertBanner>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4" noValidate>
        <FormField id="invite-token" label="Invitation token" required error={fieldErrors.token}>
          <Input
            id="invite-token"
            type="text"
            mono
            required
            hasError={Boolean(fieldErrors.token)}
            value={token}
            onChange={(e) => setToken(e.target.value)}
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
    </AuthLayout>
  );
}
