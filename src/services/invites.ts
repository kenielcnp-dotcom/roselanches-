// Convites do portal (lado da Rose): gerar, cancelar, desvincular e as
// contestações que os clientes abriram.
import { z } from 'zod';
import type { Client } from '@/lib/supabase/client';
import { need, throwIfError } from './shared';

export interface CreatedInvite {
  /** Só existe neste momento: o banco guarda apenas o hash. */
  token: string;
  expiresAt: string;
}

/** Link do convite. O token vai depois do "#", que o navegador não envia a servidor nenhum. */
export function inviteLink(origin: string, token: string): string {
  return `${origin}/convite#t=${token}`;
}

export async function createInvite(client: Client, customerId: string): Promise<CreatedInvite> {
  const { data, error } = await client.rpc('create_customer_invite', { p_customer: customerId });
  throwIfError(error);
  const r = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{32}$/), expires_at: z.string() }).parse(data);
  return { token: r.token, expiresAt: r.expires_at };
}

export async function cancelInvite(client: Client, customerId: string): Promise<void> {
  const { error } = await client.rpc('cancel_customer_invite', { p_customer: customerId });
  throwIfError(error);
}

export async function unlinkAccount(client: Client, customerId: string, reason: string): Promise<void> {
  const { error } = await client.rpc('unlink_customer_account', { p_customer: customerId, p_reason: reason.trim() });
  throwIfError(error);
}

export interface OpenInvite {
  createdAt: string;
  expiresAt: string;
}

/** Convite ainda em aberto (sem o link, que não pode ser recuperado). */
export async function fetchOpenInvite(client: Client, customerId: string): Promise<OpenInvite | null> {
  const { data, error } = await client
    .from('customer_invites')
    .select('created_at, expires_at')
    .eq('customer_id', customerId)
    .is('used_at', null)
    .is('cancelled_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  throwIfError(error);
  return data ? { createdAt: data.created_at, expiresAt: data.expires_at } : null;
}

// -----------------------------------------------------------------------------
// Contestações
// -----------------------------------------------------------------------------
export interface OpenDispute {
  saleId: string;
  customerId: string;
  customerName: string;
  establishmentName: string;
  totalCents: number;
  occurredAt: string;
  reason: string;
  disputedAt: string;
}

export async function listOpenDisputes(client: Client): Promise<OpenDispute[]> {
  const { data, error } = await client.from('sale_dispute_list').select('*').order('disputed_at', { ascending: false });
  throwIfError(error);
  return (data ?? []).map((d) => ({
    saleId: need(d.sale_id, 'sale_id'),
    customerId: need(d.customer_id, 'customer_id'),
    customerName: need(d.customer_name, 'customer_name'),
    establishmentName: need(d.establishment_name, 'establishment_name'),
    totalCents: need(d.total_cents, 'total_cents'),
    occurredAt: need(d.occurred_at, 'occurred_at'),
    reason: need(d.dispute_reason, 'dispute_reason'),
    disputedAt: need(d.disputed_at, 'disputed_at'),
  }));
}

export interface SaleOnlineResponse {
  status: 'CONFIRMED_ONLINE' | 'DISPUTED';
  disputeReason: string | null;
  receivedAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

/** Última confirmação ou contestação do cliente pelo app, para a tela da venda. */
export async function fetchSaleOnlineResponse(client: Client, saleId: string): Promise<SaleOnlineResponse | null> {
  const { data, error } = await client
    .from('sale_confirmations')
    .select('confirmation_status, dispute_reason, received_at, resolved_at, resolution_note')
    .eq('sale_id', saleId)
    .eq('confirmation_type', 'ONLINE_CONFIRMATION')
    .in('confirmation_status', ['CONFIRMED_ONLINE', 'DISPUTED'])
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  if (!data) return null;
  return {
    status: data.confirmation_status as 'CONFIRMED_ONLINE' | 'DISPUTED',
    disputeReason: data.dispute_reason,
    receivedAt: data.received_at,
    resolvedAt: data.resolved_at,
    resolutionNote: data.resolution_note,
  };
}

export async function resolveDispute(client: Client, saleId: string, note: string): Promise<void> {
  const { error } = await client.rpc('resolve_sale_dispute', { p_sale: saleId, p_note: note.trim() });
  throwIfError(error);
}
