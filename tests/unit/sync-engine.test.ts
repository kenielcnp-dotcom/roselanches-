import 'fake-indexeddb/auto';
import { randomUUID } from 'node:crypto';
import { getLocalDb, deleteLocalDb, type LocalDb } from '@/lib/offline/db';
import { countOutbox, discardFailedSale, enqueueCancel, enqueuePayment, enqueueSale, resumeInterrupted } from '@/lib/offline/outbox';
import { backoffDelay, runSyncRound } from '@/lib/offline/sync-engine';
import type { Client } from '@/lib/supabase/client';
import type { SaleDraft } from '@/types/domain';

type RpcResult = { data: unknown; error: unknown };
type RpcImpl = (name: string, args: Record<string, unknown>) => RpcResult | Promise<RpcResult>;

/** Servidor falso: guarda as chamadas e responde conforme o cenário. */
function fakeClient(impl: RpcImpl) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      return impl(name, args);
    },
  } as unknown as Client;
  return { client, calls };
}

const networkDown: RpcImpl = () => {
  throw new TypeError('Failed to fetch');
};
const created: RpcImpl = (name, args) =>
  name === 'create_sale'
    ? { data: { status: 'CREATED', sale_id: (args.p_sale as { id: string }).id, flags: [] }, error: null }
    : { data: { status: 'CANCELLED' }, error: null };

function draft(): SaleDraft {
  return {
    id: randomUUID(),
    customerId: randomUUID(),
    establishmentId: randomUUID(),
    mode: 'AMOUNT',
    period: 'AFTERNOON',
    occurredAt: new Date().toISOString(),
    items: [],
    description: 'Lanches da tarde',
    totalCents: 1850,
    paymentKind: 'CREDIT',
  };
}

const display = { customerName: 'Maria Silva', customerPhone: null, establishmentName: 'Mercado', summary: 'Lanches da tarde' };

let db: LocalDb;
let userId: string;

beforeEach(() => {
  userId = randomUUID();
  db = getLocalDb(userId);
});

afterEach(async () => {
  await deleteLocalDb(userId);
});

describe('fila do celular', () => {
  it('grava venda e operação juntas; gravar de novo o mesmo id não duplica', async () => {
    const d = draft();
    expect(await enqueueSale(db, d, display)).toBe(true);
    expect(await enqueueSale(db, d, display)).toBe(false);
    expect(await db.localSales.count()).toBe(1);
    const ops = await db.outbox.toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: 'CREATE_SALE', entityId: d.id, state: 'PENDING' });
    expect(ops[0]?.payload).toMatchObject({ id: d.id, total_cents: 1850, description: 'Lanches da tarde', items: [] });
  });

  it('sobrevive a fechar e abrir o app de novo', async () => {
    await enqueueSale(db, draft(), display);
    db.close();
    const reopened = getLocalDb(userId);
    await reopened.open();
    expect(await reopened.outbox.count()).toBe(1);
  });

  it('operação interrompida no meio do envio volta para a fila ao abrir', async () => {
    await enqueueSale(db, draft(), display);
    await db.outbox.toCollection().modify({ state: 'SYNCING' });
    expect(await resumeInterrupted(db)).toBe(1);
    expect((await db.outbox.toArray())[0]?.state).toBe('PENDING');
  });
});

