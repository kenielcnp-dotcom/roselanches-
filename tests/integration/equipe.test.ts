import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { fetchDashboard } from '@/services/dashboard';
import { fetchIdentity } from '@/services/identity';
import { listPayments, registerPayment, type RegisterPaymentPayload } from '@/services/payments';
import { fetchReportSales } from '@/services/reports';
import { cancelSale, createSale, listSales, toCreateSalePayload } from '@/services/sales';
import {
  cancelStaffInvite,
  createStaffInvite,
  fetchTeam,
  fetchTeamReport,
  redeemStaffInvite,
  setMemberActive,
} from '@/services/team';
import type { SaleDraft } from '@/types/domain';
import { dbConnect, linkCustomerAccount, setupBusiness, signUp, type TestBusiness, type TestUser } from './helpers';

let db: pg.Client;
let biz: TestBusiness;
let other: TestBusiness;
let seller: TestUser;
let sellerMemberId: string;

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/** As funções do app traduzem o erro; o código do servidor fica em .code. */
async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  try {
    await p;
  } catch (e) {
    expect((e as { code?: string }).code).toBe(code);
    return;
  }
  throw new Error(`Era esperado ${code}, mas a operação passou.`);
}

function draft(over: Partial<SaleDraft> = {}): SaleDraft {
  return {
    id: randomUUID(),
    customerId: biz.customerId,
    establishmentId: biz.establishmentId,
    mode: 'AMOUNT',
    period: 'AFTERNOON',
    occurredAt: new Date(Date.now() - 60_000).toISOString(),
    items: [],
    description: 'Lanches da rua',
    totalCents: 2000,
    paymentKind: 'CREDIT',
    ...over,
  };
}

function payment(cents: number, over: Partial<RegisterPaymentPayload> = {}): RegisterPaymentPayload {
  return { id: randomUUID(), customer_id: biz.customerId, amount_cents: cents, method: 'CASH', received_at: new Date().toISOString(), note: null, ...over };
}

beforeAll(async () => {
  db = await dbConnect();
  biz = await setupBusiness(db, 'Equipe');
  other = await setupBusiness(db, 'EquipeOutro');
  seller = await signUp('Joao');
  const invite = await createStaffInvite(biz.owner.client, 'João da Silva');
  expect((await redeemStaffInvite(seller.client, invite.token)).status).toBe('JOINED');
  const { rows } = await db.query('select id from public.business_members where user_id = $1', [seller.userId]);
  sellerMemberId = rows[0].id as string;
});
afterAll(async () => {
  await db.end();
});

