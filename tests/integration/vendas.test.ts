import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { buildItem, itemsTotal } from '@/domain/sale';
import { cancelSale, createSale, fetchStatement, toCreateSalePayload } from '@/services/sales';
import type { SaleDraft } from '@/types/domain';
import { dbConnect, linkCustomerAccount, newClient, setupBusiness, signUp, type TestBusiness, type TestUser } from './helpers';

let db: pg.Client;
let a: TestBusiness;
let b: TestBusiness;
let portalA: TestUser;

beforeAll(async () => {
  db = await dbConnect();
  a = await setupBusiness(db, 'VendaA');
  b = await setupBusiness(db, 'VendaB');
  portalA = await linkCustomerAccount(db, a.customerId, 'PortalVendaA');
});

afterAll(async () => {
  await db.end();
});

function amountDraft(biz: TestBusiness, over: Partial<SaleDraft> = {}): SaleDraft {
  return {
    id: randomUUID(),
    customerId: biz.customerId,
    establishmentId: biz.establishmentId,
    mode: 'AMOUNT',
    period: 'AFTERNOON',
    occurredAt: new Date().toISOString(),
    items: [],
    description: 'Lanches da tarde',
    totalCents: 1850,
    paymentKind: 'CREDIT',
    ...over,
  };
}

function itemsDraft(biz: TestBusiness, quantity = 2, priceCents = 650): SaleDraft {
  const items = [buildItem({ id: biz.productId, name: `Coxinha ${biz === a ? 'VendaA' : 'VendaB'}`, priceCents }, quantity)];
  return { ...amountDraft(biz), mode: 'ITEMS', description: null, items, totalCents: itemsTotal(items) };
}

async function balance(customerId: string): Promise<number> {
  const { rows } = await db.query('select balance_cents from public.customer_balances where customer_id = $1', [customerId]);
  return Number(rows[0].balance_cents);
}

async function count(table: string, where: string, value: string): Promise<number> {
  const { rows } = await db.query(`select count(*)::int as n from public.${table} where ${where} = $1`, [value]);
  return rows[0].n as number;
}

describe('create_sale: idempotência', () => {
  it('cria a venda por valor direto e o reenvio devolve DUPLICATE sem duplicar', async () => {
    const draft = amountDraft(a);
    const payload = toCreateSalePayload(draft);
    const first = await createSale(a.owner.client, payload);
    expect(first).toMatchObject({ status: 'CREATED', saleId: draft.id, flags: [] });
    const again = await createSale(a.owner.client, payload);
    expect(again.status).toBe('DUPLICATE');
    expect(await count('sales', 'id', draft.id)).toBe(1);
  });

  it('mesmo id com dados diferentes vira CONFLICT, fica na auditoria e não altera a venda', async () => {
    const draft = amountDraft(a);
    await createSale(a.owner.client, toCreateSalePayload(draft));
    const changed = await createSale(a.owner.client, toCreateSalePayload({ ...draft, totalCents: 9900 }));
    expect(changed.status).toBe('CONFLICT');
    const { rows } = await db.query('select total_cents from public.sales where id = $1', [draft.id]);
    expect(Number(rows[0].total_cents)).toBe(1850);
    const { rows: audit } = await db.query(
      `select count(*)::int as n from public.audit_logs where entity_id = $1 and action = 'SYNC_CONFLICT'`,
      [draft.id],
    );
    expect(audit[0].n).toBe(1);
  });

  it('envios simultâneos da mesma venda gravam uma só', async () => {
    const payload = toCreateSalePayload(itemsDraft(a));
    const results = await Promise.all([1, 2, 3].map(() => createSale(a.owner.client, payload)));
    expect(results.map((r) => r.status).sort()).toEqual(['CREATED', 'DUPLICATE', 'DUPLICATE']);
    expect(await count('sales', 'id', payload.id)).toBe(1);
    expect(await count('sale_items', 'sale_id', payload.id)).toBe(1);
  });

  it('id de venda de outro negócio vira CONFLICT sem revelar nada', async () => {
    const draft = amountDraft(b);
    await createSale(b.owner.client, toCreateSalePayload(draft));
    const r = await createSale(a.owner.client, toCreateSalePayload({ ...amountDraft(a), id: draft.id }));
    expect(r.status).toBe('CONFLICT');
    const { rows } = await db.query('select business_id from public.sales where id = $1', [draft.id]);
    expect(rows[0].business_id).toBe(b.businessId);
  });
});

