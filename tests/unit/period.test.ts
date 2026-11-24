import { businessTimeZone, firstName, formatDate, formatDateTime, formatTime, greeting, localDateISO, setBusinessTimeZone, suggestPeriod } from '@/domain/period';
import { BRAZIL_TIME_ZONES, isBrazilTimeZone, timeZoneLabel } from '@/domain/timezone';

// Horários em UTC; Brasília é UTC−3 (fuso padrão).
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

describe('fuso do negócio', () => {
  afterEach(() => setBusinessTimeZone(null));

  it('usa o fuso configurado (Cuiabá é UTC−4)', () => {
    setBusinessTimeZone('America/Cuiaba');
    expect(businessTimeZone()).toBe('America/Cuiaba');
    expect(formatTime(at('2026-11-23T13:23:00Z'))).toBe('09:23');
    // 03:30 UTC = 23:30 do dia 22 em Cuiabá, mas 00:30 do dia 23 em Brasília.
    expect(localDateISO(at('2026-11-23T03:30:00Z'))).toBe('2026-11-22');
    expect(localDateISO(at('2026-11-23T03:30:00Z'), 'America/Sao_Paulo')).toBe('2026-11-23');
    expect(suggestPeriod(at('2026-11-23T15:30:00Z'))).toBe('MORNING'); // 11:30 em Cuiabá
  });

  it('fuso desconhecido ou vazio volta para Brasília', () => {
    setBusinessTimeZone('Europe/Lisbon');
    expect(businessTimeZone()).toBe('America/Sao_Paulo');
    setBusinessTimeZone(undefined);
    expect(businessTimeZone()).toBe('America/Sao_Paulo');
  });

  it('formata data e hora', () => {
    expect(formatDateTime(at('2026-11-23T13:23:00Z'))).toBe('23/11 às 10:23');
    expect(formatDate(at('2026-11-23T13:23:00Z'))).toBe('23/11/2026');
  });
});

describe('lista de fusos', () => {
  it('reconhece só fusos do Brasil e tem rótulos', () => {
    expect(isBrazilTimeZone('America/Cuiaba')).toBe(true);
    expect(isBrazilTimeZone('UTC')).toBe(false);
    expect(timeZoneLabel('America/Cuiaba')).toMatch(/Mato Grosso/);
    expect(new Set(BRAZIL_TIME_ZONES.map((z) => z.id)).size).toBe(BRAZIL_TIME_ZONES.length);
  });
});
