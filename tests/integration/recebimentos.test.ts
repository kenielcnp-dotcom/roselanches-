import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  cancelEntry,
  confirmNotice,
  createAdjustment,
  createOpeningBalance,
  registerPayment,
  rejectNotice,
  reversePayment,
  type RegisterPaymentPayload,
} from '@/services/payments';
import { createSale, fetchStatement, toCreateSalePayload } from '@/services/sales';
import type { SaleDraft } from '@/types/domain';
import { dbConnect, insertAmountSale, linkCustomerAccount, newClient, setupBusiness, signUp, type TestBusiness, type TestUser } from './helpers';

let db: pg.Client;
let a: TestBusiness;
let b: TestBusiness;
let portalA: TestUser;

beforeAll(async () => {
  db = await dbConnect();
  a = await setupBusiness(db, 'RecA');
  b = await setupBusiness(db, 'RecB');
  portalA = await linkCustomerAccount(db, a.customerId, 'PortalRec');
});
afterAll(async () => {
  await db.end();
});

async function balance(customerId: string): Promise<number> {
  const { rows } = await db.query('select balance_cents from public.customer_balances where customer_id = $1', [customerId]);
  return Number(rows[0].balance_cents);
}

async function freshCustomer(biz: TestBusiness, name: string): Promise<string> {
  const id = randomUUID();
  await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3)', [id, biz.businessId, name]);
  return id;
}

function payment(customerId: string, cents: number, over: Partial<RegisterPaymentPayload> = {}): RegisterPaymentPayload {
  return { id: randomUUID(), customer_id: customerId, amount_cents: cents, method: 'CASH', received_at: new Date().toISOString(), note: null, ...over };
}

async function notice(biz: TestBusiness, customerId: string, cents: number | null): Promise<string> {
  const id = randomUUID();
  await db.query(
    `insert into public.payment_notifications (id, business_id, customer_id, amount_cents, note, created_by)
     values ($1, $2, $3, $4, 'Paguei pelo Pix', $5)`,
    [id, biz.businessId, customerId, cents, portalA.userId],
  );
  return id;
}

describe('pagamentos', () => {
  it('parcial e depois quitação: o saldo cai até zero', async () => {
    const c = await freshCustomer(a, 'Parcial Rec');
    await insertAmountSale(db, { ...a, customerId: c }, { totalCents: 3000 });
    expect(await registerPayment(a.owner.client, payment(c, 1000))).toBe('CREATED');
    expect(await balance(c)).toBe(2000);
    expect(await registerPayment(a.owner.client, payment(c, 2000, { method: 'PIX' }))).toBe('CREATED');
    expect(await balance(c)).toBe(0);
  });

  it('reenviar o mesmo pagamento não recebe duas vezes; mesmo id com outro valor é CONFLICT', async () => {
    const c = await freshCustomer(a, 'Duplicado Rec');
    await insertAmountSale(db, { ...a, customerId: c }, { totalCents: 5000 });
    const p = payment(c, 1500);
    const results = await Promise.all([1, 2, 3].map(() => registerPayment(a.owner.client, p)));
    expect(results.sort()).toEqual(['CREATED', 'DUPLICATE', 'DUPLICATE']);
    expect(await balance(c)).toBe(3500);
    expect(await registerPayment(a.owner.client, { ...p, amount_cents: 9999 })).toBe('CONFLICT');
    expect(await balance(c)).toBe(3500);
  });

  it('pagamento maior que a dívida vira crédito do cliente', async () => {
    const c = await freshCustomer(a, 'Credito Rec');
    await insertAmountSale(db, { ...a, customerId: c }, { totalCents: 1000 });
    await registerPayment(a.owner.client, payment(c, 1500));
    expect(await balance(c)).toBe(-500);
  });

  it('valida valor, forma, data e cliente de outro negócio', async () => {
    for (const [p, code] of [
      [payment(a.customerId, 0), 'LDR_INVALID_PAYMENT'],
      [payment(a.customerId, 100, { method: 'CARD' as never }), 'LDR_INVALID_PAYMENT'],
      [payment(a.customerId, 100, { received_at: new Date(Date.now() + 3600_000).toISOString() }), 'LDR_PAYMENT_IN_FUTURE'],
      [payment(b.customerId, 100), 'LDR_CUSTOMER_NOT_FOUND'],
    ] as const) {
      await expect(registerPayment(a.owner.client, p)).rejects.toMatchObject({ code });
    }
  });

  it('estorno: só a dona, com motivo, e o saldo volta; pagamento de venda paga na hora não se estorna sozinho', async () => {
    const c = await freshCustomer(a, 'Estorno Rec');
    await insertAmountSale(db, { ...a, customerId: c }, { totalCents: 2000 });
    const p = payment(c, 2000);
    await registerPayment(a.owner.client, p);
    expect(await balance(c)).toBe(0);
    await expect(reversePayment(a.owner.client, p.id, 'x')).rejects.toMatchObject({ code: 'LDR_INVALID_REASON' });
    await reversePayment(a.owner.client, p.id, 'Nota falsa');
    await reversePayment(a.owner.client, p.id, 'Nota falsa'); // repetir é seguro
    expect(await balance(c)).toBe(2000);
    const { rows } = await db.query('select status, reverse_reason, reversed_by from public.payments where id = $1', [p.id]);
    expect(rows[0]).toMatchObject({ status: 'REVERSED', reverse_reason: 'Nota falsa', reversed_by: a.owner.userId });

    const draft: SaleDraft = {
      id: randomUUID(),
      customerId: c,
      establishmentId: a.establishmentId,
      mode: 'AMOUNT',
      period: 'MORNING',
      occurredAt: new Date().toISOString(),
      items: [],
      description: 'Paga na hora',
      totalCents: 500,
      paymentKind: 'PAID_NOW',
      paidNow: { paymentId: randomUUID(), method: 'CASH' },
    };
    await createSale(a.owner.client, toCreateSalePayload(draft));
    await expect(reversePayment(a.owner.client, draft.paidNow!.paymentId, 'Teste')).rejects.toMatchObject({ code: 'LDR_PAYMENT_OF_SALE' });
  });
});

