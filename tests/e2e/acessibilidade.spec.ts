import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { CLIENTE, login, loginAsRose } from './helpers';

// Verificação automática (axe, regras WCAG 2.1 A/AA) nas telas principais de
// cada tipo de pessoa. Não substitui o teste com leitor de tela no celular.
async function audit(page: Page, label: string) {
  await page.waitForLoadState('networkidle');
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const problems = result.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.slice(0, 3).map((n) => n.target.join(' ')),
  }));
  expect.soft(problems, label).toEqual([]);
}

test('telas públicas', async ({ page }) => {
  for (const path of ['/entrar', '/criar-conta']) {
    await page.goto(path);
    await audit(page, path);
  }
});

test('telas da Rose', async ({ page }) => {
  await loginAsRose(page);
  for (const path of [
    '/',
    '/vender',
    '/vendas',
    '/clientes',
    '/recebimentos',
    '/recebimentos/novo',
    '/relatorios',
    '/relatorios?aba=locais',
    '/relatorios?aba=vendas',
    '/relatorios?aba=equipe',
    '/produtos',
    '/estabelecimentos',
    '/equipe',
    '/config',
  ]) {
    await page.goto(path);
    await expect(page.locator('main').first()).toBeVisible();
    await audit(page, path);
  }
});

test('telas do vendedor', async ({ page }) => {
  await login(page, { email: 'vendedor@teste.local', password: 'SenhaForte123' });
  await expect(page.getByText('Suas vendas hoje')).toBeVisible();
  await audit(page, '/ (vendedor)');
  await page.goto('/relatorios');
  await audit(page, '/relatorios (vendedor)');
});

test('portal do cliente', async ({ page }) => {
  await login(page, CLIENTE);
  await expect(page.getByRole('region', { name: 'Seu saldo' })).toBeVisible();
  await audit(page, '/conta');
  await page.goto('/conta/pagar');
  await audit(page, '/conta/pagar');
  await page.goto('/conta/privacidade');
  await audit(page, '/conta/privacidade');
});
