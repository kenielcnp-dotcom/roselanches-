import { Awning } from '@/components/Awning';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { EmptyState } from '@/components/States';
import { useAuth } from '@/features/auth/AuthProvider';
import { firstName } from '@/domain/period';

/** Portal do cliente. Saldo, extrato e Pix entram na etapa do portal. */
export function PortalHomePage() {
  const { identity, signOut } = useAuth();
  const name = firstName(identity?.customer?.fullName ?? '');
  return (
    <div className="min-h-dvh">
      <Awning />
      <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-10">
        <Logo />
        <h1 className="text-2xl font-black text-brown">Olá{name ? `, ${name}` : ''}!</h1>
        <EmptyState title="Sua conta">Em breve você vai ver aqui seu saldo, suas compras e como pagar com Pix.</EmptyState>
        <Button variant="ghost" block onClick={() => void signOut()}>
          Sair da conta
        </Button>
      </main>
    </div>
  );
}
