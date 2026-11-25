import { useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, BellRing, CheckCircle2, ChevronRight, Clock, HandCoins, Plus } from 'lucide-react';
import { Button } from '@/components/Button';
import { Chip, MoneyField } from '@/components/Controls';
import { PageHeader } from '@/components/PageHeader';
import { ReasonForm } from '@/components/ReasonForm';
import { EmptyState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { METHOD_LABELS } from '@/domain/labels';
import { formatBRL } from '@/domain/money';
import { formatDateTime, formatShortDate, formatTime, localDateISO } from '@/domain/period';
import { maskPhone } from '@/domain/phone';
import { errorMessage } from '@/lib/supabase/errors';
import type { PaymentNotice } from '@/services/payments';
import { useAuth } from '@/features/auth/AuthProvider';
import { useConfirmNotice, useNotices, usePaymentsSince, useRejectNotice } from './paymentsData';

export function ReceivablesPage() {
  const [days, setDays] = useState(1);
  const { identity } = useAuth();
  const isOwner = identity?.staff?.role === 'OWNER';
  // Aviso de Pix cai na conta da Rose: só ela confere. O vendedor vê o que ele recebeu.
  const notices = useNotices(isOwner);
  const { server, payments } = usePaymentsSince(days, isOwner ? undefined : identity?.userId);
  const confirmed = payments?.filter((p) => p.status === 'CONFIRMED') ?? [];
  const total = confirmed.reduce((sum, p) => sum + p.amountCents, 0);
  const today = localDateISO(new Date());

  return (
    <>
      <PageHeader title="Recebimentos" back="/" showSync />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <Link
          to="/recebimentos/novo"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange-deep px-5 text-lg font-extrabold text-white shadow-warm active:bg-orange-darker"
        >
          <Plus className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
          Registrar pagamento
        </Link>

        {isOwner && (
          <section aria-labelledby="avisos" className="space-y-2">
            <h2 id="avisos" className="flex items-center gap-2 text-xl font-black text-brown">
              <BellRing className="h-6 w-6 text-orange" aria-hidden="true" />
              Avisos de Pix dos clientes
            </h2>
            <p className="text-sm text-brown-soft">
              O aviso do cliente não prova o pagamento. Confira no app do seu banco antes de confirmar.
            </p>
            {notices.isPending ? (
              <LoadingState />
            ) : notices.isError ? (
              <p className="rounded-2xl bg-white/70 px-4 py-3 text-brown-soft ring-1 ring-line">
                Os avisos aparecem quando houver internet. ({errorMessage(notices.error)})
              </p>
            ) : notices.data.length === 0 ? (
              <p className="rounded-2xl bg-white/70 px-4 py-3 text-brown-soft ring-1 ring-line">Nenhum aviso esperando você.</p>
            ) : (
              <ul className="space-y-3">
                {notices.data.map((n) => (
                  <li key={n.id}>
                    <NoticeCard notice={n} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section aria-labelledby="pagamentos" className="space-y-2">
          <h2 id="pagamentos" className="flex items-center gap-2 text-xl font-black text-brown">
            <HandCoins className="h-6 w-6 text-orange" aria-hidden="true" />
            Pagamentos recebidos
          </h2>
          <div className="flex gap-2" role="group" aria-label="Período">
            <Chip selected={days === 1} onClick={() => setDays(1)}>
              Hoje
            </Chip>
            <Chip selected={days === 7} onClick={() => setDays(7)}>
              Últimos 7 dias
            </Chip>
          </div>
          {server.isError && (
            <p role="status" className="rounded-2xl bg-peach px-4 py-3 text-sm text-brown">
              Sem conexão com o servidor: mostrando só os pagamentos registrados neste celular.
            </p>
          )}
          {!payments ? (
            <LoadingState />
          ) : payments.length === 0 && !server.isPending ? (
            <EmptyState
              icon={<HandCoins className="h-10 w-10" />}
              title={days === 1 ? 'Nenhum pagamento hoje' : 'Nenhum pagamento nesses dias'}
            />
          ) : (
            <>
              <p className="text-brown-soft">
                {confirmed.length} {confirmed.length === 1 ? 'pagamento' : 'pagamentos'} ·{' '}
                <strong className="tabular text-brown">{formatBRL(total)}</strong>
              </p>
              <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
                {payments.map((p) => {
                  const when = new Date(p.receivedAt);
                  const reversed = p.status === 'REVERSED';
                  return (
                    <li key={p.id}>
                      <Link to={`/recebimentos/${p.id}`} className="flex min-h-16 items-center gap-3 px-4 py-2.5 active:bg-cream-deep">
                        <span className="tabular w-12 shrink-0 text-sm font-bold text-brown-soft">
                          {localDateISO(when) === today ? formatTime(when) : formatShortDate(when)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-extrabold ${reversed ? 'text-brown-soft line-through' : 'text-brown'}`}>
                            {p.customerName}
                          </span>
                          <span className="flex flex-wrap gap-1.5 text-xs font-bold">
                            <span className="rounded-full bg-cream-deep px-2 py-0.5 text-brown">
                              {METHOD_LABELS[p.method]}
                              {p.source === 'SALE_PAID_NOW'
                                ? ' · venda paga na hora'
                                : p.source === 'PIX_NOTIFICATION'
                                  ? ' · aviso do cliente'
                                  : ''}
                            </span>
                            {isOwner && p.createdBy && p.createdBy !== identity?.userId && (
                              <span className="rounded-full bg-peach px-2 py-0.5 text-orange-deep">por {p.createdByName ?? 'vendedor'}</span>
                            )}
                            {reversed && <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">Estornado</span>}
                            {p.sync === 'PENDING' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-cream-deep px-2 py-0.5 text-orange-deep">
                                <Clock className="h-3 w-3" aria-hidden="true" />
                                No celular
                              </span>
                            )}
                            {p.sync === 'FAILED' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-2 py-0.5 text-danger">
                                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                                Não enviado
                              </span>
                            )}
                            {p.sync === 'SYNCED' && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-success">
                                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                                Sincronizado
                              </span>
                            )}
                          </span>
                        </span>
                        <span className={`tabular shrink-0 font-black ${reversed ? 'text-brown-soft line-through' : 'text-success'}`}>
                          {formatBRL(p.amountCents)}
                        </span>
                        <ChevronRight className="h-5 w-5 shrink-0 text-brown-soft" aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </main>
    </>
  );
}

/** Um aviso "Já paguei": a Rose confere no banco e confirma o valor que viu, ou recusa. */
function NoticeCard({ notice: n }: { notice: PaymentNotice }) {
  const [mode, setMode] = useState<'idle' | 'confirm' | 'reject'>('idle');
  const [amount, setAmount] = useState(n.amountCents ?? 0);
  // Código do pagamento criado quando o cartão abre: toque duplo não paga duas vezes.
  const [paymentId] = useState(() => crypto.randomUUID());
  const confirm = useConfirmNotice();
  const reject = useRejectNotice();
  const toast = useToast();

  return (
    <article aria-label={`Aviso de ${n.customerName}`} className="space-y-3 rounded-card bg-white p-4 shadow-soft ring-2 ring-orange/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-lg font-black text-brown">{n.customerName}</p>
          <p className="text-sm text-brown-soft">
            {n.customerPhone ? `${maskPhone(n.customerPhone)} · ` : ''}avisou em {formatDateTime(new Date(n.createdAt))}
          </p>
          {n.note && <p className="mt-1 text-brown">"{n.note}"</p>}
          <p className="mt-1 text-sm text-brown-soft">Deve hoje: {formatBRL(Math.max(0, n.customerBalanceCents))}</p>
        </div>
        <p className="tabular shrink-0 text-right text-2xl font-black text-brown">
          {n.amountCents ? formatBRL(n.amountCents) : 'Sem valor'}
        </p>
      </div>

      {mode === 'idle' && (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" onClick={() => setMode('reject')}>
            Recusar
          </Button>
          <Button onClick={() => setMode('confirm')}>Conferi, confirmar</Button>
        </div>
      )}

      {mode === 'confirm' && (
        <div className="space-y-3">
          <MoneyField
            label="Valor que chegou na sua conta"
            valueCents={amount}
            onChange={setAmount}
            hint="Confira no app do banco. Pode ser diferente do avisado."
          />
          <Button
            block
            loading={confirm.isPending}
            disabled={amount <= 0}
            onClick={async () => {
              try {
                await confirm.mutateAsync({ id: n.id, paymentId, amountCents: amount, receivedAt: new Date().toISOString() });
                toast.show(`Pagamento confirmado: ${formatBRL(amount)} de ${n.customerName}.`);
              } catch (e) {
                toast.show(errorMessage(e), 'error');
              }
            }}
          >
            Confirmar {formatBRL(amount)}
          </Button>
          <Button variant="ghost" block onClick={() => setMode('idle')}>
            Voltar
          </Button>
        </div>
      )}

      {mode === 'reject' && (
        <ReasonForm
          label="Por que recusar?"
          placeholder="Ex.: não chegou na conta"
          hint="O cliente vê este motivo. O saldo dele não muda."
          confirmLabel="Recusar aviso"
          onCancel={() => setMode('idle')}
          onConfirm={async (reason) => {
            try {
              await reject.mutateAsync({ id: n.id, reason });
              toast.show('Aviso recusado.');
            } catch (e) {
              toast.show(errorMessage(e), 'error');
            }
          }}
        />
      )}
    </article>
  );
}
