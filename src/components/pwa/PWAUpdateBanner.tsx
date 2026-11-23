import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../ui/Button';

/**
 * Registers the VitePWA Service Worker (prompt mode) and notifies users when an updated
 * app shell is ready so active counter sessions are never abruptly reloaded mid-task.
 */
export function PWAUpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);
  const [applyUpdate, setApplyUpdate] = useState<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let cancelled = false;
    void import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (cancelled) {
          return;
        }
        const updateSW = registerSW({
          immediate: false,
          onNeedRefresh() {
            setUpdateReady(true);
            setApplyUpdate(() => () => updateSW(true));
          },
        });
      })
      .catch(() => {
        // virtual:pwa-register is unavailable in test environments; fail quietly.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!updateReady || !applyUpdate) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-20 left-4 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg border border-[#991B1B] bg-white p-3.5 text-xs text-[#18181B] shadow-sm lg:right-4 lg:bottom-4 lg:left-auto"
    >
      <p className="font-medium">A newer version of Festola Business Hub is ready.</p>
      <div className="flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="sm" onClick={() => setUpdateReady(false)}>
          Later
        </Button>
        <Button variant="primary" size="sm" onClick={() => void applyUpdate()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Update</span>
        </Button>
      </div>
    </div>
  );
}
