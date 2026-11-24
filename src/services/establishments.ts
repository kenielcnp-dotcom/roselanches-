// Estabelecimentos (lugares onde a Rose vende) e vínculos com clientes.
import { emptyToNull, type EstablishmentForm } from '@/domain/registry';
import type { Client } from '@/lib/supabase/client';
import { isDuplicateOfSameRecord, need, throwIfError } from './shared';

export interface Establishment {
  id: string;
  name: string;
  nickname: string | null;
  address: string | null;
  notes: string | null;
  isActive: boolean;
  /** Clientes ativos vinculados. */
  customerCount: number;
}

const DUPLICATE_NAME = 'Já existe um estabelecimento com esse nome.';

export async function listEstablishments(client: Client): Promise<Establishment[]> {
  const { data, error } = await client
    .from('establishment_overview')
    .select('id, name, nickname, address, notes, is_active, customer_count')
    .order('name');
  throwIfError(error);
  return (data ?? []).map((r) => ({
    id: need(r.id, 'id'),
    name: need(r.name, 'name'),
    nickname: r.nickname,
    address: r.address,
    notes: r.notes,
    isActive: need(r.is_active, 'is_active'),
    customerCount: r.customer_count ?? 0,
  }));
}

function columns(form: EstablishmentForm) {
  return {
    name: form.name.trim(),
    nickname: emptyToNull(form.nickname),
    address: emptyToNull(form.address),
    notes: emptyToNull(form.notes),
    is_active: form.isActive,
  };
}

/** O id vem do app: repetir o envio não cria um segundo estabelecimento. */
export async function createEstablishment(client: Client, id: string, form: EstablishmentForm): Promise<void> {
  const { error } = await client.from('establishments').insert({ id, ...columns(form) });
  if (isDuplicateOfSameRecord(error)) return;
  throwIfError(error, DUPLICATE_NAME);
}

export async function updateEstablishment(client: Client, id: string, form: EstablishmentForm): Promise<void> {
  const { error } = await client.from('establishments').update(columns(form)).eq('id', id);
  throwIfError(error, DUPLICATE_NAME);
}

export async function linkCustomer(client: Client, establishmentId: string, customerId: string): Promise<void> {
  const { error } = await client
    .from('customer_establishments')
    .insert({ establishment_id: establishmentId, customer_id: customerId });
  // Já vinculado (outra aba ou reenvio): é o resultado desejado.
  if (error?.code === '23505') return;
  throwIfError(error);
}

/** Remove só o vínculo; as vendas feitas naquele local continuam com o local. */
export async function unlinkCustomer(client: Client, establishmentId: string, customerId: string): Promise<void> {
  const { error } = await client
    .from('customer_establishments')
    .delete()
    .eq('establishment_id', establishmentId)
    .eq('customer_id', customerId);
  throwIfError(error);
}
