// Números da tela inicial, calculados no servidor (RPC dashboard_summary).
import { z } from 'zod';
import type { Client } from '@/lib/supabase/client';
import { throwIfError } from './shared';

const schema = z.object({
  receivable_cents: z.number().int(),
  customers_with_balance: z.number().int(),
  today_sales_count: z.number().int(),
  today_sales_cents: z.number().int(),
  today_credit_cents: z.number().int(),
  today_received_cents: z.number().int().default(0),
  pending_notifications: z.number().int().default(0),
  timezone: z.string(),
  today: z.string(),
  as_of: z.string(),
});

export interface DashboardSummary {
  receivableCents: number;
  customersWithBalance: number;
  todaySalesCount: number;
  todaySalesCents: number;
  todayCreditCents: number;
  todayReceivedCents: number;
  pendingNotices: number;
  asOf: Date;
}

export async function fetchDashboard(client: Client): Promise<DashboardSummary> {
  const { data, error } = await client.rpc('dashboard_summary');
  throwIfError(error);
  const r = schema.parse(data);
  return {
    receivableCents: r.receivable_cents,
    customersWithBalance: r.customers_with_balance,
    todaySalesCount: r.today_sales_count,
    todaySalesCents: r.today_sales_cents,
    todayCreditCents: r.today_credit_cents,
    todayReceivedCents: r.today_received_cents,
    pendingNotices: r.pending_notifications,
    asOf: new Date(r.as_of),
  };
}
