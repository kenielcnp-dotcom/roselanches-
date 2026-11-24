import { Button } from '@/components/Button';
import { useAuth } from './AuthProvider';
import { AuthLayout } from './AuthLayout';

/** Conta criada, mas ainda não ligada a um negócio nem a um cadastro de cliente. */
export function NoAccessPage() {
  const { identity, refreshIdentity, signOut } = useAuth();
  return (
    <AuthLayout title="Conta criada">
      <div className="space-y-3 text-brown">
        <p>
          {identity?.displayName ? `${identity.displayName}, sua` : 'Sua'} conta existe, mas ainda não está ligada a
          nenhum cadastro.
        </p>
        <p>
          <strong>Cliente:</strong> abra o link de convite que a Rose mandou para você.
        </p>
        <p className="text-sm text-brown-soft">
          Dona do negócio: a liberação é feita uma única vez por quem instalou o aplicativo.
        </p>
      </div>
      <div className="mt-6 space-y-2">
        <Button block variant="secondary" onClick={() => void refreshIdentity()}>
          Verificar de novo
        </Button>
        <Button block variant="ghost" onClick={() => void signOut()}>
          Sair da conta
        </Button>
      </div>
    </AuthLayout>
  );
}
