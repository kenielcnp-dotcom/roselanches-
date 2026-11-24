// Fila de operações do celular. Tudo é gravado ANTES de qualquer envio, numa
// transação só: "Venda salva no celular." só aparece depois do commit.
import Dexie from 'dexie';
import { toCreateSalePayload } from '@/services/sales';
import type { OutboxOp, SaleDraft } from '@/types/domain';
import type { LocalDb, LocalSale } from './db';

export interface SaleDisplay {
  customerName: string;
  customerPhone: string | null;
  establishmentName: string;
  summary: string;
}

function newOp(type: OutboxOp['type'], entityId: string, payload: unknown, dependsOn: string[], now: number): OutboxOp {
  return {
    opId: crypto.randomUUID(),
    type,
    entityId,
    payload,
    dependsOn,
    state: 'PENDING',
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Grava a venda e a operação de envio. O id da venda nasce quando o fluxo abre;
 * gravar de novo o mesmo id (toque duplo) não cria outra venda.
 * Devolve false se a venda já estava salva.
 */
export async function enqueueSale(db: LocalDb, draft: SaleDraft, display: SaleDisplay, now = Date.now()): Promise<boolean> {
  const op = newOp('CREATE_SALE', draft.id, toCreateSalePayload(draft), [], now);
  const sale: LocalSale = { id: draft.id, opId: op.opId, draft, ...display, createdAt: now };
  try {
    await db.transaction('rw', db.localSales, db.outbox, async () => {
      await db.localSales.add(sale);
      await db.outbox.add(op);
    });
    return true;
  } catch (e) {
    if (e instanceof Dexie.ConstraintError || (e as { name?: string }).name === 'ConstraintError') return false;
    throw e;
  }
}

/**
 * Cancelamento pela fila. Se a venda ainda não chegou ao servidor, o
 * cancelamento espera o envio dela (dependsOn): o histórico fica completo.
 */
export async function enqueueCancel(db: LocalDb, saleId: string, reason: string, now = Date.now()): Promise<void> {
  await db.transaction('rw', db.localSales, db.outbox, async () => {
    const existing = await db.outbox.where('entityId').equals(saleId).toArray();
    if (existing.some((o) => o.type === 'CANCEL_SALE' && o.state !== 'FAILED')) return;
    const create = existing.find((o) => o.type === 'CREATE_SALE' && o.state !== 'SYNCED');
    const op = newOp('CANCEL_SALE', saleId, { sale_id: saleId, reason: reason.trim() }, create ? [create.opId] : [], now);
    await db.outbox.add(op);
    const local = await db.localSales.get(saleId);
    if (local) await db.localSales.update(saleId, { cancel: { opId: op.opId, reason: reason.trim(), at: now } });
  });
}

/** "Tentar de novo" numa operação que falhou. */
export async function retryOp(db: LocalDb, opId: string, now = Date.now()): Promise<void> {
  await db.outbox.update(opId, { state: 'PENDING', nextAttemptAt: now, updatedAt: now, attempts: 0 });
}

/**
 * Apaga do celular uma venda que o servidor RECUSOU (nunca foi registrada).
 * Só vale para operação em FAILED; vendas pendentes nunca são descartadas.
 */
export async function discardFailedSale(db: LocalDb, saleId: string): Promise<boolean> {
  return db.transaction('rw', db.localSales, db.outbox, async () => {
    const ops = await db.outbox.where('entityId').equals(saleId).toArray();
    const create = ops.find((o) => o.type === 'CREATE_SALE');
    if (!create || create.state !== 'FAILED') return false;
    await db.outbox.bulkDelete(ops.map((o) => o.opId));
    await db.localSales.delete(saleId);
    return true;
  });
}

/** Ao abrir o app: operação interrompida no meio do envio volta para a fila (seguro pela idempotência). */
export async function resumeInterrupted(db: LocalDb, now = Date.now()): Promise<number> {
  return db.outbox.where('state').equals('SYNCING').modify({ state: 'PENDING', nextAttemptAt: now, updatedAt: now });
}

export interface OutboxCounts {
  /** Vendas ainda não confirmadas pelo servidor (inclui as com falha). */
  pendingSales: number;
  pendingOther: number;
  failed: number;
  syncing: boolean;
  authPaused: boolean;
}

export function countOutbox(ops: readonly OutboxOp[]): OutboxCounts {
  let pendingSales = 0;
  let pendingOther = 0;
  let failed = 0;
  let syncing = false;
  let authPaused = false;
  for (const o of ops) {
    if (o.state === 'SYNCED') continue;
    if (o.state === 'FAILED') failed += 1;
    if (o.state === 'SYNCING') syncing = true;
    if (o.lastError?.kind === 'auth' && o.state === 'PENDING') authPaused = true;
    if (o.type === 'CREATE_SALE') pendingSales += 1;
    else pendingOther += 1;
  }
  return { pendingSales, pendingOther, failed, syncing, authPaused };
}

/** Itens já confirmados ficam 7 dias (para a tela de vendas) e depois saem. */
export async function pruneSynced(db: LocalDb, now = Date.now(), keepMs = 7 * 86_400_000): Promise<void> {
  await db.transaction('rw', db.localSales, db.outbox, async () => {
    const old = await db.outbox
      .where('state')
      .equals('SYNCED')
      .filter((o) => o.updatedAt < now - keepMs)
      .toArray();
    if (old.length === 0) return;
    await db.outbox.bulkDelete(old.map((o) => o.opId));
    const saleIds = old.filter((o) => o.type === 'CREATE_SALE').map((o) => o.entityId);
    await db.localSales.bulkDelete(saleIds);
  });
}