describe('envio', () => {
  it('envia, marca como sincronizada e não reenvia', async () => {
    const d = draft();
    await enqueueSale(db, d, display);
    const { client, calls } = fakeClient(created);
    const report = await runSyncRound(db, client);
    expect(report).toMatchObject({ sent: 1, syncedSales: [d.id], failed: 0, stoppedBy: null });
    expect((await db.outbox.get((await db.localSales.get(d.id))!.opId))?.state).toBe('SYNCED');
    await runSyncRound(db, client);
    expect(calls).toHaveLength(1);
  });

  it('sem internet: continua na fila, espera e tenta de novo depois', async () => {
    await enqueueSale(db, draft(), display);
    let now = Date.now();
    const down = fakeClient(networkDown);
    const r1 = await runSyncRound(db, down.client, { now: () => now, random: () => 0.5 });
    expect(r1).toMatchObject({ sent: 0, stoppedBy: 'network' });
    const op = (await db.outbox.toArray())[0]!;
    expect(op).toMatchObject({ state: 'PENDING', attempts: 1, lastError: { kind: 'transient' } });
    expect(op.nextAttemptAt).toBe(now + 5_000);

    // Antes da hora: nem tenta.
    const up = fakeClient(created);
    await runSyncRound(db, up.client, { now: () => now + 1_000 });
    expect(up.calls).toHaveLength(0);
    now += 5_000;
    const r2 = await runSyncRound(db, up.client, { now: () => now });
    expect(r2.sent).toBe(1);
  });

  it('resposta perdida depois de o servidor gravar: o reenvio recebe DUPLICATE e conclui', async () => {
    const d = draft();
    await enqueueSale(db, d, display);
    let serverHasIt = false;
    const flaky = fakeClient((_name, args) => {
      if (!serverHasIt) {
        serverHasIt = true; // gravou, mas a resposta não chegou
        throw new DOMException('signal timed out', 'TimeoutError');
      }
      return { data: { status: 'DUPLICATE', sale_id: (args.p_sale as { id: string }).id }, error: null };
    });
    let now = Date.now();
    await runSyncRound(db, flaky.client, { now: () => now });
    now += 60_000;
    const r = await runSyncRound(db, flaky.client, { now: () => now });
    expect(r.syncedSales).toEqual([d.id]);
    // O mesmo corpo foi enviado nas duas vezes (mesmo hash no servidor).
    expect(flaky.calls[0]?.args).toEqual(flaky.calls[1]?.args);
  });

  it('CONFLICT e erro de validação ficam em FAILED, visíveis, sem travar as outras vendas', async () => {
    const bad = draft();
    const conflict = draft();
    const good = draft();
    for (const d of [bad, conflict, good]) await enqueueSale(db, d, display);
    const { client } = fakeClient((_name, args) => {
      const id = (args.p_sale as { id: string }).id;
      if (id === bad.id) return { data: null, error: { code: 'P0001', message: 'LDR_SALE_TOO_OLD' } };
      if (id === conflict.id) return { data: { status: 'CONFLICT', sale_id: id }, error: null };
      return { data: { status: 'CREATED', sale_id: id, flags: [] }, error: null };
    });
    const r = await runSyncRound(db, client);
    expect(r).toMatchObject({ sent: 1, failed: 2, syncedSales: [good.id] });
    const counts = countOutbox(await db.outbox.toArray());
    expect(counts).toMatchObject({ failed: 2, pendingSales: 2 });
    const failed = await db.outbox.where('state').equals('FAILED').toArray();
    expect(failed.map((o) => o.lastError?.code).sort()).toEqual(['CONFLICT', 'LDR_SALE_TOO_OLD']);
  });

  it('sessão expirada pausa a fila sem descartar nada', async () => {
    await enqueueSale(db, draft(), display);
    const { client } = fakeClient(() => ({ data: null, error: { code: 'PGRST301', message: 'JWT expired' } }));
    const r = await runSyncRound(db, client);
    expect(r.stoppedBy).toBe('auth');
    const counts = countOutbox(await db.outbox.toArray());
    expect(counts).toMatchObject({ authPaused: true, pendingSales: 1, failed: 0 });
  });

  it('cancelamento espera a venda chegar ao servidor e vai depois dela', async () => {
    const d = draft();
    await enqueueSale(db, d, display);
    await enqueueCancel(db, d.id, 'Cliente errado');
    await enqueueCancel(db, d.id, 'Cliente errado'); // toque duplo
    expect(await db.outbox.count()).toBe(2);

    const { client, calls } = fakeClient(created);
    await runSyncRound(db, client);
    expect(calls.map((c) => c.name)).toEqual(['create_sale', 'cancel_sale']);
    expect(calls[1]?.args).toEqual({ p_sale_id: d.id, p_reason: 'Cliente errado' });
  });

  it('se a venda falhar de vez, o cancelamento não é enviado', async () => {
    const d = draft();
    await enqueueSale(db, d, display);
    await enqueueCancel(db, d.id, 'Cliente errado');
    const { client, calls } = fakeClient(() => ({ data: null, error: { code: 'P0001', message: 'LDR_CUSTOMER_NOT_FOUND' } }));
    await runSyncRound(db, client);
    expect(calls).toHaveLength(1);
  });
});

