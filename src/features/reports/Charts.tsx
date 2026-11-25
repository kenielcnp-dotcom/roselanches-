import { useState, type ReactNode } from 'react';
import { bucketDays, type DayValue } from '@/domain/report-period';
import { formatBRL } from '@/domain/money';

const UNIT_TITLE = { day: 'por dia', week: 'por semana', month: 'por mês' } as const;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Barras verticais de uma série só (vendido no período). Tocar numa barra
 * mostra o valor; "Ver em tabela" traz os mesmos números em texto.
 */
export function SalesBars({ days }: { days: readonly DayValue[] }) {
  const { unit, buckets } = bucketDays(days);
  const [selected, setSelected] = useState<number | null>(null);
  const max = Math.max(...buckets.map((b) => b.cents), 0);
  const current = selected !== null ? buckets[selected] : undefined;
  const best = buckets.reduce<(typeof buckets)[number] | undefined>((a, b) => (!a || b.cents > a.cents ? b : a), undefined);
  const describe = (b: (typeof buckets)[number]) =>
    `${unit === 'day' ? b.label : b.from === b.to ? b.label : `${b.label} (${b.from.slice(8, 10)}/${b.from.slice(5, 7)} a ${b.to.slice(8, 10)}/${b.to.slice(5, 7)})`}: ${formatBRL(b.cents)}, ${plural(b.count, 'venda', 'vendas')}`;

  return (
    <section aria-labelledby="grafico-vendas" className="space-y-2 rounded-card bg-white p-4 shadow-soft ring-1 ring-line">
      <h3 id="grafico-vendas" className="font-black text-brown">
        Vendido {UNIT_TITLE[unit]}
      </h3>
      <p className="min-h-6 text-sm text-brown" aria-live="polite">
        {current ? describe(current) : best && best.cents > 0 ? `Maior: ${describe(best)}` : 'Nenhuma venda no período.'}
      </p>
      <div className="flex h-36 items-end gap-0.5 border-b border-line" role="group" aria-label={`Vendido ${UNIT_TITLE[unit]}`}>
        {buckets.map((b, i) => (
          <button
            key={b.from}
            type="button"
            title={describe(b)}
            aria-label={describe(b)}
            aria-pressed={selected === i}
            onClick={() => setSelected(selected === i ? null : i)}
            className="group flex h-full min-w-0 flex-1 items-end justify-center"
          >
            <span
              className={`block w-full max-w-8 rounded-t ${selected === i ? 'bg-brown' : 'bg-orange-deep group-hover:bg-orange-darker'}`}
              style={{ height: max > 0 && b.cents > 0 ? `${Math.max(3, (b.cents / max) * 100)}%` : '0' }}
            />
          </button>
        ))}
      </div>
      <div className="flex justify-between text-xs text-brown-soft" aria-hidden="true">
        <span>{buckets[0]?.label}</span>
        {buckets.length > 2 && <span>{buckets[Math.floor(buckets.length / 2)]?.label}</span>}
        <span>{buckets[buckets.length - 1]?.label}</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer py-1 font-bold text-orange-darker">Ver em tabela</summary>
        <table className="mt-1 w-full text-left">
          <thead>
            <tr className="text-brown-soft">
              <th className="py-1 font-bold">{unit === 'day' ? 'Dia' : unit === 'week' ? 'Semana de' : 'Mês'}</th>
              <th className="py-1 text-right font-bold">Vendas</th>
              <th className="py-1 text-right font-bold">Valor</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.from} className="border-t border-line text-brown">
                <td className="py-1">{b.label}</td>
                <td className="tabular py-1 text-right">{b.count}</td>
                <td className="tabular py-1 text-right">{formatBRL(b.cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

export interface HBarItem {
  key: string;
  label: string;
  value: number;
  /** Texto à direita (o valor formatado e, se quiser, um complemento). */
  detail: string;
  icon?: ReactNode;
}

/** Barras horizontais com rótulo e valor escritos (a cor nunca é a única pista). */
export function HBars({ items, label }: { items: readonly HBarItem[]; label: string }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  return (
    <ul aria-label={label} className="space-y-2.5">
      {items.map((i) => (
        <li key={i.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 items-center gap-1.5 truncate font-bold text-brown">
              {i.icon}
              {i.label}
            </span>
            <span className="tabular shrink-0 text-brown">{i.detail}</span>
          </div>
          <div className="mt-1 h-2.5 rounded-full bg-cream-deep">
            <div
              className="h-full rounded-full bg-orange-deep"
              style={{ width: max > 0 && i.value > 0 ? `${Math.max(2, (i.value / max) * 100)}%` : '0' }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
