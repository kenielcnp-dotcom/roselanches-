import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Plus, Users } from 'lucide-react';
import { CachedNotice } from '@/components/CachedNotice';
import { Chip, SearchField } from '@/components/Controls';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { formatPhone } from '@/domain/phone';
import { matchesPerson, rankByName } from '@/domain/search';
import { errorMessage } from '@/lib/supabase/errors';
import type { Customer } from '@/services/customers';
import { useCurrentEstablishmentId } from '@/features/establishments/useCurrentEstablishment';
import { useCustomers, useEstablishments } from '@/features/registry/queries';
import { BalanceTag } from './BalanceTag';

type Sort = 'name' | 'balance';
const ALL = 'all';
const INACTIVE = 'inactive';

export function CustomersPage() {
  const customers = useCustomers();
  const establishments = useEstablishments();
  const [currentId] = useCurrentEstablishmentId();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<string>(ALL);
  const [sort, setSort] = useState<Sort>('name');

  const places = useMemo(() => {
    const list = (establishments.data ?? []).filter((e) => e.isActive);
    // O lugar onde ela está vendendo vem primeiro.
    return [...list].sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId));
  }, [establishments.data, currentId]);
  const placeName = useMemo(
    () => new Map((establishments.data ?? []).map((e) => [e.id, e.nickname ?? e.name])),
    [establishments.data],
  );

  const shown = useMemo(() => {
    const list = (customers.data ?? []).filter((c) => {
      if (filter === INACTIVE) return !c.isActive;
      if (!c.isActive) return false;
      if (filter !== ALL && !c.establishmentIds.includes(filter)) return false;
      return matchesPerson({ name: c.fullName, phoneE164: c.phoneE164 }, search);
    });
    if (filter === INACTIVE) return list.filter((c) => matchesPerson({ name: c.fullName, phoneE164: c.phoneE164 }, search));
    return sort === 'balance'
      ? [...list].sort((a, b) => b.balanceCents - a.balanceCents || a.fullName.localeCompare(b.fullName, 'pt-BR'))
      : rankByName(list, search, (c) => c.fullName);
  }, [customers.data, filter, search, sort]);

  const hasInactive = (customers.data ?? []).some((c) => !c.isActive);

  return (
    <>
      <PageHeader title="Clientes" />
      <main className="mx-auto max-w-lg space-y-3 px-4 pt-2 pb-6">
        <Link
          to="/clientes/novo"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange-deep px-5 text-lg font-extrabold text-white shadow-warm active:bg-orange-darker"
        >
          <Plus className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
          Novo cliente
        </Link>
        <CachedNotice data={customers.data} />
        <SearchField label="Buscar por nome ou telefone" value={search} onChange={setSearch} />

        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrar por estabelecimento">
          <Chip selected={filter === ALL} onClick={() => setFilter(ALL)}>
            Todos
          </Chip>
          {places.map((e) => (
            <Chip key={e.id} selected={filter === e.id} onClick={() => setFilter(e.id)}>
              {e.nickname ?? e.name}
            </Chip>
          ))}
          {hasInactive && (
            <Chip selected={filter === INACTIVE} onClick={() => setFilter(INACTIVE)}>
              Desativados
            </Chip>
          )}
        </div>

        <div className="flex items-center justify-between text-sm text-brown-soft">
          <span>{customers.data ? `${shown.length} ${shown.length === 1 ? 'cliente' : 'clientes'}` : ''}</span>
          <label className="flex items-center gap-2">
            Ordenar
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as Sort)}
              className="min-h-10 rounded-xl border-2 border-line bg-white px-2 font-bold text-brown"
            >
              <option value="name">Nome</option>
              <option value="balance">Maior saldo</option>
            </select>
          </label>
        </div>

        {customers.isPending ? (
          <LoadingState />
        ) : customers.isError ? (
          <ErrorState message={errorMessage(customers.error)} onRetry={() => void customers.refetch()} />
        ) : customers.data.length === 0 ? (
          <EmptyState icon={<Users className="h-10 w-10" />} title="Nenhum cliente ainda">
            Cadastre seus clientes e escolha em quais lugares cada um compra.
          </EmptyState>
        ) : shown.length === 0 ? (
          <p className="py-8 text-center text-brown-soft">Nenhum cliente encontrado.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
            {shown.map((c) => (
              <CustomerRow key={c.id} customer={c} places={c.establishmentIds.map((id) => placeName.get(id) ?? '').filter(Boolean)} />
            ))}
          </ul>
        )}
      </main>
    </>
  );
}

function CustomerRow({ customer: c, places }: { customer: Customer; places: string[] }) {
  return (
    <li>
      <Link to={`/clientes/${c.id}`} className="flex min-h-18 items-center gap-3 px-4 py-2.5 active:bg-cream-deep">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-extrabold text-brown">{c.fullName}</span>
          <span className="block truncate text-sm text-brown-soft">
            {c.phoneE164 ? formatPhone(c.phoneE164) : 'Sem telefone'}
            {places.length > 0 ? ` · ${places.join(', ')}` : ''}
          </span>
        </span>
        <BalanceTag cents={c.balanceCents} />
        <ChevronRight className="h-5 w-5 shrink-0 text-brown-soft" aria-hidden="true" />
      </Link>
    </li>
  );
}
