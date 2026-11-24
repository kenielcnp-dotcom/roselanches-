import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { toAppError } from '@/lib/supabase/errors';
import { cacheIdentity, cachedIdentity, clearCachedIdentity, fetchIdentity, type Identity } from '@/services/identity';

export type AuthStatus = 'loading' | 'signed-out' | 'ready' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  identity: Identity | null;
  /** A identidade veio do aparelho porque o servidor não respondeu. */
  identityFromCache: boolean;
  error: string | null;
  refreshIdentity: () => Promise<void>;
  signOut: () => Promise<void>;
}

/** Resultado do whoami, sempre ligado ao usuário a que se refere. */
interface LoadedIdentity {
  userId: string;
  identity: Identity | null;
  fromCache: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function resolveIdentity(userId: string): Promise<LoadedIdentity> {
  try {
    const fresh = await fetchIdentity(supabase);
    cacheIdentity(fresh);
    return { userId, identity: fresh, fromCache: false, error: null };
  } catch (e) {
    const appError = toAppError(e);
    // Sem internet, a área da Rose abre com a última identidade conhecida.
    const cached = appError.kind === 'network' ? cachedIdentity(userId) : null;
    return cached
      ? { userId, identity: cached, fromCache: true, error: null }
      : { userId, identity: null, fromCache: false, error: appError.message };
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [loaded, setLoaded] = useState<LoadedIdentity | null>(null);

  useEffect(() => {
    let active = true;
    // getSession lê do aparelho; funciona sem internet.
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoaded(true);
    });
    return () => {
      active = false;
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

  const signOut = useCallback(async () => {
    clearCachedIdentity();
    setLoaded(null);
    // scope local: sai deste aparelho mesmo sem internet.
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

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
