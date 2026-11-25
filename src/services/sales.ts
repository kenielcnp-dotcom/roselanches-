// Vendas: envio idempotente (create_sale), cancelamento, lista e extrato.
import { z } from 'zod';
import type { Client } from '@/lib/supabase/client';
import type { ConfirmationStatus, PaymentKind, PaymentMethod, Period, SaleDraft, SaleMode, SaleStatus } from '@/types/domain';
import { need, throwIfError } from './shared';

/** Corpo enviado à RPC create_sale. Fica guardado na fila do celular e é reenviado igual. */
export interface CreateSalePayload {
  id: string;
  customer_id: string;
  establishment_id: string;
  mode: SaleMode;
  period: Period;
  occurred_at: string;
  description: string | null;
  total_cents: number;
  payment_kind: PaymentKind;
  paid_now: { payment_id: string; method: PaymentMethod } | null;
  items: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price_cents: number;
    subtotal_cents: number;
  }[];
}

export function toCreateSalePayload(d: SaleDraft): CreateSalePayload {
  return {
    id: d.id,
    customer_id: d.customerId,
    establishment_id: d.establishmentId,
    mode: d.mode,
    period: d.period,
    occurred_at: d.occurredAt,
    description: d.mode === 'AMOUNT' ? (d.description ?? '').trim() : null,
    total_cents: d.totalCents,
    payment_kind: d.paymentKind,
    paid_now: d.paymentKind === 'PAID_NOW' && d.paidNow ? { payment_id: d.paidNow.paymentId, method: d.paidNow.method } : null,
    items: d.items.map((i) => ({
      product_id: i.productId,
      product_name: i.productName,
      quantity: i.quantity,
      unit_price_cents: i.unitPriceCents,
      subtotal_cents: i.subtotalCents,
    })),
  };
}

const createResult = z.object({
  status: z.enum(['CREATED', 'DUPLICATE', 'CONFLICT']),
  sale_id: z.uuid(),
  flags: z.array(z.string()).optional(),
});

export interface CreateSaleResult {
  status: 'CREATED' | 'DUPLICATE' | 'CONFLICT';
  saleId: string;
  flags: string[];
}

export async function createSale(client: Client, payload: CreateSalePayload): Promise<CreateSaleResult> {
  const { data, error } = await client.rpc('create_sale', { p_sale: payload as unknown as never });
  throwIfError(error);
  const r = createResult.parse(data);
  return { status: r.status, saleId: r.sale_id, flags: r.flags ?? [] };
}

const cancelResult = z.object({ status: z.enum(['CANCELLED', 'ALREADY_CANCELLED']) });

export async function cancelSale(client: Client, saleId: string, reason: string): Promise<'CANCELLED' | 'ALREADY_CANCELLED'> {
  const { data, error } = await client.rpc('cancel_sale', { p_sale_id: saleId, p_reason: reason.trim() });
  throwIfError(error);
  return cancelResult.parse(data).status;
}

// -----------------------------------------------------------------------------
// Lista de vendas (servidor)
// -----------------------------------------------------------------------------
export interface SaleRow {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  establishmentId: string;
  establishmentName: string;
  mode: SaleMode;
  period: Period;
  summary: string;
  totalCents: number;
  paymentKind: PaymentKind;
  paidMethod: PaymentMethod | null;
  status: SaleStatus;
  cancelReason: string | null;
  confirmationStatus: ConfirmationStatus;
  occurredAt: string;
}

const SALE_LIST_COLUMNS =
  'id, customer_id, customer_name, customer_phone, establishment_id, establishment_name, mode, period, description, items_summary, total_cents, payment_kind, paid_method, status, cancel_reason, confirmation_status, occurred_at';

interface SaleListRow {
  id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  establishment_id: string | null;
  establishment_name: string | null;
  mode: string | null;
  period: string | null;
  description: string | null;
  items_summary: string | null;
  total_cents: number | null;
  payment_kind: string | null;
  paid_method: string | null;
  status: string | null;
  cancel_reason: string | null;
  confirmation_status: string | null;
  occurred_at: string | null;
}

function toSaleRow(r: SaleListRow): SaleRow {
  return {
    id: need(r.id, 'id'),
    customerId: need(r.customer_id, 'customer_id'),
    customerName: need(r.customer_name, 'customer_name'),
    customerPhone: r.customer_phone,
    establishmentId: need(r.establishment_id, 'establishment_id'),
    establishmentName: need(r.establishment_name, 'establishment_name'),
    mode: need(r.mode, 'mode') as SaleMode,
    period: need(r.period, 'period') as Period,
    summary: (r.mode === 'ITEMS' ? r.items_summary : r.description) ?? '',
    totalCents: need(r.total_cents, 'total_cents'),
    paymentKind: need(r.payment_kind, 'payment_kind') as PaymentKind,
    paidMethod: (r.paid_method as PaymentMethod | null) ?? null,
    status: need(r.status, 'status') as SaleStatus,
    cancelReason: r.cancel_reason,
    confirmationStatus: need(r.confirmation_status, 'confirmation_status') as ConfirmationStatus,
    occurredAt: need(r.occurred_at, 'occurred_at'),
  };
}

