import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { BRAZIL_TIME_ZONES } from '@/domain/timezone';
import {
  dbConnect,
  expectDbError,
  insertAmountSale,
  linkCustomerAccount,
  newClient,
  setupBusiness,
  signUp,
  type TestBusiness,
  type TestUser,
} from './helpers';

let db: pg.Client;
let a: TestBusiness;
let b: TestBusiness;
let portalA: TestUser;

beforeAll(async () => {
  db = await dbConnect();
  a = await setupBusiness(db, 'OpA');
  b = await setupBusiness(db, 'OpB');
  portalA = await linkCustomerAccount(db, a.customerId, 'PortalOpA');
});

afterAll(async () => {
  await db.end();
});

async function newCustomer(biz: TestBusiness, name: string): Promise<string> {
  const id = randomUUID();
  await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3)', [id, biz.businessId, name]);
  return id;
}

async function setTimezone(biz: TestBusiness, tz: string): Promise<void> {
  await db.query('update public.business_settings set timezone = $1 where business_id = $2', [tz, biz.businessId]);
}

describe('fuso do negócio', () => {
  it('padrão é Brasília e whoami informa o fuso para a equipe e para o cliente', async () => {
    const { data: staff } = await a.owner.client.rpc('whoami');
    expect((staff as { staff: { timezone: string } }).staff.timezone).toBe('America/Sao_Paulo');
    const { data: customer } = await portalA.client.rpc('whoami');
    expect((customer as { customer: { timezone: string } }).customer.timezone).toBe('America/Sao_Paulo');
  });

  it('aceita todos os fusos da lista do app e recusa outros', async () => {
    for (const { id } of BRAZIL_TIME_ZONES) {
      const { error } = await a.owner.client.from('business_settings').update({ timezone: id }).eq('business_id', a.businessId);
      expect(error, id).toBeNull();
    }
    const { error } = await a.owner.client
      .from('business_settings')
      .update({ timezone: 'Europe/Lisbon' })
      .eq('business_id', a.businessId);
    expect(error?.code).toBe('23514');
    await setTimezone(a, 'America/Sao_Paulo');
  });

  it('cliente do portal e outro negócio não alteram o fuso', async () => {
    await portalA.client.from('business_settings').update({ timezone: 'America/Manaus' }).eq('business_id', a.businessId);
    await b.owner.client.from('business_settings').update({ timezone: 'America/Manaus' }).eq('business_id', a.businessId);
    const { rows } = await db.query('select timezone from public.business_settings where business_id = $1', [a.businessId]);
    expect(rows[0].timezone).toBe('America/Sao_Paulo');
  });

  it('bootstrap_owner grava o fuso e não é executável pelo app', async () => {
    const rose = await signUp('RoseBoot');
    const { rows } = await db.query('select private.bootstrap_owner($1, $2, $3) as id', [rose.email, 'Lanches Boot', 'America/Cuiaba']);
    const { rows: s } = await db.query('select timezone from public.business_settings where business_id = $1', [rows[0].id]);
    expect(s[0].timezone).toBe('America/Cuiaba');

    // Nem quem está logado pelo app consegue executar (só o papel postgres, no painel).
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await expectDbError(db.query("select private.bootstrap_owner('x@teste.local', 'Intruso')"), /permission denied/);
    } finally {
      await db.query('rollback');
    }
  });
});

