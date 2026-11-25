// Portal do cliente: tudo pelas RPCs portal_* (o cliente não lê nenhuma tabela).
// Nada daqui é guardado no aparelho: sem internet, o portal só avisa.
import { z } from 'zod';
import type { Client } from '@/lib/supabase/client';
import type { PixKeyType } from '@/domain/pix';
import type { ConfirmationStatus, PaymentKind, PaymentMethod, Period, SaleMode } from '@/types/domain';
import { toStatementEntry, type StatementCursor, type StatementEntry } from './sales';
import { throwIfError } from './shared';

// -----------------------------------------------------------------------------
// Convite: o cliente usa o link que a Rose mandou
// -----------------------------------------------------------------------------
export type RedeemStatus =
  | 'LINKED'
  | 'ALREADY_LINKED'
  | 'INVALID'
  | 'EXPIRED'
  | 'USED'
  | 'CANCELLED'
  | 'CUSTOMER_IN_USE'
  | 'ACCOUNT_IN_USE'
  | 'STAFF_ACCOUNT'
  | 'TOO_MANY_ATTEMPTS';

const redeemSchema = z.object({
  status: z.enum([
    'LINKED',
    'ALREADY_LINKED',
    'INVALID',
    'EXPIRED',
    'USED',
    'CANCELLED',
    'CUSTOMER_IN_USE',
    'ACCOUNT_IN_USE',
    'STAFF_ACCOUNT',
    'TOO_MANY_ATTEMPTS',
  ]),
  customer_name: z.string().optional(),
  business_name: z.string().optional(),
});

export interface RedeemResult {
  status: RedeemStatus;
  customerName: string | null;
  businessName: string | null;
}

export async function redeemInvite(client: Client, token: string): Promise<RedeemResult> {
  const { data, error } = await client.rpc('redeem_customer_invite', { p_token: token });
  throwIfError(error);
  const r = redeemSchema.parse(data);
  return { status: r.status, customerName: r.customer_name ?? null, businessName: r.business_name ?? null };
}

// -----------------------------------------------------------------------------
// Resumo da conta
// -----------------------------------------------------------------------------
const noticeSchema = z.object({
  id: z.uuid(),
  amount_cents: z.number().nullable(),
  note: z.string().nullable(),
  status: z.enum(['PENDING', 'CONFIRMED', 'REJECTED']),
  resolution_note: z.string().nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
});

const summarySchema = z.object({
  customer_name: z.string(),
  business_name: z.string(),
  balance_cents: z.number(),
  last_payment_at: z.string().nullable(),
  to_confirm: z.number(),
  disputed: z.number(),
  pix_configured: z.boolean().nullable(),
  establishments: z.array(z.object({ id: z.uuid(), name: z.string() })),
  notices: z.array(noticeSchema),
});

