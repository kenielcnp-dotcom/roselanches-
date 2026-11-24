import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { inject } from 'vitest';
import type { Client } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';

export const PASSWORD = 'SenhaForte123';

export function newClient(): Client {
  return createClient<Database>(inject('supabaseUrl'), inject('anonKey'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** Cliente de serviço SÓ para preparar cenários (ignora RLS). */
export function serviceClient(): Client {
  return createClient<Database>(inject('supabaseUrl'), inject('serviceKey'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Conexão direta como postgres (dona das tabelas). Simula o que as RPCs
 * SECURITY DEFINER fazem e permite testar restrições dentro de transações.
 */
export async function dbConnect(): Promise<pg.Client> {
  const db = new pg.Client({ connectionString: inject('dbUrl') });
  await db.connect();
  return db;
}

export interface TestUser {
  client: Client;
  userId: string;
  email: string;
}

let counter = 0;
export async function signUp(name: string): Promise<TestUser> {
  const client = newClient();
  counter += 1;
  const email = `${name.toLowerCase()}-${Date.now()}-${counter}-${Math.random().toString(36).slice(2, 7)}@teste.local`;
  const { data, error } = await client.auth.signUp({ email, password: PASSWORD, options: { data: { display_name: name } } });
  if (error) throw error;
  if (!data.session || !data.user) throw new Error('Cadastro local deveria entrar direto (confirmação desligada no config.toml).');
  return { client, userId: data.user.id, email };
}

export interface TestBusiness {
  businessId: string;
  owner: TestUser;
  establishmentId: string;
  customerId: string;
  productId: string;
}

/** Negócio com dona, um estabelecimento, um cliente e um produto. */
export async function setupBusiness(db: pg.Client, label: string): Promise<TestBusiness> {
  const owner = await signUp(`Dona${label}`);
  const businessId = randomUUID();
  const establishmentId = randomUUID();
  const customerId = randomUUID();
  const productId = randomUUID();
  await db.query('insert into public.businesses (id, name) values ($1, $2)', [businessId, `Negócio de teste ${label}`]);
  await db.query(`insert into public.business_members (business_id, user_id, role) values ($1, $2, 'OWNER')`, [
    businessId,
    owner.userId,
  ]);
  await db.query('insert into public.establishments (id, business_id, name) values ($1, $2, $3)', [
    establishmentId,
    businessId,
    `Mercado ${label}`,
  ]);
  await db.query('insert into public.customers (id, business_id, full_name, phone_e164) values ($1, $2, $3, $4)', [
    customerId,
    businessId,
    `Cliente ${label}`,
    '+5511987654321',
  ]);
  await db.query('insert into public.products (id, business_id, name, price_cents) values ($1, $2, $3, 650)', [
    productId,
    businessId,
    `Coxinha ${label}`,
  ]);
  return { businessId, owner, establishmentId, customerId, productId };
}

/** Conta do portal ligada a um cliente (o que a RPC de convite fará). */
export async function linkCustomerAccount(db: pg.Client, customerId: string, name: string): Promise<TestUser> {
  const user = await signUp(name);
  await db.query('update public.customers set auth_user_id = $1, linked_at = now() where id = $2', [user.userId, customerId]);
  return user;
}

export const HASH_A = 'a'.repeat(64);

/** Venda por valor direto gravada como a RPC fará (sem itens). */
export async function insertAmountSale(
  db: pg.Client,
  b: Pick<TestBusiness, 'businessId' | 'customerId' | 'establishmentId' | 'owner'>,
  opts: { totalCents: number; occurredAt?: string; paymentKind?: 'CREDIT' | 'PAID_NOW'; description?: string } ,
): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into public.sales (id, business_id, customer_id, establishment_id, mode, period, description,
       total_cents, payment_kind, occurred_at, request_hash, created_by)
     values ($1, $2, $3, $4, 'AMOUNT', 'AFTERNOON', $5, $6, $7, $8, $9, $10)`,
    [
      id,
      b.businessId,
      b.customerId,
      b.establishmentId,
      opts.description ?? 'Lanches da tarde',
      opts.totalCents,
      opts.paymentKind ?? 'CREDIT',
      opts.occurredAt ?? new Date().toISOString(),
      HASH_A,
      b.owner.userId,
    ],
  );
  return id;
}

export async function expectDbError(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!pattern.test(msg)) throw new Error(`Erro inesperado: ${msg}`, { cause: e });
    return;
  }
  throw new Error('Era esperado que a operação fosse recusada, mas ela passou.');
}
