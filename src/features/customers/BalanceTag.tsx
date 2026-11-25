import { formatBRL } from '@/domain/money';

/** Saldo em palavras simples: "deve R$ 20,00", "em dia", "crédito R$ 5,00". */
export function BalanceTag({ cents }: { cents: number }) {
  if (cents > 0) {
    return (
      <span className="shrink-0 text-right leading-tight">
        <span className="block text-xs font-bold text-brown-soft">deve</span>
        <span className="tabular block font-black text-orange-darker">{formatBRL(cents)}</span>
      </span>
    );
  }
  if (cents < 0) {
    return (
      <span className="shrink-0 text-right leading-tight">
        <span className="block text-xs font-bold text-brown-soft">crédito</span>
        <span className="tabular block font-black text-success">{formatBRL(-cents)}</span>
      </span>
    );
  }
  return <span className="shrink-0 text-sm font-bold text-success">em dia</span>;
}
