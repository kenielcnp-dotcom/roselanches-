import { useCallback, useEffect, useRef, useState } from 'react';
import { probeServer } from '@/lib/offline/net';

export type ConnectionStatus = 'checking' | 'online' | 'offline';

export interface ConnectionState {
  status: ConnectionStatus;
  /** Última vez que o servidor respondeu. */
  lastOkAt: Date | null;
  recheck: () => void;
}

const RECHECK_ONLINE_MS = 60_000;
const RECHECK_OFFLINE_MS = 15_000;

/** Estado da conexão com o SERVIDOR (não só o indicador do navegador). */
export function useConnection(probe: () => Promise<boolean> = probeServer): ConnectionState {
  const [status, setStatus] = useState<ConnectionStatus>('checking');
  const [lastOkAt, setLastOkAt] = useState<Date | null>(null);
  const running = useRef(false);

  const check = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatus('offline');
        return;
      }
      const ok = await probe();
      setStatus(ok ? 'online' : 'offline');
      if (ok) setLastOkAt(new Date());
    } finally {
      running.current = false;
    }
  }, [probe]);

  useEffect(() => {
    void check();
    const goOffline = () => setStatus('offline');
    const recheck = () => void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    window.addEventListener('online', recheck);
    window.addEventListener('offline', goOffline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', recheck);
      window.removeEventListener('offline', goOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [check]);

  useEffect(() => {
    const id = window.setInterval(() => void check(), status === 'online' ? RECHECK_ONLINE_MS : RECHECK_OFFLINE_MS);
    return () => window.clearInterval(id);
  }, [check, status]);

  return { status, lastOkAt, recheck: () => void check() };
}
