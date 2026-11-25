import { Link, useParams } from 'react-router';
import { HandCoins, MessageCircle, NotebookPen, Pencil, Plus, SlidersHorizontal, Store, UserRound } from 'lucide-react';
import { CachedNotice } from '@/components/CachedNotice';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import { formatDate } from '@/domain/period';
import { formatPhone, whatsappLink } from '@/domain/phone';
import { errorMessage } from '@/lib/supabase/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { useCustomers, useEstablishments } from '@/features/registry/queries';
import { useSync } from '@/features/sync/SyncProvider';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { PortalAccessSection } from '@/features/client-portal/PortalAccessSection';
import { CustomerStatement } from './CustomerStatement';

export function CustomerDetailPage() {
  const { id } = useParams();
  const customers = useCustomers();
  const establishments = useEstablishments();
  const { identity } = useAuth();

  if (customers.isPending || establishments.isPending) return <LoadingState />;
  if (customers.isError || establishments.isError) {
    return (
      <ErrorState
        message={errorMessage(customers.error ?? establishments.error)}
        onRetry={() => void Promise.all([customers.refetch(), establishments.refetch()])}
      />
    );
  }
  const c = customers.data.find((x) => x.id === id);
  if (!c) return <ErrorState message="Cliente não encontrado." />;
  const places = establishments.data.filter((e) => c.establishmentIds.includes(e.id));
  const firstName = c.fullName.split(' ')[0] ?? c.fullName;
  const isOwner = identity?.staff?.role === 'OWNER';

  return (
    <>
      <PageHeader title={c.fullName} back="/clientes" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <CachedNotice data={customers.data} />
        <section
          className={`rounded-card p-5 text-white shadow-warm ${
            c.balanceCents > 0 ? 'bg-linear-to-br from-orange-deep to-brown' : 'bg-linear-to-br from-success to-[#1a6437]'
          }`}
        >
          <p className="font-bold text-white/90">{c.balanceCents > 0 ? 'Saldo devedor' : c.balanceCents < 0 ? 'Crédito do cliente' : 'Saldo'}</p>
          <p className="tabular text-4xl font-black">{formatBRL(Math.abs(c.balanceCents))}</p>
          <LocalPendingLine customerId={c.id} />
          <p className="mt-1 text-sm text-white/90">
            {c.lastSaleAt ? `Última compra: ${formatDate(new Date(c.lastSaleAt))}` : 'Nenhuma compra registrada'}
            {c.lastPaymentAt ? ` · Último pagamento: ${formatDate(new Date(c.lastPaymentAt))}` : ''}
          </p>
        </section>

        <section className="space-y-3 rounded-card bg-white p-5 shadow-soft ring-1 ring-line">
          <div className="flex items-center gap-3">
            <UserRound className="h-6 w-6 shrink-0 text-orange" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-lg font-extrabold text-brown">{c.fullName}</p>
              <p className="text-brown-soft">{c.phoneE164 ? formatPhone(c.phoneE164) : 'Sem telefone'}</p>
            </div>
          </div>
          {c.notes && <p className="rounded-2xl bg-cream px-4 py-3 text-brown">{c.notes}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Store className="h-5 w-5 text-orange" aria-hidden="true" />
            {places.length === 0 ? (
              <span className="text-brown-soft">Nenhum estabelecimento</span>
            ) : (
              places.map((p) =>
                isOwner ? (
                  <Link
                    key={p.id}
                    to={`/estabelecimentos/${p.id}`}
                    className="rounded-full bg-peach px-3 py-1 text-sm font-bold text-brown active:bg-cream-deep"
                  >
                    {p.name}
                  </Link>
                ) : (
                  <span key={p.id} className="rounded-full bg-peach px-3 py-1 text-sm font-bold text-brown">
                    {p.name}
                  </span>
                ),
              )
            )}
          </div>
          {!c.isActive && <p className="font-bold text-danger">Cliente desativado</p>}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <Link
              to={`/clientes/${c.id}/editar`}
              className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white font-extrabold text-brown shadow-soft ring-1 ring-line active:bg-cream-deep"
            >
              <Pencil className="h-5 w-5" aria-hidden="true" />
              Editar
            </Link>
            {c.phoneE164 && (
              <a
                href={whatsappLink(c.phoneE164, `Olá, ${firstName}! Aqui é do Lanches da Rose.`)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-success font-extrabold text-white shadow-soft active:brightness-95"
              >
                <MessageCircle className="h-5 w-5" aria-hidden="true" />
                WhatsApp
              </a>
            )}
          </div>
        </section>

        <div className="grid grid-cols-2 gap-3">
          <Link
            to={`/recebimentos/novo?cliente=${c.id}`}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-success px-3 text-center font-extrabold text-white shadow-soft active:brightness-95"
          >
            <HandCoins className="h-5 w-5 shrink-0" aria-hidden="true" />
            Receber pagamento
          </Link>
          {isOwner && (
            <Link
              to={`/clientes/${c.id}/saldo-anterior`}
              className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-3 text-center font-extrabold text-brown shadow-soft ring-1 ring-line active:bg-cream-deep"
            >
              <NotebookPen className="h-5 w-5 shrink-0" aria-hidden="true" />
              Saldo anterior
            </Link>
          )}
        </div>
        {isOwner && (
          <Link to={`/clientes/${c.id}/ajuste`} className="flex min-h-11 items-center justify-center gap-2 font-extrabold text-brown-soft">
            <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
            Lançar ajuste (desconto ou correção)
          </Link>
        )}

        {c.isActive && (
          <Link
            to={`/vender?cliente=${c.id}`}
            className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange-deep px-5 text-lg font-extrabold text-white shadow-warm active:bg-orange-darker"
          >
            <Plus className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
            Nova venda para {firstName}
          </Link>
        )}

        <PortalAccessSection customer={c} isOwner={isOwner} />

        <CustomerStatement customerId={c.id} />
      </main>
    </>
  );
}

/** Vendas fiadas deste cliente que estão no celular e ainda não entram no saldo do servidor. */
function LocalPendingLine({ customerId }: { customerId: string }) {
  const { db } = useSync();
  const pending = useLiveQuery(async () => {
    const [sales, ops] = await Promise.all([db.localSales.toArray(), db.outbox.toArray()]);
    const open = new Set(ops.filter((o) => o.type === 'CREATE_SALE' && o.state !== 'SYNCED').map((o) => o.opId));
    return sales
      .filter((s) => s.draft.customerId === customerId && s.draft.paymentKind === 'CREDIT' && open.has(s.opId) && !s.cancel)
      .reduce((sum, s) => sum + s.draft.totalCents, 0);
  }, [db, customerId]);
  if (!pending) return null;
  return <p className="mt-1 text-sm font-bold text-white">+ {formatBRL(pending)} em vendas no celular, ainda não enviadas</p>;
}
