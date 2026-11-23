import { Download, Share } from 'lucide-react';
import { useState } from 'react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

interface PWAInstallButtonProps {
  variant?: 'primary' | 'secondary';
}

export function PWAInstallButton({ variant = 'secondary' }: PWAInstallButtonProps) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <Button variant={variant} size="sm" onClick={() => void install()}>
        <Download className="h-4 w-4" aria-hidden="true" />
        <span>Install App</span>
      </Button>
    );
  }

  if (isIOS) {
    return (
      <>
        <Button variant={variant} size="sm" onClick={() => setShowIOSGuide(true)}>
          <Share className="h-4 w-4" aria-hidden="true" />
          <span>Install on iOS</span>
        </Button>

        <Modal
          open={showIOSGuide}
          onClose={() => setShowIOSGuide(false)}
          title="Install Festola on iPhone or iPad"
          description="Follow these steps in Safari to add Festola to your Home Screen."
        >
          <ol className="list-decimal space-y-2.5 pl-5 text-sm text-[#52525B]">
            <li>
              Tap the <strong className="text-[#18181B]">Share</strong> button in your Safari
              toolbar.
            </li>
            <li>
              Scroll down and tap <strong className="text-[#18181B]">Add to Home Screen</strong>.
            </li>
            <li>
              Confirm <strong className="text-[#18181B]">Festola</strong> to launch full-screen like
              an installed counter app.
            </li>
          </ol>
          <div className="mt-6">
            <Button variant="primary" fullWidth onClick={() => setShowIOSGuide(false)}>
              Got it
            </Button>
          </div>
        </Modal>
      </>
    );
  }

  return null;
}
