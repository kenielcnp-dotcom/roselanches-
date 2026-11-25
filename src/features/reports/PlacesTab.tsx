import { Link } from 'react-router';
import type { UseQueryResult } from '@tanstack/react-query';
import { Info, Store } from 'lucide-react';
import { LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import type { PlacesReport } from '@/services/reports';
import { ReportError } from './ReportsPage';

/**
 * Por local, três números que respondem perguntas diferentes e NÃO se somam:
 * vendas feitas ali, dívida que nasceu ali e saldo dos clientes de lá.
 */
export function PlacesTab({ query }: { query: UseQueryResult<PlacesReport> }) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ReportError error={query.error} onRetry={() => void query.refetch()} />;
  const r = query.data;

  return (
    <div className="space-y-4">
      <details className="rounded-card bg-peach px-4 py-3 text-sm text-brown">
        <summary className="flex cursor-pointer items-center gap-2 font-extrabold">
          <Info className="h-5 w-5 shrink-0 text-orange-darker" aria-hidden="true" />O que cada número quer dizer
        </summary>
        <dl className="mt-2 space-y-2">
          <div>
            <dt className="font-bold">Vendido aqui</dt>
            <dd>Vendas feitas neste local, no período escolhido.</dd>
          </div>
          <div>
            <dt className="font-bold">Dívida que nasceu aqui</dt>
            <dd>
              Quanto ainda falta receber, hoje, de compras feitas neste local. Os pagamentos quitam primeiro as compras mais
              antigas, de qualquer local.
            </dd>
          </div>
          <div>
            <dt className="font-bold">Saldo dos clientes daqui</dt>
            <dd>
              Quanto os clientes deste local devem no total, hoje, incluindo compras em outros locais. Quem é cliente de dois
              locais aparece nos dois, por isso este número não se soma entre locais.
            </dd>
          </div>
        </dl>
      </details>

      {r.places.length === 0 ? (
        <p className="rounded-card bg-white/70 px-5 py-6 text-center text-brown-soft ring-1 ring-line">Nenhum estabelecimento cadastrado.</p>
      ) : (
        <ul className="space-y-3">
          {r.places.map((p) => (
            <li key={p.establishmentId}>
              <article aria-label={p.name} className="rounded-card bg-white p-4 shadow-soft ring-1 ring-line">
                <Link to={`/estabelecimentos/${p.establishmentId}`} className="flex items-center gap-2 text-lg font-black text-brown">
                  <Store className="h-5 w-5 shrink-0 text-orange" aria-hidden="true" />
                  <span className="truncate">{p.name}</span>
                  {!p.isActive && <span className="rounded-full bg-cream-deep px-2 text-xs font-bold text-brown-soft">Desativado</span>}
                </Link>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <Metric label="Vendido aqui" value={formatBRL(p.salesCents)} sub={`${p.salesCount} ${p.salesCount === 1 ? 'venda' : 'vendas'}`} />
                  <Metric label="Dívida que nasceu aqui" value={formatBRL(p.originatedOpenCents)} sub="hoje" />
                  <Metric
                    label="Saldo dos clientes daqui"
                    value={formatBRL(p.linkedBalanceCents)}
                    sub={`${p.linkedWithBalance} de ${p.linkedCustomers} devendo`}
                  />
                </dl>
              </article>
            </li>
          ))}
        </ul>
      )}

      <section className="space-y-1 rounded-card bg-white p-4 text-brown shadow-soft ring-1 ring-line">
        <p className="flex justify-between gap-3">
          <span>Dívida sem local (saldo anterior e ajustes)</span>
          <span className="tabular shrink-0 font-black whitespace-nowrap">{formatBRL(r.noPlaceOpenCents)}</span>
        </p>
        <p className="flex justify-between gap-3 border-t border-line pt-1">
          <span className="font-bold">Total em aberto hoje</span>
          <span className="tabular shrink-0 font-black whitespace-nowrap">{formatBRL(r.totalOpenCents)}</span>
        </p>
        <p className="text-xs text-brown-soft">"Dívida que nasceu aqui" de todos os locais + "dívida sem local" = total em aberto.</p>
      </section>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-cream px-1.5 py-2">
      <dt className="text-xs leading-tight font-bold text-brown-soft">{label}</dt>
      <dd className="mt-1">
        <span className="tabular block text-base leading-tight font-black text-brown">{value}</span>
        <span className="block text-xs text-brown-soft">{sub}</span>
      </dd>
    </div>
  );
}