describe('descartar venda recusada', () => {
  it('só apaga do celular o que o servidor recusou; pendente nunca', async () => {
    const pending = draft();
    const refused = draft();
    await enqueueSale(db, pending, display);
    await enqueueSale(db, refused, display);
    const { client } = fakeClient((_n, args) =>
      (args.p_sale as { id: string }).id === refused.id
        ? { data: null, error: { code: 'P0001', message: 'LDR_SALE_TOO_OLD' } }
        : (() => {
            throw new TypeError('Failed to fetch');
          })(),
    );
    await runSyncRound(db, client); // a primeira (pending) falha por rede e para a rodada
    await db.outbox.toCollection().modify({ nextAttemptAt: 0 });
    const { client: c2 } = fakeClient((_n, args) =>
      (args.p_sale as { id: string }).id === refused.id
        ? { data: null, error: { code: 'P0001', message: 'LDR_SALE_TOO_OLD' } }
        : (() => {
            throw new TypeError('Failed to fetch');
          })(),
    );
    // Garante que a recusada seja processada: tira a pendente da frente.
    await db.outbox.where('entityId').equals(pending.id).modify({ nextAttemptAt: Date.now() + 3_600_000 });
    await runSyncRound(db, c2);

    expect(await discardFailedSale(db, pending.id)).toBe(false);
    expect(await discardFailedSale(db, refused.id)).toBe(true);
    expect(await db.localSales.get(pending.id)).toBeDefined();
    expect(await db.localSales.get(refused.id)).toBeUndefined();
  });
});

describe('espera entre tentativas', () => {
  it('dobra a cada tentativa até 15 minutos', () => {
    const mid = () => 0.5;
    expect(backoffDelay(1, mid)).toBe(5_000);
    expect(backoffDelay(2, mid)).toBe(10_000);
    expect(backoffDelay(5, mid)).toBe(80_000);
    expect(backoffDelay(20, mid)).toBe(15 * 60_000);
    expect(backoffDelay(1, () => 0)).toBe(4_000);
    expect(backoffDelay(1, () => 1)).toBe(6_000);
  });
});

