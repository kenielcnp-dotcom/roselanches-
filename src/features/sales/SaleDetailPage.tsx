import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AlertTriangle, Ban, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { CONFIRMATION_LABELS, paymentLabel, SYNC_LABELS } from '@/domain/labels';
import { formatBRL } from '@/domain/money';
import { formatDateTime, PERIOD_LABELS } from '@/domain/period';
import { maskPhone } from '@/domain/phone';
import { discardFailedSale, enqueueCancel, retryOp } from '@/lib/offline/outbox';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { errorMessage } from '@/lib/supabase/errors';
import { useSync } from '@/features/sync/SyncProvider';
import { SaleBadges } from './SaleBadges';
import { useSale } from './salesData';

export function SaleDetailPage() {
  const { id = '' } = useParams();
  const { db, requestSync } = useSync();
  const { server, sale, items: serverItems } = useSale(id);
  const local = useLiveQuery(() => db.localSales.get(id), [db, id]);
  const createOp = useLiveQuery(async () => (local ? ((await db.outbox.get(local.opId)) ?? null) : null), [db, local?.opId]);
  const navigate = useNavigate();
  const toast = useToast();
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!sale) {
    if (server.isPending || local === undefined) return <LoadingState />;
    return <ErrorState message={server.isError ? errorMessage(server.error) : 'Venda não encontrada.'} onRetry={() => void server.refetch()} />;
  }

  const items =
    serverItems ??
    local?.draft.items.map((i) => ({ productName: i.productName, quantity: i.quantity, unitPriceCents: i.unitPriceCents, subtotalCents: i.subtotalCents })) ??
    null;
  const canCancel = sale.status === 'ACTIVE' && !sale.pendingCancel && sale.sync !== 'FAILED';

  const confirmCancel = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      await enqueueCancel(db, sale.id, reason);
      toast.show('Cancelamento salvo no celular.');
      setCancelling(false);
      void requestSync();
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Venda" back="/vendas" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <section className="rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <Link to={`/clientes/${sale.customerId}`} className="block">
            <span className="block text-xl font-black text-brown underline-offset-2 hover:underline">{sale.customerName}</span>
            {sale.customerPhone && <span className="text-brown-soft">{maskPhone(sale.customerPhone)}</span>}
          </Link>
          <p className="mt-2 text-brown">
            {sale.establishmentName} · {formatDateTime(new Date(sale.occurredAt))} · {PERIOD_LABELS[sale.period]}
          </p>
          <SaleBadges sale={sale} />

          <div className="mt-4 border-t border-line pt-3">
            {sale.mode === 'ITEMS' && items ? (
              <ul className="space-y-1">
                {items.map((i, n) => (
                  <li key={n} className="flex justify-between gap-3 text-brown">
                    <span>
                      {i.quantity}× {i.productName} <span className="text-brown-soft">({formatBRL(i.unitPriceCents)})</span>
                    </span>
                    <span className="tabular">{formatBRL(i.subtotalCents)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="font-bold text-brown">{sale.summary}</p>
            )}
            <div className="mt-3 flex items-end justify-between">
              <span className="font-bold text-brown">Total</span>
              <span className={`tabular text-3xl font-black ${sale.status === 'CANCELLED' ? 'text-brown-soft line-through' : 'text-brown'}`}>
                {formatBRL(sale.totalCents)}
              </span>
            </div>
          </div>

          <dl className="mt-4 space-y-1 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-brown-soft">Pagamento</dt>
              <dd className="font-bold text-brown">{paymentLabel(sale.paymentKind, sale.paidMethod)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-brown-soft">Confirmação</dt>
              <dd className="font-bold text-brown">{CONFIRMATION_LABELS[sale.confirmationStatus]}</dd>
            </div>
            {sale.sync && (
              <div className="flex justify-between gap-3">
                <dt className="text-brown-soft">Envio</dt>
                <dd className="font-bold text-brown">{SYNC_LABELS[sale.sync]}</dd>
              </div>
            )}
          </dl>
          {sale.status === 'CANCELLED' && sale.cancelReason && (
            <p className="mt-3 rounded-2xl bg-danger/10 px-4 py-2 font-semibold text-danger">Cancelada: {sale.cancelReason}</p>
          )}
          {sale.pendingCancel && (
            <p className="mt-3 rounded-2xl bg-peach px-4 py-2 font-semibold text-brown">
              Cancelamento salvo no celular ({sale.pendingCancel.reason}). Será enviado quando houver internet.
            </p>
          )}
        </section>

        {sale.sync === 'FAILED' && createOp && (
          <section role="alert" className="space-y-3 rounded-card bg-danger/10 p-5">
            <p className="flex gap-2 font-bold text-danger">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              Não foi possível enviar esta venda. Ela continua salva no celular.
            </p>
            {createOp.lastError && <p className="text-brown">{createOp.lastError.message}</p>}
            <Button
              variant="secondary"
              block
              onClick={async () => {
                await retryOp(db, createOp.opId);
                void requestSync();
              }}
            >
              <RefreshCw className="h-5 w-5" aria-hidden="true" />
              Tentar de novo
            </Button>
            <Button
              variant="ghost"
              block
              className="text-danger"
              onClick={async () => {
                if (!window.confirm('Esta venda não foi registrada no servidor. Apagar do celular? Isso não pode ser desfeito.')) return;
                if (await discardFailedSale(db, sale.id)) {
                  toast.show('Venda apagada do celular.');
                  navigate('/vendas', { replace: true });
                }
              }}
            >
              <Trash2 className="h-5 w-5" aria-hidden="true" />
              Apagar do celular
            </Button>
          </section>
        )}

        {canCancel &&
          (cancelling ? (
            <section className="space-y-3 rounded-card bg-white p-5 ring-1 ring-line">
              <TextField
                label="Motivo do cancelamento"
                placeholder="Ex.: cliente errado, valor errado"
                value={reason}
                maxLength={200}
                autoFocus
                onChange={(e) => setReason(e.target.value)}
                error={reason.length > 0 && reason.trim().length < 3 ? 'Escreva pelo menos 3 letras.' : undefined}
              />
              <p className="text-sm text-brown-soft">A venda não é apagada: fica no histórico como cancelada, com o motivo.</p>
              <Button variant="danger" block loading={busy} disabled={reason.trim().length < 3} onClick={() => void confirmCancel()}>
                Cancelar venda
              </Button>
              <Button variant="ghost" block onClick={() => setCancelling(false)}>
                Voltar
              </Button>
            </section>
          ) : (
            <Button variant="secondary" block onClick={() => setCancelling(true)}>
              <Ban className="h-5 w-5" aria-hidden="true" />
              Cancelar esta venda
            </Button>
          ))}
      </main>
    </>
  );
}
