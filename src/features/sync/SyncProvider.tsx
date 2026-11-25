import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useConnectionStatus } from '@/app/ConnectionProvider';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/features/auth/AuthProvider';
import { refreshCatalog, CATALOG_UPDATED_AT } from '@/lib/offline/catalog';
import { getLocalDb, getMeta, type LocalDb } from '@/lib/offline/db';
import { setActiveLocalDb } from '@/lib/offline/fallback';
import { countOutbox, pruneSynced, resumeInterrupted, type OutboxCounts } from '@/lib/offline/outbox';
import { runSyncRound } from '@/lib/offline/sync-engine';
import { useLiveQuery } from '@/lib/offline/useLiveQuery';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';

const SYNC_INTERVAL_MS = 30_000;
const CATALOG_INTERVAL_MS = 5 * 60_000;

interface SyncContextValue {
  db: LocalDb;
  counts: OutboxCounts;
  /** Última cópia do catálogo no celular (epoch ms). */
  catalogUpdatedAt: number | null;
  /** O navegador garantiu que não apaga os dados do app sozinho? (null = não sabe) */
  persisted: boolean | null;
  /** force: ignora a espera entre tentativas (botão "Enviar agora"). */
  requestSync: (options?: { force?: boolean }) => Promise<void>;
  refreshCatalogNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | null>(null);

const EMPTY: OutboxCounts = { pendingSales: 0, pendingSignatures: 0, pendingOther: 0, failed: 0, syncing: false, authPaused: false };

/** Só uma rodada por vez, também entre abas (Web Lock), quando o navegador suporta. */
async function withSyncLock(fn: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    await navigator.locks.request('ldr-sync', { ifAvailable: true }, async (lock) => {
      if (lock) await fn();
    });
    return;
  }
  await fn();
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { identity } = useAuth();
  const staff = identity?.staff;
  if (!identity || !staff) return <>{children}</>;
  return (
    <SyncEngine userId={identity.userId} businessId={staff.businessId}>
      {children}
    </SyncEngine>
  );
}

function SyncEngine({ userId, businessId, children }: { userId: string; businessId: string; children: ReactNode }) {
  // Registrado já na criação (e não num efeito): as telas filhas consultam
  // antes de os efeitos do provedor rodarem, e o plano B precisa achar o banco.
  const db = useMemo(() => {
    const local = getLocalDb(userId);
    setActiveLocalDb(local);
    return local;
  }, [userId]);
  useEffect(() => () => setActiveLocalDb(null), [db]);
  const queryClient = useQueryClient();
  const toast = useToast();
  const { status: connection } = useConnectionStatus();
  const running = useRef(false);
  const [persisted, setPersisted] = useState<boolean | null>(null);

  const ops = useLiveQuery(() => db.outbox.toArray(), [db]);
  const counts = useMemo(() => (ops ? countOutbox(ops) : EMPTY), [ops]);
  const catalogUpdatedAt = useLiveQuery(async () => (await getMeta<number>(db, CATALOG_UPDATED_AT)) ?? null, [db]) ?? null;

  const refreshCatalogNow = useCallback(async () => {
    try {
      await refreshCatalog(db, supabase, businessId);
    } catch {
      /* sem internet: o celular continua com a última cópia */
    }
  }, [db, businessId]);

  const requestSync = useCallback(async (options?: { force?: boolean }) => {
    if (running.current) return;
    running.current = true;
    try {
      if (options?.force) await db.outbox.where('state').equals('PENDING').modify({ nextAttemptAt: 0 });
      await withSyncLock(async () => {
        const report = await runSyncRound(db, supabase);
        if (report.sent > 0) {
          const n = report.syncedSales.length;
          if (n > 0) toast.show(n === 1 ? 'Venda sincronizada.' : `${n} vendas sincronizadas.`);
          else if (report.syncedSignatures > 0) toast.show('Assinatura sincronizada.');
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
            queryClient.invalidateQueries({ queryKey: ['customers'] }),
            queryClient.invalidateQueries({ queryKey: ['sales'] }),
            queryClient.invalidateQueries({ queryKey: ['statement'] }),
            queryClient.invalidateQueries({ queryKey: ['signature'] }),
          ]);
          await refreshCatalogNow();
        }
        if (report.failed > 0) {
          toast.show('Não foi possível enviar esta venda. Ela continua salva no celular. Veja em Vendas.', 'error');
        }
      });
    } catch (e) {
      console.error('Falha na sincronização', errorMessage(e));
    } finally {
      running.current = false;
    }
  }, [db, queryClient, refreshCatalogNow, toast]);

  // Ao abrir: retoma o que ficou no meio, limpa o antigo, envia e atualiza o catálogo.
  useEffect(() => {
    void (async () => {
      await resumeInterrupted(db);
      await pruneSynced(db);
      // Pede ao navegador para não apagar as vendas guardadas quando faltar espaço.
      if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
        const ok = (await navigator.storage.persisted().catch(() => false)) || (await navigator.storage.persist().catch(() => false));
        setPersisted(ok);
      }
      await requestSync();
      await refreshCatalogNow();
    })();
  }, [db, requestSync, refreshCatalogNow]);

  // Voltou a conexão com o servidor: envia já.
  useEffect(() => {
    if (connection === 'online') void requestSync();
  }, [connection, requestSync]);

  // Com pendências, tenta de tempos em tempos (o backoff de cada operação decide se é hora).
  const hasPending = counts.pendingSales + counts.pendingSignatures + counts.pendingOther - counts.failed > 0;
  useEffect(() => {
    if (!hasPending) return;
    const id = window.setInterval(() => void requestSync(), SYNC_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasPending, requestSync]);

  useEffect(() => {
    const id = window.setInterval(() => void refreshCatalogNow(), CATALOG_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void requestSync();
    };
    document.addEventListener('visibilitychange', onVisible);
    // Sessão renovada (ou nova entrada): libera o que estava esperando login.
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') void requestSync();
    });
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      data.subscription.unsubscribe();
    };
  }, [refreshCatalogNow, requestSync]);

  const value = useMemo<SyncContextValue>(
    () => ({ db, counts, catalogUpdatedAt, persisted, requestSync, refreshCatalogNow }),
    [db, counts, catalogUpdatedAt, persisted, requestSync, refreshCatalogNow],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync precisa estar dentro de <SyncProvider> (área da Rose)');
  return ctx;
}

/** Versão que não exige o provedor (componentes usados também fora da área da Rose). */
export function useOptionalSync(): SyncContextValue | null {
  return useContext(SyncContext);
}
