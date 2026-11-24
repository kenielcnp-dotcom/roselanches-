import { firstName, formatTime, greeting, localDateISO, suggestPeriod } from '@/domain/period';

// Horários em UTC; Brasília é UTC−3.
const at = (utc: string) => new Date(utc);

describe('períodos no horário de Brasília', () => {
  it('sugere o período pela hora local, não pela do aparelho', () => {
    expect(suggestPeriod(at('2026-11-23T10:00:00Z'))).toBe('MORNING'); // 07:00
    expect(suggestPeriod(at('2026-11-23T14:59:00Z'))).toBe('MORNING'); // 11:59
    expect(suggestPeriod(at('2026-11-23T15:00:00Z'))).toBe('AFTERNOON'); // 12:00
    expect(suggestPeriod(at('2026-11-23T20:59:00Z'))).toBe('AFTERNOON'); // 17:59
    expect(suggestPeriod(at('2026-11-23T21:00:00Z'))).toBe('NIGHT'); // 18:00
    expect(suggestPeriod(at('2026-11-24T06:00:00Z'))).toBe('NIGHT'); // 03:00
  });

  it('saudação acompanha o período', () => {
    expect(greeting(at('2026-11-23T13:24:00Z'))).toBe('Bom dia'); // 10:24
    expect(greeting(at('2026-11-23T17:00:00Z'))).toBe('Boa tarde');
    expect(greeting(at('2026-11-23T23:00:00Z'))).toBe('Boa noite');
  });

  it('data local vira o dia em Brasília, não em UTC', () => {
    expect(localDateISO(at('2026-11-24T02:30:00Z'))).toBe('2026-11-23'); // 23:30 do dia 23
    expect(formatTime(at('2026-11-23T13:23:00Z'))).toBe('10:23');
  });

  it('primeiro nome', () => {
    expect(firstName('  Rose Maria  ')).toBe('Rose');
    expect(firstName('')).toBe('');
  });
});