describe('create_sale: conteúdo e saldo', () => {
  it('venda por produtos grava itens com nome e preço do momento e soma o saldo', async () => {
    const before = await balance(a.customerId);
    const draft = itemsDraft(a, 3);
    await createSale(a.owner.client, toCreateSalePayload(draft));
    const { rows } = await db.query('select product_name, quantity, unit_price_cents, subtotal_cents from public.sale_items where sale_id = $1', [
      draft.id,
    ]);
    expect(rows).toEqual([{ product_name: 'Coxinha VendaA', quantity: 3, unit_price_cents: '650', subtotal_cents: '1950' }]);
    expect(await balance(a.customerId)).toBe(before + 1950);
  });

  it('paga na hora grava venda e pagamento juntos e o saldo não muda', async () => {
    const before = await balance(a.customerId);
    const paymentId = randomUUID();
    const draft = amountDraft(a, { paymentKind: 'PAID_NOW', paidNow: { paymentId, method: 'PIX' }, totalCents: 1200 });
    await createSale(a.owner.client, toCreateSalePayload(draft));
    const { rows } = await db.query('select amount_cents, method, source, sale_id from public.payments where id = $1', [paymentId]);
    expect(rows[0]).toMatchObject({ amount_cents: '1200', method: 'PIX', source: 'SALE_PAID_NOW', sale_id: draft.id });
    expect(await balance(a.customerId)).toBe(before);
  });

  it('preço mudado depois da venda offline: vale o preço da venda e fica marcado', async () => {
    const draft = itemsDraft(a, 1, 500); // celular ainda com o preço antigo (R$ 5,00)
    const r = await createSale(a.owner.client, toCreateSalePayload(draft));
    expect(r.status).toBe('CREATED');
    expect(r.flags).toEqual([`PRICE_CHANGED:${a.productId}`]);
    const { rows } = await db.query('select unit_price_cents from public.sale_items where sale_id = $1', [draft.id]);
    expect(rows[0].unit_price_cents).toBe('500');
  });

  it('cliente desativado depois da venda: a venda é aceita e marcada', async () => {
    const biz = await setupBusiness(db, 'Inativo');
    await db.query('update public.customers set is_active = false where id = $1', [biz.customerId]);
    const r = await createSale(biz.owner.client, toCreateSalePayload(amountDraft(biz)));
    expect(r).toMatchObject({ status: 'CREATED', flags: ['INACTIVE_CUSTOMER'] });
  });
});

