import { createHash } from 'node:crypto';
import { canonicalSaleHash, canonicalSaleText, sha256Hex } from '@/domain/canonical';
import { AMOUNT_SALE, AMOUNT_SALE_TEXT, ITEMS_SALE, ITEMS_SALE_TEXT } from '../fixtures/canonical';

const nodeSha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

describe('resumo canônico v1', () => {
  it('venda por produtos gera exatamente o texto esperado', () => {
    expect(canonicalSaleText(ITEMS_SALE, 'v1')).toBe(ITEMS_SALE_TEXT);
  });

  it('venda por valor direto gera exatamente o texto esperado', () => {
    expect(canonicalSaleText(AMOUNT_SALE, 'v1')).toBe(AMOUNT_SALE_TEXT);
  });

  it('hash é o SHA-256 em hexadecimal do texto em UTF-8', async () => {
    expect(await sha256Hex(ITEMS_SALE_TEXT)).toBe(nodeSha(ITEMS_SALE_TEXT));
    expect(await canonicalSaleHash(AMOUNT_SALE, 'v1')).toBe(nodeSha(AMOUNT_SALE_TEXT));
  });

  it('qualquer mudança no conteúdo muda o hash', async () => {
    const base = await canonicalSaleHash(ITEMS_SALE, 'v1');
    const otherTotal = await canonicalSaleHash({ ...ITEMS_SALE, totalCents: 2001 }, 'v1');
    const otherCustomer = await canonicalSaleHash({ ...ITEMS_SALE, customerId: AMOUNT_SALE.saleId }, 'v1');
    const otherTerms = await canonicalSaleHash(ITEMS_SALE, 'v2');
    expect(new Set([base, otherTotal, otherCustomer, otherTerms]).size).toBe(4);
  });

  it('normaliza acentos (NFC) e ids em minúsculas', () => {
    const decomposed = { ...AMOUNT_SALE, description: 'Lanches da tarde — pão de queijo', saleId: AMOUNT_SALE.saleId.toUpperCase() };
    expect(canonicalSaleText(decomposed, 'v1')).toBe(AMOUNT_SALE_TEXT);
  });

  it('a data é a mesma, venha como texto em outro fuso ou como Date', () => {
    const sameInstant = { ...ITEMS_SALE, occurredAt: '2026-11-23T10:45:12.345-03:00' };
    expect(canonicalSaleText(sameInstant, 'v1')).toBe(ITEMS_SALE_TEXT);
    expect(canonicalSaleText({ ...ITEMS_SALE, occurredAt: new Date(1795441512345) }, 'v1')).toBe(ITEMS_SALE_TEXT);
  });

  it('recusa conteúdo que o banco também recusaria', () => {
    expect(() => canonicalSaleText({ ...AMOUNT_SALE, description: 'linha1\nlinha2' }, 'v1')).toThrow();
    expect(() => canonicalSaleText({ ...AMOUNT_SALE, saleId: 'nao-e-uuid' }, 'v1')).toThrow();
    expect(() => canonicalSaleText({ ...AMOUNT_SALE, description: null }, 'v1')).toThrow();
    expect(() => canonicalSaleText({ ...AMOUNT_SALE, totalCents: 18.5 }, 'v1')).toThrow();
    expect(() => canonicalSaleText(AMOUNT_SALE, '1')).toThrow();
  });
});
