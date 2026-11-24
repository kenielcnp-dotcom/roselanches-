import type { SupabaseClient } from '@supabase/supabase-js';
import type pg from 'pg';
import type { Client } from '@/lib/supabase/client';
import { dbConnect, insertAmountSale, linkCustomerAccount, newClient, setupBusiness, signUp, type TestBusiness, type TestUser } from './helpers';

// Todas as tabelas e views expostas pela API.
const TABLES = [
  'businesses',
  'profiles',
  'business_members',
  'business_settings',
  'establishments',
  'customers',
  'customer_establishments',
  'products',
  'customer_invites',
  'sales',
  'sale_items',
  'payment_notifications',
  'payments',
  'opening_balances',
  'financial_adjustments',
  'sale_confirmations',
  'audit_logs',
  'customer_ledger',
  'customer_balances',
] as const;

// customer_invites só tem SELECT por coluna (o hash do token fica de fora).
const cols = (table: string) => (table === 'customer_invites' ? 'id' : '*');
// Percorre tabelas e views pelo nome (sem a tipagem gerada, que separa os dois).
const from = (c: Client, table: string) => (c as unknown as SupabaseClient).from(table);

let db: pg.Client;
let a: TestBusiness;
let b: TestBusiness;
let stranger: TestUser;
let customerA: TestUser;

beforeAll(async () => {
  db = await dbConnect();
  a = await setupBusiness(db, 'A');
  b = await setupBusiness(db, 'B');
  stranger = await signUp('Estranho');
  customerA = await linkCustomerAccount(db, a.customerId, 'ClienteA');
  await insertAmountSale(db, a, { totalCents: 1850 });
  await insertAmountSale(db, b, { totalCents: 990 });
});

afterAll(async () => {
  await db.end();
});

