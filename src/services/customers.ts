// Clientes da Rose. O saldo vem sempre derivado do banco (customer_overview).
import { emptyToNull, phoneToE164, type CustomerForm } from '@/domain/registry';
import type { Client } from '@/lib/supabase/client';
import { need, throwIfError } from './shared';

export interface Customer {
  id: string;
  fullName: string;
  phoneE164: string | null;
  notes: string | null;
  isActive: boolean;
  portalLinked: boolean;
  linkedAt: string | null;
  /** Positivo = deve; negativo = tem crédito. */
  balanceCents: number;
  lastSaleAt: string | null;
  lastPaymentAt: string | null;
  establishmentIds: string[];
  createdAt: string;
}

export async function listCustomers(client: Client): Promise<Customer[]> {
  const { data, error } = await client
    .from('customer_overview')
    .select(
      'id, full_name, phone_e164, notes, is_active, portal_linked, linked_at, balance_cents, last_sale_at, last_payment_at, establishment_ids, created_at',
    )
    .order('full_name');
  throwIfError(error);
  return (data ?? []).map((r) => ({
    id: need(r.id, 'id'),
    fullName: need(r.full_name, 'full_name'),
    phoneE164: r.phone_e164,
    notes: r.notes,
    isActive: need(r.is_active, 'is_active'),
    portalLinked: r.portal_linked ?? false,
    linkedAt: r.linked_at,
    balanceCents: r.balance_cents ?? 0,
    lastSaleAt: r.last_sale_at,
    lastPaymentAt: r.last_payment_at,
    establishmentIds: r.establishment_ids ?? [],
    createdAt: need(r.created_at, 'created_at'),
  }));
}

/** Cliente e estabelecimentos numa transação só (RPC save_customer). */
export async function saveCustomer(client: Client, id: string, form: CustomerForm): Promise<void> {
  const { error } = await client.rpc('save_customer', {
    p_id: id,
    p_full_name: form.fullName.trim(),
    p_phone_e164: phoneToE164(form.phone) ?? '',
    p_notes: emptyToNull(form.notes) ?? '',
    p_is_active: form.isActive,
    p_establishment_ids: form.establishmentIds,
  });
  throwIfError(error);
}
