import { expect, type Page } from '@playwright/test';

// Contas criadas por "npm run db:seed-dev" (só no Supabase local).
export const ROSE = { email: 'rose@teste.local', password: 'SenhaForte123' };
export const CLIENTE = { email: 'cliente@teste.local', password: 'SenhaForte123' };

export const SHOTS = 'tests/e2e/capturas';

export async function login(page: Page, account: { email: string; password: string }): Promise<void> {
  await page.goto('/entrar');
  await page.getByLabel('E-mail').fill(account.email);
  await page.getByLabel('Senha').fill(account.password);
  await page.getByRole('button', { name: 'Entrar' }).click();
}

export async function loginAsRose(page: Page): Promise<void> {
  await login(page, ROSE);
  await expect(page.getByRole('link', { name: /Nova venda/ })).toBeVisible();
}