describe('saldo anterior e ajustes', () => {
  it('saldo anterior entra no saldo e aparece no extrato como "Saldo anterior"; repetir não duplica', async () => {
    const c = await freshCustomer(a, 'Caderno Rec');
    const entry = { id: randomUUID(), customerId: c, amountCents: 4550, referenceDate: '2026-10-31', note: 'Caderno de outubro' };
    expect(await createOpeningBalance(a.owner.client, entry)).toBe('CREATED');
    expect(await createOpeningBalance(a.owner.client, entry)).toBe('DUPLICATE');
    expect(await createOpeningBalance(a.owner.client, { ...entry, amountCents: 1 })).toBe('CONFLICT');
    expect(await balance(c)).toBe(4550);
    const [first] = await fetchStatement(a.owner.client, c, null);
    expect(first).toMatchObject({ kind: 'OPENING_BALANCE', amountCents: 4550, description: 'Caderno de outubro', openCents: 4550 });
  });

  it('saldo anterior com data futura é recusado', async () => {
    await expect(
      createOpeningBalance(a.owner.client, { id: randomUUID(), customerId: a.customerId, amountCents: 100, referenceDate: '2099-01-01', note: 'x' }),
    ).rejects.toMatchObject({ code: 'LDR_INVALID_ENTRY' });
  });

  it('ajustes de débito e crédito mexem no saldo; cancelar desfaz e fica no histórico', async () => {
    const c = await freshCustomer(a, 'Ajuste Rec');
    const debit = { id: randomUUID(), customerId: c, direction: 'DEBIT' as const, amountCents: 800, reason: 'Lanche não anotado' };
    const credit = { id: randomUUID(), customerId: c, direction: 'CREDIT' as const, amountCents: 300, reason: 'Desconto combinado' };
    await createAdjustment(a.owner.client, debit);
    await createAdjustment(a.owner.client, credit);
    expect(await balance(c)).toBe(500);
    await cancelEntry(a.owner.client, 'ADJUSTMENT', credit.id, 'Desconto não valeu');
    expect(await balance(c)).toBe(800);
    const { rows } = await db.query('select status, cancel_reason from public.financial_adjustments where id = $1', [credit.id]);
    expect(rows[0]).toMatchObject({ status: 'CANCELLED', cancel_reason: 'Desconto não valeu' });
  });

  it('só a dona lança e cancela correções', async () => {
    const outsider = await signUp('SemNegocioRec');
    for (const client of [outsider.client, portalA.client, b.owner.client]) {
      await expect(
        createAdjustment(client, { id: randomUUID(), customerId: a.customerId, direction: 'CREDIT', amountCents: 100, reason: 'Indevido' }),
      ).rejects.toMatchObject({ code: expect.stringMatching(/LDR_NOT_ALLOWED|LDR_CUSTOMER_NOT_FOUND/) });
      await expect(
        createOpeningBalance(client, { id: randomUUID(), customerId: a.customerId, amountCents: 100, referenceDate: '2026-10-01', note: 'x' }),
      ).rejects.toBeTruthy();
    }
  });
});

