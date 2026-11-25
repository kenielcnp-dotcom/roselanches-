import { useState } from 'react';
import { useParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, MessageSquareWarning, PenLine, ThumbsUp } from 'lucide-react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { TextAreaField } from '@/components/Field';
import { useToast } from '@/components/Toast';
import { paymentLabel } from '@/domain/labels';
import { formatBRL } from '@/domain/money';
import { formatDateTime, PERIOD_LABELS } from '@/domain/period';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { portalSignatureUrl, type PortalSaleDetail } from '@/services/portal';
import { useConfirmSale, useDisputeSale, usePortalSale } from './portalData';

/** Uma compra, do jeito que o cliente vê: itens, local, situação e confirmar/contestar. */
export function PortalSalePage() {
  const { id = '' } = useParams();
  const sale = usePortalSale(id);

  return (
    <>
      <PageHeader title="Compra" back="/conta" showSync={false} />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-10">
        {sale.isPending ? (
          <LoadingState />
        ) : sale.isError ? (
          <ErrorState message={errorMessage(sale.error)} onRetry={() => void sale.refetch()} />
        ) : (
          <>
            <SaleCard sale={sale.data} />
            <SignatureCard sale={sale.data} />
            <Response key={`${sale.data.confirmationStatus}-${sale.data.online?.receivedAt ?? ''}`} sale={sale.data} />
          </>
        )}
      </main>
    </>
  );
}

