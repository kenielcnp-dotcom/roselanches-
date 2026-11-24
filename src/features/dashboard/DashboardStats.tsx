import { Link } from 'react-router';
import { ReceiptText, RefreshCw, Users } from 'lucide-react';
import { formatBRL } from '@/domain/money';
import { formatTime } from '@/domain/period';
import { errorMessage } from '@/lib/supabase/errors';
import { useDashboard } from '@/features/registry/queries';
import { CoinsArt } from './CoinsArt';

/** Total a receber, vendas de hoje e clientes com saldo, sempre vindos do banco. */
export function DashboardStats() {
  const query = useDashboard();

  if (query.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando os números do dia" className="space-y-3">
        <div className="h-36 animate-pulse rounded-card bg-peach" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-28 animate-pulse rounded-card bg-white/70" />
          <div className="h-28 animate-pulse rounded-card bg-white/70" />
        </div>
      </div>
    );
  }

  if (query.isError && !query.data) {
    return (
      <div role="alert" className="rounded-card bg-white/80 px-5 py-4 ring-1 ring-line">
        <p className="font-bold text-brown">Não foi possível carregar os números do dia.</p>
        <p className="text-brown-soft">{errorMessage(query.error)}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="mt-2 inline-flex min-h-11 items-center gap-2 font-extrabold text-orange-deep"
        >
          <RefreshCw className="h-5 w-5" aria-hidden="true" />
          Tentar de novo
        </button>
      </div>
    );
  }

  const d = query.data;
  // Sem internet, os números da última leitura continuam na tela, com a hora.
  const stale = query.isError;

  return (
    <div className="space-y-3">
      <Link
        to="/clientes"
        className="relative block overflow-hidden rounded-card bg-linear-to-br from-orange-deep via-[#8a3510] to-brown px-5 py-5 text-white shadow-warm"
      >
        <p className="text-lg font-bold text-white/95">Total a receber</p>
        <p className="tabular mt-1 text-[2.6rem] leading-none font-black">{formatBRL(d.receivableCents)}</p>
        <p className="mt-2 text-sm font-semibold text-white/90">
          {stale ? `Sem internet · números de ${formatTime(d.asOf)}` : `Atualizado às ${formatTime(d.asOf)}`}
        </p>
        <CoinsArt className="pointer-events-none absolute -right-2 -bottom-3 h-28 w-28 opacity-90" />
      </Link>
      <div className="grid grid-cols-2 gap-3">
        <Link to="/vendas" className="rounded-card bg-peach px-4 py-4 shadow-soft ring-1 ring-line active:bg-cream-deep">
          <ReceiptText className="h-7 w-7 text-orange" strokeWidth={2.5} aria-hidden="true" />
          <p className="mt-1 font-bold text-brown">Vendas de hoje</p>
          {d.todaySalesCount === 0 ? (
            <p className="mt-1 text-brown-soft">Nenhuma venda hoje</p>
          ) : (
            <>
              <p className="tabular text-2xl leading-tight font-black text-brown">{formatBRL(d.todaySalesCents)}</p>
              <p className="text-sm text-brown-soft">
                {d.todaySalesCount} {d.todaySalesCount === 1 ? 'venda' : 'vendas'}
              </p>
            </>
          )}
        </Link>
        <Link to="/clientes" className="rounded-card bg-white/90 px-4 py-4 shadow-soft ring-1 ring-line active:bg-cream-deep">
          <Users className="h-7 w-7 text-orange" strokeWidth={2.5} aria-hidden="true" />
          <p className="mt-1 font-bold text-brown">Clientes com saldo</p>
          <p className="tabular text-2xl leading-tight font-black text-brown">{d.customersWithBalance}</p>
          <p className="text-sm text-brown-soft">devendo agora</p>
        </Link>
      </div>
    </div>
  );
}
