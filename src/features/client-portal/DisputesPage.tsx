import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, MessageSquareWarning } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import { formatDateTime } from '@/domain/period';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { listOpenDisputes } from '@/services/invites';

/** Compras que os clientes contestaram pelo app e ainda não foram encerradas. */
export function DisputesPage() {
  const disputes = useQuery({ queryKey: ['disputes'], queryFn: () => listOpenDisputes(supabase) });
  return (
    <>
      <PageHeader title="Contestações" back="/" />
      <main className="mx-auto max-w-lg space-y-3 px-4 pt-2 pb-6">
        <p className="text-brown-soft">A compra contestada continua na conta do cliente até você resolver.</p>
        {disputes.isPending ? (
          <LoadingState />
        ) : disputes.isError ? (
          <ErrorState message={errorMessage(disputes.error)} onRetry={() => void disputes.refetch()} />
        ) : disputes.data.length === 0 ? (
          <EmptyState icon={<MessageSquareWarning className="h-10 w-10" />} title="Nenhuma contestação em aberto" />
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
            {disputes.data.map((d) => (
              <li key={d.saleId}>
                <Link to={`/vendas/${d.saleId}`} className="flex items-center gap-3 px-4 py-3 active:bg-cream-deep">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-extrabold text-brown">{d.customerName}</span>
                    <span className="block text-sm text-brown-soft">
                      {d.establishmentName} · compra de {formatDateTime(new Date(d.occurredAt))}
                    </span>
                    <span className="mt-1 block text-brown">"{d.reason}"</span>
                  </span>
                  <span className="tabular shrink-0 font-black text-brown">{formatBRL(d.totalCents)}</span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-brown-soft" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
