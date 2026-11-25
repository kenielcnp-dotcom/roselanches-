import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2, MessageCircle, QrCode as QrIcon, UserCheck, UserCog, UserX } from 'lucide-react';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { QrCode } from '@/components/QrCode';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { firstName, formatDate, formatDateTime } from '@/domain/period';
import { whatsappShareLink } from '@/domain/phone';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { copyText } from '@/lib/ui/clipboard';
import type { CreatedInvite } from '@/services/invites';
import {
  cancelStaffInvite,
  createStaffInvite,
  fetchTeam,
  setMemberActive,
  teamInviteLink,
  type TeamMember,
} from '@/services/team';

const TEAM_KEY = ['team'];

export function teamInviteMessage(name: string, link: string): string {
  return (
    `Olá, ${firstName(name)}! Este é o convite para você vender pelo app do Lanches da Rose. ` +
    'Abra o link no SEU celular e crie sua conta com e-mail e senha. O link vale por 3 dias e só funciona uma vez:\n' +
    link
  );
}

/** Equipe: vendedores com conta própria, convites e quem está ativo. Só a dona. */
export function TeamPage() {
  const team = useQuery({ queryKey: TEAM_KEY, queryFn: () => fetchTeam(supabase), retry: false });

  return (
    <>
      <PageHeader title="Equipe" back="/" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <section className="rounded-card bg-peach px-4 py-3 text-brown">
          <p>
            Cada vendedor usa o <strong>próprio celular</strong> e a <strong>própria conta</strong>. Ele vende, recebe pagamentos,
            cadastra clientes e vê o saldo deles.
          </p>
          <p className="mt-1 text-sm">
            Cancelar venda, estornar, conferir aviso de Pix, produtos, locais, relatórios e configurações ficam só com você.
          </p>
        </section>

        <InviteSection />

        {team.isPending ? (
          <LoadingState />
        ) : team.isError ? (
          <ErrorState message={errorMessage(team.error)} onRetry={() => void team.refetch()} />
        ) : (
          <>
            {team.data.invites.length > 0 && <OpenInvites invites={team.data.invites} />}
            <section aria-labelledby="pessoas" className="space-y-2">
              <h2 id="pessoas" className="flex items-center gap-2 text-xl font-black text-brown">
                <UserCog className="h-6 w-6 text-orange" aria-hidden="true" />
                Quem usa o app
              </h2>
              <ul className="space-y-3">
                {team.data.members.map((m) => (
                  <li key={m.memberId}>
                    <MemberCard member={m} />
                  </li>
                ))}
              </ul>
            </section>
          </>
        )}
      </main>
    </>
  );
}

function InviteSection() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [created, setCreated] = useState<(CreatedInvite & { name: string }) | null>(null);
  const [showQr, setShowQr] = useState(false);
  const tooShort = name.trim().length < 2;

  const create = useMutation({
    mutationFn: (invitee: string) => createStaffInvite(supabase, invitee),
  });

  const box = 'space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line';

  if (created) {
    const link = teamInviteLink(window.location.origin, created.token);
    return (
      <section aria-label="Convite de vendedor" className={box}>
        <h2 className="text-lg font-black text-brown">Convite de {created.name} pronto!</h2>
        <p className="text-sm text-brown-soft">
          Vale até {formatDateTime(new Date(created.expiresAt))} e só funciona uma vez. Mande só para {firstName(created.name)}: quem
          abrir o link primeiro entra na equipe.
        </p>
        <a
          href={whatsappShareLink(teamInviteMessage(created.name, link))}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-success px-4 text-lg font-extrabold text-white shadow-soft active:brightness-95"
        >
          <MessageCircle className="h-6 w-6" aria-hidden="true" />
          Enviar pelo WhatsApp
        </a>
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
            <QrCode value={link} label={`QR code do convite de ${created.name}`} />
            <p className="text-center text-sm text-brown-soft">Peça para {firstName(created.name)} apontar a câmera do celular dele.</p>
          </div>
        )}
        <Button
          variant="ghost"
          block
          onClick={() => {
            setCreated(null);
            setShowQr(false);
          }}
        >
          Pronto
        </Button>
      </section>
    );
  }

  return (
    <section aria-label="Convidar vendedor" className={box}>
      <h2 className="text-lg font-black text-brown">Convidar vendedor</h2>
      <form
        noValidate
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (tooShort) return;
          const invitee = name.trim();
          try {
            const invite = await create.mutateAsync(invitee);
            setCreated({ ...invite, name: invitee });
            setName('');
            await queryClient.invalidateQueries({ queryKey: TEAM_KEY });
          } catch {
            /* a mensagem aparece abaixo */
          }
        }}
      >
        <TextField
          label="Nome do vendedor"
          placeholder="Ex.: João"
          value={name}
          maxLength={60}
          autoComplete="off"
          onChange={(e) => setName(e.target.value)}
          hint="Aparece nas vendas que ele fizer."
        />
        {create.isError && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
            {errorMessage(create.error)}
          </p>
        )}
        <Button type="submit" block loading={create.isPending} disabled={tooShort}>
          <Link2 className="h-5 w-5" aria-hidden="true" />
          Gerar convite
        </Button>
      </form>
    </section>
  );
}

