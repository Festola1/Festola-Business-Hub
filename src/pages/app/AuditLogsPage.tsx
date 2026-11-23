import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { useAuth } from '../../contexts/AuthContext';
import { fetchAuditLogs, type AuditLogItem } from '../../lib/identity-api';

const PAGE_SIZE = 25;

export default function AuditLogsPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const [logs, setLogs] = useState<AuditLogItem[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;

    void fetchAuditLogs(accessToken, activeMembership.businessId, PAGE_SIZE, offset).then((res) => {
      if (cancelled) {
        return;
      }
      if (res.success && res.data) {
        setLogs(res.data.logs);
        setErrorMessage(null);
      } else {
        setErrorMessage(res.error?.message ?? 'Unable to load audit logs.');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, offset, tenantEpoch]);

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Audit Logs"
        description="Immutable, append-only record of sensitive business, staff, financial, and device actions. Owner access only."
      />

      {errorMessage && <AlertBanner tone="error">{errorMessage}</AlertBanner>}

      {loading ? (
        <LoadingSkeleton rows={5} label="Loading audit logs..." />
      ) : logs.length === 0 && offset === 0 ? (
        <EmptyState
          title="No audit events recorded yet"
          description="Sensitive business settings, staff role updates, returns, and device changes will appear here automatically."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7] text-xs font-semibold text-[#52525B]">
                <tr>
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Actor Role</th>
                  <th className="px-6 py-3">Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-6 py-3 font-mono-tabular text-xs text-[#52525B] whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs font-medium text-[#18181B]">
                      {log.action}
                    </td>
                    <td className="px-6 py-3 text-xs capitalize text-[#52525B]">
                      {log.actorRole ?? 'system'}
                    </td>
                    <td className="px-6 py-3 text-xs text-[#52525B]">{log.entityType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#E4E4E7] px-6 py-3 text-xs">
            <Button
              variant="secondary"
              size="sm"
              disabled={offset === 0 || loading}
              onClick={() => {
                setLoading(true);
                setOffset((prev) => Math.max(0, prev - PAGE_SIZE));
              }}
            >
              Previous
            </Button>
            <span className="font-mono-tabular text-[#52525B]">
              Showing {logs.length} event(s) from offset {offset}
            </span>
            <Button
              variant="secondary"
              size="sm"
              disabled={logs.length < PAGE_SIZE || loading}
              onClick={() => {
                setLoading(true);
                setOffset((prev) => prev + PAGE_SIZE);
              }}
            >
              Next
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
