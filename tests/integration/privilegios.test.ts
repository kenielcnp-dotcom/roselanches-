import type pg from 'pg';
import { dbConnect } from './helpers';

// Matriz de quem executa cada função. Qualquer função nova precisa entrar aqui
// de propósito: o teste falha se uma função aparecer sem decisão explícita.
const AUTHENTICATED_RPCS = [
  'cancel_entry',
  'cancel_sale',
  'confirm_payment_notification',
  'create_adjustment',
  'create_opening_balance',
  'create_sale',
  'customer_statement',
  'dashboard_summary',
  'register_payment',
  'reject_payment_notification',
  'reverse_payment',
  'sale_document_hash',
  'save_customer',
  'whoami',
];
const SERVICE_ONLY_RPCS = ['signature_finalize', 'signature_prepare'];
// Auxiliares usados pelas políticas de RLS (rodam com o papel de quem consulta).
const PRIVATE_FOR_RLS = ['current_customer_id', 'is_owner', 'is_staff', 'my_business_id', 'signature_visible_to_customer', 'try_uuid'];

let db: pg.Client;

beforeAll(async () => {
  db = await dbConnect();
});
afterAll(async () => {
  await db.end();
});

async function matrix(schema: string): Promise<Map<string, { anon: boolean; auth: boolean }>> {
  const { rows } = await db.query(
    `select p.proname as name,
            bool_or(has_function_privilege('anon', p.oid, 'execute')) as anon,
            bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = $1
      group by p.proname`,
    [schema],
  );
  return new Map(rows.map((r: { name: string; anon: boolean; auth: boolean }) => [r.name, { anon: r.anon, auth: r.auth }]));
}

describe('privilégios de funções', () => {
  it('anon não executa NENHUMA função do app (public e private)', async () => {
    for (const schema of ['public', 'private']) {
      const open = [...(await matrix(schema)).entries()].filter(([, v]) => v.anon).map(([k]) => k);
      expect(open, schema).toEqual([]);
    }
  });

  it('cada RPC pública tem decisão explícita: logado ou só servidor', async () => {
    const m = await matrix('public');
    expect([...m.keys()].sort()).toEqual([...AUTHENTICATED_RPCS, ...SERVICE_ONLY_RPCS].sort());
    for (const name of AUTHENTICATED_RPCS) expect(m.get(name)?.auth, name).toBe(true);
    for (const name of SERVICE_ONLY_RPCS) expect(m.get(name)?.auth, name).toBe(false);
  });

  it('no schema privado, logado só executa os auxiliares das políticas de RLS', async () => {
    const m = await matrix('private');
    const allowed = [...m.entries()].filter(([, v]) => v.auth).map(([k]) => k).sort();
    expect(allowed).toEqual(PRIVATE_FOR_RLS);
  });

  it('função criada no futuro nasce sem acesso para anon', async () => {
    await db.query('begin');
    try {
      await db.query('create function public.ldr_teste_privilegio() returns int language sql as $$ select 1 $$');
      const { rows } = await db.query(
        `select has_function_privilege('anon', 'public.ldr_teste_privilegio()', 'execute') as anon,
                has_function_privilege('authenticated', 'public.ldr_teste_privilegio()', 'execute') as auth`,
      );
      expect(rows[0]).toEqual({ anon: false, auth: false });
    } finally {
      await db.query('rollback');
    }
  });
});
