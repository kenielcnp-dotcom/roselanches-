// Banco local do celular (IndexedDB via Dexie), um por conta: "ldr-<userId>".
//
//   * Cache do catálogo (estabelecimentos, clientes, produtos, configurações):
//     renovado por inteiro a cada atualização. É o que permite vender sem internet.
//   * localSales: vendas feitas neste celular, para mostrar enquanto não chegam ao servidor.
//   * outbox: fila persistente de operações a enviar.
//
// Nada de senha, token ou dado financeiro além do necessário para vender.
import Dexie, { type Table } from 'dexie';
import type { Customer } from '@/services/customers';
import type { Establishment } from '@/services/establishments';
import type { Product } from '@/services/products';
import type { OutboxOp, Period, SaleDraft } from '@/types/domain';

/** Mesmos modelos das telas; no cliente, a observação vai só no começo (basta para diferenciar homônimos). */
export type CachedEstablishment = Establishment;
export type CachedCustomer = Customer;
export type CachedProduct = Product;

export interface CachedSettings {
  saleMaxCents: number;
  itemMaxQty: number;
  defaultSalePeriod: Period | null;
  requireSignature: boolean;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Venda feita neste celular. O estado de envio vem da operação na fila (opId). */
export interface LocalSale {
  id: string;
  opId: string;
  draft: SaleDraft;
  customerName: string;
  customerPhone: string | null;
  establishmentName: string;
  summary: string;
  createdAt: number;
  /** Cancelamento pedido neste celular (vai pela fila). */
  cancel?: { opId: string; reason: string; at: number };
}

/**
 * Assinatura capturada no celular, até chegar ao servidor. Presa à venda pelo
 * hash do resumo canônico que o cliente viu. Apagada depois do envio.
 */
export interface LocalSignature {
  confirmationId: string;
  saleId: string;
  png: ArrayBuffer;
  fileSha256: string;
  documentHash: string;
  termsVersion: string;
  capturedAt: string;
}

export class LocalDb extends Dexie {
  meta!: Table<MetaRow, string>;
  establishments!: Table<CachedEstablishment, string>;
  customers!: Table<CachedCustomer, string>;
  products!: Table<CachedProduct, string>;
  localSales!: Table<LocalSale, string>;
  outbox!: Table<OutboxOp, string>;
  localSignatures!: Table<LocalSignature, string>;

  constructor(name: string) {
    super(name);
    this.version(1).stores({
      meta: 'key',
      establishments: 'id',
      customers: 'id, *establishmentIds',
      products: 'id',
      localSales: 'id, createdAt, opId',
      outbox: 'opId, state, createdAt, entityId',
    });
    this.version(2).stores({ localSignatures: 'confirmationId, saleId' });
  }
}

export function localDbName(userId: string): string {
  return `ldr-${userId}`;
}

const open = new Map<string, LocalDb>();

export function getLocalDb(userId: string): LocalDb {
  const name = localDbName(userId);
  let db = open.get(name);
  if (!db) {
    db = new LocalDb(name);
    open.set(name, db);
  }
  return db;
}

/** Ao sair da conta: apaga tudo deste usuário no aparelho. */
export async function deleteLocalDb(userId: string): Promise<void> {
  const name = localDbName(userId);
  open.get(name)?.close();
  open.delete(name);
  await Dexie.delete(name);
}

export async function getMeta<T>(db: LocalDb, key: string): Promise<T | undefined> {
  return (await db.meta.get(key))?.value as T | undefined;
}

export async function setMeta(db: LocalDb, key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}
