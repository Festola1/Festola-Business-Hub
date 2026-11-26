import { Copy, Mail, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import {
  AlertBanner,
  Card,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { FormField, Input, Select } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import { useFirebase } from '../../contexts/FirebaseContext';
import { buildInvitationAcceptUrl, sendStaffInvitationEmail } from '../../lib/gmail-invite';
import {
  fetchStaff,
  inviteStaffMember,
  revokeStaffInvitation,
  revokeStaffMember,
  updateStaffMemberRole,
  type StaffInvitation,
  type StaffMember,
} from '../../lib/identity-api';
import { canRoleAccess } from '../../lib/permissions';

interface PendingInviteDraft {
  email: string;
  role: 'manager' | 'cashier';
}

interface FailedDeliveryInvite {
  email: string;
  role: 'manager' | 'cashier';
  acceptUrl: string;
  expiresAt: string;
}

export default function StaffPage() {
  const { accessToken, activeMembership, profile, tenantEpoch } = useAuth();
  const { gmailAccessToken, gmailSenderEmail, connectGmailSender, clearGmailAccessToken } =
    useFirebase();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<StaffInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [failedDelivery, setFailedDelivery] = useState<FailedDeliveryInvite | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'cashier'>('cashier');
  const [confirmDraft, setConfirmDraft] = useState<PendingInviteDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [retryingEmail, setRetryingEmail] = useState(false);

  const canManage = activeMembership ? canRoleAccess(activeMembership.role, 'staff.manage') : false;
  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const loadStaff = useCallback(async () => {
    if (!accessToken || !activeMembership) {
      return;
    }
    const res = await fetchStaff(accessToken, activeMembership.businessId);
    if (res.success && res.data) {
      setMembers(res.data.members);
      setPendingInvitations(res.data.pendingInvitations);
      setErrorMessage(null);
    } else {
      setErrorMessage(res.error?.message ?? 'Unable to load staff members.');
    }
    setLoading(false);
  }, [accessToken, activeMembership]);

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;
    void fetchStaff(accessToken, activeMembership.businessId).then((res) => {
      if (cancelled) {
        return;
      }
      if (res.success && res.data) {
        setMembers(res.data.members);
        setPendingInvitations(res.data.pendingInvitations);
        setErrorMessage(null);
      } else {
        setErrorMessage(res.error?.message ?? 'Unable to load staff members.');
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, tenantEpoch]);

  const handleOpenInviteConfirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) {
      return;
    }
    const normalizedEmail = inviteEmail.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setErrorMessage('Enter a valid staff email address.');
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setConfirmDraft({ email: normalizedEmail, role: inviteRole });
  };

  const handleConfirmSendInvite = async () => {
    if (!accessToken || !activeMembership || !confirmDraft) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setFailedDelivery(null);
    setSubmitting(true);

    try {
      // Acquire Gmail send token inside the explicit confirmation click handler
      let activeGmailToken = gmailAccessToken;
      if (!activeGmailToken) {
        const connected = await connectGmailSender(profile?.email ?? null);
        activeGmailToken = connected?.accessToken ?? null;
      }
      if (!activeGmailToken) {
        setErrorMessage(
          'Connect Gmail to send the invitation email directly to your staff member.',
        );
        return;
      }

      const res = await inviteStaffMember(accessToken, activeMembership.businessId, {
        email: confirmDraft.email,
        role: confirmDraft.role,
      });

      if (!res.success || !res.data) {
        setErrorMessage(res.error?.message ?? 'Unable to create staff invitation.');
        return;
      }

      const acceptUrl = buildInvitationAcceptUrl(res.data.inviteToken);
      const emailResult = await sendStaffInvitationEmail({
        gmailAccessToken: activeGmailToken,
        toEmail: res.data.invitation.email,
        businessName: activeMembership.businessName,
        role: res.data.invitation.role,
        inviterName: profile?.fullName,
        acceptUrl,
        expiresAt: res.data.invitation.expiresAt,
      });

      setConfirmDraft(null);
      setInviteEmail('');
      await loadStaff();

      if (emailResult.ok) {
        setStatusMessage(
          `Invitation email sent directly to ${res.data.invitation.email}. When they open the link in their inbox, they will join ${activeMembership.businessName} automatically.`,
        );
        return;
      }

      if (emailResult.authExpired) {
        clearGmailAccessToken();
      }
      setFailedDelivery({
        email: res.data.invitation.email,
        role: res.data.invitation.role,
        acceptUrl,
        expiresAt: res.data.invitation.expiresAt,
      });
      setErrorMessage(
        emailResult.error ??
          `Invitation saved for ${res.data.invitation.email}, but Gmail delivery did not complete. Retry sending below.`,
      );
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Gmail connection was cancelled before sending the invitation.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryFailedEmail = async () => {
    if (!failedDelivery || !activeMembership) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setRetryingEmail(true);

    try {
      let activeGmailToken = gmailAccessToken;
      if (!activeGmailToken) {
        const connected = await connectGmailSender(profile?.email ?? null);
        activeGmailToken = connected?.accessToken ?? null;
      }
      if (!activeGmailToken) {
        setErrorMessage('Gmail permission is required to resend this invitation email.');
        return;
      }

      const emailResult = await sendStaffInvitationEmail({
        gmailAccessToken: activeGmailToken,
        toEmail: failedDelivery.email,
        businessName: activeMembership.businessName,
        role: failedDelivery.role,
        inviterName: profile?.fullName,
        acceptUrl: failedDelivery.acceptUrl,
        expiresAt: failedDelivery.expiresAt,
      });

      if (emailResult.ok) {
        const sentTo = failedDelivery.email;
        setFailedDelivery(null);
        setStatusMessage(
          `Invitation email sent directly to ${sentTo}. When they open the link in their inbox, they will join ${activeMembership.businessName} automatically.`,
        );
        return;
      }

      if (emailResult.authExpired) {
        clearGmailAccessToken();
      }
      setErrorMessage(emailResult.error ?? 'Unable to send the invitation email via Gmail.');
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to reconnect Gmail right now.');
    } finally {
      setRetryingEmail(false);
    }
  };

  const copyFallbackLink = async () => {
    if (!failedDelivery || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(failedDelivery.acceptUrl);
    setStatusMessage(`Backup invitation link copied for ${failedDelivery.email}.`);
  };

  const handleRevokeInvitation = async (invitation: StaffInvitation) => {
    if (!accessToken || !activeMembership) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    const res = await revokeStaffInvitation(
      accessToken,
      activeMembership.businessId,
      invitation.id,
    );
    if (!res.success) {
      setErrorMessage(res.error?.message ?? 'Unable to revoke pending invitation.');
      return;
    }
    setStatusMessage(`Pending invitation for ${invitation.email} has been revoked.`);
    await loadStaff();
  };

  const handleRoleChange = async (userId: string, role: 'manager' | 'cashier') => {
    if (!accessToken || !activeMembership) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    const res = await updateStaffMemberRole(accessToken, activeMembership.businessId, userId, role);
    if (!res.success) {
      setErrorMessage(res.error?.message ?? 'Unable to update staff role.');
      return;
    }
    setStatusMessage('Staff role updated and recorded in the audit log.');
    await loadStaff();
  };

  const handleRevoke = async (userId: string) => {
    if (!accessToken || !activeMembership) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    const res = await revokeStaffMember(accessToken, activeMembership.businessId, userId);
    if (!res.success || !res.data) {
      setErrorMessage(res.error?.message ?? 'Unable to revoke staff access.');
      return;
    }
    setStatusMessage(
      `Staff access revoked immediately (${res.data.revokedDevicesCount} offline device(s) revoked).`,
    );
    await loadStaff();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Staff & Roles"
        description="Server-enforced Owner, Manager, and Cashier permissions. Invitations are delivered directly to your staff member's email for automatic acceptance."
        actions={
          activeMembership ? (
            <p className="font-mono-tabular text-xs text-[#52525B]">
              Capacity:{' '}
              {members.filter((m) => m.status === 'active').length + pendingInvitations.length} /{' '}
              {activeMembership.limits.maxStaff} seats
            </p>
          ) : undefined
        }
      />

      {errorMessage && (
        <AlertBanner tone="error">
          <div className="space-y-2.5">
            <p>{errorMessage}</p>
            {failedDelivery && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  loading={retryingEmail}
                  loadingLabel="Sending email..."
                  onClick={() => void handleRetryFailedEmail()}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Retry sending via Gmail</span>
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void copyFallbackLink()}
                >
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy backup link</span>
                </Button>
              </div>
            )}
          </div>
        </AlertBanner>
      )}

      {statusMessage && (
        <AlertBanner tone="success">
          <p>{statusMessage}</p>
        </AlertBanner>
      )}

      {/* Invite Staff Form (Owner Only) */}
      {canManage && (
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-[#18181B]">Invite staff member</h2>
              <p className="mt-1 text-xs text-[#52525B]">
                We will email the one-time invitation directly through Gmail. Clicking the link in
                their inbox accepts the invitation automatically.
              </p>
            </div>
            {gmailSenderEmail && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16A34A]">
                <Mail className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Gmail connected ({gmailSenderEmail})</span>
              </span>
            )}
          </div>
          <form
            onSubmit={handleOpenInviteConfirm}
            className="mt-4 grid gap-3 sm:grid-cols-12 sm:items-end"
          >
            <div className="sm:col-span-6">
              <FormField id="invite-email" label="Staff email address" required>
                <Input
                  id="invite-email"
                  type="email"
                  required
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="cashier@yourbusiness.ng"
                />
              </FormField>
            </div>

            <div className="sm:col-span-3">
              <FormField id="invite-role" label="Role">
                <Select
                  id="invite-role"
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as 'manager' | 'cashier')}
                >
                  <option value="cashier">Cashier</option>
                  <option value="manager">Manager</option>
                </Select>
              </FormField>
            </div>

            <div className="sm:col-span-3">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={submitting}
                loadingLabel="Sending..."
                disabled={isReadOnly}
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                <span>Send invitation</span>
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Active & Revoked Members Table */}
      {loading ? (
        <LoadingSkeleton rows={3} label="Loading team members..." />
      ) : members.length === 0 ? (
        <EmptyState
          title="No staff members found"
          description="Invite a Manager or Cashier above to collaborate in this business workspace."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="border-b border-[#E4E4E7] px-6 py-4">
            <h2 className="text-base font-semibold text-[#18181B]">Team members</h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7] text-xs font-semibold text-[#52525B]">
                <tr>
                  <th className="px-6 py-3">Member</th>
                  <th className="px-6 py-3">Role</th>
                  <th className="px-6 py-3">Status</th>
                  {canManage && <th className="px-6 py-3 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-[#F4F5F7]/50">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-[#18181B]">
                        {member.fullName ?? member.userId}
                      </p>
                      {member.email && <p className="text-xs text-[#52525B]">{member.email}</p>}
                    </td>
                    <td className="px-6 py-3.5 capitalize">
                      {canManage && member.role !== 'owner' && member.status === 'active' ? (
                        <select
                          aria-label={`Change role for ${member.email ?? member.userId}`}
                          value={member.role}
                          disabled={isReadOnly}
                          onChange={(e) =>
                            void handleRoleChange(
                              member.userId,
                              e.target.value as 'manager' | 'cashier',
                            )
                          }
                          className="min-h-[36px] rounded-md border border-[#E4E4E7] bg-white px-2.5 py-1 text-xs font-medium text-[#18181B]"
                        >
                          <option value="manager">Manager</option>
                          <option value="cashier">Cashier</option>
                        </select>
                      ) : (
                        <span className="font-medium text-[#18181B]">{member.role}</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`text-xs font-medium capitalize ${
                          member.status === 'active' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                        }`}
                      >
                        {member.status}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-3.5 text-right">
                        {member.role !== 'owner' && member.status === 'active' ? (
                          <Button
                            variant="danger"
                            size="sm"
                            disabled={isReadOnly}
                            onClick={() => void handleRevoke(member.userId)}
                          >
                            Revoke access
                          </Button>
                        ) : (
                          <span className="text-xs text-[#52525B]">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Pending Invitations */}
      {pendingInvitations.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-[#E4E4E7] px-6 py-4">
            <h2 className="text-base font-semibold text-[#18181B]">Pending invitations</h2>
          </div>
          <ul className="divide-y divide-[#E4E4E7] text-sm">
            {pendingInvitations.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-2 px-6 py-3.5"
              >
                <div>
                  <p className="font-medium text-[#18181B]">{inv.email}</p>
                  <p className="text-xs capitalize text-[#52525B]">{inv.role}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-mono-tabular text-xs text-[#52525B]">
                    Expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </p>
                  {canManage && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isReadOnly}
                      onClick={() => void handleRevokeInvitation(inv)}
                    >
                      Revoke
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={Boolean(confirmDraft)}
        title="Send staff invitation email"
        description={
          confirmDraft
            ? `Send an invitation email via Gmail to ${confirmDraft.email} to join ${
                activeMembership?.businessName ?? 'your business'
              } as a ${confirmDraft.role === 'manager' ? 'Manager' : 'Cashier'}?`
            : ''
        }
        confirmLabel="Confirm & Send Email"
        cancelLabel="Cancel"
        loading={submitting}
        onConfirm={handleConfirmSendInvite}
        onClose={() => {
          if (!submitting) {
            setConfirmDraft(null);
          }
        }}
      >
        {confirmDraft && (
          <div className="rounded-lg border border-[#E4E4E7] bg-[#F4F5F7] p-3.5 text-xs text-[#52525B] space-y-1.5">
            <p>
              <span className="font-semibold text-[#18181B]">Recipient:</span> {confirmDraft.email}
            </p>
            <p>
              <span className="font-semibold text-[#18181B]">Role:</span>{' '}
              {confirmDraft.role === 'manager' ? 'Manager' : 'Cashier'}
            </p>
            <p>
              <span className="font-semibold text-[#18181B]">Delivery:</span>{' '}
              {gmailAccessToken && gmailSenderEmail
                ? `Direct email from ${gmailSenderEmail} via Gmail`
                : 'You will be prompted to confirm Gmail sending permission before the email is sent'}
            </p>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