describe('convite de vendedor', () => {
  it('quem usa o convite entra como vendedor (OPERATOR) do negócio', async () => {
    const id = await fetchIdentity(seller.client);
    expect(id.staff?.role).toBe('OPERATOR');
    expect(id.staff?.businessId).toBe(biz.businessId);
    const team = await fetchTeam(biz.owner.client);
    expect(team.members.map((m) => [m.role, m.isActive])).toEqual([
      ['OWNER', true],
      ['OPERATOR', true],
    ]);
    // O banco só guarda o hash do token.
    const { rows } = await db.query('select token_hash from public.staff_invites where used_by = $1', [seller.userId]);
    expect(rows[0].token_hash).toBeInstanceOf(Buffer);
  });

  it('o mesmo link não serve duas vezes; inválido, cancelado e vencido são recusados', async () => {
    const invite = await createStaffInvite(biz.owner.client, 'Maria');
    const first = await signUp('Maria');
    const second = await signUp('Intrusa');
    expect((await redeemStaffInvite(first.client, invite.token)).status).toBe('JOINED');
    expect((await redeemStaffInvite(first.client, invite.token)).status).toBe('ALREADY_MEMBER');
    expect((await redeemStaffInvite(second.client, invite.token)).status).toBe('USED');
    expect((await redeemStaffInvite(second.client, 'x'.repeat(32))).status).toBe('INVALID');

    const cancelled = await createStaffInvite(biz.owner.client, 'Pedro');
    const { invites } = await fetchTeam(biz.owner.client);
    await cancelStaffInvite(biz.owner.client, invites.find((i) => i.name === 'Pedro')!.inviteId);
    expect((await redeemStaffInvite(second.client, cancelled.token)).status).toBe('CANCELLED');

    const expired = await createStaffInvite(biz.owner.client, 'Paulo');
    await db.query(
      `update public.staff_invites set created_at = now() - interval '4 days', expires_at = now() - interval '1 day'
       where token_hash = sha256(convert_to($1, 'UTF8'))`,
      [expired.token],
    );
    expect((await redeemStaffInvite(second.client, expired.token)).status).toBe('EXPIRED');
    expect((await fetchIdentity(second.client)).staff).toBeNull();
  });

  it('conta de cliente, dona de outro negócio e não logado não entram', async () => {
    const portal = await linkCustomerAccount(db, other.customerId, 'ClientePortal');
    const forCustomer = await createStaffInvite(biz.owner.client, 'Cliente');
    expect((await redeemStaffInvite(portal.client, forCustomer.token)).status).toBe('CUSTOMER_ACCOUNT');

    const forOwner = await createStaffInvite(biz.owner.client, 'Outra dona');
    expect((await redeemStaffInvite(other.owner.client, forOwner.token)).status).toBe('OTHER_BUSINESS');
    expect((await fetchIdentity(other.owner.client)).staff?.businessId).toBe(other.businessId);
  });

  it('só a dona convida, cancela e vê a equipe; nome obrigatório; no máximo 5 convites abertos', async () => {
    await expectCode(createStaffInvite(seller.client, 'Amigo'), 'LDR_NOT_ALLOWED');
    await expectCode(fetchTeam(seller.client), 'LDR_NOT_ALLOWED');
    await expectCode(createStaffInvite(other.owner.client, ' '), 'LDR_INVALID_NAME');
    const { data } = await seller.client.from('staff_invites').select('id');
    expect(data).toEqual([]);

    for (let i = 0; i < 5; i += 1) await createStaffInvite(other.owner.client, `Pessoa ${i}`);
    await expectCode(createStaffInvite(other.owner.client, 'Sexta'), 'LDR_TOO_MANY_INVITES');
  });
});

