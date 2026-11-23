import { Link } from 'react-router';
import { Card, PageHeader } from '../../components/ui/Feedback';
import { useAuth } from '../../contexts/AuthContext';
import { canRoleAccess } from '../../lib/permissions';

interface ModuleStagePlaceholderPageProps {
  title: string;
  stage: string;
  description: string;
  readyEndpoints?: string[];
}

/**
 * Explicit non-masquerading stage placeholder:
 * Never renders fabricated KPIs, fake sales charts, or mock product rows.
 */
export default function ModuleStagePlaceholderPage({
  title,
  stage,
  description,
  readyEndpoints = [],
}: ModuleStagePlaceholderPageProps) {
  const { activeMembership } = useAuth();

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title={title}
        description={description}
      />

      <Card className="p-6">
        <p className="text-xs font-semibold text-[#991B1B]">
          UI Stage Pending ({stage}) · Not Connected to Live Data Yet
        </p>
        <h2 className="mt-1.5 text-lg font-semibold text-[#18181B]">
          Workspace screen reserved for {stage}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#52525B]">
          This route is integrated into the authenticated multi-tenant navigation shell and
          role-based permission checks. No placeholder revenue numbers, simulated charts, or mock
          records are shown here — live operational data will connect once {stage} is approved.
        </p>

        {readyEndpoints.length > 0 && (
          <div className="mt-5 border-t border-[#E4E4E7] pt-4">
            <p className="text-xs font-medium text-[#52525B]">
              Backend API routes prepared in Stage 08 for this screen:
            </p>
            <ul className="mt-2 space-y-1 font-mono text-xs text-[#18181B]">
              {readyEndpoints.map((endpoint) => (
                <li key={endpoint}>{endpoint}</li>
              ))}
            </ul>
          </div>
        )}

        {activeMembership && (
          <dl className="mt-6 grid gap-4 border-t border-[#E4E4E7] pt-5 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-[#52525B]">Active Business</dt>
              <dd className="mt-1 font-medium text-[#18181B]">{activeMembership.businessName}</dd>
            </div>
            <div>
              <dt className="text-xs text-[#52525B]">Verified Role</dt>
              <dd className="mt-1 font-medium capitalize text-[#18181B]">
                {activeMembership.role}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-[#52525B]">Plan Limits</dt>
              <dd className="mt-1 font-mono-tabular text-xs text-[#18181B]">
                {activeMembership.limits.maxStaff} staff · {activeMembership.limits.maxProducts}{' '}
                products · {activeMembership.limits.maxOfflineDevices} devices
              </dd>
            </div>
          </dl>
        )}

        <div className="mt-6 flex flex-wrap gap-3 border-t border-[#E4E4E7] pt-5">
          {activeMembership && canRoleAccess(activeMembership.role, 'settings.manage') && (
            <Link
              to="/app/settings"
              className="inline-flex min-h-[44px] items-center rounded-lg bg-[#991B1B] px-4 py-2 text-sm font-medium text-white hover:bg-[#7F1D1D]"
            >
              Manage Business Settings
            </Link>
          )}
          <Link
            to="/app/notifications"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-[#E4E4E7] bg-white px-4 py-2 text-sm font-medium text-[#18181B] hover:bg-[#F4F5F7]"
          >
            Open Notifications
          </Link>
          {activeMembership && canRoleAccess(activeMembership.role, 'staff.view') && (
            <Link
              to="/app/staff"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-[#E4E4E7] bg-white px-4 py-2 text-sm font-medium text-[#18181B] hover:bg-[#F4F5F7]"
            >
              Manage Staff & Roles
            </Link>
          )}
          <Link
            to="/app/devices"
            className="inline-flex min-h-[44px] items-center rounded-lg border border-[#E4E4E7] bg-white px-4 py-2 text-sm font-medium text-[#18181B] hover:bg-[#F4F5F7]"
          >
            Offline Devices
          </Link>
        </div>
      </Card>
    </div>
  );
}
