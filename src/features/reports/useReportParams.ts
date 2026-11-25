// Filtros do relatório guardados no endereço da página: ao abrir uma venda e
// voltar, o relatório continua do mesmo jeito.
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { presetRange, rangeProblem, type DateRange, type PeriodPreset } from '@/domain/report-period';
import type { ConfirmationFilter, PaymentFilter, ReportFilters } from '@/services/reports';

export type ReportTab = 'resumo' | 'locais' | 'vendas';

const PRESETS: PeriodPreset[] = ['TODAY', 'WEEK', 'MONTH', 'LAST_MONTH', 'CUSTOM'];
const TABS: ReportTab[] = ['resumo', 'locais', 'vendas'];
const PAYMENTS: PaymentFilter[] = ['ALL', 'OPEN', 'PARTIAL', 'SETTLED', 'PAID_NOW', 'CANCELLED'];
const CONFIRMATIONS: ConfirmationFilter[] = ['ALL', 'PENDING', 'SIGNED', 'CONFIRMED_ONLINE', 'DISPUTED'];

function pick<T extends string>(value: string | null, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function useReportParams() {
  const [params, setParams] = useSearchParams();
  const preset = pick(params.get('periodo'), PRESETS, 'MONTH');
  const tab = pick(params.get('aba'), TABS, 'resumo');
  const payment = pick(params.get('pagamento'), PAYMENTS, 'ALL');
  const confirmation = pick(params.get('confirmacao'), CONFIRMATIONS, 'ALL');
  const custom: DateRange = { from: params.get('de') ?? '', to: params.get('ate') ?? '' };
  const establishmentId = params.get('local');
  const customerId = params.get('cliente');

  const range = useMemo<DateRange>(
    () => (preset === 'CUSTOM' ? custom : presetRange(preset)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [preset, custom.from, custom.to],
  );
  const problem = preset === 'CUSTOM' ? rangeProblem(range) : null;

  const filters = useMemo<ReportFilters>(
    () => ({ ...range, establishmentId, customerId }),
    [range, establishmentId, customerId],
  );

  const update = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  return { preset, tab, payment, confirmation, range, problem, filters, update };
}
