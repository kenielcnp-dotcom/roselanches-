// Datas e períodos sempre no horário de Brasília, seja qual for o fuso do aparelho.
import type { Period } from '@/types/domain';

export const TIME_ZONE = 'America/Sao_Paulo';

export const PERIOD_LABELS: Record<Period, string> = {
  MORNING: 'Manhã',
  AFTERNOON: 'Tarde',
  NIGHT: 'Noite',
};

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function localParts(date: Date): LocalParts {
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(partsFormatter.formatToParts(date).find((p) => p.type === type)?.value ?? NaN);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** Período sugerido pela hora: 5h–11h manhã, 12h–17h tarde, 18h–4h noite. */
export function suggestPeriod(date: Date): Period {
  const { hour } = localParts(date);
  if (hour >= 5 && hour < 12) return 'MORNING';
  if (hour >= 12 && hour < 18) return 'AFTERNOON';
  return 'NIGHT';
}

export function greeting(date: Date): string {
  const period = suggestPeriod(date);
  return period === 'MORNING' ? 'Bom dia' : period === 'AFTERNOON' ? 'Boa tarde' : 'Boa noite';
}

/** "2026-11-23" no horário de Brasília. */
export function localDateISO(date: Date): string {
  const { year, month, day } = localParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const timeFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { timeZone: TIME_ZONE, day: '2-digit', month: '2-digit' });

/** "10:23" */
export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}

/** "23/11" */
export function formatShortDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Primeiro nome para a saudação ("Rose Maria" → "Rose"). */
export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}
