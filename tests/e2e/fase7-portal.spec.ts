import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { CLIENTE, login, localDb, loginAsRose, ROSE, SHOTS } from './helpers';

const suffix = Date.now().toString(36).slice(-5);
const NAME = `Portal Teste ${suffix}`;
const EMAIL = `portal-${suffix}@teste.local`;
const PHONE = `+55659${String(Date.now()).slice(-8)}`;
let db: pg.Client;
let customerId: string;
let inviteUrl = '';

async function insertSale(businessId: string, establishmentId: string, cents: number, description: string, minutesAgo: number) {
  await db.query(
    `insert into public.sales (id, business_id, customer_id, establishment_id, mode, period, description,
       total_cents, payment_kind, occurred_at, request_hash, created_by)
     select $1, $2, $3, $4, 'AMOUNT', 'AFTERNOON', $5, $6, 'CREDIT', now() - make_interval(mins => $7), $8, u.id
       from auth.users u where u.email = $9`,
    [randomUUID(), businessId, customerId, establishmentId, description, cents, minutesAgo, 'c'.repeat(64), ROSE.email],
  );
}

test.beforeAll(async () => {
  db = await localDb();
  const { rows } = await db.query(
    `select m.business_id, (select e.id from public.establishments e where e.business_id = m.business_id order by e.created_at limit 1) as est
       from public.business_members m join auth.users u on u.id = m.user_id where u.email = $1`,
    [ROSE.email],
  );
  const { business_id: businessId, est } = rows[0] as { business_id: string; est: string };
  customerId = randomUUID();
  await db.query('insert into public.customers (id, business_id, full_name, phone_e164) values ($1, $2, $3, $4)', [
    customerId,
    businessId,
    NAME,
    PHONE,
  ]);
  await insertSale(businessId, est, 1800, `Marmita ${suffix}`, 60);
  await insertSale(businessId, est, 1200, `Suco e pastel ${suffix}`, 30);
  await db.query(
    `update public.business_settings set pix_key_type = 'PHONE', pix_key = '+5565999887766',
            pix_receiver_name = 'Rose Teste', pix_city = 'Cuiaba' where business_id = $1`,
    [businessId],
  );
});
test.afterAll(async () => {
  await db.end();
});

test.describe.configure({ mode: 'serial' });

test('Rose gera o convite e manda pelo WhatsApp (ou mostra o QR)', async ({ page }) => {
  await loginAsRose(page);
  await page.goto(`/clientes/${customerId}`);
  const section = page.getByRole('region', { name: 'Conta no celular do cliente' });
  await section.getByRole('button', { name: 'Convidar para o app' }).click();
  await expect(section.getByText('Convite pronto!')).toBeVisible();

  const href = await section.getByRole('link', { name: 'Enviar pelo WhatsApp' }).getAttribute('href');
  const text = new URL(href ?? '').searchParams.get('text') ?? '';
  inviteUrl = /https?:\/\/\S+\/convite#t=[A-Za-z0-9_-]{32}/.exec(text)?.[0] ?? '';
  expect(inviteUrl).not.toBe('');
  expect(href).toContain(PHONE.slice(1));

  await section.getByRole('button', { name: 'Mostrar QR' }).click();
  await expect(section.getByRole('img', { name: `QR code do convite de ${NAME}` })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/24-convite.png`, fullPage: true });

  // O banco guarda só o hash: o token não aparece em lugar nenhum.
  const token = inviteUrl.split('#t=')[1] ?? '';
  const { rows } = await db.query(`select count(*)::int as n from public.audit_logs where after::text like '%' || $1 || '%'`, [token]);
  expect(rows[0].n).toBe(0);
});

test('cliente abre o link, cria a conta, confirma uma compra e contesta outra', async ({ page }) => {
  await page.goto(inviteUrl);
  await expect(page.getByRole('heading', { name: 'Você foi convidado!' })).toBeVisible();
  await expect(page).toHaveURL(/\/convite$/); // o token sai da barra de endereço
  await page.getByRole('link', { name: 'Criar minha conta' }).click();
  await page.getByLabel('Seu nome').fill('Cliente Portal');
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill('SenhaForte123');
  await page.getByLabel('Confirme a senha').fill('SenhaForte123');
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByText('Pronto! Sua conta está ligada ao seu cadastro.')).toBeVisible();
  const balance = page.getByRole('region', { name: 'Seu saldo' });
  await expect(balance).toContainText('Você deve');
  await expect(balance).toContainText('R$ 30,00');
  await page.screenshot({ path: `${SHOTS}/25-portal-inicio.png`, fullPage: true });

  await page.getByRole('button', { name: '2 compras esperando você confirmar' }).click();
  await expect(page.getByRole('button', { name: 'A confirmar' })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: new RegExp(`Marmita ${suffix}`) }).click();
  await page.getByRole('button', { name: 'Confirmo esta compra' }).click();
  await expect(page.getByText('Compra confirmada. Obrigado!')).toBeVisible();
  await expect(page.getByText(/Você confirmou esta compra/)).toBeVisible();

  await page.getByRole('button', { name: 'Voltar' }).click();
  await page.getByRole('link', { name: new RegExp(`Suco e pastel ${suffix}`) }).click();
  await page.getByRole('button', { name: 'Não reconheço / está errada' }).click();
  await page.getByLabel('O que está errado?').fill('Não comprei o suco');
  await page.getByRole('button', { name: 'Enviar contestação' }).click();
  await expect(page.getByText('Você contestou esta compra')).toBeVisible();
  await expect(page.getByText('A Rose vai conversar com você. Enquanto isso, a compra continua na sua conta.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/26-portal-contestacao.png`, fullPage: true });

  const { rows } = await db.query('select confirmation_status from public.sales where customer_id = $1 order by occurred_at', [customerId]);
  expect(rows.map((r: { confirmation_status: string }) => r.confirmation_status)).toEqual(['CONFIRMED_ONLINE', 'DISPUTED']);
});

