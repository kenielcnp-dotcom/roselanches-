import { defineConfig } from '@playwright/test';

// Verificação do site PUBLICADO (só leitura). Separado dos e2e, que usam o
// Supabase local.
export default defineConfig({
  testDir: '.',
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: process.env.PROD_URL ?? 'https://lanchesrose.com.br',
    channel: process.env.E2E_BROWSER ?? 'msedge',
    locale: 'pt-BR',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  },
});
