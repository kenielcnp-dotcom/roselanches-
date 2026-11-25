import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { Button } from '@/components/Button';
import { LoadingState } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { redeemInvite, type RedeemStatus } from '@/services/portal';
import { clearPendingInvite, inviteFromHash, pendingInvite, savePendingInvite } from './pendingInvite';

const FAILURE_MESSAGES: Partial<Record<RedeemStatus, string>> = {
  INVALID: 'Este link de convite não é válido. Confira se abriu o link inteiro, ou peça um novo para a Rose.',
  EXPIRED: 'Este convite venceu (ele vale 3 dias). Peça um novo para a Rose.',
  USED: 'Este convite já foi usado. Se não foi você, avise a Rose.',
  CANCELLED: 'Este convite foi trocado por outro. Use o link mais recente que a Rose mandou.',
  CUSTOMER_IN_USE: 'Este cadastro já está ligado a outra conta. Fale com a Rose.',
  ACCOUNT_IN_USE: 'Esta conta já está ligada a outro cadastro. Entre com outro e-mail ou fale com a Rose.',
  STAFF_ACCOUNT: 'Este link é para o cliente abrir no celular dele. Você entrou com a conta do negócio, então nada foi alterado.',
  TOO_MANY_ATTEMPTS: 'Muitas tentativas com links inválidos. Espere uma hora e tente de novo.',
};

type State = { kind: 'idle' } | { kind: 'working' } | { kind: 'failed'; message: string; retry: boolean };

/** Link do convite: guarda o token, pede para criar conta ou entrar e faz o vínculo. */
export function InvitePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { status, identity, refreshIdentity } = useAuth();
  const fromHash = inviteFromHash(location.hash);
  const stored = pendingInvite();
  const token = fromHash ?? (stored?.kind === 'customer' ? stored.token : null);
  const [state, setState] = useState<State>({ kind: 'idle' });
  const started = useRef(false);

  // Tira o token da barra de endereço (e do histórico) assim que a tela abre.
  useEffect(() => {
    if (!fromHash) return;
    savePendingInvite('customer', fromHash);
    void navigate('/convite', { replace: true });
  }, [fromHash, navigate]);

  const redeem = useCallback(
    async (t: string) => {
      setState({ kind: 'working' });
      try {
        const result = await redeemInvite(supabase, t);
        if (result.status === 'LINKED' || result.status === 'ALREADY_LINKED') {
          clearPendingInvite();
          await refreshIdentity();
          void navigate('/conta', { replace: true, state: { welcome: result.status === 'LINKED' } });
          return;
        }
        if (result.status !== 'TOO_MANY_ATTEMPTS') clearPendingInvite();
        setState({ kind: 'failed', message: FAILURE_MESSAGES[result.status] ?? 'Não foi possível usar o convite.', retry: false });
      } catch (e) {
        setState({ kind: 'failed', message: errorMessage(e), retry: true });
      }
    },
    [navigate, refreshIdentity],
  );

  const signedIn = status === 'ready' || status === 'error';
  useEffect(() => {
    if (!token || fromHash || !signedIn || started.current) return;
    started.current = true;
    void redeem(token);
  }, [token, fromHash, signedIn, redeem]);

  if (status === 'loading' || fromHash) {
    return (
      <AuthLayout title="Convite">
        <LoadingState />
      </AuthLayout>
    );
  }

  if (state.kind === 'failed') {
    return (
      <AuthLayout title="Não deu certo">
        <p role="alert" className="text-brown">
          {state.message}
        </p>
        <div className="mt-6 space-y-2">
          {state.retry && token && (
            <Button block onClick={() => void redeem(token)}>
              Tentar de novo
            </Button>
          )}
          <Link to="/" className="block py-2 text-center font-extrabold text-orange-deep">
            {identity?.staff ? 'Voltar para o início' : 'Ir para o app'}
          </Link>
        </div>
      </AuthLayout>
    );
  }

  if (!token) {
    return (
      <AuthLayout title="Convite incompleto">
        <p className="text-brown">Este link de convite está incompleto. Abra o link inteiro que a Rose mandou, ou peça um novo.</p>
        <Link to="/" className="mt-5 block text-center font-extrabold text-orange-deep">
          Ir para o app
        </Link>
      </AuthLayout>
    );
  }

  if (signedIn) {
    return (
      <AuthLayout title="Convite">
        <LoadingState label="Ligando a sua conta…" />
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Você foi convidado!">
      <div className="space-y-3 text-brown">
        <p className="text-lg">
          A Rose convidou você para acompanhar a sua conta no <strong>Lanches da Rose</strong>.
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>ver o seu saldo e as suas compras;</li>
          <li>confirmar ou contestar cada compra;</li>
          <li>pagar com Pix e avisar a Rose.</li>
        </ul>
        <p className="text-sm text-brown-soft">Crie uma conta com seu e-mail e uma senha. Se já tem conta, é só entrar.</p>
      </div>
      <div className="mt-6 space-y-3">
        <Link
          to="/criar-conta"
          className="flex min-h-14 items-center justify-center rounded-2xl bg-orange-deep px-5 text-lg font-extrabold text-white shadow-warm active:bg-orange-darker"
        >
          Criar minha conta
        </Link>
        <Link
          to="/entrar"
          className="flex min-h-12 items-center justify-center rounded-2xl bg-white font-extrabold text-brown ring-1 ring-line active:bg-cream-deep"
        >
          Já tenho conta: entrar
        </Link>
      </div>
    </AuthLayout>
  );
}
