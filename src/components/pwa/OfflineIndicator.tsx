import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-[#D97706] bg-white px-3.5 py-2 text-xs font-medium text-[#18181B] shadow-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-[#D97706]" aria-hidden="true" />
      <span>Offline mode — reconnect to sync account changes</span>
    </div>
  );
}
