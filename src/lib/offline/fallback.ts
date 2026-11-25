// Leitura com plano B: servidor primeiro; sem conexão, a cópia do celular.
// O resultado que veio do celular fica marcado com a hora da cópia, para a tela
// avisar que é um dado guardado (nunca apresentado como se fosse atual).
import { toAppError } from '@/lib/supabase/errors';
import { CATALOG_UPDATED_AT } from './catalog';
import { getMeta, type LocalDb } from './db';
import { browserSaysOffline, withTimeout } from './net';

/** Quanto esperar o servidor antes de mostrar a cópia do celular. */
const SERVER_WAIT_MS = 8_000;

let activeDb: LocalDb | null = null;

/** O banco do celular da conta logada (definido pela área da Rose). */
export function setActiveLocalDb(db: LocalDb | null): void {
  activeDb = db;
}

const cachedAtByData = new WeakMap<object, number>();

/** Hora (epoch ms) da cópia do celular de onde este dado veio; null = veio do servidor. */
export function cachedAt(data: unknown): number | null {
  return typeof data === 'object' && data !== null ? (cachedAtByData.get(data) ?? null) : null;
}

export async function withOfflineFallback<T extends object>(
  online: () => Promise<T>,
  offline: (db: LocalDb) => Promise<T | null>,
  metaKey: string = CATALOG_UPDATED_AT,
): Promise<T> {
  try {
    if (browserSaysOffline() && activeDb) throw new TypeError('Failed to fetch (sem internet)');
    return await withTimeout(online(), SERVER_WAIT_MS);
  } catch (e) {
    if (!activeDb || toAppError(e).kind !== 'network') throw e;
    const at = await getMeta<number>(activeDb, metaKey);
    const data = at ? await offline(activeDb) : null;
    if (!at || !data) throw e;
    cachedAtByData.set(data, at);
    return data;
  }
}

/** Guarda no celular a última resposta de uma leitura (ex.: números do painel). */
export async function rememberOnDevice(key: string, value: unknown, now = Date.now()): Promise<void> {
  if (!activeDb) return;
  await activeDb.meta.bulkPut([
    { key, value },
    { key: `${key}At`, value: now },
  ]);
}

export async function recallFromDevice<T>(db: LocalDb, key: string): Promise<T | null> {
  return (await getMeta<T>(db, key)) ?? null;
}
