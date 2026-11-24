import { LogOut } from 'lucide-react';
import { Button } from '@/components/Button';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from '@/features/auth/AuthProvider';

export function SettingsPage() {
  const { identity, signOut } = useAuth();
  return (
    <>
      <PageHeader title="Configurações" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-4">
        <section className="rounded-card bg-white/90 p-5 shadow-soft ring-1 ring-line">
          <h2 className="text-lg font-extrabold text-brown">Sua conta</h2>
          <dl className="mt-3 space-y-2 text-brown">
            <div>
              <dt className="text-sm text-brown-soft">Nome</dt>
              <dd className="font-bold">{identity?.displayName || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-brown-soft">Negócio</dt>
              <dd className="font-bold">{identity?.staff?.businessName ?? '—'}</dd>
            </div>
          </dl>
        </section>
        <p className="px-1 text-brown-soft">Pix, assinatura obrigatória e limites de venda ficam aqui em breve.</p>
        <Button variant="secondary" block onClick={() => void signOut()}>
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Sair da conta
        </Button>
      </main>
    </>
  );
}
