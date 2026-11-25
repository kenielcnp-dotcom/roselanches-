// Relatórios (só com internet): indicadores do período, locais e lista de vendas.
import { z } from 'zod';
import type { Client } from '@/lib/supabase/client';
import type { DateRange } from '@/domain/report-period';
import type { ConfirmationStatus, PaymentKind, PaymentMethod, Period } from '@/types/domain';
import { throwIfError } from './shared';

export interface ReportFilters extends DateRange {
  establishmentId: string | null;
  customerId: string | null;
}

const countCents = z.object({ count: z.number(), cents: z.number() });

const summarySchema = z.object({
  sales_count: z.number(),
  sales_cents: z.number(),
  credit_count: z.number(),
  credit_cents: z.number(),
  paid_now_cents: z.number(),
  customers_count: z.number(),
  cancelled_count: z.number(),
  cancelled_cents: z.number(),
  received_count: z.number().nullable(),
  received_cents: z.number().nullable(),
  received_cash_cents: z.number().nullable(),
  received_pix_cents: z.number().nullable(),
  confirmation: z.object({ PENDING: z.number(), SIGNED: z.number(), CONFIRMED_ONLINE: z.number(), DISPUTED: z.number() }),
  periods: z.object({ MORNING: countCents, AFTERNOON: countCents, NIGHT: countCents }),
  days: z.array(z.object({ date: z.string(), count: z.number(), cents: z.number() })),
  top_customers: z.array(z.object({ customer_id: z.uuid(), name: z.string(), count: z.number(), cents: z.number() })),
  top_products: z.array(z.object({ product_id: z.uuid(), name: z.string(), quantity: z.number(), cents: z.number() })),
  open_now: z.object({
    open_cents: z.number(),
    customers_with_open: z.number(),
    aging: z.object({ d0_7: z.number(), d8_30: z.number(), d31_60: z.number(), d60_plus: z.number() }),
  }),
  as_of: z.string(),
});

export interface ReportSummary {
  salesCount: number;
  salesCents: number;
  creditCount: number;
  creditCents: number;
  paidNowCents: number;
  customersCount: number;
  cancelledCount: number;
  cancelledCents: number;
  /** null quando há filtro de local (pagamento não tem local). */
  received: { count: number; cents: number; cashCents: number; pixCents: number } | null;
  confirmation: Record<'PENDING' | 'SIGNED' | 'CONFIRMED_ONLINE' | 'DISPUTED', number>;
  periods: Record<Period, { count: number; cents: number }>;
  days: { date: string; count: number; cents: number }[];
  topCustomers: { customerId: string; name: string; count: number; cents: number }[];
  topProducts: { productId: string; name: string; quantity: number; cents: number }[];
  openNow: { openCents: number; customersWithOpen: number; aging: { d0_7: number; d8_30: number; d31_60: number; d60_plus: number } };
  asOf: string;
}

export async function fetchReportSummary(client: Client, f: ReportFilters): Promise<ReportSummary> {
  const { data, error } = await client.rpc('report_summary', {
    p_from: f.from,
    p_to: f.to,
    p_establishment: f.establishmentId ?? undefined,
    p_customer: f.customerId ?? undefined,
  });
  throwIfError(error);
  const r = summarySchema.parse(data);
  return {
    salesCount: r.sales_count,
    salesCents: r.sales_cents,
    creditCount: r.credit_count,
    creditCents: r.credit_cents,
    paidNowCents: r.paid_now_cents,
    customersCount: r.customers_count,
    cancelledCount: r.cancelled_count,
    cancelledCents: r.cancelled_cents,
    received:
      r.received_cents === null
        ? null
        : {
            count: r.received_count ?? 0,
            cents: r.received_cents,
            cashCents: r.received_cash_cents ?? 0,
            pixCents: r.received_pix_cents ?? 0,
          },
    confirmation: r.confirmation,
    periods: r.periods,
    days: r.days,
    topCustomers: r.top_customers.map((c) => ({ customerId: c.customer_id, name: c.name, count: c.count, cents: c.cents })),
    topProducts: r.top_products.map((p) => ({ productId: p.product_id, name: p.name, quantity: p.quantity, cents: p.cents })),
    openNow: {
      openCents: r.open_now.open_cents,
      customersWithOpen: r.open_now.customers_with_open,
      aging: r.open_now.aging,
    },
    asOf: r.as_of,
  };
}

