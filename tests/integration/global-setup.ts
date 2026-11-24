import { execSync } from 'node:child_process';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    supabaseUrl: string;
    anonKey: string;
    serviceKey: string;
    dbUrl: string;
  }
}

/**
 * Lê URL e chaves do Supabase LOCAL (npm run db:start). A chave de serviço e a
 * conexão direta com o Postgres são usadas só aqui, em Node, para montar
 * cenários — nunca no app.
 */
export default async function setup(project: TestProject) {
  let env: Record<string, string> = {};
  try {
    const out = execSync('npx supabase status -o json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    env = JSON.parse(out.slice(out.indexOf('{'))) as Record<string, string>;
  } catch {
    /* tratado abaixo */
  }
  const url = env.API_URL;
  const anon = env.PUBLISHABLE_KEY || env.ANON_KEY;
  const service = env.SECRET_KEY || env.SERVICE_ROLE_KEY;
  const dbUrl = env.DB_URL;
  if (!url || !anon || !service || !dbUrl) {
    throw new Error('Supabase local não está rodando. Rode "npm run db:start" (precisa do Docker) e tente de novo.');
  }
  if (!/^http:\/\/(127\.0\.0\.1|localhost)/.test(url)) {
    throw new Error(`Os testes de integração só rodam contra o Supabase local, não contra ${url}.`);
  }
  const health = await fetch(`${url}/auth/v1/health`, { headers: { apikey: anon } }).catch(() => null);
  if (!health?.ok) throw new Error(`Supabase local não respondeu em ${url}.`);

  project.provide('supabaseUrl', url);
  project.provide('anonKey', anon);
  project.provide('serviceKey', service);
  project.provide('dbUrl', dbUrl);
}
