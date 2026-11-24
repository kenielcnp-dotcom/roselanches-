import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { dbConnect, HASH_A, insertAmountSale, linkCustomerAccount, newClient, serviceClient, setupBusiness, type TestBusiness, type TestUser } from './helpers';

// PNG mínimo válido (1×1 transparente).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const BUCKET = 'sale-signatures';

let db: pg.Client;
let a: TestBusiness;
let b: TestBusiness;
let customerA: TestUser;
let otherCustomerA: TestUser;
let path: string;

beforeAll(async () => {
  db = await dbConnect();
  a = await setupBusiness(db, 'StoA');
  b = await setupBusiness(db, 'StoB');
  customerA = await linkCustomerAccount(db, a.customerId, 'ClienteSto');

  const otherCustomer = randomUUID();
  await db.query('insert into public.customers (id, business_id, full_name) values ($1, $2, $3)', [otherCustomer, a.businessId, 'Outra Cliente']);
  otherCustomerA = await linkCustomerAccount(db, otherCustomer, 'OutraSto');

  // A Edge Function (service_role) é a única que grava arquivos.
  const sale = await insertAmountSale(db, a, { totalCents: 2000 });
  const confirmationId = randomUUID();
  path = `${a.businessId}/${sale}/${confirmationId}.png`;
  const up = await serviceClient().storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png', upsert: false });
  if (up.error) throw up.error;
  await db.query(
    `insert into public.sale_confirmations (id, business_id, sale_id, customer_id, confirmation_type, confirmation_status,
       signed_document_hash, consent_text_version, signature_storage_path, signature_file_sha256, signature_size_bytes, captured_at)
     values ($1, $2, $3, $4, 'DRAWN_SIGNATURE', 'SIGNED', $5, 'v1', $6, $5, $7, now())`,
    [confirmationId, a.businessId, sale, a.customerId, HASH_A, path, PNG.length],
  );
});

afterAll(async () => {
  await db.end();
});

describe('bucket de assinaturas', () => {
  it('ninguém grava pelo app: nem a dona, nem o cliente', async () => {
    const own = await a.owner.client.storage.from(BUCKET).upload(`${a.businessId}/x/${randomUUID()}.png`, PNG, { contentType: 'image/png' });
    expect(own.error).not.toBeNull();
    const cust = await customerA.client.storage.from(BUCKET).upload(`${a.businessId}/x/${randomUUID()}.png`, PNG, { contentType: 'image/png' });
    expect(cust.error).not.toBeNull();
  });

  it('não sobrescreve nem apaga a assinatura pelo app', async () => {
    const overwrite = await a.owner.client.storage.from(BUCKET).upload(path, PNG, { contentType: 'image/png', upsert: true });
    expect(overwrite.error).not.toBeNull();
    const removed = await a.owner.client.storage.from(BUCKET).remove([path]);
    expect(removed.data ?? []).toEqual([]);
    const still = await serviceClient().storage.from(BUCKET).download(path);
    expect(still.error).toBeNull();
  });

  it('a dona do negócio vê por URL assinada de curta duração', async () => {
    const { data, error } = await a.owner.client.storage.from(BUCKET).createSignedUrl(path, 120);
    expect(error).toBeNull();
    const res = await fetch(data!.signedUrl);
    expect(res.status).toBe(200);
  });

  it('o cliente vê a assinatura das próprias compras', async () => {
    const { error } = await customerA.client.storage.from(BUCKET).createSignedUrl(path, 120);
    expect(error).toBeNull();
  });

  it('outro cliente e outro negócio não veem', async () => {
    expect((await otherCustomerA.client.storage.from(BUCKET).createSignedUrl(path, 120)).error).not.toBeNull();
    expect((await b.owner.client.storage.from(BUCKET).createSignedUrl(path, 120)).error).not.toBeNull();
    expect((await newClient().storage.from(BUCKET).createSignedUrl(path, 120)).error).not.toBeNull();
  });

  it('listagem mostra só o que cada um pode ver; URL pública não abre', async () => {
    for (const client of [otherCustomerA.client, b.owner.client]) {
      const list = await client.storage.from(BUCKET).list(a.businessId);
      expect(list.data ?? []).toEqual([]);
    }
    const { data } = newClient().storage.from(BUCKET).getPublicUrl(path);
    const res = await fetch(data.publicUrl);
    expect(res.ok).toBe(false);
  });

  it('o próprio bucket recusa arquivo que não é PNG ou maior que 200 KB', async () => {
    const svc = serviceClient().storage.from(BUCKET);
    const jpeg = await svc.upload(`${a.businessId}/x/${randomUUID()}.jpg`, PNG, { contentType: 'image/jpeg' });
    expect(jpeg.error).not.toBeNull();
    const big = await svc.upload(`${a.businessId}/x/${randomUUID()}.png`, Buffer.alloc(204_801), { contentType: 'image/png' });
    expect(big.error).not.toBeNull();
  });
});
