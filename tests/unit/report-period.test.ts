import { setBusinessTimeZone } from '@/domain/period';
import { addDays, bucketDays, formatRange, presetRange, rangeDays, rangeProblem } from '@/domain/report-period';

describe('períodos dos relatórios', () => {
  beforeAll(() => setBusinessTimeZone('America/Cuiaba'));
  afterAll(() => setBusinessTimeZone(undefined));

  // Quarta-feira, 25/11/2026, 02:30 em UTC = ainda terça 24/11 em Cuiabá (UTC−4).
  const lateNight = new Date('2026-11-25T02:30:00Z');
  const wednesday = new Date('2026-11-25T15:00:00Z');

  it('hoje segue o fuso do negócio', () => {
    expect(presetRange('TODAY', lateNight)).toEqual({ from: '2026-11-24', to: '2026-11-24' });
  });

  it('semana começa na segunda', () => {
    expect(presetRange('WEEK', wednesday)).toEqual({ from: '2026-11-23', to: '2026-11-25' });
    expect(presetRange('WEEK', new Date('2026-11-23T15:00:00Z'))).toEqual({ from: '2026-11-23', to: '2026-11-23' });
    expect(presetRange('WEEK', new Date('2026-11-29T15:00:00Z'))).toEqual({ from: '2026-11-23', to: '2026-11-29' });
  });

  it('mês atual e mês passado (inclusive virada de ano e fevereiro)', () => {
    expect(presetRange('MONTH', wednesday)).toEqual({ from: '2026-11-01', to: '2026-11-25' });
    expect(presetRange('LAST_MONTH', wednesday)).toEqual({ from: '2026-10-01', to: '2026-10-31' });
    expect(presetRange('LAST_MONTH', new Date('2027-01-10T15:00:00Z'))).toEqual({ from: '2026-12-01', to: '2026-12-31' });
    expect(presetRange('LAST_MONTH', new Date('2028-03-05T15:00:00Z'))).toEqual({ from: '2028-02-01', to: '2028-02-29' });
  });

  it('contas de calendário', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(rangeDays({ from: '2026-11-01', to: '2026-11-30' })).toBe(30);
    expect(rangeProblem({ from: '2026-11-10', to: '2026-11-01' })).toMatch(/depois/);
    expect(rangeProblem({ from: '2025-01-01', to: '2026-11-01' })).toMatch(/um ano/);
    expect(rangeProblem({ from: '', to: '2026-11-01' })).toMatch(/duas datas/);
    expect(rangeProblem({ from: '2026-11-01', to: '2026-11-25' })).toBeNull();
    expect(formatRange({ from: '2026-11-25', to: '2026-11-25' })).toBe('25/11');
    expect(formatRange({ from: '2026-11-01', to: '2026-11-25' })).toBe('01/11 a 25/11');
    expect(formatRange({ from: '2026-12-20', to: '2027-01-05' })).toBe('20/12/2026 a 05/01/2027');
  });
});

describe('agrupamento do gráfico', () => {
  const series = (from: string, n: number) => Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), count: 1, cents: 100 }));

  it('até 31 dias, um ponto por dia', () => {
    const r = bucketDays(series('2026-11-01', 30));
    expect(r.unit).toBe('day');
    expect(r.buckets).toHaveLength(30);
    expect(r.buckets[0]).toMatchObject({ label: '01/11', cents: 100 });
  });

  it('até 126 dias, por semana (segunda a domingo), sem perder valor', () => {
    const r = bucketDays(series('2026-11-04', 60)); // começa numa quarta
    expect(r.unit).toBe('week');
    expect(r.buckets[0]).toMatchObject({ from: '2026-11-04', to: '2026-11-08', count: 5 });
    expect(r.buckets[1]).toMatchObject({ from: '2026-11-09', to: '2026-11-15', count: 7 });
    expect(r.buckets.reduce((s, b) => s + b.cents, 0)).toBe(6000);
  });

  it('acima disso, por mês', () => {
    const r = bucketDays(series('2026-01-01', 365));
    expect(r.unit).toBe('month');
    expect(r.buckets.map((b) => b.label)).toEqual(['jan/26', 'fev/26', 'mar/26', 'abr/26', 'mai/26', 'jun/26', 'jul/26', 'ago/26', 'set/26', 'out/26', 'nov/26', 'dez/26']);
    expect(r.buckets[1]).toMatchObject({ from: '2026-02-01', to: '2026-02-28', count: 28 });
  });
});
