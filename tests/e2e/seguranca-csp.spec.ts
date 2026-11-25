import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { CLIENTE, login, loginAsRose } from './helpers';

// Aplica no app de produção (preview) os mesmos cabeçalhos do vercel.json e
// confere que nada é bloqueado pela política de conteúdo (CSP). Só o endereço
// do Supabase muda: aqui é o local, em vez de https://*.supabase.co.
const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const csp = vercel.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy')!
  .value.replace(/upgrade-insecure-requests;?/, '')
  .replaceAll('https://*.supabase.co', 'http://127.0.0.1:55321')
  .replaceAll('wss://*.supabase.co', 'ws://127.0.0.1:55321');

// Reescrever a resposta faz o Edge tratar a página como externa e barrar o
// Supabase LOCAL (127.0.0.1); em produção os dois são endereços públicos.
test.use({
  baseURL: 'http://localhost:4173',
  serviceWorkers: 'block',
  launchOptions: { args: ['--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessRespectPreflightResults'] },
});

async function withCsp(page: Page): Promise<string[]> {
  const blocked: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to/i.test(m.text())) blocked.push(m.text());
  });
  await page.route('http://localhost:4173/**', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  return blocked;
}

test('área da Rose funciona com a política de conteúdo de produção', async ({ page }) => {
  const blocked = await withCsp(page);
  await loginAsRose(page);
  for (const path of ['/vender', '/clientes', '/relatorios', '/relatorios?aba=equipe', '/equipe', '/config']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
  }
  // QR code (imagem data:) da tela de convite de equipe.
  await page.goto('/equipe');
  await page.getByLabel('Nome do vendedor').fill('Teste CSP');
  await page.getByRole('button', { name: 'Gerar convite' }).click();
  await page.getByRole('button', { name: 'Mostrar QR' }).click();
  await expect(page.getByRole('img', { name: 'QR code do convite de Teste CSP' })).toBeVisible();
  expect(blocked).toEqual([]);
});

test('portal do cliente (Pix com QR) funciona com a política de conteúdo', async ({ page }) => {
  const blocked = await withCsp(page);
  await login(page, CLIENTE);
  await expect(page.getByRole('region', { name: 'Seu saldo' })).toBeVisible();
  await page.goto('/conta/pagar');
  await page.waitForLoadState('networkidle');
  expect(blocked).toEqual([]);
});
