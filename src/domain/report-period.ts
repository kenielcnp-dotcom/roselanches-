// Períodos dos relatórios em DATAS do negócio (AAAA-MM-DD, no fuso do negócio).
// A conta de calendário é feita em UTC puro, sem horário, para não escorregar
// de dia por causa de fuso ou horário de verão.
import { localDateISO } from './period';

export type PeriodPreset = 'TODAY' | 'WEEK' | 'MONTH' | 'LAST_MONTH' | 'CUSTOM';

export interface DateRange {
  from: string;
  to: string;
}

export const MAX_RANGE_DAYS = 367;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** Quantos dias o intervalo tem, contando o primeiro e o último. */
export function rangeDays({ from, to }: DateRange): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000) + 1;
}

/** Hoje; semana de segunda até hoje; mês do dia 1 até hoje; mês passado inteiro. */
export function presetRange(preset: Exclude<PeriodPreset, 'CUSTOM'>, now: Date = new Date()): DateRange {
  const today = localDateISO(now);
  switch (preset) {
    case 'TODAY':
      return { from: today, to: today };
    case 'WEEK': {
      const weekday = toUtc(today).getUTCDay(); // 0 = domingo
      return { from: addDays(today, -((weekday + 6) % 7)), to: today };
    }
    case 'MONTH':
      return { from: `${today.slice(0, 7)}-01`, to: today };
    case 'LAST_MONTH': {
      const lastDay = addDays(`${today.slice(0, 7)}-01`, -1);
      return { from: `${lastDay.slice(0, 7)}-01`, to: lastDay };
    }
  }
}

/** Mensagem de erro do intervalo escolhido à mão, ou null se está tudo certo. */
export function rangeProblem(range: DateRange): string | null {
  if (!ISO.test(range.from) || !ISO.test(range.to)) return 'Escolha as duas datas.';
  if (range.from > range.to) return 'A data inicial é depois da final.';
  if (rangeDays(range) > MAX_RANGE_DAYS) return 'Escolha no máximo um ano.';
  return null;
}

/** "25/11" ou "01/11 a 25/11" (com o ano quando não é o mesmo). */
export function formatRange({ from, to }: DateRange): string {
  const short = (iso: string, withYear: boolean) =>
    `${iso.slice(8, 10)}/${iso.slice(5, 7)}${withYear ? `/${iso.slice(0, 4)}` : ''}`;
  const withYear = from.slice(0, 4) !== to.slice(0, 4);
  return from === to ? short(from, false) : `${short(from, withYear)} a ${short(to, withYear)}`;
}

export interface DayValue {
  date: string;
  count: number;
  cents: number;
}

export interface Bucket extends DateRange {
  label: string;
  count: number;
  cents: number;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Junta os dias para o gráfico caber no celular: por dia até 31 dias, por
 * semana (começando na segunda) até 126 dias, por mês acima disso.
 */
export function bucketDays(days: readonly DayValue[]): { unit: 'day' | 'week' | 'month'; buckets: Bucket[] } {
  const unit = days.length <= 31 ? 'day' : days.length <= 126 ? 'week' : 'month';
  const keyOf = (iso: string): string => {
    if (unit === 'day') return iso;
    if (unit === 'month') return iso.slice(0, 7);
    const weekday = toUtc(iso).getUTCDay();
    return addDays(iso, -((weekday + 6) % 7));
  };
  const buckets: Bucket[] = [];
  for (const d of days) {
    const key = keyOf(d.date);
    const last = buckets[buckets.length - 1];
    if (last && keyOf(last.from) === key) {
      last.to = d.date;
      last.count += d.count;
      last.cents += d.cents;
    } else {
      const label =
        unit === 'month' ? `${MONTHS[Number(d.date.slice(5, 7)) - 1]}/${d.date.slice(2, 4)}` : `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`;
      buckets.push({ label, from: d.date, to: d.date, count: d.count, cents: d.cents });
    }
  }
  return { unit, buckets };
}
