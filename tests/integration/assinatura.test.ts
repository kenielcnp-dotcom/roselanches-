import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { inject } from 'vitest';
import { canonicalFromDraft, canonicalSaleHash } from '@/domain/canonical';
import { cancelSale, createSale, toCreateSalePayload } from '@/services/sales';
import type { SaleDraft } from '@/types/domain';
import { dbConnect, linkCustomerAccount, serviceClient, setupBusiness, signUp, type TestBusiness, type TestUser } from './helpers';

// PNG mínimo válido (1×1) e uma variação com outro conteúdo.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PNG_2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==', 'base64');
const BUCKET = 'sale-signatures';

let db: pg.Client;
let a: TestBusiness;
let b: TestBusiness;
let portalA: TestUser;

beforeAll(async () => {
  db = await dbConnect();
  a = await setupBusiness(db, 'AssA');
  b = await setupBusiness(db, 'AssB');
  portalA = await linkCustomerAccount(db, a.customerId, 'PortalAss');
});

afterAll(async () => {
  await db.end();
});

async function token(user: { client: TestUser['client'] }): Promise<string | null> {
  const { data } = await user.client.auth.getSession();
  return data.session?.access_token ?? null;
}

async function newSale(biz: TestBusiness): Promise<{ draft: SaleDraft; hash: string }> {
  const draft: SaleDraft = {
    id: randomUUID(),
    customerId: biz.customerId,
    establishmentId: biz.establishmentId,
    mode: 'ITEMS',
    period: 'MORNING',
    occurredAt: new Date().toISOString(),
    items: [{ productId: biz.productId, productName: `Coxinha ${biz === a ? 'AssA' : 'AssB'}`, quantity: 2, unitPriceCents: 650, subtotalCents: 1300 }],
    description: null,
    totalCents: 1300,
    paymentKind: 'CREDIT',
  };
  await createSale(biz.owner.client, toCreateSalePayload(draft));
  return { draft, hash: await canonicalSaleHash(canonicalFromDraft(draft), 'v1') };
}

interface UploadFields {
  confirmationId?: string;
  saleId: string;
  documentHash: string;
  terms?: string;
  file?: Buffer;
}

async function upload(jwt: string | null, f: UploadFields): Promise<{ status: number; body: { status?: string; error?: string } }> {
  const form = new FormData();
  form.set('file', new Blob([new Uint8Array(f.file ?? PNG)], { type: 'image/png' }), 'assinatura.png');
  form.set('confirmation_id', f.confirmationId ?? randomUUID());
  form.set('sale_id', f.saleId);
  form.set('document_hash', f.documentHash);
  form.set('terms_version', f.terms ?? 'v1');
  form.set('captured_at', new Date().toISOString());
  const headers: Record<string, string> = { apikey: inject('anonKey') };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  const res = await fetch(`${inject('supabaseUrl')}/functions/v1/signature-upload`, { method: 'POST', headers, body: form });
  return { status: res.status, body: (await res.json()) as { status?: string; error?: string } };
}

async function confirmations(saleId: string): Promise<{ id: string; confirmation_status: string; signature_storage_path: string; captured_by: string }[]> {
  const { rows } = await db.query(
    'select id, confirmation_status, signature_storage_path, captured_by from public.sale_confirmations where sale_id = $1',
    [saleId],
  );
  return rows;
}

describe('assinatura: caminho feliz e idempotência', () => {
  it('grava o arquivo no caminho fixo, registra a confirmação e a venda fica SIGNED', async () => {
    const { draft, hash } = await newSale(a);
    const confirmationId = randomUUID();
    const r = await upload(await token(a.owner), { confirmationId, saleId: draft.id, documentHash: hash });
    expect(r).toEqual({ status: 200, body: { status: 'FINALIZED' } });

    const rows = await confirmations(draft.id);
    expect(rows).toEqual([
      {
        id: confirmationId,
        confirmation_status: 'SIGNED',
        signature_storage_path: `${a.businessId}/${draft.id}/${confirmationId}.png`,
        captured_by: a.owner.userId,
      },
    ]);
    const { rows: sale } = await db.query('select confirmation_status from public.sales where id = $1', [draft.id]);
    expect(sale[0].confirmation_status).toBe('SIGNED');
    const file = await serviceClient().storage.from(BUCKET).download(rows[0]!.signature_storage_path);
    expect(createHash('sha256').update(Buffer.from(await file.data!.arrayBuffer())).digest('hex')).toBe(
      createHash('sha256').update(PNG).digest('hex'),
    );
  });

  it('reenviar a mesma assinatura devolve DUPLICATE, sem segundo arquivo nem segunda confirmação', async () => {
    const { draft, hash } = await newSale(a);
    const confirmationId = randomUUID();
    const jwt = await token(a.owner);
    await upload(jwt, { confirmationId, saleId: draft.id, documentHash: hash });
    const again = await upload(jwt, { confirmationId, saleId: draft.id, documentHash: hash });
    expect(again.body.status).toBe('DUPLICATE');
    expect(await confirmations(draft.id)).toHaveLength(1);
    const list = await serviceClient().storage.from(BUCKET).list(`${a.businessId}/${draft.id}`);
    expect(list.data).toHaveLength(1);
  });

  it('arquivo subiu mas a finalização caiu: o reenvio conclui sem duplicar', async () => {
    const { draft, hash } = await newSale(a);
    const confirmationId = randomUUID();
    // Simula a primeira tentativa: só o upload aconteceu.
    await serviceClient().storage.from(BUCKET).upload(`${a.businessId}/${draft.id}/${confirmationId}.png`, PNG, { contentType: 'image/png' });
    const r = await upload(await token(a.owner), { confirmationId, saleId: draft.id, documentHash: hash });
    expect(r.body.status).toBe('FINALIZED');
    expect(await confirmations(draft.id)).toHaveLength(1);
  });

  it('mesmo código com outro arquivo é conflito', async () => {
    const { draft, hash } = await newSale(a);
    const confirmationId = randomUUID();
    await serviceClient().storage.from(BUCKET).upload(`${a.businessId}/${draft.id}/${confirmationId}.png`, PNG_2, { contentType: 'image/png' });
    const r = await upload(await token(a.owner), { confirmationId, saleId: draft.id, documentHash: hash });
    expect(r).toMatchObject({ status: 409, body: { error: 'LDR_CONFIRMATION_CONFLICT' } });
    expect(await confirmations(draft.id)).toHaveLength(0);
  });
});

