import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { fetchPlacesReport, fetchReportSales, fetchReportSummary, type ReportFilters } from '@/services/reports';
import { dbConnect, expectDbError, insertAmountSale, linkCustomerAccount, setupBusiness, signUp, type TestBusiness } from './helpers';

let db: pg.Client;
let biz: TestBusiness;
let other: TestBusiness;
let oficina: string;
let ana: string;
let bia: string;
let saleOld: string;
let saleToday: string;
let saleOficina: string;
let salePaidNow: string;
let saleCancelled: string;

// Datas no fuso do negócio (padrão America/Sao_Paulo); meio-dia evita a virada do dia.
// "Hoje" é agora menos alguns minutos (nunca no futuro).
const isoDay = (daysAgo: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() - daysAgo * 86_400_000));
function dayAt(daysAgo: number): string {
  return daysAgo === 0 ? new Date(Date.now() - 5 * 60_000).toISOString() : `${isoDay(daysAgo)}T12:00:00-03:00`;
}

async function payment(customerId: string, cents: number, method: 'CASH' | 'PIX', receivedAt: string) {
  await db.query(
    `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, received_at, request_hash, created_by)
     values ($1, $2, $3, $4, $5, 'MANUAL', $6, $7, $8)`,
    [randomUUID(), biz.businessId, customerId, cents, method, receivedAt, 'd'.repeat(64), biz.owner.userId],
  );
}

beforeAll(async () => {
  db = await dbConnect();
  biz = await setupBusiness(db, 'Rel');
  other = await setupBusiness(db, 'RelOutro');
  ana = biz.customerId;
  oficina = randomUUID();
  bia = randomUUID();
  await db.query('insert into public.establishments (id, business_id, name) values ($1, $2, $3)', [oficina, biz.businessId, 'Oficina Rel']);
  await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3)', [bia, biz.businessId, 'Bia Rel']);
  // Ana é cliente dos dois locais; Bia só da oficina.
  await db.query(
    `insert into public.customer_establishments (business_id, customer_id, establishment_id)
     values ($1, $2, $3), ($1, $2, $4), ($1, $5, $4)`,
    [biz.businessId, ana, biz.establishmentId, oficina, bia],
  );

  saleOld = await insertAmountSale(db, biz, { totalCents: 4000, occurredAt: dayAt(40) });
  saleToday = await insertAmountSale(db, biz, { totalCents: 1000, occurredAt: dayAt(0) });
  saleOficina = await insertAmountSale(db, { ...biz, customerId: bia, establishmentId: oficina }, { totalCents: 2500, occurredAt: dayAt(1) });
  salePaidNow = await insertAmountSale(db, biz, { totalCents: 700, occurredAt: dayAt(0), paymentKind: 'PAID_NOW' });
  await db.query(
    `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, sale_id, received_at, request_hash, created_by)
     values ($1, $2, $3, 700, 'CASH', 'SALE_PAID_NOW', $4, $5, $6, $7)`,
    [randomUUID(), biz.businessId, ana, salePaidNow, dayAt(0), 'e'.repeat(64), biz.owner.userId],
  );
  saleCancelled = await insertAmountSale(db, biz, { totalCents: 900, occurredAt: dayAt(0) });
  await db.query(
    `update public.sales set status = 'CANCELLED', cancel_reason = 'Errada', cancelled_at = now(), cancelled_by = $2 where id = $1`,
    [saleCancelled, biz.owner.userId],
  );
  // Ana pagou 1.500 hoje: quita parte da compra mais antiga (FIFO).
  await payment(ana, 1500, 'PIX', dayAt(0));
  // Saldo anterior sem local.
  await db.query(
    `insert into public.opening_balances (id, business_id, customer_id, amount_cents, reference_date, note, created_by)
     values ($1, $2, $3, 800, $4, 'Caderno', $5)`,
    [randomUUID(), biz.businessId, bia, isoDay(90), biz.owner.userId],
  );
});
afterAll(async () => {
  await db.end();
});

const week = (): ReportFilters => ({ from: isoDay(6), to: isoDay(0), establishmentId: null, customerId: null });

