import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { createInvite, cancelInvite, fetchOpenInvite, listOpenDisputes, resolveDispute, unlinkAccount } from '@/services/invites';
import {
  confirmPortalSale,
  disputePortalSale,
  fetchPortalPix,
  fetchPortalSale,
  fetchPortalStatement,
  fetchPortalSummary,
  notifyPayment,
  redeemInvite,
} from '@/services/portal';
import { fetchDashboard } from '@/services/dashboard';
import { fetchIdentity } from '@/services/identity';
import { dbConnect, expectDbError, insertAmountSale, linkCustomerAccount, setupBusiness, signUp, type TestBusiness, type TestUser } from './helpers';

let db: pg.Client;
let a: TestBusiness;
let b: TestBusiness;

beforeAll(async () => {
  db = await dbConnect();
  a = await setupBusiness(db, 'PortA');
  b = await setupBusiness(db, 'PortB');
});
afterAll(async () => {
  await db.end();
});

async function newCustomer(biz: TestBusiness, name: string): Promise<string> {
  const id = randomUUID();
  await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3)', [id, biz.businessId, name]);
  return id;
}

async function balance(customerId: string): Promise<number> {
  const { rows } = await db.query('select balance_cents from public.customer_balances where customer_id = $1', [customerId]);
  return Number(rows[0].balance_cents);
}

describe('convite e vínculo da conta', () => {
  it('só a equipe do negócio gera convite; o banco guarda só o hash', async () => {
    const customerId = await newCustomer(a, 'Convidado Hash');
    const invite = await createInvite(a.owner.client, customerId);
    expect(invite.token).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const { rows } = await db.query(
      `select encode(token_hash, 'hex') = encode(sha256(convert_to($2, 'UTF8')), 'hex') as ok,
              position($2 in encode(token_hash, 'escape')) = 0 as no_plain
         from public.customer_invites where customer_id = $1 and used_at is null and cancelled_at is null`,
      [customerId, invite.token],
    );
    expect(rows).toEqual([{ ok: true, no_plain: true }]);

    // A Rose nem consegue ler a coluna do hash.
    const hashRead = await a.owner.client.from('customer_invites').select('token_hash').eq('customer_id', customerId);
    expect(hashRead.error).not.toBeNull();
    expect(await fetchOpenInvite(a.owner.client, customerId)).not.toBeNull();

    await expectDbError(createInvite(b.owner.client, customerId), /LDR_CUSTOMER_NOT_FOUND|não encontrado/i);
    const stranger = await signUp('EstranhoConvite');
    await expectDbError(createInvite(stranger.client, customerId), /permissão/i);
  });

  it('gerar outro cancela o anterior; cancelar fecha o convite', async () => {
    const customerId = await newCustomer(a, 'Convidado Troca');
    const first = await createInvite(a.owner.client, customerId);
    const second = await createInvite(a.owner.client, customerId);
    const user = await signUp('ClienteTroca');
    expect((await redeemInvite(user.client, first.token)).status).toBe('CANCELLED');

    await cancelInvite(a.owner.client, customerId);
    expect(await fetchOpenInvite(a.owner.client, customerId)).toBeNull();
    expect((await redeemInvite(user.client, second.token)).status).toBe('CANCELLED');
  });

  it('cliente cria conta, usa o convite e passa a ser cliente (uso único)', async () => {
    const customerId = await newCustomer(a, 'Joana Convite');
    const invite = await createInvite(a.owner.client, customerId);
    const joana = await signUp('Joana');

    const linked = await redeemInvite(joana.client, invite.token);
    expect(linked).toMatchObject({ status: 'LINKED', customerName: 'Joana Convite' });
    expect((await fetchIdentity(joana.client)).customer?.customerId).toBe(customerId);

    // Repetir com a mesma conta não muda nada; outra conta não consegue.
    expect((await redeemInvite(joana.client, invite.token)).status).toBe('ALREADY_LINKED');
    const other = await signUp('OutraPessoa');
    expect((await redeemInvite(other.client, invite.token)).status).toBe('USED');
    expect((await fetchIdentity(other.client)).customer).toBeNull();

    // Já ligado: não dá para gerar convite novo, e a conta não pega outro cadastro.
    await expectDbError(createInvite(a.owner.client, customerId), /já acessa/i);
    const otherCustomer = await newCustomer(a, 'Outro Cadastro');
    const invite2 = await createInvite(a.owner.client, otherCustomer);
    expect((await redeemInvite(joana.client, invite2.token)).status).toBe('ACCOUNT_IN_USE');
  });

  it('convite vencido, token inválido, conta da equipe e limite de tentativas', async () => {
    const customerId = await newCustomer(a, 'Convite Vencido');
    const invite = await createInvite(a.owner.client, customerId);
    await db.query(
      `update public.customer_invites set created_at = now() - interval '4 days', expires_at = now() - interval '1 day'
        where customer_id = $1 and used_at is null and cancelled_at is null`,
      [customerId],
    );
    const user = await signUp('ClienteAtrasado');
    expect((await redeemInvite(user.client, invite.token)).status).toBe('EXPIRED');
    expect((await redeemInvite(user.client, 'curto')).status).toBe('INVALID');

    const fresh = await createInvite(a.owner.client, customerId);
    expect((await redeemInvite(a.owner.client, fresh.token)).status).toBe('STAFF_ACCOUNT');

    const guesser = await signUp('Chutador');
    for (let i = 0; i < 10; i += 1) {
      expect((await redeemInvite(guesser.client, 'x'.repeat(32))).status).toBe('INVALID');
    }
    // Mesmo com o token certo, a conta fica bloqueada por uma hora.
    expect((await redeemInvite(guesser.client, fresh.token)).status).toBe('TOO_MANY_ATTEMPTS');
    expect((await redeemInvite(user.client, fresh.token)).status).toBe('LINKED');
  });

  it('só a dona desvincula, com motivo; o cliente perde o acesso na hora', async () => {
    const customerId = await newCustomer(a, 'Cliente Desvincula');
    const user = await linkCustomerAccount(db, customerId, 'Desvinculado');
    expect((await fetchPortalSummary(user.client)).customerName).toBe('Cliente Desvincula');

    await expectDbError(unlinkAccount(b.owner.client, customerId, 'tentativa'), /permissão|não tem acesso/i);
    await expectDbError(unlinkAccount(a.owner.client, customerId, 'x'), /motivo/i);
    await unlinkAccount(a.owner.client, customerId, 'Perdeu a senha');
    await expectDbError(fetchPortalSummary(user.client), /permissão/i);

    const { rows } = await db.query(
      `select reason from public.audit_logs where entity_id = $1 and action = 'PORTAL_UNLINK'`,
      [customerId],
    );
    expect(rows).toEqual([{ reason: 'Perdeu a senha' }]);
  });
});