describe('painel (dashboard_summary)', () => {
  let biz: TestBusiness;

  beforeAll(async () => {
    biz = await setupBusiness(db, 'Painel');
  });

  it('negócio sem lançamentos mostra zeros', async () => {
    const { data, error } = await biz.owner.client.rpc('dashboard_summary');
    expect(error).toBeNull();
    expect(data).toMatchObject({
      receivable_cents: 0,
      customers_with_balance: 0,
      today_sales_count: 0,
      today_sales_cents: 0,
      timezone: 'America/Sao_Paulo',
    });
  });

  it('soma só saldos positivos e conta vendas de hoje (fiadas e pagas na hora)', async () => {
    const devedor = { ...biz, customerId: await newCustomer(biz, 'Devedor Painel') };
    const comCredito = { ...biz, customerId: await newCustomer(biz, 'Credor Painel') };

    await insertAmountSale(db, devedor, { totalCents: 1850 });
    await insertAmountSale(db, devedor, { totalCents: 1000 });
    // Venda de ontem: entra no saldo, não em "vendas de hoje".
    await insertAmountSale(db, devedor, { totalCents: 500, occurredAt: new Date(Date.now() - 36 * 3600_000).toISOString() });
    // Cliente com crédito (pagou adiantado): não abate o total a receber.
    await db.query(
      `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, received_at, request_hash, created_by)
       values ($1, $2, $3, 700, 'CASH', 'MANUAL', now(), $4, $5)`,
      [randomUUID(), biz.businessId, comCredito.customerId, 'b'.repeat(64), biz.owner.userId],
    );
    // Venda cancelada não conta em nada.
    const cancelada = await insertAmountSale(db, devedor, { totalCents: 9999 });
    await db.query(
      `update public.sales set status = 'CANCELLED', cancelled_at = now(), cancelled_by = $2, cancel_reason = 'Registro errado'
       where id = $1`,
      [cancelada, biz.owner.userId],
    );

    const { data } = await biz.owner.client.rpc('dashboard_summary');
    expect(data).toMatchObject({
      receivable_cents: 1850 + 1000 + 500,
      customers_with_balance: 1,
      today_sales_count: 2,
      today_sales_cents: 2850,
      today_credit_cents: 2850,
    });
  });

  it('"hoje" segue o fuso do negócio', async () => {
    const tzBiz = await setupBusiness(db, 'Fuso');
    await setTimezone(tzBiz, 'America/Cuiaba');
    // 23:30 de ontem em Cuiabá (UTC−4) = 00:30 de hoje em Brasília (UTC−3).
    const { rows } = await db.query(
      `select (date_trunc('day', now() at time zone 'America/Cuiaba') - interval '30 minutes') at time zone 'America/Cuiaba' as t,
              extract(hour from now() at time zone 'America/Cuiaba')::int as hora_cuiaba`,
    );
    await insertAmountSale(db, tzBiz, { totalCents: 800, occurredAt: (rows[0].t as Date).toISOString() });

    const { data: cuiaba } = await tzBiz.owner.client.rpc('dashboard_summary');
    expect(cuiaba).toMatchObject({ today_sales_count: 0, receivable_cents: 800, timezone: 'America/Cuiaba' });

    // Entre 23h e meia-noite de Cuiabá, Brasília já está no dia seguinte.
    if (rows[0].hora_cuiaba < 23) {
      await setTimezone(tzBiz, 'America/Sao_Paulo');
      const { data: brasilia } = await tzBiz.owner.client.rpc('dashboard_summary');
      expect(brasilia).toMatchObject({ today_sales_count: 1, today_sales_cents: 800 });
    }
  });

  it('anônimo, conta sem negócio e cliente do portal não acessam', async () => {
    const anon = await newClient().rpc('dashboard_summary');
    expect(anon.error).not.toBeNull();
    const outsider = await signUp('SemNegocio');
    const o = await outsider.client.rpc('dashboard_summary');
    expect(o.error?.message).toMatch(/LDR_NOT_ALLOWED/);
    const p = await portalA.client.rpc('dashboard_summary');
    expect(p.error?.message).toMatch(/LDR_NOT_ALLOWED/);
  });
});

