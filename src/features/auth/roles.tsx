// Papel de quem está usando a área do negócio. A interface só esconde o que a
// pessoa não pode fazer; quem autoriza de verdade é o servidor.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Lock } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { useAuth } from './AuthProvider';

export function useIsOwner(): boolean {
  const { identity } = useAuth();
  return identity?.staff?.role === 'OWNER';
}

/** Telas só da dona: o vendedor vê um aviso em vez da tela. */
export function OwnerOnly({ children }: { children: ReactNode }) {
  const isOwner = useIsOwner();
  if (isOwner) return <>{children}</>;
  return (
    <>
      <PageHeader title="Só para a Rose" />
      <main className="mx-auto max-w-lg px-4 pt-2 pb-6">
        <section role="status" className="space-y-3 rounded-card bg-white p-6 text-center shadow-soft ring-1 ring-line">
          <Lock className="mx-auto h-10 w-10 text-orange" aria-hidden="true" />
          <p className="text-lg font-bold text-brown">Esta parte do app é só da dona do negócio.</p>
          <p className="text-brown-soft">Se precisar de algo daqui, fale com a Rose.</p>
          <Link to="/" className="inline-block py-2 font-extrabold text-orange-darker">
            Voltar para o início
          </Link>
        </section>
      </main>
    </>
  );
}
