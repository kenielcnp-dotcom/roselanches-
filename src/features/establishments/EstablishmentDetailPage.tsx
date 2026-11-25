import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { CheckCircle2, MapPin, Pencil, Plus, Store, UserMinus, UserPlus, Users } from 'lucide-react';
import { Button } from '@/components/Button';
import { CachedNotice } from '@/components/CachedNotice';
import { SearchField } from '@/components/Controls';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { formatBRL } from '@/domain/money';
import { formatPhone } from '@/domain/phone';
import { matchesPerson, rankByName } from '@/domain/search';
import { errorMessage } from '@/lib/supabase/errors';
import type { Customer } from '@/services/customers';
import { useCustomers, useEstablishments, useLinkCustomer } from '@/features/registry/queries';
import { useCurrentEstablishmentId } from './useCurrentEstablishment';

export function EstablishmentDetailPage() {
  const { id } = useParams();
  const establishments = useEstablishments();
  const customers = useCustomers();
  const [currentId, setCurrentId] = useCurrentEstablishmentId();
  const [adding, setAdding] = useState(false);
  const toast = useToast();

  const establishment = establishments.data?.find((e) => e.id === id);
  const linked = useMemo(
    () => (customers.data ?? []).filter((c) => id && c.establishmentIds.includes(id)),
    [customers.data, id],
  );

  if (establishments.isPending || customers.isPending) return <LoadingState />;
  if (establishments.isError || customers.isError) {
    return (
      <ErrorState
        message={errorMessage(establishments.error ?? customers.error)}
        onRetry={() => void Promise.all([establishments.refetch(), customers.refetch()])}
      />
    );
  }
  if (!establishment || !id) return <ErrorState message="Estabelecimento não encontrado." />;

  const active = linked.filter((c) => c.isActive);
  // Saldo TOTAL dos clientes vinculados (inclui compras feitas em outros locais).
  const linkedOwedCents = active.reduce((sum, c) => sum + Math.max(0, c.balanceCents), 0);
  const isCurrent = currentId === establishment.id;

  return (
    <>
      <PageHeader title={establishment.name} back="/estabelecimentos" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <CachedNotice data={customers.data} />
        <section className="rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-peach text-orange-deep">
              <Store className="h-7 w-7" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              {establishment.nickname && <p className="text-brown-soft">Apelido: {establishment.nickname}</p>}
              {establishment.address && (
                <p className="flex items-start gap-1 text-brown">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brown-soft" aria-hidden="true" />
                  {establishment.address}
                </p>
              )}
              {establishment.notes && <p className="mt-1 text-brown-soft">{establishment.notes}</p>}
              {!establishment.isActive && <p className="mt-1 font-bold text-danger">Desativado</p>}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {establishment.isActive &&
              (isCurrent ? (
                <p className="flex min-h-12 items-center justify-center gap-1.5 rounded-2xl bg-success/10 font-extrabold text-success">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  Vendendo aqui
                </p>
              ) : (
                <Button
                  onClick={() => {
                    setCurrentId(establishment.id);
                    toast.show(`Vendendo em ${establishment.name}.`);
                  }}
                >
                  Vender aqui
                </Button>
              ))}
            <Link
              to={`/estabelecimentos/${establishment.id}/editar`}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white font-extrabold text-brown shadow-soft ring-1 ring-line active:bg-cream-deep"
            >
              <Pencil className="h-5 w-5" aria-hidden="true" />
              Editar
            </Link>
          </div>
        </section>

        <section className="rounded-card bg-peach/70 p-4 ring-1 ring-line">
          <p className="text-sm font-bold text-brown-soft">Quanto os clientes deste lugar devem, no total</p>
          <p className="tabular text-3xl font-black text-brown">{formatBRL(linkedOwedCents)}</p>
          <p className="text-sm text-brown-soft">Inclui compras feitas em outros lugares.</p>
        </section>

        <section aria-labelledby="clientes-local">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2 id="clientes-local" className="flex items-center gap-2 text-xl font-black text-brown">
              <Users className="h-6 w-6 text-orange" aria-hidden="true" />
              Clientes ({active.length})
            </h2>
            {!adding && (
              <Button variant="secondary" onClick={() => setAdding(true)}>
                <UserPlus className="h-5 w-5" aria-hidden="true" />
                Adicionar
              </Button>
            )}
          </div>

          {adding && (
            <AddCustomers
              establishmentId={establishment.id}
              establishmentName={establishment.name}
              candidates={(customers.data ?? []).filter((c) => c.isActive && !c.establishmentIds.includes(establishment.id))}
              onClose={() => setAdding(false)}
            />
          )}

          {linked.length === 0 ? (
            <EmptyState title="Nenhum cliente neste lugar">
              Adicione clientes que já existem ou{' '}
              <Link to="/clientes/novo" className="font-extrabold text-orange-deep underline">
                cadastre um novo
              </Link>
              .
            </EmptyState>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card bg-white ring-1 ring-line">
              {linked.map((c) => (
                <LinkedCustomerRow key={c.id} customer={c} establishmentId={establishment.id} establishmentName={establishment.name} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function LinkedCustomerRow({
  customer: c,
  establishmentId,
  establishmentName,
}: {
  customer: Customer;
  establishmentId: string;
  establishmentName: string;
}) {
  const link = useLinkCustomer();
  const toast = useToast();
  const remove = () =>
    link.mutate(
      { establishmentId, customerId: c.id, linked: false },
      {
        onSuccess: () => toast.show(`${c.fullName} saiu de ${establishmentName}. As vendas antigas continuam lá.`),
        onError: (e) => toast.show(errorMessage(e), 'error'),
      },
    );
  return (
    <li className="flex items-center gap-2 pr-2">
      <Link to={`/clientes/${c.id}`} className="flex min-h-16 min-w-0 flex-1 flex-col justify-center px-4 py-2 active:bg-cream-deep">
        <span className={`truncate font-extrabold ${c.isActive ? 'text-brown' : 'text-brown-soft line-through'}`}>{c.fullName}</span>
        <span className="text-sm text-brown-soft">
          {c.phoneE164 ? formatPhone(c.phoneE164) : 'Sem telefone'}
          {c.balanceCents > 0 ? ` · deve ${formatBRL(c.balanceCents)}` : ''}
        </span>
      </Link>
      <button
        type="button"
        onClick={remove}
        disabled={link.isPending}
        aria-label={`Remover ${c.fullName} deste lugar`}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-brown-soft active:bg-peach disabled:opacity-50"
      >
        <UserMinus className="h-5 w-5" aria-hidden="true" />
      </button>
    </li>
  );
}

function AddCustomers({
  establishmentId,
  establishmentName,
  candidates,
  onClose,
}: {
  establishmentId: string;
  establishmentName: string;
  candidates: Customer[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const link = useLinkCustomer();
  const toast = useToast();
  const shown = rankByName(
    candidates.filter((c) => matchesPerson({ name: c.fullName, phoneE164: c.phoneE164 }, search)),
    search,
    (c) => c.fullName,
  ).slice(0, 30);

  return (
    <div className="mb-3 space-y-3 rounded-card bg-white p-4 shadow-soft ring-1 ring-line">
      <SearchField label="Buscar cliente para adicionar" value={search} onChange={setSearch} autoFocus />
      {candidates.length === 0 ? (
        <p className="text-brown-soft">Todos os clientes ativos já estão neste lugar.</p>
      ) : shown.length === 0 ? (
        <p className="text-brown-soft">Nenhum cliente encontrado.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-line overflow-y-auto">
          {shown.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={link.isPending}
                onClick={() =>
                  link.mutate(
                    { establishmentId, customerId: c.id, linked: true },
                    {
                      onSuccess: () => toast.show(`${c.fullName} agora é cliente de ${establishmentName}.`),
                      onError: (e) => toast.show(errorMessage(e), 'error'),
                    },
                  )
                }
                className="flex min-h-14 w-full items-center justify-between gap-3 py-2 text-left active:bg-cream-deep disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block truncate font-bold text-brown">{c.fullName}</span>
                  <span className="block text-sm text-brown-soft">{c.phoneE164 ? formatPhone(c.phoneE164) : 'Sem telefone'}</span>
                </span>
                <Plus className="h-6 w-6 shrink-0 text-orange-deep" strokeWidth={3} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button variant="ghost" block onClick={onClose}>
        Concluir
      </Button>
    </div>
  );
}
