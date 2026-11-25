// Números da tela inicial, calculados no servidor (RPC dashboard_summary).
import { z } from 'zod';
import type { Client } from '@/lib/supabase/client';
import { throwIfError } from './shared';

const schema = z.object({
  scope: z.enum(['BUSINESS', 'MINE']).default('BUSINESS'),
  receivable_cents: z.number().int().nullable(),
  customers_with_balance: z.number().int(),
  today_sales_count: z.number().int(),
  today_sales_cents: z.number().int(),
  today_credit_cents: z.number().int(),
  today_received_cents: z.number().int().default(0),
  today_received_cash_cents: z.number().int().default(0),
  pending_notifications: z.number().int().default(0),
  open_disputes: z.number().int().default(0),
  timezone: z.string(),
  today: z.string(),
  as_of: z.string(),
});

export interface DashboardSummary {
  /** BUSINESS: números do negócio (dona). MINE: só o que este vendedor registrou. */
  scope: 'BUSINESS' | 'MINE';
  /** null para o vendedor (o total do negócio é da dona). */
  receivableCents: number | null;
  customersWithBalance: number;
  todaySalesCount: number;
  todaySalesCents: number;
  todayCreditCents: number;
  todayReceivedCents: number;
  todayReceivedCashCents: number;
  pendingNotices: number;
  openDisputes: number;
  asOf: Date;
}

export async function fetchDashboard(client: Client): Promise<DashboardSummary> {
  const { data, error } = await client.rpc('dashboard_summary');
  throwIfError(error);
  const r = schema.parse(data);
  return {
    scope: r.scope,
    receivableCents: r.receivable_cents,
    customersWithBalance: r.customers_with_balance,
    todaySalesCount: r.today_sales_count,
    todaySalesCents: r.today_sales_cents,
    todayCreditCents: r.today_credit_cents,
    todayReceivedCents: r.today_received_cents,
    todayReceivedCashCents: r.today_received_cash_cents,
    pendingNotices: r.pending_notifications,
    openDisputes: r.open_disputes,
    asOf: new Date(r.as_of),
  };
}
