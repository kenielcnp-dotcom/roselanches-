// Banco local do celular (IndexedDB via Dexie), um por conta: "ldr-<userId>".
//
//   * Cache do catálogo (estabelecimentos, clientes, produtos, configurações):
//     renovado por inteiro a cada atualização. É o que permite vender sem internet.
//   * localSales: vendas feitas neste celular, para mostrar enquanto não chegam ao servidor.
//   * outbox: fila persistente de operações a enviar.
//
// Nada de senha, token ou dado financeiro além do necessário para vender.
import Dexie, { type Table } from 'dexie';
import type { OutboxOp, Period, SaleDraft } from '@/types/domain';

export interface CachedEstablishment {
  id: string;
  name: string;
  nickname: string | null;
  isActive: boolean;
  customerCount: number;
}

export interface CachedCustomer {
  id: string;
  fullName: string;
  phoneE164: string | null;
  /** Observação curta da Rose, para diferenciar homônimos. */
  notes: string | null;
  isActive: boolean;
  establishmentIds: string[];
  balanceCents: number;
  lastSaleAt: string | null;
}

export interface CachedProduct {
  id: string;
  name: string;
  priceCents: number;
  category: string | null;
  isActive: boolean;
  units90d: number;
}

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

export class LocalDb extends Dexie {
  meta!: Table<MetaRow, string>;
  establishments!: Table<CachedEstablishment, string>;
  customers!: Table<CachedCustomer, string>;
  products!: Table<CachedProduct, string>;
  localSales!: Table<LocalSale, string>;
  outbox!: Table<OutboxOp, string>;

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