function SaleCard({ sale: s }: { sale: PortalSaleDetail }) {
  const cancelled = s.status === 'CANCELLED';
  return (
    <section className="rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
      <p className="text-sm font-bold text-brown-soft">
        {formatDateTime(new Date(s.occurredAt))} · {PERIOD_LABELS[s.period]}
      </p>
      <p className="text-lg font-extrabold text-brown">{s.establishmentName}</p>
      <div className="mt-3 rounded-2xl bg-cream px-4 py-3">
        {s.mode === 'ITEMS' ? (
          <ul className="space-y-1">
            {s.items.map((i, n) => (
              <li key={n} className="flex justify-between gap-3 text-brown">
                <span>
                  {i.quantity}× {i.name}{' '}
                  <span className="text-sm text-brown-soft">({formatBRL(i.unitPriceCents)} cada)</span>
                </span>
                <span className="tabular">{formatBRL(i.subtotalCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-bold text-brown">{s.description}</p>
        )}
        <div className="mt-3 flex items-end justify-between">
          <span className="font-bold text-brown">Total</span>
          <span className={`tabular text-3xl font-black ${cancelled ? 'text-brown-soft line-through' : 'text-brown'}`}>
            {formatBRL(s.totalCents)}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm text-brown">
        {paymentLabel(s.paymentKind, s.paidMethod)}
        {!cancelled && s.paymentKind === 'CREDIT' && s.openCents !== null && (
          <>
            {' · '}
            <strong className={s.openCents === 0 ? 'text-success' : 'text-orange-deep'}>
              {s.openCents === 0 ? 'Já quitada' : s.openCents === s.totalCents ? 'Em aberto' : `Falta ${formatBRL(s.openCents)}`}
            </strong>
          </>
        )}
      </p>
      {cancelled && (
        <p className="mt-3 rounded-2xl bg-danger/10 px-4 py-2 font-semibold text-danger">
          A Rose cancelou esta compra{s.cancelReason ? `: ${s.cancelReason}` : ''}. Ela não conta na sua dívida.
        </p>
      )}
    </section>
  );
}

function SignatureCard({ sale: s }: { sale: PortalSaleDetail }) {
  const path = s.signature?.valid ? s.signature.path : null;
  const url = useQuery({
    queryKey: ['portal-signature', path],
    queryFn: () => portalSignatureUrl(supabase, path ?? ''),
    enabled: !!path,
    staleTime: 60_000,
    retry: false,
  });
  if (!s.signature?.valid) return null;
  return (
    <section aria-label="Sua assinatura" className="rounded-card bg-white p-4 ring-1 ring-line">
      <p className="flex items-center gap-2 font-extrabold text-brown">
        <PenLine className="h-5 w-5 text-orange" aria-hidden="true" />
        Você assinou na tela da Rose
      </p>
      {url.data && (
        <img src={url.data} alt="Sua assinatura" className="mt-2 h-28 w-full rounded-xl bg-white object-contain ring-1 ring-line" />
      )}
      <p className="mt-1 text-xs text-brown-soft">Recebida em {formatDateTime(new Date(s.signature.receivedAt))}.</p>
    </section>
  );
}

function Response({ sale: s }: { sale: PortalSaleDetail }) {
  const toast = useToast();
  const confirm = useConfirmSale();
  const dispute = useDisputeSale();
  // Códigos criados quando a tela abre: toque duplo ou reenvio não duplica.
  const [confirmId] = useState(() => crypto.randomUUID());
  const [disputeId] = useState(() => crypto.randomUUID());
  const [mode, setMode] = useState<'idle' | 'dispute'>('idle');
  const [reason, setReason] = useState('');

  if (s.status === 'CANCELLED') return null;

  const base = { saleId: s.id, documentHash: s.documentHash, termsVersion: s.termsVersion };
  const status = s.confirmationStatus;
  const confirmed = status === 'SIGNED' || status === 'CONFIRMED_ONLINE';
  const disputed = status === 'DISPUTED';

  const doConfirm = async () => {
    try {
      await confirm.mutateAsync({ ...base, id: confirmId });
      toast.show('Compra confirmada. Obrigado!');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };
  const doDispute = async () => {
    try {
      await dispute.mutateAsync({ ...base, id: disputeId, reason });
      toast.show('Contestação enviada. A Rose vai falar com você.');
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  return (
    <section aria-label="Sua confirmação" className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
      {confirmed && (
        <p className="flex gap-2 font-bold text-success">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          {status === 'SIGNED'
            ? 'Você confirmou esta compra assinando na tela.'
            : `Você confirmou esta compra${s.online ? ` em ${formatDateTime(new Date(s.online.receivedAt))}` : ''}.`}
        </p>
      )}
      {disputed && s.online && (
        <div className="space-y-1 rounded-2xl bg-peach px-4 py-3 text-brown">
          <p className="flex gap-2 font-bold">
            <MessageSquareWarning className="mt-0.5 h-5 w-5 shrink-0 text-orange-deep" aria-hidden="true" />
            Você contestou esta compra
          </p>
          <p>"{s.online.disputeReason}"</p>
          <p className="text-sm text-brown-soft">
            A Rose vai conversar com você. Enquanto isso, a compra continua na sua conta.
          </p>
        </div>
      )}
      {status === 'PENDING' && s.online?.resolvedAt && (
        <p className="rounded-2xl bg-cream px-4 py-3 text-brown">
          A Rose respondeu à sua contestação: "{s.online.resolutionNote}"
        </p>
      )}

      {!confirmed && mode === 'idle' && (
        <>
          <h2 className="text-lg font-black text-brown">{disputed ? 'Mudou de ideia?' : 'Esta compra está certa?'}</h2>
          <p className="rounded-2xl bg-cream px-4 py-3 text-sm text-brown">{s.termsBody}</p>
          <Button block loading={confirm.isPending} onClick={() => void doConfirm()}>
            <ThumbsUp className="h-5 w-5" aria-hidden="true" />
            Confirmo esta compra
          </Button>
          {!disputed && (
            <Button variant="secondary" block onClick={() => setMode('dispute')}>
              Não reconheço / está errada
            </Button>
          )}
        </>
      )}

      {confirmed && status === 'CONFIRMED_ONLINE' && mode === 'idle' && (
        <Button variant="ghost" block onClick={() => setMode('dispute')}>
          Encontrei um erro nesta compra
        </Button>
      )}

      {mode === 'dispute' && (
        <div className="space-y-3">
          <TextAreaField
            label="O que está errado?"
            placeholder="Ex.: não comprei o suco, o valor era outro"
            value={reason}
            maxLength={300}
            rows={3}
            autoFocus
            hint="A Rose vê esta mensagem. A compra continua na conta até vocês conversarem."
            onChange={(e) => setReason(e.target.value)}
          />
          <Button block loading={dispute.isPending} disabled={reason.trim().length < 3} onClick={() => void doDispute()}>
            Enviar contestação
          </Button>
          <Button variant="ghost" block onClick={() => setMode('idle')}>
            Voltar
          </Button>
        </div>
      )}
    </section>
  );
}