describe('avisos "Já paguei" (Pix)', () => {
  it('o aviso sozinho não reduz o saldo; confirmar cria um pagamento só, com o valor conferido', async () => {
    const c = await freshCustomer(a, 'Aviso Rec');
    await insertAmountSale(db, { ...a, customerId: c }, { totalCents: 2500 });
    const n = await notice(a, c, 2500);
    expect(await balance(c)).toBe(2500);

    const paymentId = randomUUID();
    // A Rose viu no banco só R$ 20,00: confirma esse valor.
    const args = { id: n, paymentId, amountCents: 2000, receivedAt: new Date().toISOString(), note: 'Conferido no app do banco' };
    await confirmNotice(a.owner.client, args);
    await confirmNotice(a.owner.client, args); // toque duplo: DUPLICATE
    expect(await balance(c)).toBe(500);
    const { rows } = await db.query('select count(*)::int as n from public.payments where notification_id = $1', [n]);
    expect(rows[0].n).toBe(1);
    await expect(confirmNotice(a.owner.client, { ...args, paymentId: randomUUID() })).rejects.toMatchObject({
      code: 'LDR_NOTIFICATION_RESOLVED',
    });
  });

  it('recusar exige motivo e não mexe no saldo', async () => {
    const c = await freshCustomer(a, 'Recusa Rec');
    await insertAmountSale(db, { ...a, customerId: c }, { totalCents: 1000 });
    const n = await notice(a, c, 1000);
    await expect(rejectNotice(a.owner.client, n, '')).rejects.toMatchObject({ code: 'LDR_INVALID_REASON' });
    await rejectNotice(a.owner.client, n, 'Não chegou na conta');
    expect(await balance(c)).toBe(1000);
    await expect(
      confirmNotice(a.owner.client, { id: n, paymentId: randomUUID(), amountCents: 1000, receivedAt: new Date().toISOString() }),
    ).rejects.toMatchObject({ code: 'LDR_NOTIFICATION_RESOLVED' });
  });

  it('cliente do portal, outro negócio e anônimo não confirmam nem recusam', async () => {
    const n = await notice(a, a.customerId, 500);
    for (const client of [portalA.client, b.owner.client, newClient()]) {
      const { error } = await client.rpc('confirm_payment_notification', {
        p_notification_id: n,
        p_payment_id: randomUUID(),
        p_amount_cents: 500,
        p_received_at: new Date().toISOString(),
      });
      expect(error).not.toBeNull();
      expect((await client.rpc('reject_payment_notification', { p_notification_id: n, p_reason: 'Indevido' })).error).not.toBeNull();
    }
    const { rows } = await db.query('select status from public.payment_notifications where id = $1', [n]);
    expect(rows[0].status).toBe('PENDING');
  });

  it('listas isoladas por negócio e invisíveis para o portal', async () => {
    for (const view of ['payment_list', 'payment_notification_list'] as const) {
      expect((await b.owner.client.from(view).select('id').eq('business_id', a.businessId)).data, view).toEqual([]);
      expect((await portalA.client.from(view).select('id')).data, view).toEqual([]);
    }
  });

  it('painel mostra recebido hoje e avisos pendentes', async () => {
    const biz = await setupBusiness(db, 'PainelRec');
    await insertAmountSale(db, biz, { totalCents: 3000 });
    await registerPayment(biz.owner.client, payment(biz.customerId, 1200));
    await notice(biz, biz.customerId, 1800);
    const { data } = await biz.owner.client.rpc('dashboard_summary');
    expect(data).toMatchObject({ today_received_cents: 1200, pending_notifications: 1, receivable_cents: 1800 });
  });
});

describe('chave Pix', () => {
  it('formato conferido pelo tipo', async () => {
    const set = (type: string, key: string) =>
      a.owner.client.from('business_settings').update({ pix_key_type: type, pix_key: key }).eq('business_id', a.businessId);
    expect((await set('CPF', '12345678909')).error).toBeNull();
    expect((await set('EMAIL', 'rose@exemplo.com')).error).toBeNull();
    expect((await set('PHONE', '+5565999887766')).error).toBeNull();
    expect((await set('CPF', '123')).error?.code).toBe('23514');
    expect((await set('PHONE', '65999887766')).error?.code).toBe('23514');
  });
});
