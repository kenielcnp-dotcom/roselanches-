export const APP_NAME = 'Lanches da Rose';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const SUPABASE_URL = url ?? '';
export const SUPABASE_KEY = key ?? '';

/** Mensagem de configuração ausente ou perigosa (mostrada no lugar do app). */
export function configProblem(): string | null {
  if (!url || !key) {
    return 'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (no .env.local, ou nas variáveis de ambiente da hospedagem, seguidas de uma nova publicação). Veja docs/deployment.md.';
  }
  return keyProblem(key);
}

/** Defesa contra o erro mais perigoso: colocar uma chave administrativa no navegador. */
export function keyProblem(value: string): string | null {
  if (/^sb_secret_/.test(value) || /^sbp_/.test(value) || isServiceRoleJwt(value)) {
    return 'A chave configurada é ADMINISTRATIVA (ignora as regras de segurança) e não pode ir para o navegador. Use a chave sb_publishable_… e revogue a chave exposta no painel do Supabase.';
  }
  return null;
}

function isServiceRoleJwt(token: string): boolean {
  const part = token.split('.')[1];
  if (!part) return false;
  try {
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}