describe('portal: leitura da própria conta', () => {
  let me: TestUser;
  let saleOld: string;
  let saleNew: string;
  let secondPlace: string;

  beforeAll(async () => {
    me = await linkCustomerAccount(db, a.customerId, 'PortalLeitura');
    secondPlace = randomUUID();
    await db.query('insert into public.establishments (id, business_id, name) values ($1, $2, $3)', [
      secondPlace,
      a.businessId,
      'Oficina PortA',
    ]);
    saleOld = await insertAmountSale(db, a, { totalCents: 1500, occurredAt: new Date(Date.now() - 86_400_000).toISOString() });
    saleNew = await insertAmountSale(db, { ...a, establishmentId: secondPlace }, { totalCents: 700 });
    await db.query(
      `insert into public.payments (id, business_id, customer_id, amount_cents, method, source, received_at, request_hash, created_by)
       values ($1, $2, $3, 1000, 'PIX', 'MANUAL', now(), $4, $5)`,
      [randomUUID(), a.businessId, a.customerId, 'b'.repeat(64), a.owner.userId],
    );
    await db.query(
      `update public.business_settings set pix_key_type = 'EMAIL', pix_key = 'rose@exemplo.com',
              pix_receiver_name = 'Rose Teste', pix_city = 'Cuiaba' where business_id = $1`,
      [a.businessId],
    );
  });

  it('resumo: saldo igual ao da Rose, compras a confirmar e locais', async () => {
    const s = await fetchPortalSummary(me.client);
    expect(s.balanceCents).toBe(await balance(a.customerId));
    expect(s.balanceCents).toBe(1200);
    expect(s.toConfirm).toBe(2);
    expect(s.pixConfigured).toBe(true);
    expect(s.establishments.map((e) => e.name).sort()).toEqual(['Mercado PortA', 'Oficina PortA']);
  });

  it('extrato com filtros e paginação', async () => {
    const all = await fetchPortalStatement(me.client, 'ALL', null, null);
    expect(all.map((e) => e.kind)).toEqual(['PAYMENT', 'SALE', 'SALE']);
    expect((await fetchPortalStatement(me.client, 'SALES', null, null)).map((e) => e.id)).toEqual([saleNew, saleOld]);
    expect((await fetchPortalStatement(me.client, 'PAYMENTS', null, null)).map((e) => e.kind)).toEqual(['PAYMENT']);
    expect((await fetchPortalStatement(me.client, 'ALL', secondPlace, null)).map((e) => e.id)).toEqual([saleNew]);
    // FIFO: o pagamento de 10,00 quita parte da compra mais antiga.
    const open = await fetchPortalStatement(me.client, 'OPEN', null, null);
    expect(open.map((e) => [e.id, e.openCents])).toEqual([
      [saleNew, 700],
      [saleOld, 500],
    ]);
    const page1 = await fetchPortalStatement(me.client, 'ALL', null, null, 2);
    const page2 = await fetchPortalStatement(me.client, 'ALL', null, { beforeAt: page1[1]!.occurredAt, beforeId: page1[1]!.id }, 2);
    expect([...page1, ...page2].map((e) => e.id)).toEqual(all.map((e) => e.id));
  });

  it('detalhe da compra traz o hash do resumo canônico; compra de outro cliente não aparece', async () => {
    const d = await fetchPortalSale(me.client, saleOld);
    expect(d.establishmentName).toBe('Mercado PortA');
    expect(d.openCents).toBe(500);
    const { rows } = await db.query('select private.sale_document_hash($1, $2) as h', [saleOld, d.termsVersion]);
    expect(d.documentHash).toBe(rows[0].h);

    const otherSale = await insertAmountSale(db, b, { totalCents: 999 });
    await expectDbError(fetchPortalSale(me.client, otherSale), /não encontrada/i);
  });

  it('Pix do negócio; e quem não é cliente não usa o portal', async () => {
    expect(await fetchPortalPix(me.client)).toMatchObject({ key: 'rose@exemplo.com', keyType: 'EMAIL', receiverName: 'Rose Teste' });
    await expectDbError(fetchPortalSummary(a.owner.client), /permissão/i);
    const nobody = await signUp('SemCadastro');
    await expectDbError(fetchPortalStatement(nobody.client, 'ALL', null, null), /permissão/i);
    await expectDbError(fetchPortalStatement(me.client, 'XYZ' as never, null, null), /filtro/i);
  });
});

