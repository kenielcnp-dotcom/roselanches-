import { expect, test, type Page } from '@playwright/test';
import type pg from 'pg';
import { localDb, loginAsRose, selectEstablishment, SHOTS } from './helpers';

const suffix = Date.now().toString(36).slice(-5);
let db: pg.Client;

test.beforeAll(async () => {
  db = await localDb();
});
test.afterAll(async () => {
  await db.end();
});

test.describe.configure({ mode: 'serial' });

/** Rabisca uma assinatura com o "dedo" (ponteiro) dentro da área. */
async function draw(page: Page): Promise<void> {
  const box = (await page.getByLabel('Área de assinatura: assine com o dedo').boundingBox())!;
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + 30, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i += 1) {
    await page.mouse.move(box.x + 30 + i * 12, y + Math.sin(i / 2) * 30, { steps: 2 });
  }
  await page.mouse.up();
}

async function startAmountSale(page: Page, customer: string, cents: string, description: string): Promise<void> {
  await page.goto('/vender');
  await page.getByLabel('Buscar cliente por nome ou telefone').fill(customer);
  await page.getByRole('button', { name: new RegExp(customer, 'i') }).first().click();
  await page.getByRole('tab', { name: 'Valor direto' }).click();
  await page.getByLabel('Valor da venda').fill(cents);
  await page.getByLabel('Descrição').fill(description);
  await page.getByRole('button', { name: 'Continuar' }).click();
}

async function confirmationOf(description: string): Promise<{ status: string; path: string; sale_status: string } | undefined> {
  const { rows } = await db.query(
    `select c.confirmation_status as status, c.signature_storage_path as path, s.confirmation_status as sale_status
       from public.sales s join public.sale_confirmations c on c.sale_id = s.id
      where s.description = $1`,
    [description],
  );
  return rows[0];
}

test('venda com assinatura: captura, conferência visual e envio', async ({ page }) => {
  await loginAsRose(page);
  await selectEstablishment(page, 'Mercado Central');
  await startAmountSale(page, 'Maria Silva', '2000', `Assinada ${suffix}`);

  await page.getByRole('button', { name: 'Pedir assinatura' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmação de compra' });
  await expect(dialog).toContainText('Maria Silva');
  await expect(dialog).toContainText('R$ 20,00');
  await expect(dialog).toContainText('Confirmo que recebi os produtos ou valores descritos nesta compra');

  // Vazia ou só um toque: não confirma.
  const confirm = dialog.getByRole('button', { name: 'Confirmar assinatura' });
  await expect(confirm).toBeDisabled();
  const box = (await page.getByLabel('Área de assinatura: assine com o dedo').boundingBox())!;
  await page.mouse.click(box.x + 50, box.y + 50);
  await expect(confirm).toBeDisabled();
  await dialog.getByRole('button', { name: 'Limpar' }).click();

  await draw(page);
  await expect(confirm).toBeEnabled();
  await page.screenshot({ path: `${SHOTS}/15-assinatura.png` });
  await confirm.click();

  await expect(page.getByText('Assinatura capturada')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/16-assinatura-capturada.png`, fullPage: true });
  await page.getByRole('button', { name: 'Salvar venda' }).click();
  await expect(page.getByText('Venda e assinatura salvas no celular.')).toBeVisible();

  await expect.poll(() => confirmationOf(`Assinada ${suffix}`), { timeout: 20_000 }).toMatchObject({ status: 'SIGNED', sale_status: 'SIGNED' });

  // O detalhe mostra a assinatura vinda do servidor (URL temporária).
  await page.goto('/vendas');
  await page.getByRole('link', { name: new RegExp(`Assinada ${suffix}`) }).click();
  await expect(page.getByText('Assinada pelo cliente')).toBeVisible();
  await expect(page.getByRole('img', { name: 'Assinatura do cliente' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/17-venda-assinada.png`, fullPage: true });
});

test('assinatura SEM internet: fica no celular, sobrevive a reabrir o app e sobe uma vez só', async ({ page, context }) => {
  await loginAsRose(page);
  await selectEstablishment(page, 'Mercado Central');
  await page.goto('/vender');
  await expect(page.getByLabel('Buscar cliente por nome ou telefone')).toBeVisible();
  await context.setOffline(true);

  await startAmountSaleOffline(page, `Offline assinada ${suffix}`);
  await page.getByRole('button', { name: 'Pedir assinatura' }).click();
  await draw(page);
  await page.getByRole('button', { name: 'Confirmar assinatura' }).click();
  await page.getByRole('button', { name: 'Salvar venda' }).click();
  await expect(page.getByText('Venda e assinatura salvas no celular.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /Sem internet/ }).first()).toBeVisible();

  // Volta a internet, mas a assinatura não consegue subir; o app é fechado e reaberto.
  await page.route('**/functions/v1/signature-upload', (route) => route.abort('failed'));
  await context.setOffline(false);
  await page.reload();
  await page.goto('/vendas');
  await page.getByRole('link', { name: new RegExp(`Offline assinada ${suffix}`) }).click();
  await expect(page.getByText('Assinatura salva no celular, aguardando envio')).toBeVisible({ timeout: 20_000 });
  expect(await confirmationOf(`Offline assinada ${suffix}`)).toBeUndefined();

  await page.unroute('**/functions/v1/signature-upload');
  await page.goto('/vendas');
  await page.getByRole('button', { name: 'Enviar agora' }).click();
  await expect.poll(() => confirmationOf(`Offline assinada ${suffix}`), { timeout: 20_000 }).toMatchObject({ status: 'SIGNED' });
  const c = await confirmationOf(`Offline assinada ${suffix}`);
  const { rows } = await db.query(`select count(*)::int as n from storage.objects where bucket_id = 'sale-signatures' and name like $1`, [
    `${c!.path.split('/').slice(0, 2).join('/')}/%`,
  ]);
  expect(rows[0].n).toBe(1);
});

test('salvar sem assinatura continua possível e fica "sem confirmação"', async ({ page }) => {
  await loginAsRose(page);
  await selectEstablishment(page, 'Mercado Central');
  await startAmountSale(page, 'Ana Souza', '700', `Sem assinatura ${suffix}`);
  await page.getByRole('button', { name: 'Pedir assinatura' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Salvar sem assinatura' }).click();
  await expect(page.getByText('Venda salva no celular.')).toBeVisible();
  await expect
    .poll(async () => (await db.query('select confirmation_status from public.sales where description = $1', [`Sem assinatura ${suffix}`])).rows[0]?.confirmation_status, {
      timeout: 20_000,
    })
    .toBe('PENDING');
});

async function startAmountSaleOffline(page: Page, description: string): Promise<void> {
  await page.getByLabel('Buscar cliente por nome ou telefone').fill('joão');
  await page.getByRole('button', { name: /João Pereira/ }).click();
  await page.getByRole('tab', { name: 'Valor direto' }).click();
  await page.getByLabel('Valor da venda').fill('1500');
  await page.getByLabel('Descrição').fill(description);
  await page.getByRole('button', { name: 'Continuar' }).click();
}