function OpenInvites({ invites }: { invites: { inviteId: string; name: string; expiresAt: string }[] }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const cancel = useMutation({ mutationFn: (id: string) => cancelStaffInvite(supabase, id) });
  return (
    <section aria-labelledby="convites" className="space-y-2">
      <h2 id="convites" className="text-xl font-black text-brown">
        Convites ainda não usados
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
        {invites.map((i) => (
          <li key={i.inviteId} className="flex items-center gap-3 px-4 py-3">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-extrabold text-brown">{i.name}</span>
              <span className="block text-sm text-brown-soft">Vale até {formatDateTime(new Date(i.expiresAt))}</span>
            </span>
            <Button
              variant="ghost"
              loading={cancel.isPending && cancel.variables === i.inviteId}
              onClick={async () => {
                try {
                  await cancel.mutateAsync(i.inviteId);
                  await queryClient.invalidateQueries({ queryKey: TEAM_KEY });
                  toast.show(`Convite de ${firstName(i.name)} cancelado.`);
                } catch (e) {
                  toast.show(errorMessage(e), 'error');
                }
              }}
            >
              Cancelar
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-brown-soft">O link de um convite não aparece de novo. Perdeu? Cancele e gere outro.</p>
    </section>
  );
}

function MemberCard({ member: m }: { member: TeamMember }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const toggle = useMutation({ mutationFn: (active: boolean) => setMemberActive(supabase, m.memberId, active) });
  const owner = m.role === 'OWNER';

  const apply = async (active: boolean) => {
    try {
      await toggle.mutateAsync(active);
      setConfirming(false);
      await queryClient.invalidateQueries({ queryKey: TEAM_KEY });
      toast.show(active ? `${firstName(m.name)} voltou a usar o app.` : `${firstName(m.name)} não acessa mais o app.`);
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    }
  };

  return (
    <article aria-label={m.name} className={`rounded-card p-4 shadow-soft ring-1 ring-line ${m.isActive ? 'bg-white' : 'bg-white/60'}`}>
      <div className="flex items-start gap-3">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-black text-brown">{m.name}</span>
          <span className="block truncate text-sm text-brown-soft">{m.email}</span>
        </span>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-sm font-extrabold ${
            owner ? 'bg-orange-deep text-white' : m.isActive ? 'bg-success/15 text-success' : 'bg-cream-deep text-brown-soft'
          }`}
        >
          {owner ? 'Dona' : m.isActive ? 'Vendedor' : 'Desativado'}
        </span>
      </div>
      <p className="mt-2 text-sm text-brown-soft">
        Desde {formatDate(new Date(m.joinedAt))}
        {m.lastSaleAt ? ` · última venda em ${formatDateTime(new Date(m.lastSaleAt))}` : ' · nenhuma venda ainda'}
      </p>

      {!owner &&
        (m.isActive ? (
          confirming ? (
            <div className="mt-3 space-y-2 rounded-2xl bg-danger/10 p-3">
              <p className="font-bold text-brown">Desativar {firstName(m.name)}?</p>
              <p className="text-sm text-brown">
                O acesso acaba na hora. As vendas dele continuam no app, com o nome dele. Se ainda houver vendas no celular dele
                sem enviar, peça para ele conectar à internet antes: depois de desativado, o servidor não aceita mais nada dele.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="ghost" onClick={() => setConfirming(false)}>
                  Voltar
                </Button>
                <Button variant="danger" loading={toggle.isPending} onClick={() => void apply(false)}>
                  Desativar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="ghost" block className="mt-2" onClick={() => setConfirming(true)}>
              <UserX className="h-5 w-5" aria-hidden="true" />
              Desativar acesso
            </Button>
          )
        ) : (
          <Button variant="secondary" block className="mt-3" loading={toggle.isPending} onClick={() => void apply(true)}>
            <UserCheck className="h-5 w-5" aria-hidden="true" />
            Reativar acesso
          </Button>
        ))}
    </article>
  );
}
