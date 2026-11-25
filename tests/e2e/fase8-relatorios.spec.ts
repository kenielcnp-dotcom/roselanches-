import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { localDb, loginAsRose, ROSE, SHOTS } from './helpers';

const suffix = Date.now().toString(36).slice(-5);
const PLACE = `Feira Rel ${suffix}`;
const NAME = `Cliente Rel ${suffix}`;
let db: pg.Client;
let placeId: string;

test.beforeAll(async () => {
  db = await localDb();
  const { rows } = await db.query(
    `select m.business_id, u.id as user_id from public.business_members m join auth.users u on u.id = m.user_id where u.email = $1`,
    [ROSE.email],
  );
  const { business_id: businessId, user_id: userId } = rows[0] as { business_id: string; user_id: string };
  placeId = randomUUID();
  const customerId = randomUUID();
  await db.query('insert into public.establishments (id, business_id, name) values ($1, $2, $3)', [placeId, businessId, PLACE]);
  await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3)', [customerId, businessId, NAME]);
  await db.query('insert into public.customer_establishments (business_id, customer_id, establishment_id) values ($1, $2, $3)', [
    businessId,
    customerId,
    placeId,
  ]);
  for (const [cents, desc, minutes] of [
    [2500, `Almoço ${suffix}`, 20],
    [1500, `Lanche ${suffix}`, 10],
  ] as const) {
    await db.query(
      `insert into public.sales (id, business_id, customer_id, establishment_id, mode, period, description,
         total_cents, payment_kind, occurred_at, request_hash, created_by)
       values ($1, $2, $3, $4, 'AMOUNT', 'AFTERNOON', $5, $6, 'CREDIT', now() - make_interval(mins => $7), $8, $9)`,
      [randomUUID(), businessId, customerId, placeId, desc, cents, minutes, 'f'.repeat(64), userId],
    );
  }
  // Pagou 1.000: quita parte da compra mais antiga (o almoço).
  await db.query(
    `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, received_at, request_hash, created_by)
     values ($1, $2, $3, 1000, 'CASH', 'MANUAL', now(), $4, $5)`,
    [randomUUID(), businessId, customerId, 'f'.repeat(64), userId],
  );
});
test.afterAll(async () => {
  await db.end();
});

test('resumo do dia filtrado por local, com gráfico e idade da dívida', async ({ page }) => {
  await loginAsRose(page);
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Relatórios' }).click();
  await page.getByRole('button', { name: 'Semana' }).click();
  await page.getByLabel('Local').selectOption({ label: PLACE });
  await expect(page.getByText('Vendido', { exact: true }).locator('..')).toContainText('R$ 40,00');
  await expect(page.getByText('Fiado', { exact: true }).locator('..')).toContainText('2 vendas');
  // Pagamento não tem local.
  await expect(page.getByText('Pagamento não tem local: tire o filtro de local.')).toBeVisible();
  await expect(page.getByText('de compras feitas neste local')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Há quanto tempo está em aberto' })).toContainText('R$ 30,00');
  await page.screenshot({ path: `${SHOTS}/28-relatorio-resumo.png`, fullPage: true });

  // O filtro fica no endereço: abrir uma venda e voltar mantém o relatório.
  await page.getByRole('button', { name: 'Hoje' }).click();
  await expect(page).toHaveURL(/periodo=TODAY/);
  await page.getByRole('tab', { name: 'Vendas' }).click();
  await page.getByRole('link', { name: new RegExp(`Almoço ${suffix}`) }).click();
  await page.getByRole('button', { name: 'Voltar' }).click();
  await expect(page.getByRole('tab', { name: 'Vendas' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('Local')).toHaveValue(placeId);
});

test('por local: três métricas rotuladas que fecham com o total', async ({ page }) => {
  await loginAsRose(page);
  await page.goto('/relatorios?aba=locais&periodo=TODAY');
  const card = page.getByRole('article', { name: PLACE });
  await expect(card.getByRole('definition').nth(0)).toContainText('R$ 40,00');
  await expect(card.getByRole('definition').nth(1)).toContainText('R$ 30,00');
  await expect(card.getByRole('definition').nth(2)).toContainText('R$ 30,00');
  await expect(card.getByRole('definition').nth(2)).toContainText('1 de 1 devendo');
  await expect(page.getByText('Total em aberto hoje')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/29-relatorio-locais.png`, fullPage: true });
});

test('lista de vendas: em aberto, pagas em parte e planilha CSV', async ({ page }) => {
  await loginAsRose(page);
  await page.goto(`/relatorios?aba=vendas&periodo=TODAY&local=${placeId}`);
  await expect(page.getByRole('status').filter({ hasText: '2 vendas' })).toContainText('em aberto R$ 30,00');
  await page.getByRole('button', { name: 'Pagas em parte' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'venda' })).toContainText('1 venda');
  await expect(page.getByRole('link', { name: new RegExp(`Almoço ${suffix}`) })).toContainText('Falta R$ 15,00');
  await page.screenshot({ path: `${SHOTS}/30-relatorio-vendas.png`, fullPage: true });

  await page.getByRole('button', { name: 'Todas' }).first().click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Baixar planilha (CSV)' }).click();
  const file = await (await download).path();
  const csv = await readFile(file, 'utf8');
  expect(csv.split('\r\n')[0]).toBe('﻿Data;Hora;Turno;Cliente;Local;Compra;Total;Pagamento;Em aberto;Situação;Confirmação');
  expect(csv).toContain(`${NAME};${PLACE};Almoço ${suffix};25,00;Fiado;15,00;Ativa`);
  expect(csv).toContain(`${NAME};${PLACE};Lanche ${suffix};15,00;Fiado;15,00;Ativa`);
});

test('sem internet, o relatório avisa em vez de mostrar números velhos', async ({ page, context }) => {
  await loginAsRose(page);
  await page.goto('/relatorios');
  await expect(page.getByText('Vendido', { exact: true })).toBeVisible();
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Mês passado' }).click();
  await expect(page.getByText('Os relatórios precisam de internet. As vendas no celular continuam salvas.')).toBeVisible({ timeout: 20_000 });
  await context.setOffline(false);
});
