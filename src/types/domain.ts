// Modelos de domínio compartilhados pelo app (independentes do Supabase).

export type SaleMode = 'ITEMS' | 'AMOUNT';
export type Period = 'MORNING' | 'AFTERNOON' | 'NIGHT';
export type PaymentKind = 'CREDIT' | 'PAID_NOW';
export type PaymentMethod = 'CASH' | 'PIX';
export type SaleStatus = 'ACTIVE' | 'CANCELLED';
export type ConfirmationStatus = 'PENDING' | 'SIGNED' | 'CONFIRMED_ONLINE' | 'DISPUTED' | 'CANCELLED';

/** Estado de envio de uma operação guardada no celular (independe do estado financeiro). */
export type SyncState = 'PENDING' | 'SYNCING' | 'SYNCED' | 'FAILED';

export interface SaleItemDraft {
  productId: string;
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

export interface SaleDraft {
  id: string;
  customerId: string;
  establishmentId: string;
  mode: SaleMode;
  period: Period;
  occurredAt: string; // ISO 8601, relógio do celular
  items: SaleItemDraft[]; // ITEMS: na ordem da posição; AMOUNT: vazio
  description: string | null; // AMOUNT: obrigatória; ITEMS: null
  totalCents: number;
  paymentKind: PaymentKind;
  paidNow?: { paymentId: string; method: PaymentMethod };
}

export type OutboxOpType = 'CREATE_SALE' | 'UPLOAD_SIGNATURE' | 'CANCEL_SALE' | 'REGISTER_PAYMENT';

export interface OutboxError {
  kind: 'transient' | 'permanent' | 'auth';
  code: string;
  message: string;
}

export interface OutboxOp {
  opId: string;
  type: OutboxOpType;
  entityId: string;
  payload: unknown;
  dependsOn: string[];
  state: SyncState;
  attempts: number;
  nextAttemptAt: number; // epoch ms
  lastError?: OutboxError;
  createdAt: number; // epoch ms
  updatedAt: number;
}

export interface SaleLimits {
  saleMaxCents: number;
  itemMaxQty: number;
}
