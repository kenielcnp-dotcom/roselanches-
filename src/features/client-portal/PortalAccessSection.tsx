import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, MessageCircle, QrCode as QrIcon, Smartphone, UserX } from 'lucide-react';
import { Button } from '@/components/Button';
import { QrCode } from '@/components/QrCode';
import { ReasonForm } from '@/components/ReasonForm';
import { useToast } from '@/components/Toast';
import { formatDate, formatDateTime, firstName } from '@/domain/period';
import { whatsappLink } from '@/domain/phone';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { copyText } from '@/lib/ui/clipboard';
import { queryKeys } from '@/features/registry/queries';
import { cancelInvite, createInvite, fetchOpenInvite, inviteLink, unlinkAccount, type CreatedInvite } from '@/services/invites';

interface Props {
  customer: {
    id: string;
    fullName: string;
    phoneE164: string | null;
    isActive: boolean;
    portalLinked: boolean;
    linkedAt: string | null;
  };
  isOwner: boolean;
}

export function inviteMessage(name: string, link: string): string {
  return (
    `Olá, ${firstName(name)}! Aqui é do Lanches da Rose. ` +
    'Por este link você acompanha suas compras e seu saldo, confirma as compras e pode pagar com Pix. ' +
    'Crie sua conta com e-mail e senha. O link vale por 3 dias e só funciona uma vez:\n' +
    link
  );
}

/** Acesso do cliente à própria conta: convite de uso único e desvínculo. */
export function PortalAccessSection({ customer: c, isOwner }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [created, setCreated] = useState<CreatedInvite | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const openInvite = useQuery({
    queryKey: ['invite', c.id],
    queryFn: () => fetchOpenInvite(supabase, c.id),
    enabled: !c.portalLinked && c.isActive,
    retry: false,
  });

  const create = useMutation({
    mutationFn: () => createInvite(supabase, c.id),
    onSuccess: async (invite) => {
      setCreated(invite);
      setShowQr(false);
      await queryClient.invalidateQueries({ queryKey: ['invite', c.id] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => cancelInvite(supabase, c.id),
    onSuccess: async () => {
      setCreated(null);
      await queryClient.invalidateQueries({ queryKey: ['invite', c.id] });
    },
  });

  const box = 'space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line';
  const title = (
    <h2 className="flex items-center gap-2 text-lg font-black text-brown">
      <Smartphone className="h-6 w-6 text-orange" aria-hidden="true" />
      Conta no celular do cliente
    </h2>
  );

  if (c.portalLinked) {
    return (
      <section aria-label="Conta no celular do cliente" className={box}>
        {title}
        <p className="text-brown">
          {firstName(c.fullName)} acompanha a conta pelo celular
          {c.linkedAt ? ` desde ${formatDate(new Date(c.linkedAt))}` : ''}: vê o saldo e as compras, confirma ou contesta, e avisa
          quando paga.
        </p>
        {isOwner &&
          (unlinking ? (
            <ReasonForm
              label="Por que tirar o acesso?"
              placeholder="Ex.: perdeu a senha, conta errada"
              hint="As compras e o saldo não mudam. Depois você pode mandar um convite novo."
              confirmLabel="Tirar acesso"
              onCancel={() => setUnlinking(false)}
              onConfirm={async (reason) => {
                try {
                  await unlinkAccount(supabase, c.id, reason);
                  setUnlinking(false);
                  await queryClient.invalidateQueries({ queryKey: queryKeys.customers });
                  toast.show(`${firstName(c.fullName)} não acessa mais a conta pelo celular.`);
                } catch (e) {
                  toast.show(errorMessage(e), 'error');
                }
              }}
            />
          ) : (
            <Button variant="ghost" block onClick={() => setUnlinking(true)}>
              <UserX className="h-5 w-5" aria-hidden="true" />
              Tirar acesso desta conta
            </Button>
          ))}
      </section>
    );
  }

  if (!c.isActive) return null;

  if (created) {
    const link = inviteLink(window.location.origin, created.token);
    return (
      <section aria-label="Conta no celular do cliente" className={box}>
        {title}
        <p className="font-bold text-success">Convite pronto!</p>
        <p className="text-sm text-brown-soft">
          Vale até {formatDateTime(new Date(created.expiresAt))} e só funciona uma vez. Mande só para {firstName(c.fullName)}:
          quem abrir o link primeiro fica com a conta.
        </p>
        {c.phoneE164 && (
          <a
            href={whatsappLink(c.phoneE164, inviteMessage(c.fullName, link))}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-success px-4 text-lg font-extrabold text-white shadow-soft active:brightness-95"
          >
            <MessageCircle className="h-6 w-6" aria-hidden="true" />
            Enviar pelo WhatsApp
          </a>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            onClick={async () => {
              toast.show((await copyText(link)) ? 'Link copiado.' : 'Não deu para copiar. Use o QR code.', 'info');
            }}
          >
            <Copy className="h-5 w-5" aria-hidden="true" />
            Copiar link
          </Button>
          <Button variant="secondary" onClick={() => setShowQr((v) => !v)}>
            <QrIcon className="h-5 w-5" aria-hidden="true" />
            {showQr ? 'Esconder QR' : 'Mostrar QR'}
          </Button>
        </div>
        {showQr && (
          <div className="space-y-2">
            <QrCode value={link} label={`QR code do convite de ${c.fullName}`} />
            <p className="text-center text-sm text-brown-soft">Peça para {firstName(c.fullName)} apontar a câmera do celular.</p>
          </div>
        )}
        <Button variant="ghost" block loading={cancel.isPending} onClick={() => cancel.mutate()}>
          Cancelar convite
        </Button>
      </section>
    );
  }

  const pending = openInvite.data;
  return (
    <section aria-label="Conta no celular do cliente" className={box}>
      {title}
      {pending ? (
        <p className="text-brown">
          Convite enviado em {formatDateTime(new Date(pending.createdAt))}, ainda não usado. Vale até{' '}
          {formatDateTime(new Date(pending.expiresAt))}.
        </p>
      ) : (
        <p className="text-brown">
          Convide {firstName(c.fullName)} para acompanhar as compras e o saldo pelo celular, e pagar com Pix.
        </p>
      )}
      {openInvite.isError && (
        <p className="text-sm text-brown-soft">Para convidar, o celular precisa estar com internet.</p>
      )}
      {create.isError && (
        <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
          {errorMessage(create.error)}
        </p>
      )}
      <Button block loading={create.isPending} onClick={() => create.mutate()}>
        <Link2 className="h-5 w-5" aria-hidden="true" />
        {pending ? 'Gerar link novo' : 'Convidar para o app'}
      </Button>
      {pending && (
        <>
          <p className="text-sm text-brown-soft">O link antigo para de funcionar quando você gera um novo.</p>
          <Button variant="ghost" block loading={cancel.isPending} onClick={() => cancel.mutate()}>
            Cancelar convite
          </Button>
        </>
      )}
    </section>
  );
}