describe('create_sale: validação no servidor', () => {
  const cases: [string, (d: SaleDraft) => SaleDraft, RegExp][] = [
    ['valor zero', (d) => ({ ...d, totalCents: 0 }), /LDR_INVALID_SALE/],
    ['acima do limite configurado', (d) => ({ ...d, totalCents: 50001 }), /LDR_SALE_OVER_LIMIT/],
    ['descrição vazia', (d) => ({ ...d, description: '   ' }), /LDR_INVALID_DESCRIPTION/],
    ['descrição longa', (d) => ({ ...d, description: 'x'.repeat(151) }), /LDR_INVALID_DESCRIPTION/],
    ['data no futuro', (d) => ({ ...d, occurredAt: new Date(Date.now() + 3600_000).toISOString() }), /LDR_SALE_IN_FUTURE/],
    ['venda com mais de 30 dias', (d) => ({ ...d, occurredAt: new Date(Date.now() - 31 * 86400_000).toISOString() }), /LDR_SALE_TOO_OLD/],
    ['cliente de outro negócio', (d) => ({ ...d, customerId: b.customerId }), /LDR_CUSTOMER_NOT_FOUND/],
    ['estabelecimento de outro negócio', (d) => ({ ...d, establishmentId: b.establishmentId }), /LDR_ESTABLISHMENT_NOT_FOUND/],
    ['paga na hora sem forma de pagamento', (d) => ({ ...d, paymentKind: 'PAID_NOW' }), /LDR_INVALID_PAYMENT/],
  ];

  it.each(cases)('recusa: %s', async (_label, change, pattern) => {
    const draft = change(amountDraft(a));
    await expect(createSale(a.owner.client, toCreateSalePayload(draft))).rejects.toMatchObject({ code: expect.stringMatching(pattern) });
    expect(await count('sales', 'id', draft.id)).toBe(0);
  });

  it('itens que não somam o total, quantidade inválida e produto de outro negócio são recusados sem deixar nada gravado', async () => {
    const base = itemsDraft(a);
    const wrongTotal = { ...base, id: randomUUID(), totalCents: base.totalCents + 1 };
    const badQty = { ...base, id: randomUUID(), items: [{ ...base.items[0]!, quantity: 0, subtotalCents: 0 }], totalCents: 650 };
    const tooMany = { ...base, id: randomUUID(), items: [{ ...base.items[0]!, quantity: 51, subtotalCents: 51 * 650 }], totalCents: 51 * 650 };
    const foreign = { ...base, id: randomUUID(), items: [{ ...base.items[0]!, productId: b.productId }] };
    for (const [draft, pattern] of [
      [wrongTotal, /LDR_SALE_ITEMS_TOTAL/],
      [badQty, /LDR_ITEM_QUANTITY/],
      [tooMany, /LDR_ITEM_QUANTITY/],
      [foreign, /LDR_PRODUCT_NOT_FOUND/],
    ] as const) {
      await expect(createSale(a.owner.client, toCreateSalePayload(draft))).rejects.toMatchObject({ code: expect.stringMatching(pattern) });
      expect(await count('sales', 'id', draft.id)).toBe(0);
      expect(await count('sale_items', 'sale_id', draft.id)).toBe(0);
    }
  });
});

describe('create_sale e cancel_sale: permissões', () => {
  it('cliente do portal, conta sem negócio e anônimo não criam vendas', async () => {
    for (const client of [portalA.client, (await signUp('SemNegocioVenda')).client, newClient()]) {
      const draft = amountDraft(a);
      const { error } = await client.rpc('create_sale', { p_sale: toCreateSalePayload(draft) as unknown as never });
      expect(error).not.toBeNull();
      expect(await count('sales', 'id', draft.id)).toBe(0);
    }
  });

  it('cliente do portal e outro negócio não cancelam', async () => {
    const draft = amountDraft(a);
    await createSale(a.owner.client, toCreateSalePayload(draft));
    for (const client of [portalA.client, b.owner.client]) {
      const { error } = await client.rpc('cancel_sale', { p_sale_id: draft.id, p_reason: 'Tentativa indevida' });
      expect(error).not.toBeNull();
    }
    const { rows } = await db.query('select status from public.sales where id = $1', [draft.id]);
    expect(rows[0].status).toBe('ACTIVE');
  });
});

describe('cancel_sale', () => {
  it('cancela com motivo, tira do saldo e repetir é seguro', async () => {
    const before = await balance(a.customerId);
    const draft = amountDraft(a, { totalCents: 777 });
    await createSale(a.owner.client, toCreateSalePayload(draft));
    expect(await balance(a.customerId)).toBe(before + 777);

    await expect(cancelSale(a.owner.client, draft.id, 'x')).rejects.toMatchObject({ code: 'LDR_INVALID_REASON' });
    expect(await cancelSale(a.owner.client, draft.id, 'Cliente errado')).toBe('CANCELLED');
    expect(await cancelSale(a.owner.client, draft.id, 'Cliente errado')).toBe('ALREADY_CANCELLED');
    expect(await balance(a.customerId)).toBe(before);

    const { rows } = await db.query('select status, cancel_reason, cancelled_by from public.sales where id = $1', [draft.id]);
    expect(rows[0]).toMatchObject({ status: 'CANCELLED', cancel_reason: 'Cliente errado', cancelled_by: a.owner.userId });
  });

  it('cancelar venda paga na hora estorna o pagamento junto', async () => {
    const before = await balance(a.customerId);
    const paymentId = randomUUID();
    const draft = amountDraft(a, { paymentKind: 'PAID_NOW', paidNow: { paymentId, method: 'CASH' } });
    await createSale(a.owner.client, toCreateSalePayload(draft));
    await cancelSale(a.owner.client, draft.id, 'Registrado em dobro');
    const { rows } = await db.query('select status, reverse_reason from public.payments where id = $1', [paymentId]);
    expect(rows[0]).toMatchObject({ status: 'REVERSED', reverse_reason: 'Venda cancelada: Registrado em dobro' });
    expect(await balance(a.customerId)).toBe(before);
  });
});

