import { centsFromDigits, centsToDecimalString, formatBRL, multiplyCents, parseBRL, sumCents } from '@/domain/money';

describe('dinheiro em centavos', () => {
  it('formata em reais com espaço comum', () => {
    expect(formatBRL(125650)).toBe('R$ 1.256,50');
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(-1850)).toBe('−R$ 18,50');
    expect(formatBRL(1850, { signed: true })).toBe('+R$ 18,50');
  });

  it('recusa valores que não são inteiros', () => {
    expect(() => formatBRL(10.5)).toThrow();
    expect(() => sumCents([100, 0.1])).toThrow();
    expect(() => multiplyCents(650, 1.5)).toThrow();
  });

  it('soma e multiplica sem ponto flutuante', () => {
    // 0,1 + 0,2 em float daria 0,30000000000000004
    expect(sumCents([10, 20])).toBe(30);
    expect(multiplyCents(650, 3)).toBe(1950);
  });

  it('lê o que a pessoa digita', () => {
    expect(parseBRL('18,50')).toBe(1850);
    expect(parseBRL('R$ 1.256,50')).toBe(125650);
    expect(parseBRL('18.5')).toBe(1850);
    expect(parseBRL('1.000')).toBe(100000);
    expect(parseBRL('7')).toBe(700);
    expect(parseBRL('')).toBeNull();
    expect(parseBRL('abc')).toBeNull();
  });

  it('recusa mais de duas casas decimais', () => {
    expect(parseBRL('18,505')).toBeNull();
    expect(parseBRL('1,2,3')).toBeNull();
  });

  it('máscara de maquininha', () => {
    expect(centsFromDigits('1850')).toBe(1850);
    expect(centsFromDigits('R$ 0,05')).toBe(5);
    expect(centsFromDigits('')).toBe(0);
    expect(centsToDecimalString(1850)).toBe('18,50');
  });
});
