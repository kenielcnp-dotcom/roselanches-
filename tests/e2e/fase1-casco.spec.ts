import { expect, test } from '@playwright/test';
import { CLIENTE, login, loginAsRose, SHOTS } from './helpers';

test('tela de login', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('img', { name: 'Lanches da Rose' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/01-login.png` });
});

test('Rose entra e vê a tela inicial com navegação', async ({ page }) => {
  await loginAsRose(page);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rose');
  await expect(page.getByRole('status').filter({ hasText: 'Sincronizado' })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Navegação principal' });
  for (const tab of ['Início', 'Vender', 'Clientes', 'Relatórios', 'Config.']) {
    await expect(nav.getByRole('link', { name: tab })).toBeVisible();
  }
  await page.screenshot({ path: `${SHOTS}/02-inicio-rose.png`, fullPage: true });
});

test('cliente entra e vai para o portal, nunca para a área da Rose', async ({ page }) => {
  await login(page, CLIENTE);
  await expect(page).toHaveURL(/\/conta$/);
  await page.goto('/clientes');
  await expect(page).toHaveURL(/\/conta$/);
});

test('sem login, a área da Rose não abre', async ({ page }) => {
  await page.goto('/relatorios');
  await expect(page).toHaveURL(/\/entrar$/);
});
