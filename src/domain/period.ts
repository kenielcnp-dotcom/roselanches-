// Datas e períodos sempre no fuso do NEGÓCIO (business_settings.timezone),
// seja qual for o fuso do aparelho. O app informa o fuso ao carregar a
// identidade (setBusinessTimeZone); cada função também aceita um fuso explícito.
import type { Period } from '@/types/domain';
import { DEFAULT_TIME_ZONE, isBrazilTimeZone } from './timezone';

let currentTimeZone = DEFAULT_TIME_ZONE;

export function setBusinessTimeZone(timeZone: string | null | undefined): void {
  currentTimeZone = timeZone && isBrazilTimeZone(timeZone) ? timeZone : DEFAULT_TIME_ZONE;
}

export function businessTimeZone(): string {
  return currentTimeZone;
}

export const PERIOD_LABELS: Record<Period, string> = {
  MORNING: 'Manhã',
  AFTERNOON: 'Tarde',
  NIGHT: 'Noite',
};

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(locale: string, timeZone: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone });
    formatters.set(key, f);
  }
  return f;
}

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const PARTS_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
};

export function localParts(date: Date, timeZone = currentTimeZone): LocalParts {
  const parts = formatter('en-US', timeZone, PARTS_OPTIONS).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? NaN);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** Período sugerido pela hora: 5h–11h manhã, 12h–17h tarde, 18h–4h noite. */
export function suggestPeriod(date: Date, timeZone = currentTimeZone): Period {
  const { hour } = localParts(date, timeZone);
  if (hour >= 5 && hour < 12) return 'MORNING';
  if (hour >= 12 && hour < 18) return 'AFTERNOON';
  return 'NIGHT';
}

export function greeting(date: Date, timeZone = currentTimeZone): string {
  const period = suggestPeriod(date, timeZone);
  return period === 'MORNING' ? 'Bom dia' : period === 'AFTERNOON' ? 'Boa tarde' : 'Boa noite';
}

/** "2026-11-23" no fuso do negócio. */
export function localDateISO(date: Date, timeZone = currentTimeZone): string {
  const { year, month, day } = localParts(date, timeZone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** "10:23" */
export function formatTime(date: Date, timeZone = currentTimeZone): string {
  return formatter('pt-BR', timeZone, { hour: '2-digit', minute: '2-digit' }).format(date);
}

/** "23/11" */
export function formatShortDate(date: Date, timeZone = currentTimeZone): string {
  return formatter('pt-BR', timeZone, { day: '2-digit', month: '2-digit' }).format(date);
}

/** "23/11/2026" */
export function formatDate(date: Date, timeZone = currentTimeZone): string {
  return formatter('pt-BR', timeZone, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

/** "23/11 às 10:23" */
export function formatDateTime(date: Date, timeZone = currentTimeZone): string {
  return `${formatShortDate(date, timeZone)} às ${formatTime(date, timeZone)}`;
}

/** Primeiro nome para a saudação ("Rose Maria" → "Rose"). */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

/** Início do dia (meia-noite) no fuso do negócio, como instante. */
export function startOfLocalDay(date: Date, timeZone = currentTimeZone): Date {
  const { year, month, day } = localParts(date, timeZone);
  const guess = Date.UTC(year, month - 1, day);
  const p = localParts(new Date(guess), timeZone);
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - guess;
  return new Date(guess - offset);
}
