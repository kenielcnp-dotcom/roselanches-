// Configurações do negócio. Só a dona altera (RLS + privilégio por coluna).
import type { Client } from '@/lib/supabase/client';
import { AppError } from '@/lib/supabase/errors';
import type { PixKeyType } from '@/domain/pix';
import type { Period } from '@/types/domain';
import { throwIfError } from './shared';

export interface BusinessSettings {
  timezone: string;
  saleMaxCents: number;
  itemMaxQty: number;
  /** null = período sugerido pela hora do dia. */
  defaultSalePeriod: Period | null;
  requireSignature: boolean;
  allowOnlineConfirmation: boolean;
  pix: PixSettings | null;
}

export interface PixSettings {
  keyType: PixKeyType;
  key: string;
  receiverName: string;
  city: string;
}

const PERIODS: readonly Period[] = ['MORNING', 'AFTERNOON', 'NIGHT'];

function toPeriod(value: string | null): Period | null {
  return PERIODS.find((p) => p === value) ?? null;
}

export async function fetchSettings(client: Client, businessId: string): Promise<BusinessSettings> {
  const { data, error } = await client
    .from('business_settings')
    .select(
      'timezone, sale_max_cents, item_max_qty, default_sale_period, require_signature, allow_online_confirmation, pix_key, pix_key_type, pix_receiver_name, pix_city',
    )
    .eq('business_id', businessId)
    .single();
  throwIfError(error);
  if (!data) throw new Error('Configurações do negócio não encontradas.');
  return {
    timezone: data.timezone,
    saleMaxCents: data.sale_max_cents,
    itemMaxQty: data.item_max_qty,
    defaultSalePeriod: toPeriod(data.default_sale_period),
    requireSignature: data.require_signature,
    allowOnlineConfirmation: data.allow_online_confirmation,
    pix:
      data.pix_key && data.pix_key_type
        ? {
            keyType: data.pix_key_type as PixKeyType,
            key: data.pix_key,
            receiverName: data.pix_receiver_name ?? '',
            city: data.pix_city ?? '',
          }
        : null,
  };
}

export interface SalesSettingsForm {
  timezone: string;
  saleMaxCents: number;
  itemMaxQty: number;
  defaultSalePeriod: Period | null;
  requireSignature: boolean;
}

export async function updateSalesSettings(client: Client, businessId: string, form: SalesSettingsForm): Promise<void> {
  const { data, error } = await client
    .from('business_settings')
    .update({
      timezone: form.timezone,
      sale_max_cents: form.saleMaxCents,
      item_max_qty: form.itemMaxQty,
      default_sale_period: form.defaultSalePeriod,
      require_signature: form.requireSignature,
    })
    .eq('business_id', businessId)
    .select('business_id');
  throwIfError(error);
  // Sem linha alterada = o RLS recusou (quem não é a dona).
  if (!data || data.length === 0) {
    throw new AppError('Só a dona do negócio pode alterar as configurações.', 'permission', 'NOT_OWNER');
  }
}

/** Dados do Pix que o cliente vê para pagar. null apaga (cliente não vê Pix). */
export async function updatePixSettings(client: Client, businessId: string, pix: PixSettings | null): Promise<void> {
  const { data, error } = await client
    .from('business_settings')
    .update({
      pix_key_type: pix?.keyType ?? null,
      pix_key: pix?.key ?? null,
      pix_receiver_name: pix ? pix.receiverName.trim() : null,
      pix_city: pix ? pix.city.trim() : null,
    })
    .eq('business_id', businessId)
    .select('business_id');
  throwIfError(error);
  if (!data || data.length === 0) {
    throw new AppError('Só a dona do negócio pode alterar o Pix.', 'permission', 'NOT_OWNER');
  }
}
