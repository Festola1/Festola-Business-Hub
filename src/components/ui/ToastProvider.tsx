import { CheckCircle2, Info, AlertCircle, X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  message: string;
}

interface ToastContextValue {
  pushToast: (message: string, tone?: ToastTone) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const pushToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
      setTimeout(() => {
        dismissToast(id);
      }, 4500);
    },
    [dismissToast],
  );

  const value = useMemo(() => ({ pushToast, dismissToast }), [pushToast, dismissToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none fixed right-4 bottom-20 z-50 flex w-full max-w-sm flex-col gap-2 lg:bottom-4"
      >
        {toasts.map((toast) => {
          const Icon =
            toast.tone === 'success' ? CheckCircle2 : toast.tone === 'error' ? AlertCircle : Info;
          const border =
            toast.tone === 'success'
              ? 'border-[#16A34A]'
              : toast.tone === 'error'
                ? 'border-[#DC2626]'
                : 'border-[#E4E4E7]';
          const iconColor =
            toast.tone === 'success'
              ? 'text-[#16A34A]'
              : toast.tone === 'error'
                ? 'text-[#DC2626]'
                : 'text-[#52525B]';

          return (
            <div
              key={toast.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-2.5 rounded-lg border bg-white p-3.5 text-xs text-[#18181B] shadow-sm ${border}`}
            >
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} aria-hidden="true" />
              <p className="flex-1 leading-relaxed">{toast.message}</p>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                aria-label="Dismiss notification"
                className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[#52525B] hover:bg-[#F4F5F7] hover:text-[#18181B]"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      pushToast: () => undefined,
      dismissToast: () => undefined,
    };
  }
  return ctx;
}
