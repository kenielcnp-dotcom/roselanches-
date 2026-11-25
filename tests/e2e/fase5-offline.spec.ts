import { expect, test, type Page } from '@playwright/test';
import type pg from 'pg';
import { localDb, loginAsRose, selectEstablishment, SHOTS } from './helpers';

// App de PRODUÇÃO (service worker ativo) apontando para o Supabase local.
test.use({ baseURL: 'http://localhost:4173', serviceWorkers: 'allow' });
test.describe.configure({ mode: 'serial' });

const suffix = Date.now().toString(36).slice(-5);
let db: pg.Client;

test.beforeAll(async () => {
  db = await localDb();
});
test.afterAll(async () => {
  await db.end();
});

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** Faz o login guardado no aparelho parecer vencido (como na manhã seguinte). */
async function expireStoredSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    const raw = localStorage.getItem('ldr-auth');
    if (!raw) throw new Error('sem sessão guardada');
    const s = JSON.parse(raw) as { expires_at: number };
    s.expires_at = Math.floor(Date.now() / 1000) - 3600;
    localStorage.setItem('ldr-auth', JSON.stringify(s));
  });
}

test('abre o app SEM internet, com o login vencido, vende, e envia quando a internet volta', async ({ page, context }) => {
  await loginAsRose(page);
  await selectEstablishment(page, 'Mercado Central');
  await page.goto('/vender');
  await expect(page.getByLabel('Buscar cliente por nome ou telefone')).toBeVisible();
  await page.goto('/clientes');
  await expect(page.getByRole('link', { name: /Maria Silva/ })).toBeVisible();
  await page.goto('/');
  await expect(page.getByText('Total a receber')).toBeVisible();
  await waitForServiceWorker(page);

  // Dia seguinte: login vencido, sem internet, app fechado e aberto de novo.
  await expireStoredSession(page);
  await context.setOffline(true);
  await page.reload();
  await expect(page).not.toHaveURL(/\/entrar/);
  await expect(page.getByRole('link', { name: /Nova venda/ })).toBeVisible();
  await expect(page.getByText(/Sem internet · números de/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/18-inicio-sem-internet.png`, fullPage: true });

  // Vende normalmente.
  await page.getByRole('link', { name: /Nova venda/ }).click();
  await page.getByLabel('Buscar cliente por nome ou telefone').fill('maria');
  await page.getByRole('button', { name: /Maria Silva/ }).click();
  await page.getByRole('tab', { name: 'Valor direto' }).click();
  await page.getByLabel('Valor da venda').fill('1250');
  await page.getByLabel('Descrição').fill(`Frio ${suffix}`);
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Salvar sem assinatura' }).click();
  await expect(page.getByText('Venda salva no celular.')).toBeVisible();

  // Telas de consulta mostram a cópia do celular, identificada (navegando pelo app).
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Clientes' }).click();
  await expect(page.getByText(/Sem conexão com o servidor\. Mostrando os dados guardados no celular/)).toBeVisible();
  await page.getByRole('link', { name: /Maria Silva/ }).click();
  await expect(page.getByText('+ R$ 12,50 em vendas no celular, ainda não enviadas')).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/19-cliente-sem-internet.png`, fullPage: true });

  // Sair da conta com venda pendente: bloqueado.
  await page.getByRole('navigation', { name: 'Navegação principal' }).getByRole('link', { name: 'Config.' }).click();
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page.getByRole('dialog')).toContainText('não chegaram ao servidor');
  await page.screenshot({ path: `${SHOTS}/20-sair-bloqueado.png` });
  await page.getByRole('button', { name: 'Voltar' }).click();
  const { rows: none } = await db.query('select count(*)::int as n from public.sales where description = $1', [`Frio ${suffix}`]);
  expect(none[0].n).toBe(0);

  // Internet volta: o login é renovado sozinho e a venda sobe uma vez só.
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Enviar agora' }).click();
  await expect
    .poll(async () => (await db.query('select count(*)::int as n from public.sales where description = $1', [`Frio ${suffix}`])).rows[0].n, {
      timeout: 30_000,
    })
    .toBe(1);
  await expect(page.getByText('Tudo o que foi registrado aqui já chegou ao servidor.')).toBeVisible({ timeout: 15_000 });

  // Agora pode sair, e nada da conta fica no aparelho.
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(/\/entrar/);
  const leftovers = await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name).filter((n) => n?.startsWith('ldr-')));
  expect(leftovers).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('ldr.')))).toEqual([]);
});

test('recarregar direto numa tela interna sem internet abre do celular', async ({ page, context }) => {
  await loginAsRose(page);
  await page.goto('/clientes');
  await expect(page.getByRole('link', { name: /Maria Silva/ })).toBeVisible();
  await waitForServiceWorker(page);
  await context.setOffline(true);
  await page.goto('/clientes', { waitUntil: 'domcontentloaded', timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Clientes' })).toBeVisible();
  await expect(page.getByText(/Mostrando os dados guardados no celular/)).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 15_000 });
  await expect(page.getByRole('link', { name: /Maria Silva/ })).toBeVisible();
  await context.setOffline(false);
});
