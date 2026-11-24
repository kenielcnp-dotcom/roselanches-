import { amountSaleFormSchema, buildItem, describeItems, itemsTotal, validateSaleDraft } from '@/domain/sale';
import type { SaleDraft } from '@/types/domain';

const LIMITS = { saleMaxCents: 50_000, itemMaxQty: 50 };
const coxinha = { id: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b', name: 'Coxinha', priceCents: 650 };
const suco = { id: '4f5a6b7c-8d9e-4fa0-9b2c-3d4e5f6a7b8c', name: 'Suco', priceCents: 700 };

function itemsDraft(overrides: Partial<SaleDraft> = {}): SaleDraft {
  const items = [buildItem(coxinha, 2), buildItem(suco, 1)];
  return {
    id: '0b6a8c1e-5f2d-4c3b-9a7e-1d2c3b4a5f60',
    customerId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
    establishmentId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
    mode: 'ITEMS',
    period: 'AFTERNOON',
    occurredAt: '2026-11-23T17:00:00.000Z',
    items,
    description: null,
    totalCents: itemsTotal(items),
    paymentKind: 'CREDIT',
    ...overrides,
  };
}

function amountDraft(overrides: Partial<SaleDraft> = {}): SaleDraft {
  return itemsDraft({ mode: 'AMOUNT', items: [], description: 'Lanches da tarde', totalCents: 1850, ...overrides });
}

const fields = (d: SaleDraft) => validateSaleDraft(d, LIMITS).map((i) => i.field);

describe('venda por produtos', () => {
  it('calcula subtotais e total', () => {
    const d = itemsDraft();
    expect(d.items.map((i) => i.subtotalCents)).toEqual([1300, 700]);
    expect(d.totalCents).toBe(2000);
    expect(describeItems(d.items)).toBe('2× Coxinha + 1× Suco');
    expect(validateSaleDraft(d, LIMITS)).toEqual([]);
  });

  it('exige pelo menos um produto', () => {
    expect(fields(itemsDraft({ items: [], totalCents: 0 }))).toContain('items');
  });

  it.each([0, -1, 1.5])('recusa quantidade %s', (quantity) => {
    const item = { ...buildItem(coxinha, 1), quantity, subtotalCents: 650 };
    expect(fields(itemsDraft({ items: [item], totalCents: 650 }))).toContain('items');
  });

  it('recusa quantidade acima do limite configurado', () => {
    const items = [buildItem(coxinha, 51)];
    expect(fields(itemsDraft({ items, totalCents: itemsTotal(items) }))).toContain('items');
  });

  it('recusa total que não confere com os itens', () => {
    expect(fields(itemsDraft({ totalCents: 1999 }))).toContain('total');
  });

  it('guarda o preço da hora da venda, mesmo que o produto mude depois', () => {
    const item = buildItem(coxinha, 2);
    coxinha.priceCents = 800; // preço alterado depois
    expect(item.unitPriceCents).toBe(650);
    expect(item.subtotalCents).toBe(1300);
    coxinha.priceCents = 650;
  });
});

describe('venda por valor direto', () => {
  it('aceita valor e descrição', () => {
    expect(validateSaleDraft(amountDraft(), LIMITS)).toEqual([]);
  });

  it.each([0, -500])('recusa valor %s', (totalCents) => {
    expect(fields(amountDraft({ totalCents }))).toContain('total');
  });

  it('recusa valor acima do limite', () => {
    expect(fields(amountDraft({ totalCents: 50_001 }))).toContain('total');
  });

  it('exige descrição de até 150 caracteres', () => {
    expect(fields(amountDraft({ description: '   ' }))).toContain('description');
    expect(fields(amountDraft({ description: 'x'.repeat(151) }))).toContain('description');
    expect(fields(amountDraft({ description: 'x'.repeat(150) }))).toEqual([]);
  });

  it('formulário: duas casas decimais (centavos inteiros) e descrição obrigatória', () => {
    expect(amountSaleFormSchema.safeParse({ amountCents: 1850, description: 'Lanches da tarde' }).success).toBe(true);
    expect(amountSaleFormSchema.safeParse({ amountCents: 18.505, description: 'x' }).success).toBe(false);
    expect(amountSaleFormSchema.safeParse({ amountCents: 1850, description: '' }).success).toBe(false);
  });
});

describe('dados comuns', () => {
  it('exige cliente e estabelecimento', () => {
    const f = fields(itemsDraft({ customerId: '', establishmentId: '' }));
    expect(f).toContain('customer');
    expect(f).toContain('establishment');
  });

  it('venda paga na hora exige a forma de pagamento; fiada não leva pagamento', () => {
    expect(fields(itemsDraft({ paymentKind: 'PAID_NOW' }))).toContain('payment');
    expect(
      validateSaleDraft(
        itemsDraft({ paymentKind: 'PAID_NOW', paidNow: { paymentId: '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e', method: 'CASH' } }),
        LIMITS,
      ),
    ).toEqual([]);
    expect(
      fields(itemsDraft({ paidNow: { paymentId: '6b7c8d9e-0f1a-4b2c-9d3e-4f5a6b7c8d9e', method: 'PIX' } })),
    ).toContain('payment');
  });
});
