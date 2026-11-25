import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { localDb, loginAsRose, ROSE, SHOTS } from './helpers';

const suffix = Date.now().toString(36).slice(-5);
const NAME = `Teste Receb ${suffix}`;
let db: pg.Client;
let customerId: string;

async function balance(): Promise<number> {
  const { rows } = await db.query('select balance_cents from public.customer_balances where customer_id = $1', [customerId]);
  return Number(rows[0].balance_cents);
}

test.beforeAll(async () => {
  db = await localDb();
  const { rows } = await db.query(
    `select m.business_id from public.business_members m join auth.users u on u.id = m.user_id where u.email = $1`,
    [ROSE.email],
  );
  customerId = randomUUID();
  await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3)', [customerId, rows[0].business_id, NAME]);
});
test.afterAll(async () => {
  await db.end();
});

test.describe.configure({ mode: 'serial' });

test('saldo anterior do caderno aparece no extrato e no saldo', async ({ page }) => {
  await loginAsRose(page);
  await page.goto(`/clientes/${customerId}`);
  await page.getByRole('link', { name: 'Saldo anterior' }).click();
  await page.getByLabel('Valor').fill('4550');
  await page.getByLabel('Observação').fill('Caderno de outubro');
  await page.getByRole('button', { name: 'Registrar R$ 45,50' }).click();
  await expect(page.getByText('Saldo anterior registrado.')).toBeVisible();
  await expect(page.getByText('Saldo devedor')).toBeVisible();
  await expect(page.getByRole('link', { name: /Saldo anterior.*Caderno de outubro/ })).toBeVisible();
  expect(await balance()).toBe(4550);
});

test('pagamento parcial SEM internet, com "quitar tudo" sugerido, sobe quando a internet volta', async ({ page, context }) => {
  await loginAsRose(page);
  await page.goto(`/recebimentos/novo?cliente=${customerId}`);
  await expect(page.getByRole('button', { name: 'Quitar tudo: R$ 45,50' })).toBeVisible();

  await context.setOffline(true);
  await page.getByLabel('Valor recebido').fill('2000');
  await expect(page.getByText('Depois deste pagamento ainda fica devendo R$ 25,50.')).toBeVisible();
  await page.getByRole('button', { name: 'Pix', exact: true }).click();
  await page.screenshot({ path: `${SHOTS}/21-pagamento.png`, fullPage: true });
  await page.getByRole('button', { name: 'Salvar pagamento de R$ 20,00' }).click();
  await expect(page.getByText('Pagamento salvo no celular.')).toBeVisible();
  await expect(page.getByRole('link', { name: new RegExp(NAME) })).toContainText('No celular');
  expect(await balance()).toBe(4550);

  await context.setOffline(false);
  await expect.poll(balance, { timeout: 45_000 }).toBe(2550);
});

test('aviso "Já paguei": a Rose confirma o valor que viu no banco', async ({ page }) => {
  const noticeId = randomUUID();
  const { rows } = await db.query('select business_id from public.customers where id = $1', [customerId]);
  await db.query(
    `insert into public.payment_notifications (id, business_id, customer_id, amount_cents, note, created_by)
     select $1, $2, $3, 1000, 'Paguei 10 pelo Pix', u.id from auth.users u where u.email = 'cliente@teste.local'`,
    [noticeId, rows[0].business_id, customerId],
  );
  await loginAsRose(page);
  // Conta qualquer número de avisos (outras execuções podem ter deixado algum).
  await expect(page.getByText(/\d+ avisos? de Pix/)).toBeVisible();
  await page.goto('/recebimentos');
  const card = page.getByRole('article', { name: `Aviso de ${NAME}` });
  await expect(card).toContainText('R$ 10,00');
  await expect(card).toContainText('Paguei 10 pelo Pix');
  await page.screenshot({ path: `${SHOTS}/22-aviso-pix.png`, fullPage: true });
  await card.getByRole('button', { name: 'Conferi, confirmar' }).click();
  await card.getByLabel('Valor que chegou na sua conta').fill('900');
  await card.getByRole('button', { name: 'Confirmar R$ 9,00' }).click();
  await expect(page.getByText(`Pagamento confirmado: R$ 9,00 de ${NAME}.`)).toBeVisible();
  await expect(card).toHaveCount(0);
  expect(await balance()).toBe(1650);
});

test('estorno com motivo devolve o valor à dívida', async ({ page }) => {
  await loginAsRose(page);
  await page.goto(`/clientes/${customerId}`);
  await page.getByRole('link', { name: /Pagamento em pix.*R\$ 20,00/ }).click();
  await page.getByRole('button', { name: 'Estornar este pagamento' }).click();
  await page.getByLabel('Motivo do estorno').fill('Pix não caiu');
  await page.getByRole('button', { name: 'Estornar pagamento' }).click();
  await expect(page.getByText('Estornado: Pix não caiu')).toBeVisible();
  expect(await balance()).toBe(3650);
});

test('ajuste de desconto e configuração do Pix', async ({ page }) => {
  await loginAsRose(page);
  await page.goto(`/clientes/${customerId}/ajuste`);
  await page.getByRole('button', { name: 'Diminuir a dívida' }).click();
  await page.getByLabel('Valor').fill('650');
  await page.getByLabel('Motivo (obrigatório)').fill('Desconto combinado');
  await page.getByRole('button', { name: 'Registrar R$ 6,50' }).click();
  await expect(page.getByText('Ajuste registrado.')).toBeVisible();
  expect(await balance()).toBe(3000);

  await page.goto('/config');
  await page.getByLabel('Tipo de chave').selectOption('CPF');
  await page.getByLabel('Chave Pix').fill('123.456.789-00');
  await expect(page.getByText('CPF inválido. Confira os 11 números.')).toBeVisible();
  await page.getByLabel('Tipo de chave').selectOption('PHONE');
  await page.getByLabel('Chave Pix').fill('65 99988 7766');
  await page.getByLabel('Nome de quem recebe').fill('Rose Teste');
  await page.getByLabel('Cidade').fill('Cuiaba');
  await page.getByRole('button', { name: 'Salvar Pix' }).click();
  await expect(page.getByText('Pix salvo. Os clientes já veem estes dados para pagar.')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/23-config-pix.png`, fullPage: true });
  const { rows } = await db.query(
    `select s.pix_key, s.pix_key_type from public.business_settings s join public.customers c on c.business_id = s.business_id where c.id = $1`,
    [customerId],
  );
  expect(rows[0]).toEqual({ pix_key: '+5565999887766', pix_key_type: 'PHONE' });
});
