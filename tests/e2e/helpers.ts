import { execSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import pg from 'pg';

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

/** Conexão direta com o Postgres LOCAL, só para conferir o resultado no banco. */
export async function localDb(): Promise<pg.Client> {
  const out = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const env = JSON.parse(out.slice(out.indexOf('{'))) as { DB_URL: string };
  if (!/127\.0\.0\.1|localhost/.test(env.DB_URL)) throw new Error('Só contra o banco local.');
  const client = new pg.Client({ connectionString: env.DB_URL });
  await client.connect();
  return client;
}

/** Escolhe o lugar atual (fica lembrado no aparelho). */
export async function selectEstablishment(page: Page, name: string): Promise<void> {
  await page.goto('/estabelecimentos');
  await page.getByRole('button', { name: new RegExp(name) }).click();
  await expect(page.getByText('Vendendo aqui')).toBeVisible();
}
