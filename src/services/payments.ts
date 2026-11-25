// Recebimentos: pagamentos (também pela fila do celular), estornos, saldo
// anterior, ajustes e avisos "Já paguei" dos clientes.
import { z } from 'zod';
import type { Client } from '@/lib/supabase/client';
import type { PaymentMethod } from '@/types/domain';
import { need, throwIfError } from './shared';

/** Corpo enviado a register_payment. Fica guardado na fila e é reenviado igual. */
export interface RegisterPaymentPayload {
  id: string;
  customer_id: string;
  amount_cents: number;
  method: PaymentMethod;
  received_at: string;
  note: string | null;
}

const writeResult = z.object({ status: z.enum(['CREATED', 'DUPLICATE', 'CONFLICT']) });
export type WriteStatus = z.infer<typeof writeResult>['status'];

export async function registerPayment(client: Client, payload: RegisterPaymentPayload): Promise<WriteStatus> {
  const { data, error } = await client.rpc('register_payment', { p_payment: payload as unknown as never });
  throwIfError(error);
  return writeResult.parse(data).status;
}

export async function reversePayment(client: Client, paymentId: string, reason: string): Promise<void> {
  const { error } = await client.rpc('reverse_payment', { p_payment_id: paymentId, p_reason: reason.trim() });
  throwIfError(error);
}

export interface OpeningBalanceInput {
  id: string;
  customerId: string;
  amountCents: number;
  referenceDate: string; // AAAA-MM-DD
  note: string;
}

export async function createOpeningBalance(client: Client, e: OpeningBalanceInput): Promise<WriteStatus> {
  const { data, error } = await client.rpc('create_opening_balance', {
    p_entry: { id: e.id, customer_id: e.customerId, amount_cents: e.amountCents, reference_date: e.referenceDate, note: e.note.trim() },
  });
  throwIfError(error);
  return writeResult.parse(data).status;
}

export interface AdjustmentInput {
  id: string;
  customerId: string;
  direction: 'DEBIT' | 'CREDIT';
  amountCents: number;
  reason: string;
}

export async function createAdjustment(client: Client, e: AdjustmentInput): Promise<WriteStatus> {
  const { data, error } = await client.rpc('create_adjustment', {
    p_entry: { id: e.id, customer_id: e.customerId, direction: e.direction, amount_cents: e.amountCents, reason: e.reason.trim() },
  });
  throwIfError(error);
  return writeResult.parse(data).status;
}

export async function cancelEntry(client: Client, kind: 'OPENING_BALANCE' | 'ADJUSTMENT', id: string, reason: string): Promise<void> {
  const { error } = await client.rpc('cancel_entry', { p_kind: kind, p_id: id, p_reason: reason.trim() });
  throwIfError(error);
}

// -----------------------------------------------------------------------------
// Listas
// -----------------------------------------------------------------------------
export interface PaymentRow {
  id: string;
  customerId: string;
  customerName: string;
  amountCents: number;
  method: PaymentMethod;
  source: 'MANUAL' | 'SALE_PAID_NOW' | 'PIX_NOTIFICATION';
  receivedAt: string;
  note: string | null;
  status: 'CONFIRMED' | 'REVERSED';
  reverseReason: string | null;
}

export async function listPayments(client: Client, filter: { since?: string; id?: string }): Promise<PaymentRow[]> {
  let q = client
    .from('payment_list')
    .select('id, customer_id, customer_name, amount_cents, method, source, received_at, note, status, reverse_reason')
    .order('received_at', { ascending: false })
    .limit(200);
  if (filter.since) q = q.gte('received_at', filter.since);
  if (filter.id) q = q.eq('id', filter.id);
  const { data, error } = await q;
  throwIfError(error);
  return (data ?? []).map((r) => ({
    id: need(r.id, 'id'),
    customerId: need(r.customer_id, 'customer_id'),
    customerName: need(r.customer_name, 'customer_name'),
    amountCents: need(r.amount_cents, 'amount_cents'),
    method: need(r.method, 'method') as PaymentMethod,
    source: need(r.source, 'source') as PaymentRow['source'],
    receivedAt: need(r.received_at, 'received_at'),
    note: r.note,
    status: need(r.status, 'status') as PaymentRow['status'],
    reverseReason: r.reverse_reason,
  }));
}

export interface PaymentNotice {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string | null;
  amountCents: number | null;
  note: string | null;
  createdAt: string;
  customerBalanceCents: number;
}

export async function listPendingNotices(client: Client): Promise<PaymentNotice[]> {
  const { data, error } = await client
    .from('payment_notification_list')
    .select('id, customer_id, customer_name, customer_phone, amount_cents, note, created_at, customer_balance_cents')
    .eq('status', 'PENDING')
    .order('created_at');
  throwIfError(error);
  return (data ?? []).map((r) => ({
    id: need(r.id, 'id'),
    customerId: need(r.customer_id, 'customer_id'),
    customerName: need(r.customer_name, 'customer_name'),
    customerPhone: r.customer_phone,
    amountCents: r.amount_cents,
    note: r.note,
    createdAt: need(r.created_at, 'created_at'),
    customerBalanceCents: r.customer_balance_cents ?? 0,
  }));
}

export async function confirmNotice(
  client: Client,
  notice: { id: string; paymentId: string; amountCents: number; receivedAt: string; note?: string },
): Promise<void> {
  const { error } = await client.rpc('confirm_payment_notification', {
    p_notification_id: notice.id,
    p_payment_id: notice.paymentId,
    p_amount_cents: notice.amountCents,
    p_received_at: notice.receivedAt,
    p_note: notice.note ?? '',
  });
  throwIfError(error);
}

export async function rejectNotice(client: Client, id: string, reason: string): Promise<void> {
  const { error } = await client.rpc('reject_payment_notification', { p_notification_id: id, p_reason: reason.trim() });
  throwIfError(error);
}
