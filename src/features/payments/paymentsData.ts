// Recebimentos na tela: servidor + os pagamentos que ainda estão no celular.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startOfLocalDay } from '@/domain/period';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { supabase } from '@/lib/supabase/client';
import {
  cancelEntry,
  confirmNotice,
  createAdjustment,
  createOpeningBalance,
  listPayments,
  listPendingNotices,
  rejectNotice,
  reversePayment,
  type AdjustmentInput,
  type OpeningBalanceInput,
  type PaymentRow,
} from '@/services/payments';
import type { SyncState } from '@/types/domain';
import { useSync } from '@/features/sync/SyncProvider';

export interface PaymentView extends PaymentRow {
  /** Estado no celular; null = conhecido só pelo servidor. */
  sync: SyncState | null;
  syncError: string | null;
}

/** Saldo e contas mudam juntos depois de qualquer recebimento ou correção. */
function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [['payments'], ['notices'], ['dashboard'], ['customers'], ['statement']].map((queryKey) => qc.invalidateQueries({ queryKey })),
    );
}

export function usePaymentsSince(days: number) {
  const { db } = useSync();
  const since = new Date(startOfLocalDay(new Date()).getTime() - (days - 1) * 86_400_000).toISOString();
  const server = useQuery({ queryKey: ['payments', 'since', since], queryFn: () => listPayments(supabase, { since }) });
  const local = useLiveQuery(async () => {
    const [rows, ops] = await Promise.all([db.localPayments.toArray(), db.outbox.toArray()]);
    const byId = new Map(ops.map((o) => [o.opId, o]));
    return rows
      .filter((r) => r.payload.received_at >= since)
      .map((r): PaymentView => {
        const op = byId.get(r.opId);
        return {
          id: r.id,
          customerId: r.payload.customer_id,
          customerName: r.customerName,
          amountCents: r.payload.amount_cents,
          method: r.payload.method,
          source: 'MANUAL',
          receivedAt: r.payload.received_at,
          note: r.payload.note,
          status: 'CONFIRMED',
          reverseReason: null,
          sync: op?.state ?? 'SYNCED',
          syncError: op?.lastError?.message ?? null,
        };
      });
  }, [db, since]);

  const payments = local
    ? (() => {
        const localById = new Map(local.map((l) => [l.id, l]));
        const merged: PaymentView[] = (server.data ?? []).map((p) => {
          const l = localById.get(p.id);
          localById.delete(p.id);
          return { ...p, sync: l?.sync ?? null, syncError: l?.syncError ?? null };
        });
        merged.push(...localById.values());
        return merged.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
      })()
    : undefined;
  return { server, payments };
}

export function usePayment(id: string) {
  return useQuery({ queryKey: ['payments', 'one', id], queryFn: async () => (await listPayments(supabase, { id }))[0] ?? null });
}

export function useNotices() {
  return useQuery({ queryKey: ['notices'], queryFn: () => listPendingNotices(supabase), refetchInterval: 60_000 });
}

export function useConfirmNotice() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (n: { id: string; paymentId: string; amountCents: number; receivedAt: string; note?: string }) => confirmNotice(supabase, n),
    onSuccess: invalidate,
  });
}

export function useRejectNotice() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (n: { id: string; reason: string }) => rejectNotice(supabase, n.id, n.reason), onSuccess: invalidate });
}

export function useReversePayment() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (p: { id: string; reason: string }) => reversePayment(supabase, p.id, p.reason), onSuccess: invalidate });
}

export function useCreateOpeningBalance() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (e: OpeningBalanceInput) => createOpeningBalance(supabase, e), onSuccess: invalidate });
}

export function useCreateAdjustment() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (e: AdjustmentInput) => createAdjustment(supabase, e), onSuccess: invalidate });
}

export function useCancelEntry() {
  const invalidate = useInvalidateMoney();
  return useMutation({
    mutationFn: (e: { kind: 'OPENING_BALANCE' | 'ADJUSTMENT'; id: string; reason: string }) => cancelEntry(supabase, e.kind, e.id, e.reason),
    onSuccess: invalidate,
  });
}