export interface PortalNotice {
  id: string;
  amountCents: number | null;
  note: string | null;
  status: 'PENDING' | 'CONFIRMED' | 'REJECTED';
  resolutionNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface PortalSummary {
  customerName: string;
  businessName: string;
  /** Positivo = deve; negativo = tem crédito. */
  balanceCents: number;
  lastPaymentAt: string | null;
  toConfirm: number;
  disputed: number;
  pixConfigured: boolean;
  establishments: { id: string; name: string }[];
  notices: PortalNotice[];
}

export async function fetchPortalSummary(client: Client): Promise<PortalSummary> {
  const { data, error } = await client.rpc('portal_summary');
  throwIfError(error);
  const s = summarySchema.parse(data);
  return {
    customerName: s.customer_name,
    businessName: s.business_name,
    balanceCents: s.balance_cents,
    lastPaymentAt: s.last_payment_at,
    toConfirm: s.to_confirm,
    disputed: s.disputed,
    pixConfigured: s.pix_configured ?? false,
    establishments: s.establishments,
    notices: s.notices.map((n) => ({
      id: n.id,
      amountCents: n.amount_cents,
      note: n.note,
      status: n.status,
      resolutionNote: n.resolution_note,
      createdAt: n.created_at,
      resolvedAt: n.resolved_at,
    })),
  };
}

// -----------------------------------------------------------------------------
// Extrato
// -----------------------------------------------------------------------------
export type PortalFilter = 'ALL' | 'SALES' | 'PAYMENTS' | 'TO_CONFIRM' | 'OPEN';

export async function fetchPortalStatement(
  client: Client,
  filter: PortalFilter,
  establishmentId: string | null,
  cursor: StatementCursor | null,
  limit = 20,
): Promise<StatementEntry[]> {
  const { data, error } = await client.rpc('portal_statement', {
    p_before_at: cursor?.beforeAt,
    p_before_id: cursor?.beforeId,
    p_limit: limit,
    p_filter: filter,
    p_establishment: establishmentId ?? undefined,
  });
  throwIfError(error);
  return (data ?? []).map(toStatementEntry);
}

// -----------------------------------------------------------------------------
// Detalhe da compra, confirmação e contestação
// -----------------------------------------------------------------------------
const saleDetailSchema = z.object({
  id: z.uuid(),
  occurred_at: z.string(),
  period: z.enum(['MORNING', 'AFTERNOON', 'NIGHT']),
  establishment_name: z.string(),
  mode: z.enum(['ITEMS', 'AMOUNT']),
  description: z.string().nullable(),
  items: z
    .array(z.object({ name: z.string(), quantity: z.number(), unit_price_cents: z.number(), subtotal_cents: z.number() }))
    .nullable(),
  total_cents: z.number(),
  payment_kind: z.enum(['CREDIT', 'PAID_NOW']),
  paid_method: z.enum(['CASH', 'PIX']).nullable(),
  status: z.enum(['ACTIVE', 'CANCELLED']),
  cancel_reason: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  confirmation_status: z.enum(['PENDING', 'SIGNED', 'CONFIRMED_ONLINE', 'DISPUTED', 'CANCELLED']),
  open_cents: z.number().nullable(),
  terms_version: z.string(),
  terms_body: z.string(),
  document_hash: z.string().regex(/^[0-9a-f]{64}$/),
  signature: z.object({ path: z.string(), received_at: z.string(), status: z.string() }).nullable(),
  online: z
    .object({
      id: z.uuid(),
      status: z.enum(['CONFIRMED_ONLINE', 'DISPUTED']),
      dispute_reason: z.string().nullable(),
      received_at: z.string(),
      resolved_at: z.string().nullable(),
      resolution_note: z.string().nullable(),
    })
    .nullable(),
});

export interface PortalSaleDetail {
  id: string;
  occurredAt: string;
  period: Period;
  establishmentName: string;
  mode: SaleMode;
  description: string | null;
  items: { name: string; quantity: number; unitPriceCents: number; subtotalCents: number }[];
  totalCents: number;
  paymentKind: PaymentKind;
  paidMethod: PaymentMethod | null;
  status: 'ACTIVE' | 'CANCELLED';
  cancelReason: string | null;
  confirmationStatus: ConfirmationStatus;
  openCents: number | null;
  termsVersion: string;
  termsBody: string;
  documentHash: string;
  /** Assinatura feita na tela da Rose (caminho no Storage, visível só para este cliente). */
  signature: { path: string; receivedAt: string; valid: boolean } | null;
  /** Última manifestação pelo app (confirmação ou contestação). */
  online: {
    status: 'CONFIRMED_ONLINE' | 'DISPUTED';
    disputeReason: string | null;
    receivedAt: string;
    resolvedAt: string | null;
    resolutionNote: string | null;
  } | null;
}

export async function fetchPortalSale(client: Client, saleId: string): Promise<PortalSaleDetail> {
  const { data, error } = await client.rpc('portal_sale_detail', { p_sale: saleId });
  throwIfError(error);
  const s = saleDetailSchema.parse(data);
  return {
    id: s.id,
    occurredAt: s.occurred_at,
    period: s.period,
    establishmentName: s.establishment_name,
    mode: s.mode,
    description: s.description,
    items: (s.items ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unit_price_cents,
      subtotalCents: i.subtotal_cents,
    })),
    totalCents: s.total_cents,
    paymentKind: s.payment_kind,
    paidMethod: s.paid_method,
    status: s.status,
    cancelReason: s.cancel_reason,
    confirmationStatus: s.confirmation_status,
    openCents: s.open_cents,
    termsVersion: s.terms_version,
    termsBody: s.terms_body,
    documentHash: s.document_hash,
    signature: s.signature
      ? { path: s.signature.path, receivedAt: s.signature.received_at, valid: s.signature.status === 'SIGNED' }
      : null,
    online: s.online
      ? {
          status: s.online.status,
          disputeReason: s.online.dispute_reason,
          receivedAt: s.online.received_at,
          resolvedAt: s.online.resolved_at,
          resolutionNote: s.online.resolution_note,
        }
      : null,
  };
}

