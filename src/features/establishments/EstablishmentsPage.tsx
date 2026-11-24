import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CheckCircle2, ChevronRight, Plus, Store } from 'lucide-react';
import { SearchField } from '@/components/Controls';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { matchesWords } from '@/domain/search';
import { errorMessage } from '@/lib/supabase/errors';
import type { Establishment } from '@/services/establishments';
import { useEstablishments } from '@/features/registry/queries';
import { useCurrentEstablishmentId } from './useCurrentEstablishment';

export function EstablishmentsPage() {
  const query = useEstablishments();
  const [currentId, setCurrentId] = useCurrentEstablishmentId();
  const [search, setSearch] = useState('');
  const toast = useToast();

  const { active, inactive } = useMemo(() => {
    const all = (query.data ?? []).filter((e) => matchesWords(`${e.name} ${e.nickname ?? ''}`, search));
    return { active: all.filter((e) => e.isActive), inactive: all.filter((e) => !e.isActive) };
  }, [query.data, search]);

  const select = (e: Establishment) => {
    setCurrentId(e.id);
    toast.show(`Vendendo em ${e.name}.`);
  };

  return (
    <>
      <PageHeader title="Estabelecimentos" back="/" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <p className="text-brown-soft">Toque no lugar onde você está vendendo agora.</p>
        <Link
          to="/estabelecimentos/novo"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange-deep px-5 text-lg font-extrabold text-white shadow-warm active:bg-orange-darker"
        >
          <Plus className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
          Novo estabelecimento
        </Link>
        {(query.data?.length ?? 0) > 4 && (
          <SearchField label="Buscar estabelecimento" value={search} onChange={setSearch} />
        )}

        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState icon={<Store className="h-10 w-10" />} title="Nenhum estabelecimento ainda">
            Cadastre os lugares onde você vende, como o mercado ou a oficina. Depois, agrupe os clientes de cada um.
          </EmptyState>
        ) : (
          <>
            {active.length === 0 && search !== '' && <p className="py-6 text-center text-brown-soft">Nenhum estabelecimento encontrado.</p>}
            <ul className="space-y-3">
              {active.map((e) => (
                <li key={e.id}>
                  <EstablishmentCard establishment={e} selected={e.id === currentId} onSelect={() => select(e)} />
                </li>
              ))}
            </ul>
            {inactive.length > 0 && (
              <section aria-label="Desativados" className="pt-2">
                <h2 className="mb-2 text-sm font-extrabold tracking-wide text-brown-soft uppercase">Desativados</h2>
                <ul className="space-y-2">
                  {inactive.map((e) => (
                    <li key={e.id}>
                      <Link
                        to={`/estabelecimentos/${e.id}`}
                        className="flex min-h-14 items-center justify-between rounded-card bg-white/60 px-4 text-brown-soft ring-1 ring-line"
                      >
                        <span className="font-bold">{e.name}</span>
                        <ChevronRight className="h-5 w-5" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function EstablishmentCard({
  establishment: e,
  selected,
  onSelect,
}: {
  establishment: Establishment;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`flex items-stretch overflow-hidden rounded-card bg-white shadow-soft ${
        selected ? 'ring-3 ring-orange-deep' : 'ring-1 ring-line'
      }`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="flex min-h-22 min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left active:bg-cream-deep"
      >
        <span
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${selected ? 'bg-orange-deep text-white' : 'bg-peach text-orange-deep'}`}
        >
          <Store className="h-8 w-8" strokeWidth={2.2} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xl font-black text-brown">{e.name}</span>
          <span className="block text-brown-soft">
            {e.customerCount === 0 ? 'Nenhum cliente' : e.customerCount === 1 ? '1 cliente' : `${e.customerCount} clientes`}
            {e.nickname ? ` · ${e.nickname}` : ''}
          </span>
          {selected && (
            <span className="mt-1 inline-flex items-center gap-1 text-sm font-extrabold text-success">
              <CheckCircle2 className="h-4 w-4" strokeWidth={3} aria-hidden="true" />
              Vendendo aqui
            </span>
          )}
        </span>
      </button>
      <Link
        to={`/estabelecimentos/${e.id}`}
        aria-label={`Clientes e dados de ${e.name}`}
        className="flex w-16 shrink-0 flex-col items-center justify-center gap-0.5 border-l border-line text-xs font-bold text-brown-soft active:bg-cream-deep"
      >
        <ChevronRight className="h-6 w-6" aria-hidden="true" />
        Ver
      </Link>
    </div>
  );
}
