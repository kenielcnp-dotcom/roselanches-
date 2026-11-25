import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Clock } from 'lucide-react';
import { Button } from '@/components/Button';
import { ErrorState, LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import { formatDateTime } from '@/domain/period';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { supabase } from '@/lib/supabase/client';
import { errorMessage, toAppError } from '@/lib/supabase/errors';
import { fetchStatement, type StatementEntry } from '@/services/sales';
import { useSync } from '@/features/sync/SyncProvider';
import { StatementEntryRow } from '@/features/shared/StatementEntryRow';

const PAGE = 20;

/** Extrato: vendas, pagamentos, saldo anterior e ajustes, do mais novo para o mais antigo. */
export function CustomerStatement({ customerId }: { customerId: string }) {
  const { db } = useSync();
  // Vendas ainda no celular (não chegaram ao servidor): aparecem no topo, identificadas.
  const onPhone = useLiveQuery(async () => {
    const [sales, ops] = await Promise.all([db.localSales.toArray(), db.outbox.toArray()]);
    const pending = new Set(ops.filter((o) => o.type === 'CREATE_SALE' && o.state !== 'SYNCED').map((o) => o.opId));
    return sales.filter((s) => s.draft.customerId === customerId && pending.has(s.opId));
  }, [db, customerId]);

  const query = useInfiniteQuery({
    queryKey: ['statement', customerId],
    initialPageParam: null as { beforeAt: string; beforeId: string } | null,
    queryFn: ({ pageParam }) => fetchStatement(supabase, customerId, pageParam, PAGE),
    getNextPageParam: (last) => {
      const tail = last[last.length - 1];
      return last.length === PAGE && tail ? { beforeAt: tail.occurredAt, beforeId: tail.id } : undefined;
    },
  });

  const entries = query.data?.pages.flat() ?? [];

  return (
    <section aria-labelledby="extrato" className="space-y-3">
      <h2 id="extrato" className="text-xl font-black text-brown">
        Compras e pagamentos
      </h2>

      {onPhone && onPhone.length > 0 && (
        <ul className="space-y-2">
          {onPhone.map((s) => (
            <li key={s.id}>
              <Link to={`/vendas/${s.id}`} className="flex items-center gap-3 rounded-card bg-peach px-4 py-3 ring-1 ring-line">
                <Clock className="h-5 w-5 shrink-0 text-orange-deep" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold text-brown">{s.summary}</span>
                  <span className="text-sm text-brown-soft">
                    {formatDateTime(new Date(s.draft.occurredAt))} · salva no celular, aguardando envio
                  </span>
                </span>
                <span className="tabular font-black text-brown">{formatBRL(s.draft.totalCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        toAppError(query.error).kind === 'network' ? (
          <p className="rounded-card bg-white/70 px-5 py-6 text-center text-brown-soft ring-1 ring-line">
            Sem internet: o extrato completo aparece quando a conexão voltar.
          </p>
        ) : (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        )
      ) : entries.length === 0 ? (
        <p className="rounded-card bg-white/70 px-5 py-6 text-center text-brown-soft ring-1 ring-line">Nenhum lançamento ainda.</p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
          {entries.map((e) => (
            <StatementEntryRow key={`${e.kind}-${e.id}`} entry={e} to={staffLink(e, customerId)} audience="staff" />
          ))}
        </ul>
      )}

      {query.hasNextPage && (
        <Button variant="secondary" block loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          Ver mais antigos
        </Button>
      )}
    </section>
  );
}

function staffLink(e: StatementEntry, customerId: string): string {
  if (e.kind === 'SALE') return `/vendas/${e.id}`;
  if (e.kind === 'PAYMENT') return `/recebimentos/${e.id}`;
  return `/clientes/${customerId}/lancamentos/${e.id}?tipo=${e.kind === 'OPENING_BALANCE' ? 'OPENING_BALANCE' : 'ADJUSTMENT'}`;
}
