import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, UserCog } from 'lucide-react';
import { LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import type { DateRange } from '@/domain/report-period';
import { supabase } from '@/lib/supabase/client';
import { fetchTeamReport, type TeamReportRow } from '@/services/team';
import { HBars } from './Charts';
import { ReportError } from './ReportsPage';

/**
 * Por pessoa: quanto vendeu e quanto recebeu no período. "Em dinheiro" inclui
 * as vendas pagas na hora em dinheiro: é o que ficou na mão de quem registrou.
 */
export function TeamTab({ range, onSeeSales }: { range: DateRange; onSeeSales: (userId: string) => void }) {
  const query = useQuery({
    queryKey: ['report', 'team', range],
    queryFn: () => fetchTeamReport(supabase, range.from, range.to),
  });
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ReportError error={query.error} onRetry={() => void query.refetch()} />;
  const rows = query.data;
  const onlyOwner = rows.every((r) => r.role === 'OWNER');

  return (
    <div className="space-y-4">
      {onlyOwner && (
        <p className="rounded-card bg-peach px-4 py-3 text-brown">
          Por enquanto só você usa o app. Para ter vendedores com conta própria,{' '}
          <Link to="/equipe" className="font-extrabold text-orange-darker underline">
            convide pela tela Equipe
          </Link>
          .
        </p>
      )}

      {rows.length > 1 && (
        <section className="space-y-3 rounded-card bg-white p-4 shadow-soft ring-1 ring-line">
          <h3 className="font-black text-brown">Vendido por pessoa</h3>
          <HBars
            label="Vendido por pessoa"
            items={rows.map((r) => ({ key: r.userId, label: r.name, value: r.salesCents, detail: formatBRL(r.salesCents) }))}
          />
        </section>
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.userId}>
            <MemberReport row={r} onSeeSales={() => onSeeSales(r.userId)} />
          </li>
        ))}
      </ul>
      <p className="text-xs text-brown-soft">
        "Em dinheiro" soma os pagamentos de fiado e as vendas pagas na hora em dinheiro que a pessoa registrou: é o que ficou com
        ela. Pix cai direto na sua conta.
      </p>
    </div>
  );
}

function MemberReport({ row: r, onSeeSales }: { row: TeamReportRow; onSeeSales: () => void }) {
  return (
    <article aria-label={r.name} className="rounded-card bg-white p-4 shadow-soft ring-1 ring-line">
      <div className="flex items-center gap-2">
        <UserCog className="h-5 w-5 shrink-0 text-orange" aria-hidden="true" />
        <h3 className="min-w-0 flex-1 truncate text-lg font-black text-brown">{r.name}</h3>
        <span className="shrink-0 rounded-full bg-cream-deep px-2 py-0.5 text-xs font-bold text-brown-soft">
          {r.role === 'OWNER' ? 'Dona' : r.isActive ? 'Vendedor' : 'Desativado'}
        </span>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <Metric label="Vendido" value={formatBRL(r.salesCents)} sub={`${r.salesCount} ${r.salesCount === 1 ? 'venda' : 'vendas'}`} />
        <Metric label="Fiado" value={formatBRL(r.creditCents)} sub={r.cancelledCount ? `${r.cancelledCount} cancelada(s)` : undefined} />
        <Metric label="Recebeu em dinheiro" value={formatBRL(r.cashCents)} highlight />
        <Metric label="Recebeu em Pix" value={formatBRL(r.pixCents)} />
      </dl>
      {r.salesCount > 0 && (
        <button
          type="button"
          onClick={onSeeSales}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-1 font-extrabold text-orange-darker"
        >
          Ver as vendas de {r.name.split(' ')[0]}
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </article>
  );
}

function Metric({ label, value, sub, highlight = false }: { label: string; value: string; sub?: string | undefined; highlight?: boolean }) {
  return (
    <div className="rounded-2xl bg-cream px-3 py-2">
      <dt className="text-xs font-bold text-brown-soft">{label}</dt>
      <dd>
        <span className={`tabular block text-lg leading-tight font-black ${highlight ? 'text-success' : 'text-brown'}`}>{value}</span>
        {sub && <span className="block text-xs text-brown-soft">{sub}</span>}
      </dd>
    </div>
  );
}