test('cliente paga com Pix (QR e copia e cola) e avisa "Já paguei"', async ({ page }) => {
  await login(page, { email: EMAIL, password: 'SenhaForte123' });
  await page.getByRole('link', { name: 'Pagar com Pix' }).click();
  await expect(page.getByRole('button', { name: 'Tudo: R$ 30,00' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('img', { name: 'QR code do Pix' })).toBeVisible();
  await expect(page.getByText('(65) 99988-7766')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copiar código Pix (copia e cola)' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/27-portal-pix.png`, fullPage: true });

  await page.getByRole('button', { name: 'Já paguei: avisar a Rose' }).click();
  await page.getByLabel('Recado (opcional)').fill('Paguei tudo');
  await page.getByRole('button', { name: 'Enviar aviso de R$ 30,00' }).click();
  await expect(page.getByText('Aviso enviado!')).toBeVisible();

  await page.getByRole('link', { name: 'Voltar para a minha conta' }).click();
  await expect(page.getByText('R$ 30,00 · Esperando a Rose conferir')).toBeVisible();
  // O aviso não mexe no saldo.
  await expect(page.getByRole('region', { name: 'Seu saldo' })).toContainText('R$ 30,00');
});

test('Rose vê a contestação no painel e encerra com uma resposta', async ({ page }) => {
  await loginAsRose(page);
  await page.getByRole('link', { name: /contestadas? pel/ }).click();
  await page.getByRole('link', { name: new RegExp(NAME) }).click();
  const dispute = page.getByRole('region', { name: 'Contestação do cliente' });
  await expect(dispute).toContainText('Não comprei o suco');
  await dispute.getByRole('button', { name: 'Encerrar contestação' }).click();
  await dispute.getByLabel('O que foi combinado?').fill('Conversamos, o suco foi para a filha');
  await dispute.getByRole('button', { name: 'Encerrar contestação' }).click();
  await expect(page.getByText('Contestação encerrada.')).toBeVisible();
  await expect(dispute).toContainText('Encerrada em');
});

test('portal sem internet avisa e não guarda nada no aparelho', async ({ page, context }) => {
  await login(page, CLIENTE);
  await expect(page.getByRole('region', { name: 'Seu saldo' })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Compras', exact: true }).click();
  await expect(page.getByText('Sem internet: o extrato aparece quando a conexão voltar.')).toBeVisible({ timeout: 20_000 });
  const dbs = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name ?? ''));
  expect(dbs.filter((n) => n.startsWith('ldr-'))).toEqual([]);
  await context.setOffline(false);
});
