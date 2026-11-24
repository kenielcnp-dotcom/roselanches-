import { Hammer } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState } from '@/components/States';

/** Tela ainda em construção. Nunca mostra números de exemplo. */
export function ComingSoonPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <main className="mx-auto max-w-lg px-4 pt-4">
        <EmptyState icon={<Hammer className="h-10 w-10" />} title="Em breve">
          Esta parte do aplicativo ainda está sendo preparada.
        </EmptyState>
      </main>
    </>
  );
}
