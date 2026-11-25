import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { CheckCircle2, Clock, MessageSquareWarning, PenLine } from 'lucide-react';
import { LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import { formatTime, PERIOD_LABELS } from '@/domain/period';
import type { ReportSummary } from '@/services/reports';
import { HBars, SalesBars } from './Charts';
import { ReportError } from './ReportsPage';

function Tile({ label, value, sub, tone = 'brown' }: { label: string; value: string; sub?: string; tone?: 'brown' | 'success' }) {
  return (
    <div className="rounded-card bg-white px-4 py-3 shadow-soft ring-1 ring-line">
      <p className="text-sm font-bold text-brown-soft">{label}</p>
      <p className={`tabular text-xl leading-tight font-black ${tone === 'success' ? 'text-success' : 'text-brown'}`}>{value}</p>
      {sub && <p className="text-xs text-brown-soft">{sub}</p>}
    </div>
  );
}

function Card({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="space-y-3 rounded-card bg-white p-4 shadow-soft ring-1 ring-line">
      <h3 className="font-black text-brown">{title}</h3>
      {children}
      {note && <p className="text-xs text-brown-soft">{note}</p>}
    </section>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function SummaryTab({ query, establishmentFiltered }: { query: UseQueryResult<ReportSummary>; establishmentFiltered: boolean }) {
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ReportError error={query.error} onRetry={() => void query.refetch()} />;
  const r = query.data;
  const avg = r.salesCount > 0 ? Math.round(r.salesCents / r.salesCount) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Tile label="Vendido" value={formatBRL(r.salesCents)} sub={plural(r.salesCount, 'venda', 'vendas')} />
        <Tile label="Fiado" value={formatBRL(r.creditCents)} sub={plural(r.creditCount, 'venda', 'vendas')} />
        <Tile label="Pago na hora" value={formatBRL(r.paidNowCents)} />
        {r.received ? (
          <Tile
            label="Recebido de fiado"
            value={formatBRL(r.received.cents)}
            sub={`Dinheiro ${formatBRL(r.received.cashCents)} · Pix ${formatBRL(r.received.pixCents)}`}
            tone="success"
          />
        ) : (
          <Tile label="Recebido de fiado" value="—" sub="Pagamento não tem local: tire o filtro de local." />
        )}
        <Tile label="Clientes que compraram" value={String(r.customersCount)} sub={avg ? `Média ${formatBRL(avg)} por venda` : undefined} />
        <Tile label="Canceladas" value={String(r.cancelledCount)} sub={r.cancelledCount ? formatBRL(r.cancelledCents) : undefined} />
      </div>

      {r.days.length > 1 && <SalesBars days={r.days} />}

      <Card title="Em aberto agora" note={`Não depende do período escolhido. Atualizado às ${formatTime(new Date(r.asOf))}.`}>
        <p>
          <span className="tabular text-3xl font-black text-brown">{formatBRL(r.openNow.openCents)}</span>{' '}
          <span className="text-brown-soft">
            {establishmentFiltered ? 'de compras feitas neste local' : `com ${plural(r.openNow.customersWithOpen, 'cliente', 'clientes')}`}
          </span>
        </p>
        <HBars
          label="Há quanto tempo está em aberto"
          items={[
            { key: 'a', label: 'Até 7 dias', value: r.openNow.aging.d0_7, detail: formatBRL(r.openNow.aging.d0_7) },
            { key: 'b', label: '8 a 30 dias', value: r.openNow.aging.d8_30, detail: formatBRL(r.openNow.aging.d8_30) },
            { key: 'c', label: '31 a 60 dias', value: r.openNow.aging.d31_60, detail: formatBRL(r.openNow.aging.d31_60) },
            { key: 'd', label: 'Mais de 60 dias', value: r.openNow.aging.d60_plus, detail: formatBRL(r.openNow.aging.d60_plus) },
          ]}
        />
      </Card>

      <Card title="Por turno">
        <HBars
          label="Vendido por turno"
          items={(['MORNING', 'AFTERNOON', 'NIGHT'] as const).map((k) => ({
            key: k,
            label: PERIOD_LABELS[k],
            value: r.periods[k].cents,
            detail: `${formatBRL(r.periods[k].cents)} · ${r.periods[k].count}`,
          }))}
        />
      </Card>

      <Card title="Confirmação dos clientes" note="Vendas sem confirmação continuam valendo; a confirmação é uma evidência a mais.">
        <ul className="space-y-2 text-brown">
          <ConfirmRow icon={<Clock className="h-5 w-5 text-brown-soft" />} label="Sem confirmação" n={r.confirmation.PENDING} />
          <ConfirmRow icon={<PenLine className="h-5 w-5 text-success" />} label="Assinadas na tela" n={r.confirmation.SIGNED} />
          <ConfirmRow icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Confirmadas no app" n={r.confirmation.CONFIRMED_ONLINE} />
          <ConfirmRow icon={<MessageSquareWarning className="h-5 w-5 text-danger" />} label="Contestadas" n={r.confirmation.DISPUTED} />
        </ul>
      </Card>

      {r.topProducts.length > 0 && (
        <Card title="Produtos mais vendidos" note="Só vendas por produto (a venda por valor direto não tem itens).">
          <HBars
            label="Produtos mais vendidos"
            items={r.topProducts.map((p) => ({ key: p.productId, label: p.name, value: p.cents, detail: `${p.quantity}× · ${formatBRL(p.cents)}` }))}
          />
        </Card>
      )}

      {r.topCustomers.length > 0 && (
        <Card title="Clientes que mais compraram">
          <HBars
            label="Clientes que mais compraram"
            items={r.topCustomers.map((c) => ({ key: c.customerId, label: c.name, value: c.cents, detail: `${formatBRL(c.cents)} · ${c.count}` }))}
          />
        </Card>
      )}
    </div>
  );
}

function ConfirmRow({ icon, label, n }: { icon: ReactNode; label: string; n: number }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="tabular font-black">{n}</span>
    </li>
  );
}
