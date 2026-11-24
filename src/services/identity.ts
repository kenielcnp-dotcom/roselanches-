// Quem é a pessoa logada (Rose/equipe ou cliente), segundo o SERVIDOR.
// A última resposta fica guardada no aparelho só para a área da Rose abrir sem
// internet; o servidor continua conferindo cada leitura e escrita.
import { z } from 'zod';
import { setBusinessTimeZone } from '@/domain/period';
import { DEFAULT_TIME_ZONE } from '@/domain/timezone';
import type { Client } from '@/lib/supabase/client';

const whoamiSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string().nullable(),
  staff: z
    .object({
      business_id: z.uuid(),
      business_name: z.string(),
      role: z.enum(['OWNER', 'OPERATOR']),
      timezone: z.string().default(DEFAULT_TIME_ZONE),
    })
    .nullable(),
  customer: z
    .object({
      customer_id: z.uuid(),
      full_name: z.string(),
      business_name: z.string(),
      timezone: z.string().default(DEFAULT_TIME_ZONE),
    })
    .nullable(),
});

export interface Identity {
  userId: string;
  displayName: string;
  staff: { businessId: string; businessName: string; role: 'OWNER' | 'OPERATOR'; timeZone: string } | null;
  customer: { customerId: string; fullName: string; businessName: string; timeZone: string } | null;
}

/** Datas e períodos do app passam a seguir o fuso do negócio desta pessoa. */
export function applyIdentityTimeZone(identity: Identity): void {
  setBusinessTimeZone(identity.staff?.timeZone ?? identity.customer?.timeZone);
}

export async function fetchIdentity(client: Client): Promise<Identity> {
  const { data, error } = await client.rpc('whoami');
  if (error) throw error;
  const w = whoamiSchema.parse(data);
  return {
    userId: w.user_id,
    displayName: w.display_name ?? '',
    staff: w.staff
      ? {
          businessId: w.staff.business_id,
          businessName: w.staff.business_name,
          role: w.staff.role,
          timeZone: w.staff.timezone,
        }
      : null,
    customer: w.customer
      ? {
          customerId: w.customer.customer_id,
          fullName: w.customer.full_name,
          businessName: w.customer.business_name,
          timeZone: w.customer.timezone,
        }
      : null,
  };
}

const CACHE_KEY = 'ldr.identity';

/** Só a identidade da equipe é guardada (o portal não funciona sem internet). */
export function cacheIdentity(identity: Identity): void {
  try {
    if (identity.staff) localStorage.setItem(CACHE_KEY, JSON.stringify(identity));
    else localStorage.removeItem(CACHE_KEY);
  } catch {
    /* armazenamento indisponível: o app só não abrirá sem internet */
  }
}

export function cachedIdentity(userId: string): Identity | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Identity;
    return parsed.userId === userId && parsed.staff ? parsed : null;
  } catch {
    return null;
  }
}

export function clearCachedIdentity(): void {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* nada a limpar */
  }
}