describe('o que o vendedor faz', () => {
  it('vende e recebe; a venda e o pagamento ficam com o nome dele', async () => {
    const d = draft();
    expect((await createSale(seller.client, toCreateSalePayload(d))).status).toBe('CREATED');
    const p = payment(500);
    expect(await registerPayment(seller.client, p)).toBe('CREATED');

    const sales = await listSales(biz.owner.client, { since: new Date(Date.now() - 3_600_000).toISOString() });
    const sale = sales.find((s) => s.id === d.id)!;
    expect(sale.createdBy).toBe(seller.userId);
    expect(sale.createdByName).toBe('Joao');
    const [pay] = await listPayments(biz.owner.client, { id: p.id });
    expect(pay?.createdByName).toBe('Joao');

    // A lista "minhas vendas" do vendedor filtra pelo servidor.
    const mine = await listSales(seller.client, { since: new Date(Date.now() - 3_600_000).toISOString(), createdBy: seller.userId });
    expect(mine.every((s) => s.createdBy === seller.userId)).toBe(true);
  });

  it('não cancela venda, não estorna, não confere aviso de Pix e não vê relatórios', async () => {
    const d = draft({ totalCents: 900 });
    await createSale(seller.client, toCreateSalePayload(d));
    await expectCode(cancelSale(seller.client, d.id, 'Errei o valor'), 'LDR_OWNER_ONLY');
    expect(await cancelSale(biz.owner.client, d.id, 'Errei o valor')).toBe('CANCELLED');

    const p = payment(100);
    await registerPayment(seller.client, p);
    const { error: rev } = await seller.client.rpc('reverse_payment', { p_payment_id: p.id, p_reason: 'Teste indevido' });
    expect(rev?.message).toMatch(/LDR_NOT_ALLOWED/);

    const notification = randomUUID();
    const { error: conf } = await seller.client.rpc('confirm_payment_notification', {
      p_notification_id: notification,
      p_payment_id: randomUUID(),
      p_amount_cents: 100,
      p_received_at: new Date().toISOString(),
    });
    expect(conf?.message).toMatch(/LDR_OWNER_ONLY/);
    const { error: rej } = await seller.client.rpc('reject_payment_notification', { p_notification_id: notification, p_reason: 'Não caiu' });
    expect(rej?.message).toMatch(/LDR_OWNER_ONLY/);

    for (const [fn, args] of [
      ['report_summary', { p_from: today, p_to: today }],
      ['report_establishments', { p_from: today, p_to: today }],
      ['report_sales', { p_from: today, p_to: today }],
      ['report_team', { p_from: today, p_to: today }],
    ] as const) {
      const { error } = await seller.client.rpc(fn, args);
      expect(error?.message, fn).toMatch(/LDR_OWNER_ONLY/);
    }
  });

  it('não cria nem altera produto, local ou configuração; cadastra cliente normalmente', async () => {
    const { error: prod } = await seller.client.from('products').insert({ business_id: biz.businessId, name: 'Pastel', price_cents: 800 });
    expect(prod).not.toBeNull();
    const { data: upd } = await seller.client.from('products').update({ price_cents: 1 }).eq('id', biz.productId).select('id');
    expect(upd).toEqual([]);
    const { error: place } = await seller.client.from('establishments').insert({ business_id: biz.businessId, name: 'Feira nova' });
    expect(place).not.toBeNull();
    const { data: settings } = await seller.client
      .from('business_settings')
      .update({ sale_max_cents: 100 })
      .eq('business_id', biz.businessId)
      .select('business_id');
    expect(settings).toEqual([]);

    const { error: customer } = await seller.client.rpc('save_customer', {
      p_id: randomUUID(),
      p_full_name: 'Cliente do João',
      p_phone_e164: null as unknown as string,
      p_notes: null as unknown as string,
      p_is_active: true,
      p_establishment_ids: [biz.establishmentId],
    });
    expect(customer).toBeNull();
  });

  it('painel do vendedor: só os números dele, sem o total a receber do negócio', async () => {
    const mine = await fetchDashboard(seller.client);
    expect(mine.scope).toBe('MINE');
    expect(mine.receivableCents).toBeNull();
    expect(mine.pendingNotices).toBe(0);
    const { rows } = await db.query(
      `select count(*)::int as n from public.sales where created_by = $1 and status = 'ACTIVE' and occurred_at > now() - interval '12 hours'`,
      [seller.userId],
    );
    expect(mine.todaySalesCount).toBe(rows[0].n);

    const owner = await fetchDashboard(biz.owner.client);
    expect(owner.scope).toBe('BUSINESS');
    expect(owner.receivableCents).not.toBeNull();
  });
});

