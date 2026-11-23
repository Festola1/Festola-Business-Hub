import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  variant?: 'dialog' | 'drawer-left';
  children: ReactNode;
}

/**
 * Accessible modal dialog and navigation drawer with:
 * - Escape key dismissal
 * - Keyboard focus trap (Tab / Shift+Tab)
 * - Automatic focus restoration to the invoking trigger on close
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  variant = 'dialog',
  children,
}: ModalProps) {
  const titleId = useId();
  const descriptionId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const panel = containerRef.current;
    const focusables = panel
      ? Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      : [];
    const firstFocusable = focusables[0];
    if (firstFocusable) {
      firstFocusable.focus();
    } else {
      panel?.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key === 'Tab' && panel) {
        const elements = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
        if (elements.length === 0) {
          event.preventDefault();
          return;
        }
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first || !last) {
          return;
        }

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  if (variant === 'drawer-left') {
    return (
      <div className="fixed inset-0 z-50 lg:hidden">
        <div className="fixed inset-0 bg-black/45" onClick={onClose} aria-hidden="true" />
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-[#E4E4E7] bg-white focus:outline-none"
        >
          <div className="flex h-14 items-center justify-between border-b border-[#E4E4E7] px-4">
            <h2 id={titleId} className="text-base font-bold text-[#991B1B]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[#52525B] hover:bg-[#F4F5F7] hover:text-[#18181B]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {description && (
            <p id={descriptionId} className="sr-only">
              {description}
            </p>
          )}
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="relative z-10 w-full max-w-md rounded-lg border border-[#E4E4E7] bg-white p-6 focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-[#18181B]">
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className="mt-1 text-xs text-[#52525B]">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={`Close ${title}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-[#52525B] hover:bg-[#F4F5F7] hover:text-[#18181B]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