describe('visões dos cadastros', () => {
  it('estabelecimento conta só clientes ativos vinculados', async () => {
    const biz = await setupBusiness(db, 'Visao');
    const ativo = await newCustomer(biz, 'Ativo Visao');
    const inativo = await newCustomer(biz, 'Inativo Visao');
    await db.query('update public.customers set is_active = false where id = $1', [inativo]);
    for (const c of [ativo, inativo]) {
      await db.query('insert into public.customer_establishments (business_id, customer_id, establishment_id) values ($1, $2, $3)', [
        biz.businessId,
        c,
        biz.establishmentId,
      ]);
    }
    const { data } = await biz.owner.client.from('establishment_overview').select('id, customer_count').eq('id', biz.establishmentId).single();
    expect(data?.customer_count).toBe(1);
  });

  it('cliente traz saldo e estabelecimentos', async () => {
    const biz = await setupBusiness(db, 'VisaoCli');
    await db.query('insert into public.customer_establishments (business_id, customer_id, establishment_id) values ($1, $2, $3)', [
      biz.businessId,
      biz.customerId,
      biz.establishmentId,
    ]);
    await insertAmountSale(db, biz, { totalCents: 2000 });
    const { data } = await biz.owner.client.from('customer_overview').select('*').eq('id', biz.customerId).single();
    expect(data).toMatchObject({ balance_cents: 2000, establishment_ids: [biz.establishmentId], portal_linked: false });
    expect(data?.last_sale_at).not.toBeNull();
  });

  it('produto traz unidades vendidas nos últimos 90 dias', async () => {
    const biz = await setupBusiness(db, 'VisaoProd');
    const saleId = randomUUID();
    await db.query('begin');
    await db.query(
      `insert into public.sales (id, business_id, customer_id, establishment_id, mode, period, total_cents, payment_kind,
         occurred_at, request_hash, created_by)
       values ($1, $2, $3, $4, 'ITEMS', 'MORNING', 1950, 'CREDIT', now(), $5, $6)`,
      [saleId, biz.businessId, biz.customerId, biz.establishmentId, 'c'.repeat(64), biz.owner.userId],
    );
    await db.query(
      `insert into public.sale_items (business_id, sale_id, position, product_id, product_name, quantity, unit_price_cents, subtotal_cents)
       values ($1, $2, 1, $3, 'Coxinha', 3, 650, 1950)`,
      [biz.businessId, saleId, biz.productId],
    );
    await db.query('commit');
    const { data } = await biz.owner.client.from('product_overview').select('units_90d, last_sold_at').eq('id', biz.productId).single();
    expect(data?.units_90d).toBe(3);
  });

  it('isolamento: outro negócio, cliente do portal e anônimo não veem nada', async () => {
    for (const view of ['establishment_overview', 'customer_overview', 'product_overview'] as const) {
      const other = await b.owner.client.from(view).select('id').eq('business_id', a.businessId);
      expect(other.data, view).toEqual([]);
      const portal = await portalA.client.from(view).select('id');
      expect(portal.data, view).toEqual([]);
      const anon = await newClient().from(view).select('id');
      expect(anon.data ?? [], view).toEqual([]);
    }
  });
});

