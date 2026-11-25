import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { AlertTriangle, RefreshCw, Undo2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { ReasonForm } from '@/components/ReasonForm';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { METHOD_LABELS, SYNC_LABELS } from '@/domain/labels';
import { formatBRL } from '@/domain/money';
import { formatDateTime } from '@/domain/period';
import { retryOp } from '@/lib/offline/outbox';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { errorMessage } from '@/lib/supabase/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSync } from '@/features/sync/SyncProvider';
import { usePayment, useReversePayment } from './paymentsData';

const SOURCE_LABELS = {
  MANUAL: 'Registrado pela Rose',
  SALE_PAID_NOW: 'Venda paga na hora',
  PIX_NOTIFICATION: 'Aviso de Pix do cliente, conferido',
} as const;

export function PaymentDetailPage() {
  const { id = '' } = useParams();
  const { identity } = useAuth();
  const { db, requestSync } = useSync();
  const server = usePayment(id);
  const local = useLiveQuery(() => db.localPayments.get(id), [db, id]);
  const op = useLiveQuery(async () => (local ? ((await db.outbox.get(local.opId)) ?? null) : null), [db, local?.opId]);
  const reverse = useReversePayment();
  const toast = useToast();
  const [reversing, setReversing] = useState(false);

  if (server.isPending && local === undefined) return <LoadingState />;
  const p = server.data;
  if (!p && !local) {
    return <ErrorState message={server.isError ? errorMessage(server.error) : 'Pagamento não encontrado.'} onRetry={() => void server.refetch()} />;
  }

  const view = p ?? {
    id,
    customerId: local!.payload.customer_id,
    customerName: local!.customerName,
    amountCents: local!.payload.amount_cents,
    method: local!.payload.method,
    source: 'MANUAL' as const,
    receivedAt: local!.payload.received_at,
    note: local!.payload.note,
    status: 'CONFIRMED' as const,
    reverseReason: null,
  };
  const canReverse = identity?.staff?.role === 'OWNER' && !!p && p.status === 'CONFIRMED' && p.source !== 'SALE_PAID_NOW';

  return (
    <>
      <PageHeader title="Pagamento" back="/recebimentos" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <section className="rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <Link to={`/clientes/${view.customerId}`} className="text-xl font-black text-brown underline-offset-2 hover:underline">
            {view.customerName}
          </Link>
          <p className={`tabular mt-2 text-4xl font-black ${view.status === 'REVERSED' ? 'text-brown-soft line-through' : 'text-success'}`}>
            {formatBRL(view.amountCents)}
          </p>
          <dl className="mt-3 space-y-1 text-sm">
            <Row label="Forma" value={METHOD_LABELS[view.method]} />
            <Row label="Recebido em" value={formatDateTime(new Date(view.receivedAt))} />
            <Row label="Origem" value={SOURCE_LABELS[view.source]} />
            {view.note && <Row label="Observação" value={view.note} />}
            {op && <Row label="Envio" value={SYNC_LABELS[op.state]} />}
          </dl>
          {view.status === 'REVERSED' && (
            <p className="mt-3 rounded-2xl bg-danger/10 px-4 py-2 font-semibold text-danger">Estornado: {view.reverseReason}</p>
          )}
          {view.source === 'SALE_PAID_NOW' && (
            <p className="mt-3 text-sm text-brown-soft">Para desfazer, cancele a venda: o pagamento é estornado junto.</p>
          )}
        </section>

        {op?.state === 'FAILED' && (
          <section role="alert" className="space-y-3 rounded-card bg-danger/10 p-5">
            <p className="flex gap-2 font-bold text-danger">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Não foi possível enviar este pagamento. Ele continua salvo no celular.
            </p>
            {op.lastError && <p className="text-brown">{op.lastError.message}</p>}
            <Button
              variant="secondary"
              block
              onClick={async () => {
                await retryOp(db, op.opId);
                void requestSync();
              }}
            >
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
              Tentar de novo
            </Button>
          </section>
        )}

        {canReverse &&
          (reversing ? (
            <ReasonForm
              label="Motivo do estorno"
              placeholder="Ex.: dinheiro não recebido, valor errado"
              hint="O pagamento fica no histórico como estornado e o valor volta para a dívida."
              confirmLabel="Estornar pagamento"
              onCancel={() => setReversing(false)}
              onConfirm={async (reason) => {
                try {
                  await reverse.mutateAsync({ id, reason });
                  toast.show('Pagamento estornado.');
                  setReversing(false);
                } catch (e) {
                  toast.show(errorMessage(e), 'error');
                }
              }}
            />
          ) : (
            <Button variant="secondary" block onClick={() => setReversing(true)}>
              <Undo2 className="h-5 w-5" aria-hidden="true" />
              Estornar este pagamento
            </Button>
          ))}
      </main>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-brown-soft">{label}</dt>
      <dd className="text-right font-bold text-brown">{value}</dd>
    </div>
  );
}
