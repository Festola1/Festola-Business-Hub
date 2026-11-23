import { AlertTriangle, CheckCircle2, CloudUpload, RefreshCw, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  EmptyState,
  ErrorState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { FormField, Input, Select } from '../../components/ui/FormControls';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchSyncBootstrap,
  fetchSyncConflicts,
  pushSyncOperations,
  resolveSyncConflict,
  type SyncConflictItem,
} from '../../lib/commerce-api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { fetchDevices, type RegisteredDevice } from '../../lib/identity-api';
import {
  getRegisteredLocalDevice,
  listQueuedOfflineSales,
  loadOfflineBootstrapCache,
  removeQueuedOfflineSales,
  saveOfflineBootstrapCache,
  setRegisteredLocalDevice,
  type QueuedOfflineSale,
} from '../../lib/offline-store';
import { canRoleAccess } from '../../lib/permissions';

export default function SyncPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const { pushToast } = useToast();

  const businessId = activeMembership?.businessId ?? '';
  const canViewDevices = activeMembership
    ? canRoleAccess(activeMembership.role, 'devices.view')
    : false;
  const canResolveConflicts = activeMembership
    ? canRoleAccess(activeMembership.role, 'sync_conflicts.resolve')
    : false;
  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const [localDevice, setLocalDevice] = useState<{ deviceId: string; deviceCode: string } | null>(
    () => (businessId ? getRegisteredLocalDevice(businessId) : null),
  );
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [queuedSales, setQueuedSales] = useState<QueuedOfflineSale[]>(() =>
    businessId ? listQueuedOfflineSales(businessId) : [],
  );
  const [cacheInfo, setCacheInfo] = useState(() =>
    businessId ? loadOfflineBootstrapCache(businessId) : null,
  );

  const [conflicts, setConflicts] = useState<SyncConflictItem[]>([]);
  const [conflictFilter, setConflictFilter] = useState<'open' | 'resolved'>('open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [syncingBootstrap, setSyncingBootstrap] = useState(false);
  const [pushingQueue, setPushingQueue] = useState(false);

  // Resolve conflict modal
  const [resolveTarget, setResolveTarget] = useState<SyncConflictItem | null>(null);
  const [resolveAction, setResolveAction] = useState<
    'accept_with_adjustment' | 'reject_and_reverse' | 'acknowledge'
  >('acknowledge');
  const [resolveNote, setResolveNote] = useState('');
  const [resolving, setResolving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!accessToken || !activeMembership) {
      return;
    }
    let cancelled = false;
    const currentBizId = activeMembership.businessId;

    void Promise.all([
      canViewDevices ? fetchDevices(accessToken, currentBizId) : Promise.resolve(null),
      canResolveConflicts
        ? fetchSyncConflicts(accessToken, currentBizId, conflictFilter)
        : Promise.resolve(null),
    ]).then(([devRes, confRes]) => {
      if (cancelled) {
        return;
      }
      setLocalDevice(getRegisteredLocalDevice(currentBizId));
      setQueuedSales(listQueuedOfflineSales(currentBizId));
      setCacheInfo(loadOfflineBootstrapCache(currentBizId));

      if (devRes && devRes.success && devRes.data) {
        setDevices(devRes.data.devices.filter((d) => d.status === 'active'));
      }
      if (confRes) {
        if (confRes.success && confRes.data) {
          setConflicts(confRes.data.conflicts);
          setError(null);
        } else {
          setError(confRes.error?.message ?? 'Unable to load sync conflicts.');
        }
      } else {
        setError(null);
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    activeMembership,
    canViewDevices,
    canResolveConflicts,
    conflictFilter,
    reloadTick,
    tenantEpoch,
  ]);

  const handleLinkDevice = (deviceId: string) => {
    if (!businessId) return;
    const found = devices.find((d) => d.id === deviceId);
    if (!found) return;
    const next = { deviceId: found.id, deviceCode: found.deviceCode };
    setRegisteredLocalDevice(businessId, next);
    setLocalDevice(next);
    pushToast(`This browser is now linked to device OFF-${found.deviceCode}.`, 'success');
  };

  const handleRefreshBootstrap = async () => {
    if (!accessToken || !businessId || !localDevice) {
      pushToast('Link or register an active offline device first.', 'error');
      return;
    }
    setSyncingBootstrap(true);
    const res = await fetchSyncBootstrap(accessToken, businessId, localDevice.deviceId);
    setSyncingBootstrap(false);

    if (!res.success || !res.data) {
      pushToast(res.error?.message ?? 'Unable to download offline catalog snapshot.', 'error');
      return;
    }

    const cache = {
      syncCursor: res.data.syncCursor,
      products: res.data.products,
      customers: res.data.customers,
    };
    saveOfflineBootstrapCache(businessId, cache);
    setCacheInfo(cache);
    pushToast(
      `Offline cache refreshed (${cache.products.length} products, ${cache.customers.length} customers).`,
      'success',
    );
  };

  const handlePushQueue = async () => {
    if (!accessToken || !businessId || !localDevice) {
      pushToast('Link an active registered device before syncing offline sales.', 'error');
      return;
    }
    if (queuedSales.length === 0) {
      return;
    }
    setPushingQueue(true);
    const res = await pushSyncOperations(
      accessToken,
      businessId,
      localDevice.deviceId,
      queuedSales.map((q) => ({
        operationType: 'offline_sale',
        clientOperationUuid: q.clientOperationUuid,
        occurredAt: q.occurredAt,
        payload: q.payload,
      })),
    );
    setPushingQueue(false);

    if (!res.success || !res.data) {
      pushToast(res.error?.message ?? 'Unable to push offline queue to server.', 'error');
      return;
    }

    const processedUuids = res.data.results.map((r) => r.clientOperationUuid);
    const appliedCount = res.data.results.filter((r) => r.status === 'applied').length;
    const conflictCount = res.data.results.filter((r) => r.status === 'conflict').length;
    const remaining = removeQueuedOfflineSales(businessId, processedUuids);
    setQueuedSales(remaining);

    if (conflictCount > 0) {
      pushToast(
        `Synced ${appliedCount} sale(s); ${conflictCount} moved to Sync Conflicts for review.`,
        'info',
      );
      setLoading(true);
      setReloadTick((n) => n + 1);
    } else {
      pushToast(`Successfully synced ${appliedCount} offline sale(s).`, 'success');
    }
  };

  const handleResolveConflict = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !businessId || !resolveTarget) {
      return;
    }
    if (resolveNote.trim().length < 4) {
      setFormError('Enter a resolution audit note (at least 4 characters).');
      return;
    }
    setResolving(true);
    setFormError(null);
    const res = await resolveSyncConflict(accessToken, businessId, resolveTarget.id, {
      action: resolveAction,
      note: resolveNote.trim(),
    });
    setResolving(false);

    if (!res.success) {
      setFormError(res.error?.message ?? 'Unable to resolve sync conflict.');
      return;
    }

    pushToast('Sync conflict resolved and recorded in the audit log.', 'success');
    setResolveTarget(null);
    setResolveNote('');
    setLoading(true);
    setReloadTick((n) => n + 1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Offline Sync & Conflicts"
        description="Download catalog snapshots for 7-day offline POS sales, push queued offline receipts idempotently, and review conflicts."
      />

      {/* Device & Offline Snapshot Card */}
      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#18181B]">
              <Smartphone className="h-4 w-4 text-[#991B1B]" aria-hidden="true" />
              <span>This Browser&apos;s Registered Offline Device</span>
            </div>
            {localDevice ? (
              <p className="text-xs text-[#52525B]">
                Linked to{' '}
                <span className="font-mono-tabular font-semibold text-[#18181B]">
                  OFF-{localDevice.deviceCode}
                </span>{' '}
                ·{' '}
                {cacheInfo
                  ? `Cached ${cacheInfo.products.length} products & ${cacheInfo.customers.length} customers (${formatDateTime(cacheInfo.syncCursor)})`
                  : 'Offline catalog not cached yet'}
              </p>
            ) : (
              <p className="text-xs text-[#52525B]">
                No device linked to this browser yet. Register this counter in{' '}
                <Link to="/app/devices" className="font-medium text-[#991B1B] underline">
                  Offline Devices
                </Link>{' '}
                or select an active device below.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canViewDevices && devices.length > 0 && (
              <Select
                aria-label="Select registered device for this browser"
                value={localDevice?.deviceId ?? ''}
                onChange={(e) => handleLinkDevice(e.target.value)}
                className="w-auto min-w-[200px]"
              >
                <option value="">Link active device...</option>
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.deviceName} (OFF-{d.deviceCode})
                  </option>
                ))}
              </Select>
            )}
            <Button
              variant="secondary"
              disabled={!localDevice}
              loading={syncingBootstrap}
              onClick={() => void handleRefreshBootstrap()}
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Refresh offline catalog</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* Local Pending Offline Queue */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E4E4E7] px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-[#18181B]">
              Pending Offline Sales Queue ({queuedSales.length})
            </h2>
            <p className="text-xs text-[#52525B]">
              Isolated to {activeMembership?.businessName}. Syncs idempotently by client UUID
              (D-05).
            </p>
          </div>
          <Button
            variant="primary"
            disabled={queuedSales.length === 0 || !localDevice || isReadOnly}
            loading={pushingQueue}
            onClick={() => void handlePushQueue()}
          >
            <CloudUpload className="h-4 w-4" aria-hidden="true" />
            <span>Push sync batch</span>
          </Button>
        </div>

        {queuedSales.length === 0 ? (
          <div className="flex items-center gap-2.5 p-5 text-sm text-[#52525B]">
            <CheckCircle2 className="h-4 w-4 text-[#16A34A]" aria-hidden="true" />
            <span>All local offline sales on this browser have been synced.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7] text-xs font-semibold text-[#52525B]">
                <tr>
                  <th className="px-4 py-2.5">Offline Receipt</th>
                  <th className="px-4 py-2.5">Recorded At</th>
                  <th className="px-4 py-2.5">Items</th>
                  <th className="px-4 py-2.5 text-right">Estimated Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E4E4E7]">
                {queuedSales.map((op) => (
                  <tr key={op.clientOperationUuid}>
                    <td className="px-4 py-3 font-mono-tabular text-xs font-semibold text-[#18181B]">
                      {op.offlineReceiptNumber}
                    </td>
                    <td className="px-4 py-3 font-mono-tabular text-xs text-[#52525B]">
                      {formatDateTime(op.occurredAt)}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#18181B]">{op.itemSummary}</td>
                    <td className="px-4 py-3 text-right font-mono-tabular text-xs font-semibold text-[#18181B]">
                      {formatMoney(op.estimatedTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Owner/Manager Sync Conflicts Queue */}
      {canResolveConflicts && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-[#18181B]">Sync Conflict Review Queue</h2>
            <div className="inline-flex gap-1.5" role="group" aria-label="Conflict status filter">
              <Button
                variant={conflictFilter === 'open' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setLoading(true);
                  setConflictFilter('open');
                }}
              >
                Open
              </Button>
              <Button
                variant={conflictFilter === 'resolved' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setLoading(true);
                  setConflictFilter('resolved');
                }}
              >
                Resolved
              </Button>
            </div>
          </div>

          {loading ? (
            <LoadingSkeleton rows={3} label="Loading sync conflicts..." />
          ) : error ? (
            <ErrorState
              message={error}
              onRetry={() => {
                setLoading(true);
                setReloadTick((n) => n + 1);
              }}
            />
          ) : conflicts.length === 0 ? (
            <EmptyState
              title={`No ${conflictFilter} sync conflicts`}
              description={
                conflictFilter === 'open'
                  ? 'Offline operations synced cleanly without stock or validation conflicts.'
                  : 'No previously resolved conflicts to display.'
              }
            />
          ) : (
            <Card className="divide-y divide-[#E4E4E7]">
              {conflicts.map((conflict) => (
                <div
                  key={conflict.id}
                  className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`h-4 w-4 shrink-0 ${
                          conflict.status === 'open' ? 'text-[#D97706]' : 'text-[#16A34A]'
                        }`}
                        aria-hidden="true"
                      />
                      <p className="text-sm font-semibold text-[#18181B]">{conflict.reason}</p>
                    </div>
                    <p className="font-mono-tabular text-xs text-[#52525B]">
                      Op UUID: {conflict.clientOperationUuid} · {formatDateTime(conflict.createdAt)}
                    </p>
                    {conflict.resolutionAction && (
                      <p className="text-xs text-[#16A34A]">
                        Resolved ({conflict.resolutionAction.replace(/_/g, ' ')})
                        {conflict.resolutionNote ? ` · ${conflict.resolutionNote}` : ''}
                      </p>
                    )}
                  </div>
                  {conflict.status === 'open' && !isReadOnly && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => {
                        setFormError(null);
                        setResolveAction('acknowledge');
                        setResolveNote('');
                        setResolveTarget(conflict);
                      }}
                    >
                      Resolve
                    </Button>
                  )}
                </div>
              ))}
            </Card>
          )}
        </section>
      )}

      {/* Resolve Conflict Modal */}
      <Modal
        open={Boolean(resolveTarget)}
        onClose={() => setResolveTarget(null)}
        title="Resolve Sync Conflict"
        description={resolveTarget?.reason}
      >
        <form onSubmit={(e) => void handleResolveConflict(e)} className="space-y-4">
          {formError && <AlertBanner tone="error">{formError}</AlertBanner>}
          <FormField id="conf-action" label="Resolution decision" required>
            <Select
              id="conf-action"
              value={resolveAction}
              onChange={(e) =>
                setResolveAction(
                  e.target.value as 'accept_with_adjustment' | 'reject_and_reverse' | 'acknowledge',
                )
              }
            >
              <option value="acknowledge">Acknowledge (keep server state)</option>
              <option value="accept_with_adjustment">Accept with manual stock adjustment</option>
              <option value="reject_and_reverse">Reject offline entry</option>
            </Select>
          </FormField>
          <FormField id="conf-note" label="Audit note" required>
            <Input
              id="conf-note"
              required
              minLength={4}
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              placeholder="Explain how this discrepancy was verified"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setResolveTarget(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={resolving}>
              Record resolution
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
