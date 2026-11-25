import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { Ban } from 'lucide-react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { ReasonForm } from '@/components/ReasonForm';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { formatBRL } from '@/domain/money';
import { formatDate, formatDateTime } from '@/domain/period';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { throwIfError } from '@/services/shared';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCancelEntry } from './paymentsData';

interface Entry {
  title: string;
  amountCents: number;
  date: string;
  text: string;
  status: string;
  cancelReason: string | null;
  createdAt: string;
}

async function fetchEntry(kind: 'OPENING_BALANCE' | 'ADJUSTMENT', id: string): Promise<Entry | null> {
  if (kind === 'OPENING_BALANCE') {
    const { data, error } = await supabase
      .from('opening_balances')
      .select('amount_cents, reference_date, note, status, cancel_reason, created_at')
      .eq('id', id)
      .maybeSingle();
    throwIfError(error);
    return data
      ? {
          title: 'Saldo anterior',
          amountCents: data.amount_cents,
          date: formatDate(new Date(`${data.reference_date}T12:00:00`)),
          text: data.note,
          status: data.status,
          cancelReason: data.cancel_reason,
          createdAt: data.created_at,
        }
      : null;
  }
  const { data, error } = await supabase
    .from('financial_adjustments')
    .select('direction, amount_cents, reason, occurred_at, status, cancel_reason, created_at')
    .eq('id', id)
    .maybeSingle();
  throwIfError(error);
  return data
    ? {
        title: data.direction === 'CREDIT' ? 'Ajuste (diminuiu a dívida)' : 'Ajuste (aumentou a dívida)',
        amountCents: data.amount_cents,
        date: formatDateTime(new Date(data.occurred_at)),
        text: data.reason,
        status: data.status,
        cancelReason: data.cancel_reason,
        createdAt: data.created_at,
      }
    : null;
}

/** Saldo anterior ou ajuste: detalhes e cancelamento (com motivo, sem apagar). */
export function EntryDetailPage() {
  const { id: customerId = '', entryId = '' } = useParams();
  const [params] = useSearchParams();
  const kind = params.get('tipo') === 'ADJUSTMENT' ? 'ADJUSTMENT' : 'OPENING_BALANCE';
  const query = useQuery({ queryKey: ['entry', kind, entryId], queryFn: () => fetchEntry(kind, entryId) });
  const { identity } = useAuth();
  const cancel = useCancelEntry();
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);

  if (query.isPending) return <LoadingState />;
  if (query.isError || !query.data) {
    return <ErrorState message={query.isError ? errorMessage(query.error) : 'Lançamento não encontrado.'} onRetry={() => void query.refetch()} />;
  }
  const e = query.data;
  const cancelled = e.status === 'CANCELLED';

  return (
    <>
      <PageHeader title={e.title} back={`/clientes/${customerId}`} />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <section className="rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <p className={`tabular text-4xl font-black ${cancelled ? 'text-brown-soft line-through' : 'text-brown'}`}>{formatBRL(e.amountCents)}</p>
          <p className="mt-2 text-brown">{e.text}</p>
          <p className="mt-1 text-sm text-brown-soft">
            {kind === 'OPENING_BALANCE' ? `Referência: ${e.date}` : e.date} · lançado em {formatDateTime(new Date(e.createdAt))}
          </p>
          {cancelled && <p className="mt-3 rounded-2xl bg-danger/10 px-4 py-2 font-semibold text-danger">Cancelado: {e.cancelReason}</p>}
        </section>
        {!cancelled &&
          identity?.staff?.role === 'OWNER' &&
          (cancelling ? (
            <ReasonForm
              label="Motivo do cancelamento"
              hint="O lançamento fica no histórico como cancelado e sai do saldo."
              confirmLabel="Cancelar lançamento"
              onCancel={() => setCancelling(false)}
              onConfirm={async (reason) => {
                try {
                  await cancel.mutateAsync({ kind, id: entryId, reason });
                  await query.refetch();
                  toast.show('Lançamento cancelado.');
                  setCancelling(false);
                } catch (err) {
                  toast.show(errorMessage(err), 'error');
                }
              }}
            />
          ) : (
            <Button variant="secondary" block onClick={() => setCancelling(true)}>
              <Ban className="h-5 w-5" aria-hidden="true" />
              Cancelar este lançamento
            </Button>
          ))}
      </main>
    </>
  );
}
