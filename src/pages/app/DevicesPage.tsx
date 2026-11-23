import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import {
  AlertBanner,
  Card,
  EmptyState,
  LoadingSkeleton,
  PageHeader,
} from '../../components/ui/Feedback';
import { FormField, Input } from '../../components/ui/FormControls';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchDevices,
  registerCurrentDevice,
  revokeRegisteredDevice,
  type RegisteredDevice,
} from '../../lib/identity-api';
import { getRegisteredLocalDevice, setRegisteredLocalDevice } from '../../lib/offline-store';
import { canRoleAccess } from '../../lib/permissions';

const DEVICE_FP_STORAGE_KEY = 'festola.device_fingerprint';

function getOrCreateDeviceFingerprint(): string {
  try {
    const existing = window.localStorage.getItem(DEVICE_FP_STORAGE_KEY);
    if (existing && existing.length >= 16) {
      return existing;
    }
    const generated = `festola-${crypto.randomUUID()}`;
    window.localStorage.setItem(DEVICE_FP_STORAGE_KEY, generated);
    return generated;
  } catch {
    return `festola-${crypto.randomUUID()}`;
  }
}

export default function DevicesPage() {
  const { accessToken, activeMembership, tenantEpoch } = useAuth();
  const [devices, setDevices] = useState<RegisteredDevice[]>([]);
  const [loading, setLoading] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [linkedDeviceId, setLinkedDeviceId] = useState<string | null>(() =>
    activeMembership
      ? (getRegisteredLocalDevice(activeMembership.businessId)?.deviceId ?? null)
      : null,
  );

  const canViewAll = activeMembership
    ? canRoleAccess(activeMembership.role, 'devices.view')
    : false;
  const canRevoke = activeMembership
    ? canRoleAccess(activeMembership.role, 'devices.revoke')
    : false;
  const isReadOnly =
    activeMembership?.subscriptionStatus === 'read_only' ||
    activeMembership?.subscriptionStatus === 'cancelled';

  const loadDevices = useCallback(async () => {
    if (!accessToken || !activeMembership || !canViewAll) {
      return;
    }
    const res = await fetchDevices(accessToken, activeMembership.businessId);
    if (res.success && res.data) {
      setDevices(res.data.devices);
      setErrorMessage(null);
    } else {
      setErrorMessage(res.error?.message ?? 'Unable to load registered devices.');
    }
    setLoading(false);
  }, [accessToken, activeMembership, canViewAll]);

  useEffect(() => {
    if (!accessToken || !activeMembership || !canViewAll) {
      return;
    }
    let cancelled = false;
    void fetchDevices(accessToken, activeMembership.businessId).then((res) => {
      if (cancelled) {
        return;
      }
      if (res.success && res.data) {
        setDevices(res.data.devices);
        setErrorMessage(null);
      } else {
        setErrorMessage(res.error?.message ?? 'Unable to load registered devices.');
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken, activeMembership, canViewAll, tenantEpoch]);

  const handleRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accessToken || !activeMembership) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);

    setSubmitting(true);
    const res = await registerCurrentDevice(accessToken, activeMembership.businessId, {
      deviceName: deviceName.trim(),
      deviceFingerprint: getOrCreateDeviceFingerprint(),
    });
    setSubmitting(false);

    if (!res.success || !res.data) {
      setErrorMessage(res.error?.message ?? 'Unable to register this device.');
      return;
    }

    setRegisteredLocalDevice(activeMembership.businessId, {
      deviceId: res.data.device.id,
      deviceCode: res.data.device.deviceCode,
    });
    setLinkedDeviceId(res.data.device.id);
    setStatusMessage(
      `Device registered and linked to this browser with offline receipt prefix OFF-${res.data.device.deviceCode} (valid offline for 7 days).`,
    );
    setDeviceName('');
    await loadDevices();
  };

  const handleLinkLocalDevice = (device: RegisteredDevice) => {
    if (!activeMembership) {
      return;
    }
    setRegisteredLocalDevice(activeMembership.businessId, {
      deviceId: device.id,
      deviceCode: device.deviceCode,
    });
    setLinkedDeviceId(device.id);
    setStatusMessage(`This browser is now linked to offline counter OFF-${device.deviceCode}.`);
  };

  const handleRevoke = async (deviceId: string) => {
    if (!accessToken || !activeMembership) {
      return;
    }
    setErrorMessage(null);
    setStatusMessage(null);
    const res = await revokeRegisteredDevice(accessToken, activeMembership.businessId, deviceId);
    if (!res.success) {
      setErrorMessage(res.error?.message ?? 'Unable to revoke device.');
      return;
    }
    setStatusMessage('Device revoked immediately. It will be locked on its next sync attempt.');
    await loadDevices();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={activeMembership?.businessName}
        title="Registered Offline Devices"
        description="Each counter device receives a unique offline receipt prefix (OFF-XXXX) and stays authorized offline for up to 7 days between online check-ins."
        actions={
          activeMembership && canViewAll ? (
            <p className="font-mono-tabular text-xs text-[#52525B]">
              Active devices: {devices.filter((d) => d.status === 'active').length} /{' '}
              {activeMembership.limits.maxOfflineDevices}
            </p>
          ) : undefined
        }
      />

      {errorMessage && <AlertBanner tone="error">{errorMessage}</AlertBanner>}
      {statusMessage && <AlertBanner tone="success">{statusMessage}</AlertBanner>}

      <Card className="p-6">
        <h2 className="text-base font-semibold text-[#18181B]">Register this device</h2>
        <form
          onSubmit={(e) => void handleRegister(e)}
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <FormField id="device-name" label="Device label" required>
              <Input
                id="device-name"
                type="text"
                required
                minLength={2}
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Front Counter Android Tablet"
              />
            </FormField>
          </div>
          <Button
            type="submit"
            variant="primary"
            loading={submitting}
            loadingLabel="Registering..."
            disabled={isReadOnly}
          >
            Register device
          </Button>
        </form>
      </Card>

      {canViewAll &&
        (loading ? (
          <LoadingSkeleton rows={3} label="Loading registered devices..." />
        ) : devices.length === 0 ? (
          <EmptyState
            title="No offline devices registered"
            description="Register a counter phone, tablet, or laptop above to issue sequential OFF-XXXX offline receipts."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="border-b border-[#E4E4E7] px-6 py-4">
              <h2 className="text-base font-semibold text-[#18181B]">Registered devices</h2>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[#E4E4E7] bg-[#F4F5F7] text-xs font-semibold text-[#52525B]">
                  <tr>
                    <th className="px-6 py-3">Device</th>
                    <th className="px-6 py-3">Receipt Prefix</th>
                    <th className="px-6 py-3">Offline Window Ends</th>
                    <th className="px-6 py-3">Status</th>
                    {canRevoke && <th className="px-6 py-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E4E4E7]">
                  {devices.map((device) => (
                    <tr key={device.id}>
                      <td className="px-6 py-3.5 font-medium text-[#18181B]">
                        {device.deviceName}
                      </td>
                      <td className="px-6 py-3.5 font-mono-tabular text-xs text-[#18181B]">
                        OFF-{device.deviceCode}
                      </td>
                      <td className="px-6 py-3.5 font-mono-tabular text-xs text-[#52525B]">
                        {new Date(device.offlineExpiresAt).toLocaleString()}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`text-xs font-medium capitalize ${
                            device.status === 'active' ? 'text-[#16A34A]' : 'text-[#DC2626]'
                          }`}
                        >
                          {device.status}
                        </span>
                      </td>
                      {canRevoke && (
                        <td className="px-6 py-3.5 text-right">
                          {device.status === 'active' ? (
                            <div className="inline-flex flex-wrap justify-end gap-2">
                              {linkedDeviceId === device.id ? (
                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium text-[#16A34A]">
                                  Linked here
                                </span>
                              ) : (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => handleLinkLocalDevice(device)}
                                >
                                  Use here
                                </Button>
                              )}
                              <Button
                                variant="danger"
                                size="sm"
                                disabled={isReadOnly}
                                onClick={() => void handleRevoke(device.id)}
                              >
                                Revoke
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-[#52525B]">Revoked</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
    </div>
  );
}
