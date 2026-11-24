import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';

export type ToastTone = 'success' | 'error' | 'info';

interface ToastMessage {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DURATION_MS = 3500;

/** Avisos curtos depois de cada ação ("Cliente salvo."), acima da navegação inferior. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const counter = useRef(0);

  const show = useCallback((message: string, tone: ToastTone = 'success') => {
    counter.current += 1;
    setToast({ id: counter.current, message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), toast.tone === 'error' ? DURATION_MS * 2 : DURATION_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live={toast?.tone === 'error' ? 'assertive' : 'polite'}
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex justify-center px-4"
      >
        {toast && (
          <div
            key={toast.id}
            className={`pointer-events-auto flex max-w-md items-start gap-2.5 rounded-2xl px-4 py-3 text-base font-bold text-white shadow-warm ${
              toast.tone === 'success' ? 'bg-success' : toast.tone === 'error' ? 'bg-danger' : 'bg-brown'
            }`}
            onClick={() => setToast(null)}
          >
            {toast.tone === 'success' ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            ) : toast.tone === 'error' ? (
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            ) : (
              <Info className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <span>{toast.message}</span>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast precisa estar dentro de <ToastProvider>');
  return ctx;
}
