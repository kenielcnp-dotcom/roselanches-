import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, Copy, Send } from 'lucide-react';
import { Button } from '@/components/Button';
import { Chip, MoneyField } from '@/components/Controls';
import { TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { QrCode } from '@/components/QrCode';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { formatBRL } from '@/domain/money';
import { formatPixKey, PIX_KEY_LABELS } from '@/domain/pix';
import { buildPixBrCode } from '@/domain/pix-brcode';
import { errorMessage } from '@/lib/supabase/errors';
import { copyText } from '@/lib/ui/clipboard';
import type { PortalPix } from '@/services/portal';
import { useNotifyPayment, usePortalPix, usePortalSummary } from './portalData';

/** "Pagar com Pix": chave para copiar, QR estático com valor opcional e o aviso "Já paguei". */
export function PortalPixPage() {
  const pix = usePortalPix();
  const summary = usePortalSummary();

  return (
    <>
      <PageHeader title="Pagar com Pix" back="/conta" showSync={false} />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-10">
        {pix.isPending || summary.isPending ? (
          <LoadingState />
        ) : pix.isError || summary.isError ? (
          <ErrorState
            message={errorMessage(pix.error ?? summary.error)}
            onRetry={() => void Promise.all([pix.refetch(), summary.refetch()])}
          />
        ) : !pix.data.key || !pix.data.keyType ? (
          <p className="rounded-card bg-white/70 px-5 py-6 text-center text-brown ring-1 ring-line">
            A Rose ainda não cadastrou a chave Pix. Para pagar, fale com ela.
          </p>
        ) : (
          <PixContent pix={pix.data} balanceCents={summary.data.balanceCents} />
        )}
      </main>
    </>
  );
}

function PixContent({ pix, balanceCents }: { pix: PortalPix; balanceCents: number }) {
  const toast = useToast();
  const owes = Math.max(0, balanceCents);
  const [choice, setChoice] = useState<'ALL' | 'OTHER' | 'NONE'>(owes > 0 ? 'ALL' : 'NONE');
  const [other, setOther] = useState(0);
  const amount = choice === 'ALL' ? owes : choice === 'OTHER' ? other : null;

  const code = useMemo(() => {
    if (!pix.key || !pix.receiverName || !pix.city) return null;
    if (amount !== null && amount <= 0) return null;
    try {
      return buildPixBrCode({ key: pix.key, receiverName: pix.receiverName, city: pix.city, amountCents: amount });
    } catch {
      return null;
    }
  }, [pix, amount]);

  const copy = async (text: string, what: string) => {
    toast.show((await copyText(text)) ? `${what} copiado.` : 'Não deu para copiar. Selecione e copie na mão.', 'info');
  };

  return (
    <>
      <section className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
        <h2 className="text-lg font-black text-brown">Quanto você vai pagar?</h2>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Valor do Pix">
          {owes > 0 && (
            <Chip selected={choice === 'ALL'} onClick={() => setChoice('ALL')}>
              Tudo: {formatBRL(owes)}
            </Chip>
          )}
          <Chip selected={choice === 'OTHER'} onClick={() => setChoice('OTHER')}>
            Outro valor
          </Chip>
          <Chip selected={choice === 'NONE'} onClick={() => setChoice('NONE')}>
            Digitar no banco
          </Chip>
        </div>
        {choice === 'OTHER' && <MoneyField label="Valor do Pix" valueCents={other} onChange={setOther} autoFocus />}
      </section>

      <section className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
        {code ? (
          <>
            <QrCode value={code} label="QR code do Pix" />
            <p className="text-center text-sm text-brown-soft">
              Abra o app do seu banco, escolha Pix e leia o QR code
              {amount ? ` (${formatBRL(amount)})` : ''}, ou use o "copia e cola".
            </p>
            <Button block onClick={() => void copy(code, 'Código Pix')}>
              <Copy className="h-5 w-5" aria-hidden="true" />
              Copiar código Pix (copia e cola)
            </Button>
          </>
        ) : (
          choice === 'OTHER' && <p className="text-center text-brown-soft">Digite o valor para gerar o QR code.</p>
        )}
        <div className="rounded-2xl bg-cream px-4 py-3">
          <p className="text-sm font-bold text-brown-soft">Chave Pix ({PIX_KEY_LABELS[pix.keyType ?? 'EVP']})</p>
          <p className="font-extrabold break-all text-brown">{formatPixKey(pix.keyType ?? 'EVP', pix.key ?? '')}</p>
          {pix.receiverName && <p className="text-sm text-brown">Em nome de {pix.receiverName}</p>}
        </div>
        <Button variant="secondary" block onClick={() => void copy(pix.key ?? '', 'Chave')}>
          <Copy className="h-5 w-5" aria-hidden="true" />
          Copiar chave
        </Button>
        <p className="text-xs text-brown-soft">Confira o nome de quem recebe no app do banco antes de confirmar o Pix.</p>
      </section>

      <AlreadyPaid suggestedCents={amount} />
    </>
  );
}

function AlreadyPaid({ suggestedCents }: { suggestedCents: number | null }) {
  const notify = useNotifyPayment();
  const [id, setId] = useState(() => crypto.randomUUID());
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState<number | null>(null);

  if (sent !== null) {
    return (
      <section role="status" className="space-y-2 rounded-card bg-success/10 p-5 text-brown ring-1 ring-success/30">
        <p className="flex gap-2 font-extrabold text-success">
          <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0" aria-hidden="true" />
          Aviso enviado!
        </p>
        <p>
          A Rose vai conferir o Pix{sent ? ` de ${formatBRL(sent)}` : ''} no banco dela. O seu saldo muda quando ela confirmar.
        </p>
        <Link to="/conta" className="block pt-1 font-extrabold text-orange-darker">
          Voltar para a minha conta
        </Link>
      </section>
    );
  }

  if (!open) {
    return (
      <Button
        variant="secondary"
        block
        onClick={() => {
          setAmount(suggestedCents ?? 0);
          setOpen(true);
        }}
      >
        <Send className="h-5 w-5" aria-hidden="true" />
        Já paguei: avisar a Rose
      </Button>
    );
  }

  return (
    <section aria-label="Avisar que já paguei" className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
      <h2 className="text-lg font-black text-brown">Avisar que já paguei</h2>
      <MoneyField label="Quanto você pagou" valueCents={amount} onChange={setAmount} hint="Pode deixar em branco se não lembrar." />
      <TextField
        label="Recado (opcional)"
        value={note}
        maxLength={200}
        placeholder="Ex.: paguei pelo Pix da minha esposa"
        onChange={(e) => setNote(e.target.value)}
      />
      <p className="text-sm text-brown-soft">O aviso não muda o saldo sozinho: a Rose confere no banco e confirma.</p>
      {notify.isError && (
        <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
          {errorMessage(notify.error)}
        </p>
      )}
      <Button
        block
        loading={notify.isPending}
        onClick={async () => {
          try {
            await notify.mutateAsync({ id, amountCents: amount > 0 ? amount : null, note: note || null });
            setSent(amount);
            setId(crypto.randomUUID());
          } catch {
            /* a mensagem aparece acima */
          }
        }}
      >
        Enviar aviso{amount > 0 ? ` de ${formatBRL(amount)}` : ''}
      </Button>
      <Button variant="ghost" block onClick={() => setOpen(false)}>
        Cancelar
      </Button>
    </section>
  );
}
