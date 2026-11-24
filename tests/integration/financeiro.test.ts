import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { canonicalSaleHash, type CanonicalSale } from '@/domain/canonical';
import { ITEMS_SALE } from '../fixtures/canonical';
import { dbConnect, expectDbError, HASH_A, insertAmountSale, linkCustomerAccount, setupBusiness, signUp, type TestBusiness } from './helpers';

let db: pg.Client;
let a: TestBusiness;
let b: TestBusiness;

beforeAll(async () => {
  db = await dbConnect();
  a = await setupBusiness(db, 'FinA');
  b = await setupBusiness(db, 'FinB');
});

afterAll(async () => {
  await db.end();
});

/** Grava venda + itens numa transação, como a RPC create_sale fará. */
async function insertItemsSale(
  biz: TestBusiness,
  items: { productId: string; productName: string; quantity: number; unitPriceCents: number; subtotalCents: number }[],
  totalCents: number,
  ids: { saleId?: string; customerId?: string; establishmentId?: string; occurredAt?: string } = {},
): Promise<string> {
  const saleId = ids.saleId ?? randomUUID();
  await db.query('begin');
  try {
    await db.query(
      `insert into public.sales (id, business_id, customer_id, establishment_id, mode, period, total_cents,
         payment_kind, occurred_at, request_hash, created_by)
       values ($1, $2, $3, $4, 'ITEMS', 'AFTERNOON', $5, 'CREDIT', $6, $7, $8)`,
      [
        saleId,
        biz.businessId,
        ids.customerId ?? biz.customerId,
        ids.establishmentId ?? biz.establishmentId,
        totalCents,
        ids.occurredAt ?? new Date().toISOString(),
        HASH_A,
        biz.owner.userId,
      ],
    );
    let position = 1;
    for (const item of items) {
      await db.query(
        `insert into public.sale_items (business_id, sale_id, position, product_id, product_name, quantity,
           unit_price_cents, subtotal_cents)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [biz.businessId, saleId, position++, item.productId, item.productName, item.quantity, item.unitPriceCents, item.subtotalCents],
      );
    }
    await db.query('commit');
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
  return saleId;
}

const coxinha = () => ({ productId: a.productId, productName: 'Coxinha FinA', quantity: 2, unitPriceCents: 650, subtotalCents: 1300 });

async function balance(customerId: string): Promise<number> {
  const { rows } = await db.query('select balance_cents from public.customer_balances where customer_id = $1', [customerId]);
  return Number(rows[0].balance_cents);
}

describe('venda atômica', () => {
  it('venda por produtos com itens que somam o total é gravada', async () => {
    const id = await insertItemsSale(a, [coxinha()], 1300);
    const { rows } = await db.query('select count(*)::int as n from public.sale_items where sale_id = $1', [id]);
    expect(rows[0].n).toBe(1);
  });

  it('itens que não somam o total: nada é gravado', async () => {
    const saleId = randomUUID();
    await expectDbError(insertItemsSale(a, [coxinha()], 1500, { saleId }), /LDR_SALE_ITEMS_TOTAL/);
    const { rows } = await db.query('select 1 from public.sales where id = $1', [saleId]);
    expect(rows).toHaveLength(0);
  });

  it('venda por produtos sem itens é recusada', async () => {
    await expectDbError(insertItemsSale(a, [], 1300), /LDR_SALE_ITEMS_TOTAL/);
  });

  it('subtotal precisa ser quantidade × preço', async () => {
    await expectDbError(insertItemsSale(a, [{ ...coxinha(), subtotalCents: 1299 }], 1299), /sale_items_check/);
  });

  it('valor direto exige descrição e valor positivo', async () => {
    await expectDbError(insertAmountSale(db, a, { totalCents: 0 }), /sales_total_cents_check/);
    await expectDbError(
      db.query(
        `insert into public.sales (id, business_id, customer_id, establishment_id, mode, period, total_cents,
           payment_kind, occurred_at, request_hash, created_by)
         values ($1, $2, $3, $4, 'AMOUNT', 'MORNING', 100, 'CREDIT', now(), $5, $6)`,
        [randomUUID(), a.businessId, a.customerId, a.establishmentId, HASH_A, a.owner.userId],
      ),
      /sales_check/,
    );
  });

  it('não grava venda de cliente ou estabelecimento de outro negócio', async () => {
    await expectDbError(insertAmountSale(db, { ...a, customerId: b.customerId }, { totalCents: 100 }), /foreign key/);
    await expectDbError(insertAmountSale(db, { ...a, establishmentId: b.establishmentId }, { totalCents: 100 }), /foreign key/);
  });

  it('venda registrada não muda: só pode ser cancelada, com motivo', async () => {
    const id = await insertAmountSale(db, a, { totalCents: 1000 });
    await expectDbError(db.query('update public.sales set total_cents = 1 where id = $1', [id]), /LDR_SALE_IMMUTABLE/);
    await expectDbError(db.query(`update public.sales set status = 'CANCELLED' where id = $1`, [id]), /sales_check/);
    await db.query(
      `update public.sales set status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2, cancel_reason = 'Cliente errado' where id = $1`,
      [id, a.owner.userId],
    );
    await expectDbError(
      db.query(`update public.sales set status = 'ACTIVE', cancelled_at = null, cancelled_by = null, cancel_reason = null where id = $1`, [id]),
      /LDR_SALE_ALREADY_CANCELLED/,
    );
    await expectDbError(db.query('delete from public.sales where id = $1', [id]), /LDR_DELETE_FORBIDDEN/);
  });

  it('itens de venda não mudam nem são apagados', async () => {
    const id = await insertItemsSale(a, [coxinha()], 1300);
    await expectDbError(db.query('update public.sale_items set quantity = 3 where sale_id = $1', [id]), /LDR_SALE_ITEMS_IMMUTABLE/);
    await expectDbError(db.query('delete from public.sale_items where sale_id = $1', [id]), /LDR_DELETE_FORBIDDEN/);
  });
});

describe('saldo derivado', () => {
  let biz: TestBusiness;
  beforeAll(async () => {
    biz = await setupBusiness(db, 'Saldo');
  });

  async function payment(amount: number, opts: { saleId?: string; source?: string } = {}): Promise<string> {
    const id = randomUUID();
    await db.query(
      `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, sale_id, received_at,
         request_hash, created_by)
       values ($1, $2, $3, $4, 'CASH', $5, $6, now(), $7, $8)`,
      [id, biz.businessId, biz.customerId, amount, opts.source ?? 'MANUAL', opts.saleId ?? null, HASH_A, biz.owner.userId],
    );
    return id;
  }

  it('saldo = vendas + saldo anterior + débitos − pagamentos − créditos', async () => {
    expect(await balance(biz.customerId)).toBe(0);

    await db.query(
      `insert into public.opening_balances (id, business_id, customer_id, amount_cents, reference_date, note, created_by)
       values ($1, $2, $3, 5000, '2026-10-01', 'Caderno de outubro', $4)`,
      [randomUUID(), biz.businessId, biz.customerId, biz.owner.userId],
    );
    await insertAmountSale(db, biz, { totalCents: 1850 });
    expect(await balance(biz.customerId)).toBe(6850);

    // Venda paga na hora: venda + pagamento juntos, líquido zero.
    await db.query('begin');
    const paidSale = await insertAmountSale(db, biz, { totalCents: 700, paymentKind: 'PAID_NOW' });
    await payment(700, { saleId: paidSale, source: 'SALE_PAID_NOW' });
    await db.query('commit');
    expect(await balance(biz.customerId)).toBe(6850);

    // Pagamento parcial.
    const partial = await payment(2000);
    expect(await balance(biz.customerId)).toBe(4850);

    // Ajuste de crédito com justificativa.
    await db.query(
      `insert into public.financial_adjustments (id, business_id, customer_id, direction, amount_cents, reason, created_by)
       values ($1, $2, $3, 'CREDIT', 350, 'Coxinha veio fria, desconto', $4)`,
      [randomUUID(), biz.businessId, biz.customerId, biz.owner.userId],
    );
    expect(await balance(biz.customerId)).toBe(4500);

    // Estorno do pagamento parcial devolve a dívida.
    await db.query(
      `update public.payments set status = 'REVERSED', reversed_at = now(), reversed_by = $2, reverse_reason = 'Pix não caiu' where id = $1`,
      [partial, biz.owner.userId],
    );
    expect(await balance(biz.customerId)).toBe(6500);
  });

  it('pagamento registrado não muda e não é apagado', async () => {
    const id = await payment(100);
    await expectDbError(db.query('update public.payments set amount_cents = 1 where id = $1', [id]), /LDR_PAYMENT_IMMUTABLE/);
    await expectDbError(db.query('delete from public.payments where id = $1', [id]), /LDR_DELETE_FORBIDDEN/);
  });

  it('pagamento na hora é do mesmo cliente da venda e é único por venda', async () => {
    const other = randomUUID();
    await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3)', [other, biz.businessId, 'Outro Cliente']);
    const sale = await insertAmountSale(db, biz, { totalCents: 500, paymentKind: 'PAID_NOW' });
    await expectDbError(
      db.query(
        `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, sale_id, received_at, request_hash, created_by)
         values ($1, $2, $3, 500, 'PIX', 'SALE_PAID_NOW', $4, now(), $5, $6)`,
        [randomUUID(), biz.businessId, other, sale, HASH_A, biz.owner.userId],
      ),
      /foreign key/,
    );
    await payment(500, { saleId: sale, source: 'SALE_PAID_NOW' });
    await expectDbError(payment(500, { saleId: sale, source: 'SALE_PAID_NOW' }), /payments_one_per_sale/);
  });

  it('FIFO: pagamentos quitam primeiro as dívidas mais antigas', async () => {
    const f = await setupBusiness(db, 'Fifo');
    const s1 = await insertAmountSale(db, f, { totalCents: 1000, occurredAt: '2026-11-01T12:00:00Z' });
    const s2 = await insertAmountSale(db, f, { totalCents: 1000, occurredAt: '2026-11-02T12:00:00Z' });
    const s3 = await insertAmountSale(db, f, { totalCents: 1000, occurredAt: '2026-11-03T12:00:00Z' });
    await db.query(
      `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, received_at, request_hash, created_by)
       values ($1, $2, $3, 1500, 'CASH', 'MANUAL', now(), $4, $5)`,
      [randomUUID(), f.businessId, f.customerId, HASH_A, f.owner.userId],
    );
    const { rows } = await db.query('select entry_id, open_cents from private.customer_open_debits($1)', [f.customerId]);
    const open = Object.fromEntries(rows.map((r) => [r.entry_id, Number(r.open_cents)]));
    expect(open).toEqual({ [s1]: 0, [s2]: 500, [s3]: 1000 });
    expect(await balance(f.customerId)).toBe(1500);
  });
});

describe('confirmações de compra', () => {
  async function confirmation(saleId: string, type: 'DRAWN_SIGNATURE' | 'ONLINE_CONFIRMATION', status: string, extra: Record<string, unknown> = {}) {
    const id = randomUUID();
    const drawn = type === 'DRAWN_SIGNATURE';
    await db.query(
      `insert into public.sale_confirmations (id, business_id, sale_id, customer_id, confirmation_type, confirmation_status,
         signed_document_hash, consent_text_version, signature_storage_path, signature_file_sha256, signature_size_bytes,
         captured_at, confirmed_by_user_id, dispute_reason)
       values ($1, $2, $3, $4, $5, $6, $7, 'v1', $8, $9, $10, $11, $12, $13)`,
      [
        id,
        a.businessId,
        saleId,
        a.customerId,
        type,
        status,
        HASH_A,
        drawn ? `${a.businessId}/${saleId}/${id}.png` : null,
        drawn ? HASH_A : null,
        drawn ? 2048 : null,
        drawn ? new Date().toISOString() : null,
        drawn ? null : a.owner.userId,
        (extra.dispute_reason as string | undefined) ?? null,
      ],
    );
    return id;
  }

  const saleStatus = async (id: string) =>
    (await db.query('select confirmation_status from public.sales where id = $1', [id])).rows[0].confirmation_status as string;

  it('venda nasce aguardando confirmação e fica assinada com a assinatura', async () => {
    const sale = await insertAmountSale(db, a, { totalCents: 2000 });
    expect(await saleStatus(sale)).toBe('PENDING');
    await confirmation(sale, 'DRAWN_SIGNATURE', 'SIGNED');
    expect(await saleStatus(sale)).toBe('SIGNED');
  });

  it('uma assinatura válida por venda', async () => {
    const sale = await insertAmountSale(db, a, { totalCents: 2000 });
    await confirmation(sale, 'DRAWN_SIGNATURE', 'SIGNED');
    await expectDbError(confirmation(sale, 'DRAWN_SIGNATURE', 'SIGNED'), /sale_confirmations_one_signature/);
  });

  it('assinatura não pode ser de outro cliente nem sem arquivo', async () => {
    const sale = await insertAmountSale(db, a, { totalCents: 2000 });
    await expectDbError(
      db.query(
        `insert into public.sale_confirmations (id, business_id, sale_id, customer_id, confirmation_type, confirmation_status,
           signed_document_hash, consent_text_version)
         values ($1, $2, $3, $4, 'DRAWN_SIGNATURE', 'SIGNED', $5, 'v1')`,
        [randomUUID(), a.businessId, sale, a.customerId, HASH_A],
      ),
      /sale_confirmations_check/,
    );
    await expectDbError(
      db.query(
        `insert into public.sale_confirmations (id, business_id, sale_id, customer_id, confirmation_type, confirmation_status,
           signed_document_hash, consent_text_version, confirmed_by_user_id)
         values ($1, $2, $3, $4, 'ONLINE_CONFIRMATION', 'CONFIRMED_ONLINE', $5, 'v1', $6)`,
        [randomUUID(), a.businessId, sale, b.customerId, HASH_A, a.owner.userId],
      ),
      /foreign key/,
    );
  });

  it('contestação aparece na venda, e a dívida continua', async () => {
    const sale = await insertAmountSale(db, a, { totalCents: 2000 });
    const before = await balance(a.customerId);
    await confirmation(sale, 'ONLINE_CONFIRMATION', 'DISPUTED', { dispute_reason: 'Não comprei isso' });
    expect(await saleStatus(sale)).toBe('DISPUTED');
    expect(await balance(a.customerId)).toBe(before);
  });

  it('cancelar a venda invalida as confirmações', async () => {
    const sale = await insertAmountSale(db, a, { totalCents: 2000 });
    const conf = await confirmation(sale, 'DRAWN_SIGNATURE', 'SIGNED');
    await db.query(
      `update public.sales set status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2, cancel_reason = 'Valor errado' where id = $1`,
      [sale, a.owner.userId],
    );
    expect(await saleStatus(sale)).toBe('CANCELLED');
    const { rows } = await db.query('select confirmation_status, invalidation_reason from public.sale_confirmations where id = $1', [conf]);
    expect(rows[0].confirmation_status).toBe('CANCELLED');
    expect(rows[0].invalidation_reason).toContain('Valor errado');
  });

  it('confirmação gravada não troca de arquivo nem de hash', async () => {
    const sale = await insertAmountSale(db, a, { totalCents: 2000 });
    const conf = await confirmation(sale, 'DRAWN_SIGNATURE', 'SIGNED');
    await expectDbError(
      db.query('update public.sale_confirmations set signature_file_sha256 = $2 where id = $1', [conf, 'b'.repeat(64)]),
      /LDR_CONFIRMATION_IMMUTABLE/,
    );
    await expectDbError(db.query('delete from public.sale_confirmations where id = $1', [conf]), /LDR_DELETE_FORBIDDEN/);
  });
});

describe('resumo canônico: banco e app calculam o mesmo hash', () => {
  async function storeFixture(sale: CanonicalSale): Promise<void> {
    // Mesmos ids do vetor de teste, dentro do negócio A.
    await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3) on conflict do nothing', [
      sale.customerId,
      a.businessId,
      'Cliente do vetor',
    ]);
    await db.query('insert into public.establishments (id, business_id, name) values ($1, $2, $3) on conflict do nothing', [
      sale.establishmentId,
      a.businessId,
      'Estabelecimento do vetor',
    ]);
    for (const item of sale.items) {
      await db.query('insert into public.products (id, business_id, name, price_cents) values ($1, $2, $3, $4) on conflict do nothing', [
        item.productId,
        a.businessId,
        item.productName,
        item.unitPriceCents,
      ]);
    }
    await insertItemsSale(
      { ...a, customerId: sale.customerId, establishmentId: sale.establishmentId },
      [...sale.items],
      sale.totalCents,
      { saleId: sale.saleId, occurredAt: String(sale.occurredAt) },
    );
  }

  it('venda por produtos (com acento)', async () => {
    await storeFixture(ITEMS_SALE);
    const { rows } = await db.query('select private.sale_document_hash($1, $2) as h', [ITEMS_SALE.saleId, 'v1']);
    expect(rows[0].h).toBe(await canonicalSaleHash(ITEMS_SALE, 'v1'));
  });

  it('venda por valor direto (com travessão e acento)', async () => {
    const saleId = await insertAmountSale(db, a, {
      totalCents: 1850,
      occurredAt: '2026-11-22T20:10:00.000Z',
      description: 'Lanches da tarde — pão de queijo',
    });
    const expected = await canonicalSaleHash(
      {
        saleId,
        customerId: a.customerId,
        establishmentId: a.establishmentId,
        occurredAt: '2026-11-22T20:10:00.000Z',
        mode: 'AMOUNT',
        items: [],
        description: 'Lanches da tarde — pão de queijo',
        totalCents: 1850,
      },
      'v1',
    );
    const { data, error } = await a.owner.client.rpc('sale_document_hash', { p_sale: saleId, p_terms: 'v1' });
    expect(error).toBeNull();
    expect(data).toBe(expected);
  });

  it('só a equipe do negócio e o próprio cliente consultam o hash', async () => {
    const saleId = await insertAmountSale(db, a, { totalCents: 990 });
    const owner = await a.owner.client.rpc('sale_document_hash', { p_sale: saleId, p_terms: 'v1' });
    expect(owner.error).toBeNull();
    const customer = await linkCustomerAccount(db, a.customerId, 'ClienteHash');
    const own = await customer.client.rpc('sale_document_hash', { p_sale: saleId, p_terms: 'v1' });
    expect(own.data).toBe(owner.data);

    // Dona de outro negócio, conta sem vínculo e cliente de outro negócio: recusados.
    const stranger = await signUp('SemVinculo');
    const otherCustomer = await linkCustomerAccount(db, b.customerId, 'ClienteOutroNegocio');
    for (const client of [b.owner.client, stranger.client, otherCustomer.client]) {
      const { data, error } = await client.rpc('sale_document_hash', { p_sale: saleId, p_terms: 'v1' });
      expect(data).toBeNull();
      expect(error?.message).toMatch(/LDR_NOT_ALLOWED/);
    }
  });

  it('termo desconhecido é recusado', async () => {
    const unknown = await a.owner.client.rpc('sale_document_hash', { p_sale: ITEMS_SALE.saleId, p_terms: 'v9' });
    expect(unknown.error?.message).toMatch(/LDR_UNKNOWN_TERMS/);
  });
});
