import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { Button } from '@/components/Button';
import { ErrorState, LoadingState } from '@/components/States';
import { useAuth } from './AuthProvider';

function FullScreen({ children }: { children: ReactNode }) {
  return <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-4">{children}</main>;
}

/** Exige sessão. A interface só escolhe a tela: quem autoriza é o servidor. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, error, refreshIdentity, signOut } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <FullScreen>
        <LoadingState />
      </FullScreen>
    );
  }
  if (status === 'signed-out') return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  if (status === 'error') {
    return (
      <FullScreen>
        <ErrorState message={error ?? 'Não foi possível carregar sua conta.'} onRetry={() => void refreshIdentity()} />
        <Button variant="ghost" className="mt-4" onClick={async () => {
            if ((await signOut()) === 'pending') {
              window.alert('Há vendas neste celular que ainda não chegaram ao servidor. Conecte à internet e envie antes de sair.');
            }
          }}>
          Sair da conta
        </Button>
      </FullScreen>
    );
  }
  return <>{children}</>;
}

/** Área da Rose (equipe do negócio). */
export function RequireStaff({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <StaffOnly>{children}</StaffOnly>
    </RequireAuth>
  );
}

function StaffOnly({ children }: { children: ReactNode }) {
  const { identity } = useAuth();
  if (identity?.staff) return <>{children}</>;
  return <Navigate to={identity?.customer ? '/conta' : '/sem-acesso'} replace />;
}

/** Portal do cliente. */
export function RequireCustomer({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <CustomerOnly>{children}</CustomerOnly>
    </RequireAuth>
  );
}

function CustomerOnly({ children }: { children: ReactNode }) {
  const { identity } = useAuth();
  if (identity?.customer) return <>{children}</>;
  return <Navigate to={identity?.staff ? '/' : '/sem-acesso'} replace />;
}

/** Telas de login/cadastro: quem já entrou vai direto para a sua área. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'ready') return <Navigate to="/" replace />;
  return <>{children}</>;
}
