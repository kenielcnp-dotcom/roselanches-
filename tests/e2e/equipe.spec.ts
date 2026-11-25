import { expect, test } from '@playwright/test';
import type pg from 'pg';
import { login, localDb, loginAsRose, SHOTS } from './helpers';

const suffix = Date.now().toString(36).slice(-5);
const SELLER = `Beto ${suffix}`;
const EMAIL = `vendedor-${suffix}@teste.local`;
const PASSWORD = 'SenhaForte123';
let db: pg.Client;
let inviteUrl = '';

test.beforeAll(async () => {
  db = await localDb();
});
test.afterAll(async () => {
  await db.end();
});

test.describe.configure({ mode: 'serial' });

test('Rose convida um vendedor pela tela Equipe', async ({ page }) => {
  await loginAsRose(page);
  await page.getByRole('link', { name: /Equipe/ }).click();
  await expect(page.getByRole('heading', { name: 'Equipe' })).toBeVisible();
  await page.getByLabel('Nome do vendedor').fill(SELLER);
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  await expect(page.getByText(`Convite de ${SELLER} pronto!`)).toBeVisible();

  const href = await page.getByRole('link', { name: 'Enviar pelo WhatsApp' }).getAttribute('href');
  const text = new URL(href ?? '').searchParams.get('text') ?? '';
  inviteUrl = /https?:\/\/\S+\/convite-equipe#t=[A-Za-z0-9_-]{32}/.exec(text)?.[0] ?? '';
  expect(inviteUrl).not.toBe('');
  await page.screenshot({ path: `${SHOTS}/31-equipe-convite.png`, fullPage: true });

  await page.getByRole('button', { name: 'Pronto' }).click();
  await expect(page.getByRole('heading', { name: 'Convites ainda não usados' })).toBeVisible();
  await expect(page.getByText(SELLER)).toBeVisible();
});

test('vendedor abre o link, cria a conta e vende no próprio celular', async ({ page }) => {
  await page.goto(inviteUrl);
  await expect(page.getByRole('heading', { name: 'Bem-vindo à equipe!' })).toBeVisible();
  await expect(page).toHaveURL(/\/convite-equipe$/); // o token sai da barra de endereço
  await page.getByRole('link', { name: 'Criar minha conta' }).click();
  await expect(page.getByText('você já entra na equipe do Lanches da Rose')).toBeVisible();
  await page.getByLabel('Seu nome').fill(SELLER);
  await page.getByLabel('E-mail').fill(EMAIL);
  await page.getByLabel('Senha', { exact: true }).fill(PASSWORD);
  await page.getByLabel('Confirme a senha').fill(PASSWORD);
  await page.getByRole('button', { name: 'Criar conta' }).click();

  await expect(page.getByText('Aqui estão as suas vendas de hoje.')).toBeVisible();
  await expect(page.getByText('Suas vendas hoje')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  await expect(nav.getByRole('link', { name: 'Vendas' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Relatórios' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Equipe/ })).toHaveCount(0);

  await page.getByRole('link', { name: /Nova venda/ }).click();
  await page.getByRole('button', { name: /Mercado Central/ }).click();
  await page.getByLabel('Buscar cliente por nome ou telefone').fill('ana');
  await page.getByRole('button', { name: /Ana Souza/ }).click();
  await page.getByRole('tab', { name: 'Valor direto' }).click();
  await page.getByLabel('Valor da venda').fill('2350');
  await page.getByLabel('Descrição').fill(`Rua ${suffix}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Salvar sem assinatura' }).click();
  await expect(page.getByText('Venda sincronizada.')).toBeVisible({ timeout: 15_000 });

  await page.goto('/');
  await expect(page.getByText('Suas vendas hoje').locator('..')).toContainText('R$ 23,50');
  await page.screenshot({ path: `${SHOTS}/32-vendedor-inicio.png`, fullPage: true });

  // Minhas vendas: só a dele; sem botão de cancelar.
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Vendas' }).click();
  await expect(page.getByRole('heading', { name: 'Minhas vendas' })).toBeVisible();
  await page.getByRole('link', { name: new RegExp(`Rua ${suffix}`) }).click();
  await expect(page.getByText('Peça para a Rose cancelar.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar esta venda' })).toHaveCount(0);

  // Relatório e produtos: tela "só para a Rose".
  await page.goto('/relatorios');
  await expect(page.getByText('Esta parte do app é só da dona do negócio.')).toBeVisible();

  const { rows } = await db.query(
    `select u.email from public.sales s join auth.users u on u.id = s.created_by where s.description = $1`,
    [`Rua ${suffix}`],
  );
  expect(rows).toEqual([{ email: EMAIL }]);
});

test('Rose vê quem vendeu, o relatório da equipe e desativa o acesso', async ({ page }) => {
  await loginAsRose(page);
  await page.goto('/vendas');
  const row = page.getByRole('link', { name: new RegExp(`Rua ${suffix}`) });
  await expect(row).toContainText(`Vendido por ${SELLER}`);
  await row.click();
  await expect(page.getByText('Vendido por', { exact: true }).locator('..')).toContainText(SELLER);
  await expect(page.getByRole('button', { name: 'Cancelar esta venda' })).toBeVisible();

  await page.goto('/relatorios?aba=equipe&periodo=TODAY');
  const card = page.getByRole('article', { name: SELLER });
  await expect(card).toContainText('R$ 23,50');
  await page.screenshot({ path: `${SHOTS}/33-relatorio-equipe.png`, fullPage: true });
  await card.getByRole('button', { name: /Ver as vendas de/ }).click();
  await expect(page.getByLabel('Vendedor')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'venda' })).toContainText('1 venda');

  await page.goto('/equipe');
  const member = page.getByRole('article', { name: SELLER });
  await member.getByRole('button', { name: 'Desativar acesso' }).click();
  await member.getByRole('button', { name: 'Desativar', exact: true }).click();
  await expect(member).toContainText('Desativado');
  await page.screenshot({ path: `${SHOTS}/34-equipe.png`, fullPage: true });
});

test('vendedor desativado não entra mais na área do negócio', async ({ page }) => {
  await login(page, { email: EMAIL, password: PASSWORD });
  await expect(page.getByRole('heading', { name: 'Conta criada' })).toBeVisible();
  await expect(page.getByText('Se a Rose desativou o seu acesso')).toBeVisible();
});
