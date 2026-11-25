// Cria dados de DESENVOLVIMENTO no Supabase LOCAL (nunca na nuvem):
//   rose@teste.local    / SenhaForte123  → dona do "Lanches da Rose (teste)"
//   cliente@teste.local / SenhaForte123  → conta do portal ligada a "Maria Silva"
//   vendedor@teste.local / SenhaForte123 → vendedor (OPERATOR) do mesmo negócio
// Pode rodar várias vezes: o que já existe é reaproveitado.
//
//   npm run db:seed-dev
import { execSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const status = JSON.parse(
  (() => {
    const out = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    return out.slice(out.indexOf('{'));
  })(),
);
const url = status.API_URL;
const serviceKey = status.SECRET_KEY || status.SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Supabase local não está rodando. Rode "npm run db:start".');
if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) throw new Error(`Recusado: ${url} não é o Supabase local.`);

const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const PASSWORD = 'SenhaForte123';

async function ensureUser(email, displayName) {
  const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const found = list.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await db.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  if (error) throw error;
  return data.user.id;
}

async function one(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

const roseId = await ensureUser('rose@teste.local', 'Rose');
const clientUserId = await ensureUser('cliente@teste.local', 'Maria');
const sellerId = await ensureUser('vendedor@teste.local', 'Zeca');

let member = await one(db.from('business_members').select('business_id').eq('user_id', roseId).maybeSingle());
if (!member) {
  const business = await one(db.from('businesses').insert({ name: 'Lanches da Rose (teste)' }).select('id').single());
  await one(db.from('business_members').insert({ business_id: business.id, user_id: roseId, role: 'OWNER' }));
  member = { business_id: business.id };
}
const businessId = member.business_id;

const sellerMember = await one(db.from('business_members').select('id').eq('user_id', sellerId).maybeSingle());
if (!sellerMember) {
  await one(db.from('business_members').insert({ business_id: businessId, user_id: sellerId, role: 'OPERATOR' }));
}

async function ensure(table, match, values) {
  const existing = await one(db.from(table).select('id').match({ business_id: businessId, ...match }).maybeSingle());
  if (existing) return existing.id;
  const created = await one(db.from(table).insert({ business_id: businessId, ...match, ...values }).select('id').single());
  return created.id;
}

const establishments = {
  mercado: await ensure('establishments', { name: 'Mercado Central' }, { nickname: 'Mercado' }),
  oficina: await ensure('establishments', { name: 'Oficina do João' }, { nickname: 'Oficina' }),
  prefeitura: await ensure('establishments', { name: 'Prefeitura' }, {}),
};

for (const [name, price_cents, category] of [
  ['Coxinha', 650, 'Salgados'],
  ['Pastel de carne', 700, 'Salgados'],
  ['Pão de queijo', 400, 'Salgados'],
  ['Suco de laranja', 600, 'Bebidas'],
  ['Café', 300, 'Bebidas'],
]) {
  await ensure('products', { name }, { price_cents, category });
}

const people = [
  ['Maria Silva', '+5511987654321', ['mercado']],
  ['João Pereira', '+5511976543210', ['mercado', 'oficina']],
  ['Ana Souza', '+5511965432109', ['mercado']],
  ['Carlos Mendes', '+5511954321098', ['oficina']],
  ['Fernanda Alves', '+5511943210987', ['prefeitura']],
];
for (const [full_name, phone_e164, places] of people) {
  const customerId = await ensure('customers', { full_name }, { phone_e164 });
  for (const place of places) {
    const link = await one(
      db.from('customer_establishments').select('id').match({ customer_id: customerId, establishment_id: establishments[place] }).maybeSingle(),
    );
    if (!link) {
      await one(
        db.from('customer_establishments').insert({ business_id: businessId, customer_id: customerId, establishment_id: establishments[place] }),
      );
    }
  }
}

const maria = await one(db.from('customers').select('id, auth_user_id').match({ business_id: businessId, full_name: 'Maria Silva' }).single());
if (!maria.auth_user_id) {
  await one(db.from('customers').update({ auth_user_id: clientUserId, linked_at: new Date().toISOString() }).eq('id', maria.id));
}

console.log('Dados de desenvolvimento prontos:');
console.log('  Rose (dona):     rose@teste.local    /', PASSWORD);
console.log('  Cliente (Maria): cliente@teste.local /', PASSWORD);
console.log('  Vendedor (Zeca): vendedor@teste.local /', PASSWORD);