describe('relatório por vendedor', () => {
  it('separa vendido e recebido (dinheiro inclui venda paga na hora) e filtra a lista por vendedor', async () => {
    const paidNow = draft({ totalCents: 1500, paymentKind: 'PAID_NOW', paidNow: { paymentId: randomUUID(), method: 'CASH' } });
    await createSale(seller.client, toCreateSalePayload(paidNow));
    await registerPayment(seller.client, payment(300, { method: 'PIX' }));
    await createSale(biz.owner.client, toCreateSalePayload(draft({ totalCents: 4200 })));

    const rows = await fetchTeamReport(biz.owner.client, today, today);
    const joao = rows.find((r) => r.userId === seller.userId)!;
    const { rows: expected } = await db.query(
      `select
         (select coalesce(sum(total_cents), 0)::int from public.sales where created_by = $1 and status = 'ACTIVE' and occurred_at > now() - interval '12 hours') as sales,
         (select coalesce(sum(amount_cents), 0)::int from public.payments where created_by = $1 and status = 'CONFIRMED' and method = 'CASH' and received_at > now() - interval '12 hours') as cash,
         (select coalesce(sum(amount_cents), 0)::int from public.payments where created_by = $1 and status = 'CONFIRMED' and method = 'PIX' and received_at > now() - interval '12 hours') as pix`,
      [seller.userId],
    );
    expect(joao.salesCents).toBe(expected[0].sales);
    expect(joao.cashCents).toBe(expected[0].cash);
    expect(joao.pixCents).toBe(expected[0].pix);
    expect(joao.cashCents).toBeGreaterThanOrEqual(1500);
    expect(rows[0]?.role).toBe('OWNER');

    const filtered = await fetchReportSales(
      biz.owner.client,
      { from: today, to: today, establishmentId: null, customerId: null, payment: 'ALL', confirmation: 'ALL', sellerId: seller.userId },
      100,
      0,
    );
    expect(filtered.rows.length).toBeGreaterThan(0);
    expect(filtered.rows.every((r) => r.sellerName === 'Joao')).toBe(true);
    expect(filtered.sumCents).toBe(expected[0].sales);
  });
});

describe('desativar e reativar', () => {
  it('desativado perde o acesso na hora; as vendas continuam com o nome dele; reativar devolve', async () => {
    await expectCode(setMemberActive(seller.client, sellerMemberId, false), 'LDR_NOT_ALLOWED');
    await setMemberActive(biz.owner.client, sellerMemberId, false);

    expect((await fetchIdentity(seller.client)).staff).toBeNull();
    await expectCode(createSale(seller.client, toCreateSalePayload(draft())), 'LDR_NOT_ALLOWED');
    const sales = await listSales(biz.owner.client, { since: new Date(Date.now() - 3_600_000).toISOString(), createdBy: seller.userId });
    expect(sales.length).toBeGreaterThan(0);
    expect(sales.every((s) => s.createdByName === 'Joao')).toBe(true);

    await setMemberActive(biz.owner.client, sellerMemberId, true);
    expect((await fetchIdentity(seller.client)).staff?.role).toBe('OPERATOR');
  });

  it('um convite novo também reativa quem já foi da equipe', async () => {
    await setMemberActive(biz.owner.client, sellerMemberId, false);
    const invite = await createStaffInvite(biz.owner.client, 'João de volta');
    expect((await redeemStaffInvite(seller.client, invite.token)).status).toBe('JOINED');
    const { rows } = await db.query('select count(*)::int as n from public.business_members where user_id = $1', [seller.userId]);
    expect(rows[0].n).toBe(1);
    expect((await fetchIdentity(seller.client)).staff?.role).toBe('OPERATOR');
  });

  it('a dona não pode ser desativada; outro negócio não mexe na equipe', async () => {
    const { rows } = await db.query(`select id from public.business_members where user_id = $1`, [biz.owner.userId]);
    await expectCode(setMemberActive(biz.owner.client, rows[0].id as string, false), 'LDR_CANNOT_CHANGE_OWNER');
    await expectCode(setMemberActive(other.owner.client, sellerMemberId, false), 'LDR_MEMBER_NOT_FOUND');
    expect((await fetchIdentity(seller.client)).staff?.role).toBe('OPERATOR');
  });

  it('cada mudança fica na auditoria', async () => {
    const { rows } = await db.query(
      `select action, after from public.audit_logs where entity = 'business_members' and entity_id = $1 order by id`,
      [sellerMemberId],
    );
    expect(rows.map((r) => [r.action, r.after?.is_active])).toEqual([
      ['INSERT', true],
      ['UPDATE', false],
      ['UPDATE', true],
      ['UPDATE', false],
      ['UPDATE', true],
    ]);
  });
});