describe('save_customer (cliente + estabelecimentos numa transação)', () => {
  let biz: TestBusiness;
  let segundoLocal: string;

  beforeAll(async () => {
    biz = await setupBusiness(db, 'Save');
    segundoLocal = randomUUID();
    await db.query('insert into public.establishments (id, business_id, name) values ($1, $2, $3)', [
      segundoLocal,
      biz.businessId,
      'Oficina Save',
    ]);
  });

  async function links(customerId: string): Promise<string[]> {
    const { rows } = await db.query('select establishment_id from public.customer_establishments where customer_id = $1 order by 1', [
      customerId,
    ]);
    return rows.map((r: { establishment_id: string }) => r.establishment_id);
  }

  it('cria o cliente já vinculado a vários estabelecimentos', async () => {
    const id = randomUUID();
    const { data, error } = await biz.owner.client.rpc('save_customer', {
      p_id: id,
      p_full_name: '  João Pereira  ',
      p_phone_e164: '+5565999887766',
      p_notes: '',
      p_is_active: true,
      p_establishment_ids: [biz.establishmentId, segundoLocal],
    });
    expect(error).toBeNull();
    expect(data).toBe(id);
    const { rows } = await db.query('select full_name, phone_e164, notes, business_id, created_by from public.customers where id = $1', [id]);
    expect(rows[0]).toMatchObject({
      full_name: 'João Pereira',
      phone_e164: '+5565999887766',
      notes: null,
      business_id: biz.businessId,
      created_by: biz.owner.userId,
    });
    expect(await links(id)).toEqual([biz.establishmentId, segundoLocal].sort());
  });

  it('repetir a chamada não duplica nada e editar troca os vínculos', async () => {
    const id = randomUUID();
    const args = {
      p_id: id,
      p_full_name: 'Ana Souza',
      p_phone_e164: '',
      p_notes: 'Paga sexta',
      p_is_active: true,
      p_establishment_ids: [biz.establishmentId, biz.establishmentId],
    };
    await biz.owner.client.rpc('save_customer', args);
    await biz.owner.client.rpc('save_customer', args);
    const { rows } = await db.query('select count(*)::int as n from public.customers where id = $1', [id]);
    expect(rows[0].n).toBe(1);
    expect(await links(id)).toEqual([biz.establishmentId]);

    await biz.owner.client.rpc('save_customer', { ...args, p_full_name: 'Ana Souza Lima', p_establishment_ids: [segundoLocal] });
    expect(await links(id)).toEqual([segundoLocal]);
    const { rows: c } = await db.query('select full_name, phone_e164 from public.customers where id = $1', [id]);
    expect(c[0]).toMatchObject({ full_name: 'Ana Souza Lima', phone_e164: null });
  });

  it('remover um vínculo não mexe nas vendas daquele local', async () => {
    const id = randomUUID();
    await biz.owner.client.rpc('save_customer', {
      p_id: id,
      p_full_name: 'Carlos Mendes',
      p_phone_e164: '',
      p_notes: '',
      p_is_active: true,
      p_establishment_ids: [biz.establishmentId],
    });
    const saleId = await insertAmountSale(db, { ...biz, customerId: id }, { totalCents: 1500 });
    await biz.owner.client.rpc('save_customer', {
      p_id: id,
      p_full_name: 'Carlos Mendes',
      p_phone_e164: '',
      p_notes: '',
      p_is_active: true,
      p_establishment_ids: [segundoLocal],
    });
    const { rows } = await db.query('select establishment_id from public.sales where id = $1', [saleId]);
    expect(rows[0].establishment_id).toBe(biz.establishmentId);
  });

  it('telefone inválido desfaz tudo (nem cliente nem vínculos)', async () => {
    const id = randomUUID();
    const { error } = await biz.owner.client.rpc('save_customer', {
      p_id: id,
      p_full_name: 'Telefone Ruim',
      p_phone_e164: '+55119876',
      p_notes: '',
      p_is_active: true,
      p_establishment_ids: [biz.establishmentId],
    });
    expect(error?.code).toBe('23514');
    const { rows } = await db.query('select count(*)::int as n from public.customers where id = $1', [id]);
    expect(rows[0].n).toBe(0);
  });

  it('estabelecimento de outro negócio é recusado e nada é gravado', async () => {
    const id = randomUUID();
    const { error } = await biz.owner.client.rpc('save_customer', {
      p_id: id,
      p_full_name: 'Vínculo Cruzado',
      p_phone_e164: '',
      p_notes: '',
      p_is_active: true,
      p_establishment_ids: [b.establishmentId],
    });
    expect(error?.code).toBe('23503');
    const { rows } = await db.query('select count(*)::int as n from public.customers where id = $1', [id]);
    expect(rows[0].n).toBe(0);
  });

  it('não sobrescreve cliente de outro negócio usando o mesmo id', async () => {
    const { error } = await biz.owner.client.rpc('save_customer', {
      p_id: b.customerId,
      p_full_name: 'Sequestro',
      p_phone_e164: '',
      p_notes: '',
      p_is_active: true,
      p_establishment_ids: [],
    });
    expect(error).not.toBeNull();
    const { rows } = await db.query('select full_name, business_id from public.customers where id = $1', [b.customerId]);
    expect(rows[0]).toMatchObject({ full_name: 'Cliente OpB', business_id: b.businessId });
  });

  it('cliente do portal e conta sem negócio não usam', async () => {
    for (const who of [portalA, await signUp('SemNegocioSave')]) {
      const { error } = await who.client.rpc('save_customer', {
        p_id: randomUUID(),
        p_full_name: 'Não Pode',
        p_phone_e164: '',
        p_notes: '',
        p_is_active: true,
        p_establishment_ids: [],
      });
      expect(error?.message).toMatch(/LDR_NOT_ALLOWED/);
    }
  });

  it('vínculo duplicado direto na tabela é recusado', async () => {
    await expectDbError(
      (async () => {
        for (let i = 0; i < 2; i += 1) {
          await db.query('insert into public.customer_establishments (business_id, customer_id, establishment_id) values ($1, $2, $3)', [
            biz.businessId,
            biz.customerId,
            segundoLocal,
          ]);
        }
      })(),
      /duplicate key|customer_establishments_business_id_customer_id_establishment_id_key/,
    );
  });
});
