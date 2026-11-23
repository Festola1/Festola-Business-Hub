import { Copy } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { FormField, Input, Select } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchStaff,
  inviteStaffMember,
  revokeStaffMember,
  updateStaffMemberRole,
  type StaffInvitation,
  type StaffMember,
} from '../../lib/identity-api';
import { canRoleAccess } from '../../lib/permissions';

export default function StaffPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<StaffInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [createdInviteLink, setCreatedInviteLink] = useState<string | null>(null);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'manager' | 'cashier'>('cashier');
  const [submitting, setSubmitting] = useState(false);

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

  const handleInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    setCreatedInviteLink(null);

    setSubmitting(true);
    const res = await inviteStaffMember(accessToken, activeMembership.businessId, {
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
    });
    setSubmitting(false);

    if (!res.success || !res.data) {
      setErrorMessage(res.error?.message ?? 'Unable to send staff invitation.');
      return;
    }

    const link = `${window.location.origin}/accept-invite?token=${encodeURIComponent(
      res.data.inviteToken,
    )}`;
    setCreatedInviteLink(link);
    setStatusMessage(
      `Invitation created for ${res.data.invitation.email}. Share the one-time invite link below.`,
    );
    setInviteEmail('');
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

  const copyInviteLink = async () => {
    if (!createdInviteLink || !navigator.clipboard) {
      return;
    }
    await navigator.clipboard.writeText(createdInviteLink);
    setStatusMessage('Invitation link copied to clipboard.');
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Staff & Roles"
        description="Server-enforced Owner, Manager, and Cashier permissions. Revoking a staff member immediately disables their registered offline devices."
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

      {errorMessage && <AlertBanner tone="error">{errorMessage}</AlertBanner>}

      {statusMessage && (
        <AlertBanner tone="success">
          <div className="space-y-2">
            <p>{statusMessage}</p>
            {createdInviteLink && (
              <div className="flex items-center gap-2 pt-1">
                <code className="flex-1 truncate rounded border border-[#E4E4E7] bg-white px-2.5 py-1.5 font-mono text-xs text-[#18181B]">
                  {createdInviteLink}
                </code>
                <Button variant="secondary" size="sm" onClick={() => void copyInviteLink()}>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy</span>
                </Button>
              </div>
            )}
          </div>
        </AlertBanner>
      )}

      {/* Invite Staff Form (Owner Only) */}
      {canManage && (
        <Card className="p-6">
          <h2 className="text-base font-semibold text-[#18181B]">Invite staff member</h2>
          <form
            onSubmit={(e) => void handleInvite(e)}
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
                loadingLabel="Inviting..."
                disabled={isReadOnly}
              >
                Create invite
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
                <p className="font-mono-tabular text-xs text-[#52525B]">
                  Expires {new Date(inv.expiresAt).toLocaleDateString()}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
