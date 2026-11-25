// Junta as vendas do servidor com as que ainda estão (ou passaram) pelo
// celular, sem repetir: o celular sempre diz se a venda já chegou ao servidor.
import { useQuery } from '@tanstack/react-query';
import { startOfLocalDay } from '@/domain/period';
import type { LocalSale } from '@/lib/offline/db';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { supabase } from '@/lib/supabase/client';
import { fetchSale, listSales, type SaleRow } from '@/services/sales';
import type { OutboxOp, SyncState } from '@/types/domain';
import { useSync } from '@/features/sync/SyncProvider';

export interface SaleView extends SaleRow {
  /** Estado no celular; null = venda conhecida só pelo servidor. */
  sync: SyncState | null;
  syncError: string | null;
  /** Cancelamento pedido no celular, ainda não confirmado. */
  pendingCancel: { reason: string; state: SyncState } | null;
}

function fromLocal(l: LocalSale, ops: Map<string, OutboxOp>): SaleView {
  const op = ops.get(l.opId);
  const cancelOp = l.cancel ? ops.get(l.cancel.opId) : undefined;
  return {
    id: l.id,
    customerId: l.draft.customerId,
    customerName: l.customerName,
    customerPhone: l.customerPhone,
    establishmentId: l.draft.establishmentId,
    establishmentName: l.establishmentName,
    mode: l.draft.mode,
    period: l.draft.period,
    summary: l.summary,
    totalCents: l.draft.totalCents,
    paymentKind: l.draft.paymentKind,
    paidMethod: l.draft.paidNow?.method ?? null,
    status: l.cancel && cancelOp?.state === 'SYNCED' ? 'CANCELLED' : 'ACTIVE',
    cancelReason: l.cancel?.reason ?? null,
    confirmationStatus: 'PENDING',
    occurredAt: l.draft.occurredAt,
    createdBy: null,
    createdByName: null,
    sync: op?.state ?? 'SYNCED',
    syncError: op?.state === 'FAILED' || op?.state === 'PENDING' ? (op.lastError?.message ?? null) : null,
    pendingCancel: l.cancel && cancelOp && cancelOp.state !== 'SYNCED' ? { reason: l.cancel.reason, state: cancelOp.state } : null,
  };
}

function merge(server: SaleRow[] | undefined, local: SaleView[]): SaleView[] {
  const localById = new Map(local.map((l) => [l.id, l]));
  const out: SaleView[] = (server ?? []).map((s) => {
    const l = localById.get(s.id);
    localById.delete(s.id);
    return { ...s, sync: l?.sync ?? null, syncError: l?.syncError ?? null, pendingCancel: s.status === 'CANCELLED' ? null : (l?.pendingCancel ?? null) };
  });
  out.push(...localById.values());
  return out.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function useLocalSales(filter: (l: LocalSale) => boolean, deps: unknown[]): SaleView[] | undefined {
  const { db } = useSync();
  return useLiveQuery(async () => {
    const [sales, ops] = await Promise.all([db.localSales.toArray(), db.outbox.toArray()]);
    const byId = new Map(ops.map((o) => [o.opId, o]));
    return sales.filter(filter).map((l) => fromLocal(l, byId));
     
  }, [db, ...deps]);
}

/** createdBy: só as vendas desta pessoa (vendedor). As do celular são sempre de quem está usando. */
export function useSalesSince(days: number, createdBy?: string) {
  const since = new Date(startOfLocalDay(new Date()).getTime() - (days - 1) * 86_400_000).toISOString();
  const server = useQuery({
    queryKey: ['sales', 'since', since, createdBy ?? 'all'],
    queryFn: () => listSales(supabase, createdBy ? { since, createdBy } : { since }),
  });
  const local = useLocalSales((l) => l.draft.occurredAt >= since, [since]);
  return { server, sales: local ? merge(server.data, local) : undefined };
}

export function useSale(id: string) {
  const server = useQuery({ queryKey: ['sales', 'one', id], queryFn: () => fetchSale(supabase, id) });
  const local = useLocalSales((l) => l.id === id, [id]);
  const merged = local ? merge(server.data ? [server.data.sale] : [], local)[0] : undefined;
  return { server, sale: merged, items: server.data?.items ?? null };
}
