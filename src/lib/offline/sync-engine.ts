// Envia a fila do celular ao servidor.
//
//   * Ordem de criação, respeitando dependências (cancelamento espera a venda).
//   * Nada sai da fila antes de o servidor confirmar (CREATED/DUPLICATE).
//   * Falha de rede/servidor: tenta de novo depois, com espera crescente.
//   * Sessão expirada: pausa (nada é descartado) até a Rose entrar de novo.
//   * Erro de validação ou CONFLICT: FAILED, visível para revisão.
//   * Não confia em navigator.onLine: só a resposta do servidor decide.
import type { Client } from '@/lib/supabase/client';
import { toAppError } from '@/lib/supabase/errors';
import { cancelSale, createSale, type CreateSalePayload } from '@/services/sales';
import { registerPayment, type RegisterPaymentPayload } from '@/services/payments';
import { uploadSignature } from '@/services/signatures';
import type { OutboxError, OutboxOp } from '@/types/domain';
import type { LocalDb } from './db';

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_MAX_MS = 15 * 60_000;

/** 5 s × 2ⁿ, teto de 15 min, ±20% de variação para não bater todos juntos. */
export function backoffDelay(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(base * (0.8 + random() * 0.4));
}

export interface SyncReport {
  sent: number;
  /** Ids das vendas que acabaram de chegar ao servidor. */
  syncedSales: string[];
  syncedSignatures: number;
  syncedPayments: number;
  failed: number;
  /** Parou por falta de conexão ou sessão expirada. */
  stoppedBy: 'network' | 'auth' | null;
  /** Flags devolvidas pelo servidor (preço mudado, cliente desativado…). */
  flags: string[];
}

export class PermanentSyncError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Handler = (client: Client, op: OutboxOp, db: LocalDb) => Promise<{ flags?: string[] }>;

const HANDLERS: Record<OutboxOp['type'], Handler | undefined> = {
  CREATE_SALE: async (client, op) => {
    const r = await createSale(client, op.payload as CreateSalePayload);
    if (r.status === 'CONFLICT') {
      throw new PermanentSyncError(
        'CONFLICT',
        'O servidor já tem uma venda com este código e dados diferentes. Confira a venda e registre de novo se for preciso.',
      );
    }
    return { flags: r.flags };
  },
  CANCEL_SALE: async (client, op) => {
    const p = op.payload as { sale_id: string; reason: string };
    await cancelSale(client, p.sale_id, p.reason);
    return {};
  },
  UPLOAD_SIGNATURE: async (client, op, db) => {
    const sig = await db.localSignatures.get(op.entityId);
    if (!sig) throw new PermanentSyncError('SIGNATURE_MISSING', 'A imagem da assinatura não está mais neste celular.');
    await uploadSignature(client, sig);
    // Confirmada no servidor: a imagem sai do celular.
    await db.localSignatures.delete(op.entityId);
    return {};
  },
  REGISTER_PAYMENT: async (client, op) => {
    const status = await registerPayment(client, op.payload as RegisterPaymentPayload);
    if (status === 'CONFLICT') {
      throw new PermanentSyncError(
        'CONFLICT',
        'O servidor já tem um pagamento com este código e valor diferente. Confira e registre de novo se for preciso.',
      );
    }
    return {};
  },
};

function classify(e: unknown): OutboxError {
  if (e instanceof PermanentSyncError) return { kind: 'permanent', code: e.code, message: e.message };
  const err = toAppError(e);
  if (err.kind === 'session') return { kind: 'auth', code: err.code, message: err.message };
  if (err.transient) return { kind: 'transient', code: err.code, message: err.message };
  return { kind: 'permanent', code: err.code, message: err.message };
}

export interface SyncOptions {
  now?: () => number;
  random?: () => number;
}

/** Uma rodada de envio. Quem chama garante que só uma rodada roda por vez. */
export async function runSyncRound(db: LocalDb, client: Client, options: SyncOptions = {}): Promise<SyncReport> {
  const now = options.now ?? Date.now;
  const report: SyncReport = { sent: 0, syncedSales: [], syncedSignatures: 0, syncedPayments: 0, failed: 0, stoppedBy: null, flags: [] };

  const all = await db.outbox.orderBy('createdAt').toArray();
  const state = new Map(all.map((o) => [o.opId, o.state]));

  for (const op of all) {
    if (op.state !== 'PENDING' || op.nextAttemptAt > now()) continue;
    // Dependência que já saiu da fila (podada) conta como enviada.
    const blocked = op.dependsOn.some((id) => state.has(id) && state.get(id) !== 'SYNCED');
    if (blocked) continue;

    const handler = HANDLERS[op.type];
    if (!handler) continue;

    await db.outbox.update(op.opId, { state: 'SYNCING', updatedAt: now() });
    state.set(op.opId, 'SYNCING');
    try {
      const result = await handler(client, op, db);
      await db.outbox.update(op.opId, { state: 'SYNCED', updatedAt: now(), lastError: undefined });
      state.set(op.opId, 'SYNCED');
      report.sent += 1;
      if (op.type === 'CREATE_SALE') report.syncedSales.push(op.entityId);
      if (op.type === 'UPLOAD_SIGNATURE') report.syncedSignatures += 1;
      if (op.type === 'REGISTER_PAYMENT') report.syncedPayments += 1;
      report.flags.push(...(result.flags ?? []));
    } catch (e) {
      const error = classify(e);
      const attempts = op.attempts + 1;
      if (error.kind === 'permanent') {
        await db.outbox.update(op.opId, { state: 'FAILED', attempts, lastError: error, updatedAt: now() });
        state.set(op.opId, 'FAILED');
        report.failed += 1;
        continue;
      }
      await db.outbox.update(op.opId, {
        state: 'PENDING',
        attempts,
        lastError: error,
        updatedAt: now(),
        nextAttemptAt: error.kind === 'auth' ? now() : now() + backoffDelay(attempts, options.random),
      });
      state.set(op.opId, 'PENDING');
      // Sem conexão ou sem sessão, as próximas falhariam igual: para a rodada.
      report.stoppedBy = error.kind === 'auth' ? 'auth' : 'network';
      break;
    }
  }
  return report;
}

/** Próximo momento em que vale tentar de novo (null = nada esperando). */
export async function nextAttemptAt(db: LocalDb): Promise<number | null> {
  const pending = await db.outbox.where('state').equals('PENDING').toArray();
  if (pending.length === 0) return null;
  return Math.min(...pending.map((o) => o.nextAttemptAt));
}
