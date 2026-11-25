// O navegador dizer "online" não garante que o servidor responde (Wi-Fi sem
// internet, 4G fraco). A conexão só conta como boa depois de uma resposta real.
import { SUPABASE_KEY, SUPABASE_URL } from '@/app/config';

export const PROBE_TIMEOUT_MS = 5_000;

export async function probeServer(
  fetcher: typeof fetch = fetch,
  timeoutMs = PROBE_TIMEOUT_MS,
): Promise<boolean> {
  if (!SUPABASE_URL) return false;
  try {
    const res = await fetcher(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_KEY },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * O navegador dizer "sem rede" é confiável (o contrário é que não é). Usado para
 * não esperar à toa: sem rede, vai direto para os dados do celular.
 */
export function browserSaysOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Falha como erro de rede se a resposta demorar demais (internet ruim). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new TypeError('Failed to fetch (tempo esgotado)')), ms);
    promise.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}