describe('assinatura na fila', () => {
  function withFunctions(impl: RpcImpl, upload: () => { data: unknown; error: unknown }) {
    const base = fakeClient(impl);
    const uploads: FormData[] = [];
    (base.client as unknown as { functions: unknown }).functions = {
      invoke: async (_name: string, opts: { body: FormData }) => {
        uploads.push(opts.body);
        return upload();
      },
    };
    return { ...base, uploads };
  }

  function signatureFor(saleId: string) {
    return {
      confirmationId: randomUUID(),
      saleId,
      png: new Uint8Array([137, 80, 78, 71]).buffer,
      fileSha256: 'f'.repeat(64),
      documentHash: 'e'.repeat(64),
      termsVersion: 'v1',
      capturedAt: new Date().toISOString(),
    };
  }

  it('venda e assinatura são gravadas juntas; a assinatura depende da venda', async () => {
    const d = draft();
    const sig = signatureFor(d.id);
    await enqueueSale(db, d, display, sig);
    const ops = await db.outbox.orderBy('createdAt').toArray();
    expect(ops.map((o) => o.type)).toEqual(['CREATE_SALE', 'UPLOAD_SIGNATURE']);
    expect(ops[1]?.dependsOn).toEqual([ops[0]?.opId]);
    expect(await db.localSignatures.count()).toBe(1);
    expect(countOutbox(ops)).toMatchObject({ pendingSales: 1, pendingSignatures: 1 });
  });

  it('não aceita assinatura de outra venda', async () => {
    await expect(enqueueSale(db, draft(), display, signatureFor(randomUUID()))).rejects.toThrow();
    expect(await db.outbox.count()).toBe(0);
  });

  it('sobe depois da venda e a imagem sai do celular quando o servidor confirma', async () => {
    const d = draft();
    const sig = signatureFor(d.id);
    await enqueueSale(db, d, display, sig);
    const c = withFunctions(created, () => ({ data: { status: 'FINALIZED' }, error: null }));
    const r = await runSyncRound(db, c.client);
    expect(c.calls.map((x) => x.name)).toEqual(['create_sale']);
    expect(c.uploads).toHaveLength(1);
    expect(c.uploads[0]?.get('confirmation_id')).toBe(sig.confirmationId);
    expect(c.uploads[0]?.get('document_hash')).toBe(sig.documentHash);
    expect(r.syncedSignatures).toBe(1);
    expect(await db.localSignatures.count()).toBe(0);
  });

  it('sem internet para a venda, a assinatura nem é tentada e continua no celular', async () => {
    const d = draft();
    await enqueueSale(db, d, display, signatureFor(d.id));
    const c = withFunctions(networkDown, () => ({ data: { status: 'FINALIZED' }, error: null }));
    await runSyncRound(db, c.client);
    expect(c.uploads).toHaveLength(0);
    expect(await db.localSignatures.count()).toBe(1);
  });

  it('venda enviada mas assinatura falhou: a venda fica sincronizada e a assinatura espera', async () => {
    const d = draft();
    await enqueueSale(db, d, display, signatureFor(d.id));
    const { FunctionsFetchError } = await import('@supabase/supabase-js');
    const c = withFunctions(created, () => ({ data: null, error: new FunctionsFetchError('rede') }));
    await runSyncRound(db, c.client);
    const ops = await db.outbox.orderBy('createdAt').toArray();
    expect(ops.map((o) => o.state)).toEqual(['SYNCED', 'PENDING']);
    expect(await db.localSignatures.count()).toBe(1);
    expect(countOutbox(ops)).toMatchObject({ pendingSales: 0, pendingSignatures: 1 });
  });
});

describe('pagamento na fila', () => {
  function pay(customerId = randomUUID()) {
    return { id: randomUUID(), customer_id: customerId, amount_cents: 1500, method: 'CASH' as const, received_at: new Date().toISOString(), note: null };
  }

  it('grava no celular; toque duplo não cria outro; sobe pela fila', async () => {
    const p = pay();
    expect(await enqueuePayment(db, p, 'Maria Silva')).toBe(true);
    expect(await enqueuePayment(db, p, 'Maria Silva')).toBe(false);
    expect(countOutbox(await db.outbox.toArray())).toMatchObject({ pendingPayments: 1, pendingSales: 0 });
    const { client, calls } = fakeClient(() => ({ data: { status: 'CREATED' }, error: null }));
    const r = await runSyncRound(db, client);
    expect(r.syncedPayments).toBe(1);
    expect(calls).toEqual([{ name: 'register_payment', args: { p_payment: p } }]);
  });

  it('CONFLICT fica em FAILED para revisão', async () => {
    await enqueuePayment(db, pay(), 'Maria Silva');
    const { client } = fakeClient(() => ({ data: { status: 'CONFLICT' }, error: null }));
    expect((await runSyncRound(db, client)).failed).toBe(1);
  });
});
