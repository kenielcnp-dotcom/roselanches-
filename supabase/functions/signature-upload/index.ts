// Edge Function signature-upload: único caminho para gravar a assinatura de
// uma venda no Storage privado.
//
//   POST multipart/form-data, com o JWT da Rose no cabeçalho Authorization:
//     file             PNG da assinatura (até 200 KB)
//     confirmation_id  uuid gerado no celular (idempotência)
//     sale_id          uuid da venda
//     document_hash    SHA-256 do resumo canônico que o cliente viu
//     terms_version    versão do texto de confirmação (ex.: v1)
//     captured_at      data/hora da captura (relógio do celular)
//
// Passos (cada um idempotente, pois Storage e Postgres não têm transação comum):
//   1. valida o usuário (getUser) e o arquivo (bytes do PNG, IHDR, tamanho)
//   2. signature_prepare: permissão, venda ativa, hash do resumo, caminho fixo
//   3. upload com upsert:false; se o arquivo já existe, o sha256 precisa ser igual
//   4. signature_finalize: grava a confirmação (repetir devolve DUPLICATE)
// Respostas: 200 {status: FINALIZED | DUPLICATE | SKIPPED}; 4xx/5xx {error, message}.
import { createClient } from 'npm:@supabase/supabase-js@2';

const MAX_BYTES = 204_800;
const MAX_SIDE = 4_000;
const BUCKET = 'sale-signatures';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[0-9a-f]{64}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
  const first = Object.values(keys)[0];
  if (!first) throw new Error('Chave de serviço ausente no ambiente da função.');
  return first;
}

/** Confere que é mesmo um PNG: assinatura de 8 bytes + bloco IHDR com dimensões válidas. */
export function isValidPng(bytes: Uint8Array): boolean {
  const magic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 33 || !magic.every((b, i) => bytes[i] === b)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ihdrLength = view.getUint32(8);
  const type = String.fromCharCode(bytes[12]!, bytes[13]!, bytes[14]!, bytes[15]!);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  return ihdrLength === 13 && type === 'IHDR' && width > 0 && height > 0 && width <= MAX_SIDE && height <= MAX_SIDE;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function ldrCode(message: string | undefined): string | null {
  return /\bLDR_[A-Z_]+\b/.exec(message ?? '')?.[0] ?? null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return reply(405, { error: 'METHOD', message: 'Use POST.' });

  const url = Deno.env.get('SUPABASE_URL');
  if (!url) return reply(500, { error: 'CONFIG', message: 'SUPABASE_URL ausente.' });
  const admin = createClient(url, serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. Quem está enviando (o JWT é conferido no servidor de Auth, não só decodificado).
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: auth, error: authError } = await admin.auth.getUser(jwt);
  if (authError || !auth.user) return reply(401, { error: 'SESSION', message: 'Sessão inválida ou expirada.' });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return reply(400, { error: 'LDR_INVALID_SIGNATURE', message: 'Envio inválido.' });
  }
  const file = form.get('file');
  const confirmationId = String(form.get('confirmation_id') ?? '');
  const saleId = String(form.get('sale_id') ?? '');
  const documentHash = String(form.get('document_hash') ?? '');
  const terms = String(form.get('terms_version') ?? '');
  const capturedAt = String(form.get('captured_at') ?? '');

  if (!(file instanceof File) || !UUID.test(confirmationId) || !UUID.test(saleId) || !HEX64.test(documentHash) || !/^v[0-9]+$/.test(terms)) {
    return reply(400, { error: 'LDR_INVALID_SIGNATURE', message: 'Dados da assinatura incompletos.' });
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return reply(413, { error: 'LDR_INVALID_SIGNATURE', message: 'Arquivo da assinatura vazio ou maior que 200 KB.' });
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isValidPng(bytes)) return reply(400, { error: 'LDR_INVALID_SIGNATURE', message: 'O arquivo não é uma imagem PNG válida.' });
  const fileSha = await sha256Hex(bytes);

  const args = {
    p_user: auth.user.id,
    p_confirmation_id: confirmationId,
    p_sale_id: saleId,
    p_document_hash: documentHash,
    p_terms: terms,
    p_file_sha256: fileSha,
    p_size: bytes.length,
    p_captured_at: capturedAt,
  };

  // 2. Permissão, venda, hash e caminho determinístico.
  const prep = await admin.rpc('signature_prepare', args);
  if (prep.error) {
    const code = ldrCode(prep.error.message);
    return reply(code ? (code === 'LDR_NOT_ALLOWED' ? 403 : 422) : 500, { error: code ?? 'SERVER', message: prep.error.message });
  }
  const prepared = prep.data as { status: string; path: string };
  if (prepared.status === 'ALREADY_FINALIZED') return reply(200, { status: 'DUPLICATE' });
  if (prepared.status === 'SALE_CANCELLED') return reply(200, { status: 'SKIPPED' });

  // 3. Arquivo no caminho fixo, sem sobrescrever.
  const storage = admin.storage.from(BUCKET);
  const up = await storage.upload(prepared.path, bytes, { contentType: 'image/png', upsert: false });
  if (up.error) {
    // Já existe (tentativa anterior subiu o arquivo e caiu antes de finalizar)?
    const existing = await storage.download(prepared.path);
    if (existing.error || !existing.data) return reply(500, { error: 'SERVER', message: 'Falha ao gravar a assinatura.' });
    const existingSha = await sha256Hex(new Uint8Array(await existing.data.arrayBuffer()));
    if (existingSha !== fileSha) {
      return reply(409, { error: 'LDR_CONFIRMATION_CONFLICT', message: 'Já existe outra assinatura com este código.' });
    }
  }

  // 4. Registro da confirmação (idempotente).
  const fin = await admin.rpc('signature_finalize', args);
  if (fin.error) {
    const code = ldrCode(fin.error.message);
    return reply(code ? 422 : 500, { error: code ?? 'SERVER', message: fin.error.message });
  }
  const finalized = fin.data as { status: string };
  return reply(200, { status: finalized.status === 'SALE_CANCELLED' ? 'SKIPPED' : finalized.status });
});
