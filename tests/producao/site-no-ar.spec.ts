import { expect, test } from '@playwright/test';

// Fumaça no site publicado. NÃO cria nem altera dados: só abre telas e tenta
// um login com e-mail inexistente (o Supabase recusa sem gravar nada).
//   npx playwright test --config tests/producao/playwright.config.ts
test('site no ar: abre, fala com o Supabase da nuvem e nada é bloqueado', async ({ page }) => {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy|Refused to/i.test(m.text())) problems.push(m.text());
  });
  page.on('pageerror', (e) => problems.push(e.message));

  await page.goto('/');
  await expect(page).toHaveURL(/\/entrar$/);
  await expect(page.getByRole('heading', { name: 'Entrar' })).toBeVisible();
  await expect(page.getByText(/Faltam VITE_SUPABASE/)).toHaveCount(0);

  await page.getByLabel('E-mail').fill(`ninguem-${Date.now()}@exemplo.invalid`);
  await page.getByLabel('Senha').fill('SenhaErrada123');
  await page.getByRole('button', { name: 'Entrar' }).click();
  const alert = page.getByRole('alert');
  await expect(alert).toBeVisible({ timeout: 15_000 });
  await expect(alert).not.toContainText('servidor');

  // Rotas internas abrem pelo fallback do app (sem 404).
  for (const path of ['/convite', '/convite-equipe', '/criar-conta']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
  }

  // Credenciais inválidas geram 400 no console do navegador; o resto não pode ter erro.
  expect(problems.filter((p) => !/status of 400/.test(p))).toEqual([]);
});

test('www redireciona para o endereço principal', async ({ request }) => {
  const res = await request.get('https://www.lanchesrose.com.br/relatorios', { maxRedirects: 0 });
  expect([301, 308]).toContain(res.status());
  expect(res.headers()['location']).toBe('https://lanchesrose.com.br/relatorios');
});

test('cabeçalhos de segurança e cache no ar', async ({ request }) => {
  const page = await request.get('/');
  const h = page.headers();
  expect(h['content-security-policy']).toContain("script-src 'self'");
  expect(h['strict-transport-security']).toContain('max-age=');
  expect(h['x-frame-options']).toBe('DENY');
  expect((await request.get('/sw.js')).headers()['cache-control']).toBe('no-cache');
});