describe('assinatura: integridade', () => {
  it('hash diferente do conteúdo gravado é recusado', async () => {
    const { draft } = await newSale(a);
    const wrong = await canonicalSaleHash(canonicalFromDraft({ ...draft, totalCents: 9999 }), 'v1');
    const r = await upload(await token(a.owner), { saleId: draft.id, documentHash: wrong });
    expect(r).toMatchObject({ status: 422, body: { error: 'LDR_HASH_MISMATCH' } });
    expect(await confirmations(draft.id)).toHaveLength(0);
  });

  it('assinatura de uma venda não serve para outra (reuso)', async () => {
    const first = await newSale(a);
    const second = await newSale(a);
    const r = await upload(await token(a.owner), { saleId: second.draft.id, documentHash: first.hash });
    expect(r.body.error).toBe('LDR_HASH_MISMATCH');
    // O mesmo código de confirmação também não pode ir para outra venda.
    const confirmationId = randomUUID();
    await upload(await token(a.owner), { confirmationId, saleId: first.draft.id, documentHash: first.hash });
    const reuse = await upload(await token(a.owner), { confirmationId, saleId: second.draft.id, documentHash: second.hash });
    expect(reuse.body.error).toBe('LDR_CONFIRMATION_CONFLICT');
  });

  it('segunda assinatura válida para a mesma venda é recusada', async () => {
    const { draft, hash } = await newSale(a);
    const jwt = await token(a.owner);
    await upload(jwt, { saleId: draft.id, documentHash: hash });
    const r = await upload(jwt, { saleId: draft.id, documentHash: hash, file: PNG_2 });
    expect(r.body.error).toBe('LDR_ALREADY_SIGNED');
  });

  it('venda cancelada: a assinatura que chega depois é ignorada; cancelar depois invalida a confirmação', async () => {
    const late = await newSale(a);
    await cancelSale(a.owner.client, late.draft.id, 'Registro errado');
    const r = await upload(await token(a.owner), { saleId: late.draft.id, documentHash: late.hash });
    expect(r.body.status).toBe('SKIPPED');
    expect(await confirmations(late.draft.id)).toHaveLength(0);

    const signed = await newSale(a);
    await upload(await token(a.owner), { saleId: signed.draft.id, documentHash: signed.hash });
    await cancelSale(a.owner.client, signed.draft.id, 'Valor errado');
    expect((await confirmations(signed.draft.id))[0]?.confirmation_status).toBe('CANCELLED');
    const { rows } = await db.query('select confirmation_status from public.sales where id = $1', [signed.draft.id]);
    expect(rows[0].confirmation_status).toBe('CANCELLED');
  });

  it('recusa o que não é PNG e arquivo grande demais', async () => {
    const { draft, hash } = await newSale(a);
    const jwt = await token(a.owner);
    const notPng = await upload(jwt, { saleId: draft.id, documentHash: hash, file: Buffer.from('<svg></svg>') });
    expect(notPng.status).toBe(400);
    const big = Buffer.concat([PNG, Buffer.alloc(210_000)]);
    expect((await upload(jwt, { saleId: draft.id, documentHash: hash, file: big })).status).toBe(413);
  });
});

describe('assinatura: permissões', () => {
  it('sem login, cliente do portal, conta sem negócio e outro negócio não gravam', async () => {
    const { draft, hash } = await newSale(a);
    expect((await upload(null, { saleId: draft.id, documentHash: hash })).status).toBe(401);
    for (const user of [portalA, await signUp('SemNegocioAss'), b.owner]) {
      const r = await upload(await token(user), { saleId: draft.id, documentHash: hash });
      expect(r).toMatchObject({ status: 403, body: { error: 'LDR_NOT_ALLOWED' } });
    }
    expect(await confirmations(draft.id)).toHaveLength(0);
  });

  it('o app não chama as funções internas de preparo e finalização', async () => {
    const { draft, hash } = await newSale(a);
    const args = {
      p_user: a.owner.userId,
      p_confirmation_id: randomUUID(),
      p_sale_id: draft.id,
      p_document_hash: hash,
      p_terms: 'v1',
      p_file_sha256: 'a'.repeat(64),
      p_size: 100,
      p_captured_at: new Date().toISOString(),
    };
    for (const fn of ['signature_prepare', 'signature_finalize'] as const) {
      const { error } = await a.owner.client.rpc(fn, args);
      expect(error).not.toBeNull();
    }
    expect(await confirmations(draft.id)).toHaveLength(0);
  });
});
