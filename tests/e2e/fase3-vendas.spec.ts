import { expect, test } from '@playwright/test';
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

async function salesWithDescription(description: string): Promise<number> {
  const { rows } = await db.query('select count(*)::int as n from public.sales where description = $1', [description]);
  return rows[0].n as number;
}

test.describe.configure({ mode: 'serial' });

test('venda por valor direto, online: salva no celular e sincroniza', async ({ page }) => {
  await loginAsRose(page);
  await selectEstablishment(page, 'Mercado Central');
  await page.goto('/');
  await page.getByRole('link', { name: /Nova venda/ }).click();
  await expect(page.getByText(/Vendendo em/)).toContainText('Mercado Central');

  await page.getByLabel('Buscar cliente por nome ou telefone').fill('maria');
  await page.getByRole('button', { name: /Maria Silva/ }).click();
  await page.getByRole('tab', { name: 'Valor direto' }).click();
  await page.getByLabel('Valor da venda').fill('1850');
  await page.getByLabel('Descrição').fill(`Online ${suffix}`);
  await page.getByRole('button', { name: 'Continuar' }).click();

  const summary = page.getByRole('region', { name: 'Resumo da venda' });
  await expect(summary).toContainText('Maria Silva');
  await expect(summary).toContainText('(11) •••••-4321');
  await expect(summary).toContainText('Mercado Central');
  await expect(summary).toContainText('R$ 18,50');
  await page.screenshot({ path: `${SHOTS}/10-venda-resumo.png`, fullPage: true });

  await page.getByRole('button', { name: 'Salvar venda' }).click();
  await expect(page.getByText('Venda salva no celular.')).toBeVisible();
  await expect(page.getByText('Venda sincronizada.')).toBeVisible({ timeout: 15_000 });
  // Volta direto para a escolha do cliente, no mesmo lugar.
  await expect(page.getByLabel('Buscar cliente por nome ou telefone')).toBeVisible();
  await expect.poll(() => salesWithDescription(`Online ${suffix}`)).toBe(1);
});

test('venda por produtos SEM internet, app reaberto com a venda pendente, envio sem duplicar', async ({ page, context }) => {
  await loginAsRose(page);
  await selectEstablishment(page, 'Mercado Central');
  await page.goto('/vender');
  await expect(page.getByLabel('Buscar cliente por nome ou telefone')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByRole('status').filter({ hasText: 'Sem internet' }).first()).toBeVisible();

  await page.getByLabel('Buscar cliente por nome ou telefone').fill('joão');
  await page.getByRole('button', { name: /João Pereira/ }).click();
  await page.getByRole('tab', { name: 'Produtos' }).click();
  await page.getByRole('button', { name: /^Coxinha, R\$ 6,50/ }).click();
  await page.getByRole('button', { name: /^Coxinha, R\$ 6,50/ }).click();
  await page.getByRole('button', { name: /^Café, R\$ 3,00/ }).click();
  await expect(page.getByText('R$ 16,00').first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/11-venda-produtos.png`, fullPage: true });
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Salvar venda' }).click();
  await expect(page.getByText('Venda salva no celular.')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: '1 venda no celular' }).first()).toBeVisible();

  // Abre a venda na lista (navegação dentro do app, ainda sem internet).
  await page.getByRole('link', { name: 'Ver vendas de hoje' }).click();
  const row = page.getByRole('link', { name: /João Pereira.*2× Coxinha \+ 1× Café/ });
  await expect(row).toContainText('No celular');
  await row.click();
  const saleId = page.url().split('/').pop()!;
  await page.screenshot({ path: `${SHOTS}/12-venda-no-celular.png`, fullPage: true });

  // Internet volta, mas a venda não chega ao servidor (rede instável); o app é fechado e reaberto.
  await page.route('**/rest/v1/rpc/create_sale', (route) => route.abort('failed'));
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByText('Salva no celular, aguardando internet')).toBeVisible({ timeout: 15_000 });
  const { rows: before } = await db.query('select count(*)::int as n from public.sales where id = $1', [saleId]);
  expect(before[0].n).toBe(0);

  // Servidor volta: "Enviar agora".
  await page.unroute('**/rest/v1/rpc/create_sale');
  await page.goto('/vendas');
  await page.getByRole('button', { name: 'Enviar agora' }).click();
  await expect(page.getByText('Venda sincronizada.')).toBeVisible({ timeout: 15_000 });
  const { rows } = await db.query('select count(*)::int as n, max(total_cents)::int as total from public.sales where id = $1', [saleId]);
  expect(rows[0]).toEqual({ n: 1, total: 1600 });
  const { rows: items } = await db.query('select count(*)::int as n from public.sale_items where sale_id = $1', [saleId]);
  expect(items[0].n).toBe(2);
});

test('cliente de outro lugar: aviso que não bloqueia a venda', async ({ page }) => {
  await loginAsRose(page);
  await selectEstablishment(page, 'Mercado Central');
  await page.goto('/vender');
  await page.getByLabel('Buscar cliente por nome ou telefone').fill('carlos');
  await expect(page.getByText(/Ver 1 cliente de outros lugares/)).toBeVisible();
  await page.getByRole('button', { name: 'Buscar em todos os estabelecimentos' }).click();
  await page.getByRole('button', { name: /Carlos Mendes/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Este cliente não está cadastrado neste estabelecimento. Deseja continuar?');
  await page.screenshot({ path: `${SHOTS}/13-aviso-outro-lugar.png` });
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await page.getByRole('tab', { name: 'Valor direto' }).click();
  await page.getByLabel('Valor da venda').fill('900');
  await page.getByLabel('Descrição').fill(`Fora ${suffix}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Pago agora' }).click();
  await page.getByRole('button', { name: 'Pix' }).click();
  await page.getByRole('button', { name: 'Salvar venda' }).click();
  await expect(page.getByText('Venda sincronizada.')).toBeVisible({ timeout: 15_000 });
  const { rows } = await db.query(
    `select e.name, p.method from public.sales s join public.establishments e on e.id = s.establishment_id
     join public.payments p on p.sale_id = s.id where s.description = $1`,
    [`Fora ${suffix}`],
  );
  expect(rows).toEqual([{ name: 'Mercado Central', method: 'PIX' }]);
});

test('cancelar venda com motivo; o extrato mostra cancelada', async ({ page }) => {
  await loginAsRose(page);
  await page.goto('/vendas');
  await page.getByRole('link', { name: new RegExp(`Maria Silva.*Online ${suffix}`) }).click();
  await page.getByRole('button', { name: 'Cancelar esta venda' }).click();
  await page.getByLabel('Motivo do cancelamento').fill('Valor errado');
  await page.getByRole('button', { name: 'Cancelar venda' }).click();
  await expect(page.getByText('Cancelamento salvo no celular.')).toBeVisible();
  await expect(page.getByText('Cancelada: Valor errado')).toBeVisible({ timeout: 15_000 });

  await page.getByRole('link', { name: /Maria Silva/ }).click();
  await expect(page.getByRole('heading', { name: 'Compras e pagamentos' })).toBeVisible();
  await expect(page.getByText('Cancelado: Valor errado')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/14-extrato-cliente.png`, fullPage: true });
  const { rows } = await db.query('select status from public.sales where description = $1', [`Online ${suffix}`]);
  expect(rows[0].status).toBe('CANCELLED');
});
