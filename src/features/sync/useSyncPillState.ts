import { useConnectionStatus } from '@/app/ConnectionProvider';
import type { SyncPillState } from '@/components/SyncPill';
import { useOptionalSync } from './SyncProvider';

/** Estado da pílula do cabeçalho: conexão com o servidor + fila de vendas do celular. */
export function useSyncPillState(): SyncPillState {
  const { status, lastOkAt } = useConnectionStatus();
  const sync = useOptionalSync();
  const counts = sync?.counts;
  const waiting = counts ? counts.pendingSales + counts.pendingSignatures + counts.pendingPayments - counts.failed : 0;

  if (counts?.failed) return { kind: 'failed', count: counts.failed };
  if (counts?.authPaused) return { kind: 'auth', pending: waiting };
  if (status === 'offline') return { kind: 'offline', pending: waiting };
  if (counts?.syncing) return { kind: 'sending' };
  if (waiting > 0) {
    const signatures = counts?.pendingSignatures ?? 0;
    const payments = counts?.pendingPayments ?? 0;
    return { kind: 'pending', sales: Math.max(0, waiting - signatures - payments), signatures, payments };
  }
  if (status === 'checking') return { kind: 'checking' };
  return { kind: 'synced', at: lastOkAt };
}