const respondSchema = z.object({
  status: z.enum(['CREATED', 'DUPLICATE', 'CONFLICT', 'ALREADY']),
});
export type RespondStatus = z.infer<typeof respondSchema>['status'];

export interface SaleResponseInput {
  /** Gerado quando a tela abre: toque duplo ou reenvio não duplica. */
  id: string;
  saleId: string;
  documentHash: string;
  termsVersion: string;
}

export async function confirmPortalSale(client: Client, input: SaleResponseInput): Promise<RespondStatus> {
  const { data, error } = await client.rpc('portal_confirm_sale', {
    p_confirmation: {
      id: input.id,
      sale_id: input.saleId,
      document_hash: input.documentHash,
      terms_version: input.termsVersion,
    },
  });
  throwIfError(error);
  return respondSchema.parse(data).status;
}

export async function disputePortalSale(client: Client, input: SaleResponseInput & { reason: string }): Promise<RespondStatus> {
  const { data, error } = await client.rpc('portal_dispute_sale', {
    p_confirmation: {
      id: input.id,
      sale_id: input.saleId,
      document_hash: input.documentHash,
      terms_version: input.termsVersion,
      reason: input.reason.trim(),
    },
  });
  throwIfError(error);
  return respondSchema.parse(data).status;
}

/** URL de 2 minutos da assinatura do próprio cliente (o Storage confere a dona do arquivo). */
export async function portalSignatureUrl(client: Client, path: string): Promise<string | null> {
  const { data, error } = await client.storage.from('sale-signatures').createSignedUrl(path, 120);
  if (error) throw error;
  return data?.signedUrl ?? null;
}

// -----------------------------------------------------------------------------
// Pix e "Já paguei"
// -----------------------------------------------------------------------------
const pixSchema = z.object({
  business_name: z.string(),
  key: z.string().nullable(),
  key_type: z.enum(['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP']).nullable(),
  receiver_name: z.string().nullable(),
  city: z.string().nullable(),
});

export interface PortalPix {
  businessName: string;
  key: string | null;
  keyType: PixKeyType | null;
  receiverName: string | null;
  city: string | null;
}

export async function fetchPortalPix(client: Client): Promise<PortalPix> {
  const { data, error } = await client.rpc('portal_pix_info');
  throwIfError(error);
  const p = pixSchema.parse(data);
  return { businessName: p.business_name, key: p.key, keyType: p.key_type, receiverName: p.receiver_name, city: p.city };
}

export interface NotifyPaymentInput {
  id: string;
  amountCents: number | null;
  note: string | null;
}

export async function notifyPayment(client: Client, input: NotifyPaymentInput): Promise<'CREATED' | 'DUPLICATE' | 'CONFLICT'> {
  const { data, error } = await client.rpc('portal_notify_payment', {
    p_notice: { id: input.id, amount_cents: input.amountCents, note: input.note?.trim() || null },
  });
  throwIfError(error);
  return z.object({ status: z.enum(['CREATED', 'DUPLICATE', 'CONFLICT']) }).parse(data).status;
}
