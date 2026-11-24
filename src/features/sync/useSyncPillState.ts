import { useConnectionStatus } from '@/app/ConnectionProvider';
import type { SyncPillState } from '@/components/SyncPill';

/**
 * Estado mostrado na pílula do cabeçalho. Nesta etapa vem só da conexão com o
 * servidor; a fila de vendas no celular (pendentes, enviando, falhas) entra
 * junto com o registro de vendas.
 */
export function useSyncPillState(): SyncPillState {
  const { status, lastOkAt } = useConnectionStatus();
  if (status === 'checking') return { kind: 'checking' };
  if (status === 'offline') return { kind: 'offline', pending: 0 };
  return { kind: 'synced', at: lastOkAt };
}