// -----------------------------------------------------------------------------
// Por estabelecimento
// -----------------------------------------------------------------------------
const placesSchema = z.object({
  establishments: z.array(
    z.object({
      establishment_id: z.uuid(),
      name: z.string(),
      is_active: z.boolean(),
      sales_count: z.number(),
      sales_cents: z.number(),
      originated_open_cents: z.number(),
      linked_customers: z.number(),
      linked_with_balance: z.number(),
      linked_balance_cents: z.number(),
    }),
  ),
  no_place_open_cents: z.number(),
  total_open_cents: z.number(),
});

export interface PlaceReport {
  establishmentId: string;
  name: string;
  isActive: boolean;
  /** Vendas feitas no local, no período. */
  salesCount: number;
  salesCents: number;
  /** Dívida em aberto agora que nasceu de vendas no local (FIFO). */
  originatedOpenCents: number;
  /** Saldo devedor agora dos clientes vinculados (inclui compras em outros locais). */
  linkedCustomers: number;
  linkedWithBalance: number;
  linkedBalanceCents: number;
}

export interface PlacesReport {
  places: PlaceReport[];
  noPlaceOpenCents: number;
  totalOpenCents: number;
}

export async function fetchPlacesReport(client: Client, range: DateRange): Promise<PlacesReport> {
  const { data, error } = await client.rpc('report_establishments', { p_from: range.from, p_to: range.to });
  throwIfError(error);
  const r = placesSchema.parse(data);
  return {
    places: r.establishments.map((e) => ({
      establishmentId: e.establishment_id,
      name: e.name,
      isActive: e.is_active,
      salesCount: e.sales_count,
      salesCents: e.sales_cents,
      originatedOpenCents: e.originated_open_cents,
      linkedCustomers: e.linked_customers,
      linkedWithBalance: e.linked_with_balance,
      linkedBalanceCents: e.linked_balance_cents,
    })),
    noPlaceOpenCents: r.no_place_open_cents,
    totalOpenCents: r.total_open_cents,
  };
}

// -----------------------------------------------------------------------------
// Lista de vendas
// -----------------------------------------------------------------------------
export type PaymentFilter = 'ALL' | 'OPEN' | 'PARTIAL' | 'SETTLED' | 'PAID_NOW' | 'CANCELLED';
export type ConfirmationFilter = 'ALL' | 'PENDING' | 'SIGNED' | 'CONFIRMED_ONLINE' | 'DISPUTED';

export interface ReportSaleRow {
  id: string;
  occurredAt: string;
  period: Period;
  customerId: string;
  customerName: string;
  establishmentName: string;
  summary: string;
  totalCents: number;
  paymentKind: PaymentKind;
  paidMethod: PaymentMethod | null;
  /** Em aberto agora (só fiado ativo). */
  openCents: number | null;
  status: 'ACTIVE' | 'CANCELLED';
  cancelReason: string | null;
  confirmationStatus: ConfirmationStatus;
  /** Quem registrou a venda. */
  sellerName: string | null;
}

export interface ReportSalesPage {
  rows: ReportSaleRow[];
  totalCount: number;
  sumCents: number;
  sumOpenCents: number;
}

export async function fetchReportSales(
  client: Client,
  f: ReportFilters & { payment: PaymentFilter; confirmation: ConfirmationFilter; sellerId?: string | null },
  limit: number,
  offset: number,
): Promise<ReportSalesPage> {
  const { data, error } = await client.rpc('report_sales', {
    p_from: f.from,
    p_to: f.to,
    p_establishment: f.establishmentId ?? undefined,
    p_customer: f.customerId ?? undefined,
    p_payment: f.payment,
    p_confirmation: f.confirmation,
    p_limit: limit,
    p_offset: offset,
    p_seller: f.sellerId ?? undefined,
  });
  throwIfError(error);
  const rows = data ?? [];
  const first = rows[0];
  return {
    rows: rows.map((r) => ({
      id: r.sale_id,
      occurredAt: r.occurred_at,
      period: r.period as Period,
      customerId: r.customer_id,
      customerName: r.customer_name,
      establishmentName: r.establishment_name,
      summary: r.summary ?? '',
      totalCents: r.total_cents,
      paymentKind: r.payment_kind as PaymentKind,
      paidMethod: (r.paid_method as PaymentMethod | null) ?? null,
      openCents: r.open_cents,
      status: r.status as 'ACTIVE' | 'CANCELLED',
      cancelReason: r.cancel_reason,
      confirmationStatus: r.confirmation_status as ConfirmationStatus,
      sellerName: r.seller_name,
    })),
    totalCount: first?.total_count ?? 0,
    sumCents: first?.sum_cents ?? 0,
    sumOpenCents: first?.sum_open_cents ?? 0,
  };
}