export async function listSales(client: Client, filter: { since: string; customerId?: string }): Promise<SaleRow[]> {
  let q = client
    .from('sale_list')
    .select(SALE_LIST_COLUMNS)
    .gte('occurred_at', filter.since)
    .order('occurred_at', { ascending: false })
    .limit(200);
  if (filter.customerId) q = q.eq('customer_id', filter.customerId);
  const { data, error } = await q;
  throwIfError(error);
  return (data ?? []).map(toSaleRow);
}

export async function fetchSale(client: Client, saleId: string): Promise<{ sale: SaleRow; items: SaleItemRow[] } | null> {
  const [list, items] = await Promise.all([
    client.from('sale_list').select(SALE_LIST_COLUMNS).eq('id', saleId)
      .maybeSingle(),
    client
      .from('sale_items')
      .select('position, product_name, quantity, unit_price_cents, subtotal_cents')
      .eq('sale_id', saleId)
      .order('position'),
  ]);
  throwIfError(list.error);
  throwIfError(items.error);
  const r = list.data;
  if (!r) return null;
  return {
    sale: toSaleRow(r),
    items: (items.data ?? []).map((i) => ({
      productName: i.product_name,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      subtotalCents: i.subtotal_cents,
    })),
  };
}

export interface SaleItemRow {
  productName: string;
  quantity: number;
  unitPriceCents: number;
  subtotalCents: number;
}

// -----------------------------------------------------------------------------
// Extrato do cliente
// -----------------------------------------------------------------------------
export type StatementKind = 'SALE' | 'PAYMENT' | 'OPENING_BALANCE' | 'ADJUSTMENT_DEBIT' | 'ADJUSTMENT_CREDIT';

export interface StatementEntry {
  kind: StatementKind;
  id: string;
  occurredAt: string;
  period: Period | null;
  establishmentName: string | null;
  mode: SaleMode | null;
  description: string | null;
  items: SaleItemRow[] | null;
  amountCents: number;
  paymentKind: PaymentKind | null;
  method: PaymentMethod | null;
  /** ACTIVE/CANCELLED (vendas, saldo anterior, ajustes) ou CONFIRMED/REVERSED (pagamentos). */
  status: string;
  statusReason: string | null;
  confirmationStatus: ConfirmationStatus | null;
  /** Quanto desta dívida ainda está em aberto (null quando não se aplica). */
  openCents: number | null;
}

const itemsSchema = z
  .array(z.object({ name: z.string(), quantity: z.number(), unit_price_cents: z.number(), subtotal_cents: z.number() }))
  .nullable();

export interface StatementCursor {
  beforeAt: string;
  beforeId: string;
}

export async function fetchStatement(
  client: Client,
  customerId: string,
  cursor: StatementCursor | null,
  limit = 30,
): Promise<StatementEntry[]> {
  const { data, error } = await client.rpc('customer_statement', {
    p_customer: customerId,
    p_before_at: cursor?.beforeAt,
    p_before_id: cursor?.beforeId,
    p_limit: limit,
  });
  throwIfError(error);
  return (data ?? []).map(toStatementEntry);
}

/** Linha do extrato (mesmo formato para a Rose e para o portal do cliente). */
export interface StatementRow {
  kind: string;
  entry_id: string;
  occurred_at: string;
  period: string | null;
  establishment_name: string | null;
  mode: string | null;
  description: string | null;
  items: unknown;
  amount_cents: number;
  payment_kind: string | null;
  method: string | null;
  status: string;
  status_reason: string | null;
  confirmation_status: string | null;
  open_cents: number | null;
}

export function toStatementEntry(r: StatementRow): StatementEntry {
  const items = itemsSchema.parse(r.items ?? null);
  return {
    kind: r.kind as StatementKind,
    id: r.entry_id,
    occurredAt: r.occurred_at,
    period: (r.period as Period | null) ?? null,
    establishmentName: r.establishment_name,
    mode: (r.mode as SaleMode | null) ?? null,
    description: r.description,
    items: items?.map((i) => ({
      productName: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      subtotalCents: i.subtotal_cents,
    })) ?? null,
    amountCents: r.amount_cents,
    paymentKind: (r.payment_kind as PaymentKind | null) ?? null,
    method: (r.method as PaymentMethod | null) ?? null,
    status: r.status,
    statusReason: r.status_reason,
    confirmationStatus: (r.confirmation_status as ConfirmationStatus | null) ?? null,
    openCents: r.open_cents,
  };
}
