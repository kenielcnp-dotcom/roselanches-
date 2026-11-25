import { useState } from 'react';
import { AlertTriangle, LogOut, RefreshCw, Send, Smartphone } from 'lucide-react';
import { Button } from '@/components/Button';
import { useToast } from '@/components/Toast';
import { formatDateTime } from '@/domain/period';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSync } from '@/features/sync/SyncProvider';

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** O que está guardado neste celular, com envio e atualização manuais. */
export function DeviceSection() {
  const { counts, catalogUpdatedAt, persisted, requestSync, refreshCatalogNow } = useSync();
  const [busy, setBusy] = useState<'send' | 'refresh' | null>(null);
  const toast = useToast();
  const waitingSales = counts.pendingSales;
  const waitingSignatures = counts.pendingSignatures;
  const waitingPayments = counts.pendingPayments;

  return (
    <section aria-labelledby="dados-celular" className="space-y-3 rounded-card bg-white/90 p-5 shadow-soft ring-1 ring-line">
      <h2 id="dados-celular" className="flex items-center gap-2 text-lg font-extrabold text-brown">
        <Smartphone className="h-5 w-5 text-orange" aria-hidden="true" />
        Dados no celular
      </h2>
      <p className="text-brown">
        {waitingSales + waitingSignatures + waitingPayments === 0
          ? 'Tudo o que foi registrado aqui já chegou ao servidor.'
          : `Aguardando envio: ${[
              waitingSales > 0 ? plural(waitingSales, 'venda', 'vendas') : null,
              waitingSignatures > 0 ? plural(waitingSignatures, 'assinatura', 'assinaturas') : null,
              waitingPayments > 0 ? plural(waitingPayments, 'pagamento', 'pagamentos') : null,
            ]
              .filter(Boolean)
              .join(' e ')}.`}
      </p>
      <p className="text-sm text-brown-soft">
        {catalogUpdatedAt
          ? `Clientes e produtos copiados para o celular em ${formatDateTime(new Date(catalogUpdatedAt))}.`
          : 'Clientes e produtos ainda não foram copiados para o celular.'}
      </p>
      {persisted === false && (
        <p role="status" className="flex gap-2 rounded-2xl bg-peach px-4 py-3 text-sm font-semibold text-brown">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-darker" aria-hidden="true" />
          Este navegador pode apagar os dados do app se o celular ficar sem espaço. Envie as vendas sempre que tiver internet.
          Instalar o app na tela inicial ajuda a evitar isso.
        </p>
      )}
      <p className="text-sm text-brown-soft">O celular não é backup: o que vale é o que já foi enviado ao servidor.</p>
      <div className="grid grid-cols-2 gap-3">
        <Button
          variant="secondary"
          loading={busy === 'send'}
          onClick={async () => {
            setBusy('send');
            await requestSync({ force: true });
            setBusy(null);
          }}
        >
          <Send className="h-5 w-5" aria-hidden="true" />
          Enviar agora
        </Button>
        <Button
          variant="secondary"
          loading={busy === 'refresh'}
          onClick={async () => {
            setBusy('refresh');
            await refreshCatalogNow();
            setBusy(null);
            toast.show('Dados do celular atualizados.', 'info');
          }}
        >
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          Atualizar dados
        </Button>
      </div>
    </section>
  );
}

/**
 * Sair da conta. Com vendas que não chegaram ao servidor, não deixa sair:
 * sair apaga os dados do celular, e essas vendas se perderiam.
 */
export function SignOutButton() {
  const { signOut } = useAuth();
  const { counts, requestSync } = useSync();
  const [blocked, setBlocked] = useState(false);
  const [sending, setSending] = useState(false);
  const unsent = counts.pendingSales + counts.pendingSignatures + counts.pendingPayments + counts.pendingOther;

  return (
    <>
      <Button
        variant="secondary"
        block
        onClick={async () => {
          if ((await signOut()) === 'pending') setBlocked(true);
        }}
      >
        <LogOut className="h-5 w-5" aria-hidden="true" />
        Sair da conta
      </Button>
      {blocked && (
        <div role="dialog" aria-modal="true" aria-labelledby="sair-bloqueado" className="fixed inset-0 z-40 flex items-end bg-brown/40 p-3 sm:items-center sm:justify-center">
          <div className="w-full max-w-md space-y-3 rounded-card bg-white p-5 shadow-warm">
            <h2 id="sair-bloqueado" className="flex gap-2 text-lg font-black text-brown">
              <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-orange-darker" aria-hidden="true" />
              Ainda há {unsent === 1 ? '1 registro' : `${unsent} registros`} no celular que não chegaram ao servidor.
            </h2>
            <p className="text-brown">Sair agora apagaria esses registros. Envie primeiro, com internet.</p>
            <Button
              block
              loading={sending}
              onClick={async () => {
                setSending(true);
                await requestSync({ force: true });
                setSending(false);
                if ((await signOut()) === 'ok') setBlocked(false);
              }}
            >
              <Send className="h-5 w-5" aria-hidden="true" />
              Enviar agora e sair
            </Button>
            <Button variant="ghost" block onClick={() => setBlocked(false)}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
