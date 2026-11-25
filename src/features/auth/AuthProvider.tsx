import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { deleteLocalDb, getLocalDb } from '@/lib/offline/db';
import { browserSaysOffline, withTimeout } from '@/lib/offline/net';
import { AUTH_STORAGE_KEY, supabase } from '@/lib/supabase/client';
import { toAppError } from '@/lib/supabase/errors';
import {
  applyIdentityTimeZone,
  cacheIdentity,
  cachedIdentity,
  clearCachedIdentity,
  fetchIdentity,
  type Identity,
} from '@/services/identity';

export type AuthStatus = 'loading' | 'signed-out' | 'ready' | 'error';

/** 'pending' = há vendas/assinaturas no celular que ainda não chegaram ao servidor. */
export type SignOutResult = 'ok' | 'pending';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  identity: Identity | null;
  /** A identidade veio do aparelho porque o servidor não respondeu. */
  identityFromCache: boolean;
  error: string | null;
  refreshIdentity: () => Promise<void>;
  /** Recusa sair se houver operações não enviadas (a não ser que force). Ao sair, apaga os dados do celular. */
  signOut: (options?: { force?: boolean }) => Promise<SignOutResult>;
}

/** Resultado do whoami, sempre ligado ao usuário a que se refere. */
interface LoadedIdentity {
  userId: string;
  identity: Identity | null;
  fromCache: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Sem internet, o supabase-js insiste em renovar o login por até 30 s antes de
 * desistir. A Rose não pode esperar isso: passado este limite, vale o que está
 * guardado no aparelho (e a renovação continua sozinha em segundo plano).
 */
const WAIT_FOR_SERVER_MS = 4_000;



async function resolveIdentity(userId: string): Promise<LoadedIdentity> {
  try {
    if (browserSaysOffline()) throw new TypeError('Failed to fetch (sem internet)');
    const fresh = await withTimeout(fetchIdentity(supabase), WAIT_FOR_SERVER_MS);
    cacheIdentity(fresh);
    applyIdentityTimeZone(fresh);
    return { userId, identity: fresh, fromCache: false, error: null };
  } catch (e) {
    const appError = toAppError(e);
    // Sem internet (ou com o login vencido e sem como renovar), a área da Rose
    // abre com a última identidade conhecida. O servidor confere tudo depois.
    const offline = appError.kind === 'network' || appError.kind === 'session';
    const cached = offline ? cachedIdentity(userId) : null;
    if (cached) applyIdentityTimeZone(cached);
    return cached
      ? { userId, identity: cached, fromCache: true, error: null }
      : { userId, identity: null, fromCache: false, error: appError.message };
  }
}

/**
 * Sessão guardada no aparelho, mesmo vencida. Usada só quando não dá para
 * renovar por falta de internet: a Rose continua vendendo no celular e o
 * supabase-js renova sozinho quando a conexão voltar.
 */
function storedSession(): Session | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<Session>;
    return s.access_token && s.refresh_token && s.user?.id ? (s as Session) : null;
  } catch {
    return null;
  }
}

/** Preferências do app neste aparelho (lugar atual, último modo de venda…). */
function clearDevicePreferences(): void {
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('ldr.')) localStorage.removeItem(key);
    }
  } catch {
    /* nada a limpar */
  }
}

async function hasUnsentWork(userId: string): Promise<boolean> {
  const db = getLocalDb(userId);
  return (await db.outbox.where('state').notEqual('SYNCED').count()) > 0;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [loaded, setLoaded] = useState<LoadedIdentity | null>(null);

  useEffect(() => {
    let active = true;
    // getSession lê do aparelho; se o login venceu e não há internet para
    // renovar, ele responde "sem sessão" com erro de rede: nesse caso vale a
    // sessão guardada (sair só acontece por pedido ou recusa do servidor).
    const adoptStoredSession = () => {
      const stored = storedSession();
      if (!active || !stored) return;
      setSession((current) => current ?? stored);
      setSessionLoaded(true);
    };
    // Sem internet: abre já com a sessão guardada.
    if (browserSaysOffline()) adoptStoredSession();
    const slow = setTimeout(adoptStoredSession, WAIT_FOR_SERVER_MS);
    void supabase.auth.getSession().then(({ data, error }) => {
      clearTimeout(slow);
      if (!active) return;
      if (data.session) setSession(data.session);
      else if (error && isAuthRetryableFetchError(error)) adoptStoredSession();
      else setSession(null);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'SIGNED_OUT') setSession(null);
      else if (next) setSession(next);
      setSessionLoaded(true);
    });
    return () => {
      active = false;
      clearTimeout(slow);
      data.subscription.unsubscribe();
    };
  }, []);

  const userId = session?.user.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let active = true;
    void resolveIdentity(userId).then((result) => {
      if (active) setLoaded(result);
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const refreshIdentity = useCallback(async () => {
    if (userId) setLoaded(await resolveIdentity(userId));
  }, [userId]);

  const signOut = useCallback(
    async (options?: { force?: boolean }): Promise<SignOutResult> => {
      if (userId && !options?.force && (await hasUnsentWork(userId))) return 'pending';
      clearCachedIdentity();
      if (userId) {
        clearDevicePreferences();
        // O celular não é backup: ao sair, nada da conta fica no aparelho.
        await deleteLocalDb(userId).catch(() => undefined);
      }
      setLoaded(null);
      // scope local: sai deste aparelho mesmo sem internet.
      await supabase.auth.signOut({ scope: 'local' });
      setSession(null);
      return 'ok';
    },
    [userId],
  );

  const current = loaded && loaded.userId === userId ? loaded : null;
  const identity = current?.identity ?? null;
  const error = current?.error ?? null;

  const status: AuthStatus = !sessionLoaded
    ? 'loading'
    : !session
      ? 'signed-out'
      : identity
        ? 'ready'
        : error
          ? 'error'
          : 'loading';

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      session,
      identity,
      identityFromCache: current?.fromCache ?? false,
      error,
      refreshIdentity,
      signOut,
    }),
    [status, session, identity, current?.fromCache, error, refreshIdentity, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth precisa estar dentro de <AuthProvider>');
  return ctx;
}