describe('portal: confirmar e contestar compras', () => {
  let biz: TestBusiness;
  let me: TestUser;

  beforeAll(async () => {
    biz = await setupBusiness(db, 'PortConf');
    me = await linkCustomerAccount(db, biz.customerId, 'PortalConf');
  });

  async function saleStatus(id: string): Promise<string> {
    const { rows } = await db.query('select confirmation_status from public.sales where id = $1', [id]);
    return rows[0].confirmation_status;
  }

  it('confirmar é idempotente; contestar depois troca a manifestação sem mexer na dívida', async () => {
    const saleId = await insertAmountSale(db, biz, { totalCents: 2000 });
    const d = await fetchPortalSale(me.client, saleId);
    const before = await balance(biz.customerId);
    const confirmId = randomUUID();
    const base = { saleId, documentHash: d.documentHash, termsVersion: d.termsVersion };

    expect(await confirmPortalSale(me.client, { ...base, id: confirmId })).toBe('CREATED');
    expect(await confirmPortalSale(me.client, { ...base, id: confirmId })).toBe('DUPLICATE');
    expect(await confirmPortalSale(me.client, { ...base, id: randomUUID() })).toBe('ALREADY');
    expect(await saleStatus(saleId)).toBe('CONFIRMED_ONLINE');

    const disputeId = randomUUID();
    expect(await disputePortalSale(me.client, { ...base, id: disputeId, reason: 'Não comprei o suco' })).toBe('CREATED');
    expect(await saleStatus(saleId)).toBe('DISPUTED');
    expect(await balance(biz.customerId)).toBe(before);
    // Mesmo id com outro motivo = conflito (registrado), não uma nova contestação.
    expect(await disputePortalSale(me.client, { ...base, id: disputeId, reason: 'Outro motivo' })).toBe('CONFLICT');

    const { rows } = await db.query(
      `select confirmation_status, invalidation_reason from public.sale_confirmations where id = $1`,
      [confirmId],
    );
    expect(rows[0]).toEqual({ confirmation_status: 'CANCELLED', invalidation_reason: 'Cliente contestou depois de confirmar' });

    const detail = await fetchPortalSale(me.client, saleId);
    expect(detail.online).toMatchObject({ status: 'DISPUTED', disputeReason: 'Não comprei o suco' });

    // A Rose vê a contestação e encerra; a compra volta a "sem confirmação".
    expect((await listOpenDisputes(biz.owner.client)).map((x) => x.saleId)).toEqual([saleId]);
    expect((await fetchDashboard(biz.owner.client)).openDisputes).toBe(1);
    await expectDbError(resolveDispute(me.client, saleId, 'Tentando'), /permissão/i);
    await resolveDispute(biz.owner.client, saleId, 'Conversamos, o suco era dela');
    expect(await saleStatus(saleId)).toBe('PENDING');
    expect(await listOpenDisputes(biz.owner.client)).toEqual([]);
    expect((await fetchPortalSale(me.client, saleId)).online).toMatchObject({ resolutionNote: 'Conversamos, o suco era dela' });
    await expectDbError(resolveDispute(biz.owner.client, saleId, 'De novo'), /contestação em aberto/i);

    // Depois de resolvida, o cliente pode confirmar.
    expect(await confirmPortalSale(me.client, { ...base, id: randomUUID() })).toBe('CREATED');
    expect(await saleStatus(saleId)).toBe('CONFIRMED_ONLINE');
  });

  it('recusa hash errado, motivo vazio, venda cancelada e venda de outra pessoa', async () => {
    const saleId = await insertAmountSale(db, biz, { totalCents: 900 });
    const d = await fetchPortalSale(me.client, saleId);
    const base = { saleId, documentHash: d.documentHash, termsVersion: d.termsVersion };

    await expectDbError(confirmPortalSale(me.client, { ...base, id: randomUUID(), documentHash: 'f'.repeat(64) }), /não confere/i);
    await expectDbError(disputePortalSale(me.client, { ...base, id: randomUUID(), reason: ' ' }), /motivo/i);
    await expectDbError(confirmPortalSale(me.client, { ...base, id: randomUUID(), termsVersion: 'v999' }), /desconhecida/i);

    const stranger = await linkCustomerAccount(db, await newCustomer(biz, 'Vizinho'), 'Vizinho');
    await expectDbError(confirmPortalSale(stranger.client, { ...base, id: randomUUID() }), /não encontrada/i);
    await expectDbError(confirmPortalSale(biz.owner.client, { ...base, id: randomUUID() }), /permissão/i);

    await db.query(
      `update public.sales set status = 'CANCELLED', cancel_reason = 'Lançada errado', cancelled_at = now(), cancelled_by = $2 where id = $1`,
      [saleId, biz.owner.userId],
    );
    await expectDbError(confirmPortalSale(me.client, { ...base, id: randomUUID() }), /já foi cancelada/i);
  });
});

