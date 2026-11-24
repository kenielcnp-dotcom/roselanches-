import { defineConfig } from '@playwright/test';

// Fluxos críticos num navegador real já instalado (Edge por padrão, sem baixar
// navegadores). Pré-requisitos: npm run db:start e npm run db:seed-dev.
// O servidor de desenvolvimento sobe sozinho se ainda não estiver rodando.
const BASE_URL = process.env.E2E_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    channel: process.env.E2E_BROWSER ?? 'msedge',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    // Celular de referência (mesma proporção do mockup).
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: BASE_URL,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