describe('extrato do cliente', () => {
  let biz: TestBusiness;
  const ids: string[] = [];

  beforeAll(async () => {
    biz = await setupBusiness(db, 'Extrato');
    // Três vendas fiadas em horários diferentes e um pagamento de R$ 25,00.
    for (const [minutesAgo, cents] of [
      [300, 1000],
      [200, 2000],
      [100, 3000],
    ] as const) {
      const d = amountDraft(biz, { totalCents: cents, occurredAt: new Date(Date.now() - minutesAgo * 60_000).toISOString() });
      ids.push(d.id);
      await createSale(biz.owner.client, toCreateSalePayload(d));
    }
    await db.query(
      `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, received_at, request_hash, created_by)
       values ($1, $2, $3, 2500, 'CASH', 'MANUAL', now() - interval '50 minutes', $4, $5)`,
      [randomUUID(), biz.businessId, biz.customerId, 'd'.repeat(64), biz.owner.userId],
    );
    await cancelSale(biz.owner.client, ids[1]!, 'Lançado errado');
  });

  it('lista do mais novo para o mais antigo, com cancelada e o que está em aberto (FIFO)', async () => {
    const entries = await fetchStatement(biz.owner.client, biz.customerId, null);
    expect(entries.map((e) => [e.kind, e.amountCents, e.status, e.openCents])).toEqual([
      ['PAYMENT', 2500, 'CONFIRMED', null],
      ['SALE', 3000, 'ACTIVE', 1500], // R$ 25,00 quitou a de R$ 10,00 e R$ 15,00 desta
      ['SALE', 2000, 'CANCELLED', null],
      ['SALE', 1000, 'ACTIVE', 0],
    ]);
    expect(entries[2]?.statusReason).toBe('Lançado errado');
    expect(entries[1]).toMatchObject({ establishmentName: 'Mercado Extrato', description: 'Lanches da tarde' });
  });

  it('pagina pelo cursor sem repetir nem pular', async () => {
    const first = await fetchStatement(biz.owner.client, biz.customerId, null, 2);
    const last = first[first.length - 1]!;
    const second = await fetchStatement(biz.owner.client, biz.customerId, { beforeAt: last.occurredAt, beforeId: last.id }, 2);
    expect([...first, ...second].map((e) => e.id)).toEqual((await fetchStatement(biz.owner.client, biz.customerId, null)).map((e) => e.id));
  });

  it('outro negócio, cliente do portal e anônimo não leem o extrato', async () => {
    for (const client of [a.owner.client, portalA.client, newClient()]) {
      const { error } = await client.rpc('customer_statement', { p_customer: biz.customerId });
      expect(error).not.toBeNull();
    }
  });

  it('lista de vendas (sale_list) isola negócios e não aparece para o cliente do portal', async () => {
    const own = await biz.owner.client.from('sale_list').select('id').eq('customer_id', biz.customerId);
    expect(own.data).toHaveLength(3);
    const other = await a.owner.client.from('sale_list').select('id').eq('customer_id', biz.customerId);
    expect(other.data).toEqual([]);
    const portal = await portalA.client.from('sale_list').select('id');
    expect(portal.data).toEqual([]);
  });
});