describe('relatórios', () => {
  it('indicadores do período: vendido, fiado, pago na hora, recebido e canceladas', async () => {
    const r = await fetchReportSummary(biz.owner.client, week());
    expect(r).toMatchObject({
      salesCount: 3,
      salesCents: 1000 + 2500 + 700,
      creditCount: 2,
      creditCents: 3500,
      paidNowCents: 700,
      customersCount: 2,
      cancelledCount: 1,
      cancelledCents: 900,
      received: { count: 1, cents: 1500, cashCents: 0, pixCents: 1500 },
    });
    expect(r.confirmation).toEqual({ PENDING: 3, SIGNED: 0, CONFIRMED_ONLINE: 0, DISPUTED: 0 });
    expect(r.periods.AFTERNOON).toEqual({ count: 3, cents: 4200 });
    expect(r.days).toHaveLength(7);
    expect(r.days.at(-1)).toEqual({ date: isoDay(0), count: 2, cents: 1700 });
    expect(r.days.reduce((s, d) => s + d.cents, 0)).toBe(r.salesCents);
    expect(r.topCustomers[0]).toMatchObject({ name: 'Bia Rel', cents: 2500 });
  });

  it('em aberto agora = soma dos saldos devedores, com idade da dívida', async () => {
    const r = await fetchReportSummary(biz.owner.client, week());
    const { rows } = await db.query(
      'select coalesce(sum(balance_cents) filter (where balance_cents > 0), 0)::int as owed from public.customer_balances where business_id = $1',
      [biz.businessId],
    );
    expect(r.openNow.openCents).toBe(rows[0].owed);
    // Ana: 4.000 (40 dias) + 1.000 (hoje) − 1.500 → 2.500 da antiga + 1.000 de hoje. Bia: 2.500 (ontem) + 800 (90 dias).
    expect(r.openNow.aging).toEqual({ d0_7: 1000 + 2500, d8_30: 0, d31_60: 2500, d60_plus: 800 });
    expect(r.openNow.customersWithOpen).toBe(2);
  });

  it('filtro de local e de cliente; com local, o recebido não se aplica', async () => {
    const atOficina = await fetchReportSummary(biz.owner.client, { ...week(), establishmentId: oficina });
    expect(atOficina).toMatchObject({ salesCount: 1, salesCents: 2500, received: null });
    expect(atOficina.openNow.openCents).toBe(2500);

    const onlyAna = await fetchReportSummary(biz.owner.client, { ...week(), customerId: ana });
    expect(onlyAna).toMatchObject({ salesCents: 1700, received: { cents: 1500 } });
    expect(onlyAna.openNow.openCents).toBe(3500);
  });

  it('por local: três métricas separadas; dívidas sem local fecham a conta', async () => {
    const r = await fetchPlacesReport(biz.owner.client, week());
    const mercado = r.places.find((p) => p.establishmentId === biz.establishmentId);
    const ofi = r.places.find((p) => p.establishmentId === oficina);
    expect(mercado).toMatchObject({ salesCount: 2, salesCents: 1700, originatedOpenCents: 3500, linkedCustomers: 1, linkedBalanceCents: 3500 });
    // Mercado: só a Ana (3.500). Oficina: Ana (3.500) e Bia (3.300); a Ana conta nos dois locais.
    expect(ofi).toMatchObject({ salesCount: 1, salesCents: 2500, originatedOpenCents: 2500, linkedCustomers: 2, linkedBalanceCents: 6800 });
    expect(r.noPlaceOpenCents).toBe(800);
    // A dívida originada por local + a sem local é exatamente o total em aberto.
    expect(r.places.reduce((s, p) => s + p.originatedOpenCents, 0) + r.noPlaceOpenCents).toBe(r.totalOpenCents);
    expect(r.totalOpenCents).toBe(6800);
  });

  it('lista de vendas com filtros de pagamento e confirmação e totais do filtro', async () => {
    const base = { ...week(), from: isoDay(60), payment: 'ALL' as const, confirmation: 'ALL' as const };
    const all = await fetchReportSales(biz.owner.client, base, 50, 0);
    expect(new Set(all.rows.map((r) => r.id))).toEqual(new Set([salePaidNow, saleToday, saleOficina, saleOld]));
    expect(all).toMatchObject({ totalCount: 4, sumCents: 8200, sumOpenCents: 2500 + 1000 + 2500 });

    const partial = await fetchReportSales(biz.owner.client, { ...base, payment: 'PARTIAL' }, 50, 0);
    expect(partial.rows.map((r) => [r.id, r.openCents])).toEqual([[saleOld, 2500]]);
    expect((await fetchReportSales(biz.owner.client, { ...base, payment: 'PAID_NOW' }, 50, 0)).rows.map((r) => r.id)).toEqual([salePaidNow]);
    const cancelled = await fetchReportSales(biz.owner.client, { ...base, payment: 'CANCELLED' }, 50, 0);
    expect(cancelled.rows).toEqual([expect.objectContaining({ id: saleCancelled, cancelReason: 'Errada' })]);
    expect((await fetchReportSales(biz.owner.client, { ...base, confirmation: 'DISPUTED' }, 50, 0)).totalCount).toBe(0);

    // Paginação mantém os totais do filtro inteiro.
    const page2 = await fetchReportSales(biz.owner.client, base, 2, 2);
    expect(page2.rows).toHaveLength(2);
    expect(page2.totalCount).toBe(4);
  });

  it('quitada some de "em aberto" e aparece em "quitadas"', async () => {
    await payment(bia, 3300, 'CASH', dayAt(0));
    const base = { ...week(), payment: 'SETTLED' as const, confirmation: 'ALL' as const };
    expect((await fetchReportSales(biz.owner.client, base, 50, 0)).rows.map((r) => r.id)).toEqual([saleOficina]);
    expect((await fetchPlacesReport(biz.owner.client, week())).noPlaceOpenCents).toBe(0);
  });

  it('só a equipe do próprio negócio; período validado', async () => {
    const r = await fetchReportSummary(other.owner.client, week());
    expect(r.salesCount).toBe(0);
    const customer = await linkCustomerAccount(db, bia, 'RelCliente');
    await expectDbError(fetchReportSummary(customer.client, week()), /permissão/i);
    const stranger = await signUp('RelEstranho');
    await expectDbError(fetchPlacesReport(stranger.client, week()), /permissão/i);
    await expectDbError(fetchReportSummary(biz.owner.client, { ...week(), from: isoDay(0), to: isoDay(5) }), /período/i);
    await expectDbError(fetchReportSummary(biz.owner.client, { ...week(), from: '2020-01-01' }), /período/i);
    await expectDbError(
      fetchReportSales(biz.owner.client, { ...week(), payment: 'XX' as never, confirmation: 'ALL' }, 10, 0),
      /filtro/i,
    );
  });
});