describe('portal: "Já paguei"', () => {
  let biz: TestBusiness;
  let me: TestUser;

  beforeAll(async () => {
    biz = await setupBusiness(db, 'PortPix');
    me = await linkCustomerAccount(db, biz.customerId, 'PortalPix');
    await insertAmountSale(db, biz, { totalCents: 3000 });
  });

  it('aviso é idempotente e não muda o saldo; no máximo 5 pendentes', async () => {
    const id = randomUUID();
    expect(await notifyPayment(me.client, { id, amountCents: 1000, note: 'Paguei agora' })).toBe('CREATED');
    expect(await notifyPayment(me.client, { id, amountCents: 1000, note: 'Paguei agora' })).toBe('DUPLICATE');
    expect(await notifyPayment(me.client, { id, amountCents: 2000, note: 'Paguei agora' })).toBe('CONFLICT');
    expect(await balance(biz.customerId)).toBe(3000);

    const s = await fetchPortalSummary(me.client);
    expect(s.notices).toEqual([expect.objectContaining({ id, amountCents: 1000, status: 'PENDING' })]);

    const { rows } = await db.query('select created_by from public.payment_notifications where id = $1', [id]);
    expect(rows[0].created_by).toBe(me.userId);

    await expectDbError(notifyPayment(me.client, { id: randomUUID(), amountCents: 0, note: null }), /valor/i);
    for (let i = 0; i < 4; i += 1) {
      expect(await notifyPayment(me.client, { id: randomUUID(), amountCents: null, note: null })).toBe('CREATED');
    }
    await expectDbError(notifyPayment(me.client, { id: randomUUID(), amountCents: 500, note: null }), /5 avisos/i);
    await expectDbError(notifyPayment(biz.owner.client, { id: randomUUID(), amountCents: 500, note: null }), /permissão/i);
  });
});