describe('usuário não autenticado', () => {
  it.each(TABLES)('não lê %s', async (table) => {
    const { data, error } = await from(newClient(), table).select(cols(table)).limit(1);
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it('não chama RPCs', async () => {
    const { error } = await newClient().rpc('whoami');
    expect(error).not.toBeNull();
  });
});

describe('conta sem vínculo com negócio nem cliente', () => {
  it.each(TABLES.filter((t) => t !== 'profiles'))('não vê nada em %s', async (table) => {
    const { data, error } = await from(stranger.client, table).select(cols(table));
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('whoami diz que não é equipe nem cliente', async () => {
    const { data } = await stranger.client.rpc('whoami');
    expect(data).toMatchObject({ user_id: stranger.userId, staff: null, customer: null });
  });

  it('não cadastra nada em negócio nenhum', async () => {
    const { error } = await stranger.client.from('establishments').insert({ name: 'Invasão' });
    expect(error).not.toBeNull();
  });
});

describe('isolamento entre negócios', () => {
  it('a dona vê só o próprio negócio', async () => {
    for (const table of ['establishments', 'customers', 'products', 'sales'] as const) {
      const { data, error } = await a.owner.client.from(table).select('business_id');
      expect(error).toBeNull();
      expect(data!.length).toBeGreaterThan(0);
      expect(data!.every((r) => r.business_id === a.businessId)).toBe(true);
    }
  });

  it('whoami identifica a dona', async () => {
    const { data } = await a.owner.client.rpc('whoami');
    expect(data).toMatchObject({ staff: { business_id: a.businessId, role: 'OWNER' }, customer: null });
  });

  it('cadastro novo cai sempre no negócio de quem cadastra', async () => {
    const { data, error } = await a.owner.client.from('establishments').insert({ name: 'Oficina do Teste' }).select().single();
    expect(error).toBeNull();
    expect(data).toMatchObject({ business_id: a.businessId, created_by: a.owner.userId });
  });

  it('não dá para escolher o negócio nem o autor ao cadastrar', async () => {
    const forged = await a.owner.client
      .from('customers')
      .insert({ full_name: 'Forjado', business_id: b.businessId } as never);
    expect(forged.error).not.toBeNull();
    const author = await a.owner.client.from('products').insert({ name: 'Pastel', price_cents: 800, created_by: b.owner.userId } as never);
    expect(author.error).not.toBeNull();
  });

  it('não vincula cliente de outro negócio, mesmo sabendo o id', async () => {
    const { error } = await a.owner.client
      .from('customer_establishments')
      .insert({ customer_id: b.customerId, establishment_id: a.establishmentId });
    expect(error).not.toBeNull();
  });

  it('não altera cadastro de outro negócio', async () => {
    const { data } = await a.owner.client.from('customers').update({ notes: 'mexido' }).eq('id', b.customerId).select();
    expect(data).toEqual([]);
    const { rows } = await db.query('select notes from public.customers where id = $1', [b.customerId]);
    expect(rows[0].notes).toBeNull();
  });

  it('vínculo cliente-estabelecimento não duplica', async () => {
    const first = await a.owner.client
      .from('customer_establishments')
      .insert({ customer_id: a.customerId, establishment_id: a.establishmentId });
    expect(first.error).toBeNull();
    const again = await a.owner.client
      .from('customer_establishments')
      .insert({ customer_id: a.customerId, establishment_id: a.establishmentId });
    expect(again.error?.code).toBe('23505');
  });

  it('a dona não escreve vendas nem pagamentos direto nas tabelas', async () => {
    const sale = await a.owner.client.from('sales').insert({} as never);
    expect(sale.error).not.toBeNull();
    const payment = await a.owner.client.from('payments').insert({} as never);
    expect(payment.error).not.toBeNull();
    const upd = await a.owner.client.from('sales').update({ total_cents: 1 } as never).eq('business_id', a.businessId);
    expect(upd.error).not.toBeNull();
  });

  it('cadastros não são apagados', async () => {
    const { error } = await a.owner.client.from('customers').delete().eq('id', a.customerId);
    expect(error).not.toBeNull();
  });

  it('não muda o vínculo de conta do portal pelo app', async () => {
    const { error } = await a.owner.client
      .from('customers')
      .update({ auth_user_id: stranger.userId } as never)
      .eq('id', a.customerId);
    expect(error).not.toBeNull();
  });

  it('não lê o hash dos tokens de convite', async () => {
    const { error } = await a.owner.client.from('customer_invites').select('token_hash');
    expect(error).not.toBeNull();
  });
});

describe('cliente do portal', () => {
  it('whoami identifica o cliente', async () => {
    const { data } = await customerA.client.rpc('whoami');
    expect(data).toMatchObject({ staff: null, customer: { customer_id: a.customerId } });
  });

  it.each(TABLES.filter((t) => t !== 'profiles'))('não lê a tabela %s diretamente', async (table) => {
    const { data, error } = await from(customerA.client, table).select(cols(table));
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('não cria vendas nem altera o próprio cadastro', async () => {
    const sale = await customerA.client.from('sales').insert({} as never);
    expect(sale.error).not.toBeNull();
    const { data } = await customerA.client.from('customers').update({ full_name: 'Outro nome' }).eq('id', a.customerId).select();
    expect(data).toEqual([]);
  });
});

describe('auditoria', () => {
  it('registra os cadastros e só a dona lê', async () => {
    const { data, error } = await a.owner.client.from('audit_logs').select('entity, action').eq('entity', 'establishments');
    expect(error).toBeNull();
    expect(data!.some((r) => r.action === 'INSERT')).toBe(true);
    const fromB = await b.owner.client.from('audit_logs').select('id').eq('business_id', a.businessId);
    expect(fromB.data).toEqual([]);
  });

  it('ninguém altera nem apaga a auditoria, nem com acesso total ao banco', async () => {
    const ins = await a.owner.client.from('audit_logs').insert({} as never);
    expect(ins.error).not.toBeNull();
    await expect(db.query('update public.audit_logs set action = $1 where business_id = $2', ['X', a.businessId])).rejects.toThrow(
      /LDR_AUDIT_IMMUTABLE/,
    );
    await expect(db.query('delete from public.audit_logs where business_id = $1', [a.businessId])).rejects.toThrow(
      /LDR_AUDIT_IMMUTABLE/,
    );
  });
});
