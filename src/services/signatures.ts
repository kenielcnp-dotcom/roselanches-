// Assinaturas: envio pela Edge Function signature-upload e leitura por URL
// assinada de curta duração (o bucket é privado).
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import type { LocalSignature } from '@/lib/offline/db';
import type { Client } from '@/lib/supabase/client';
import { AppError, toAppError } from '@/lib/supabase/errors';
import { throwIfError } from './shared';

export type UploadResult = 'FINALIZED' | 'DUPLICATE' | 'SKIPPED';

export async function uploadSignature(client: Client, sig: LocalSignature): Promise<UploadResult> {
  const form = new FormData();
  form.set('file', new Blob([sig.png], { type: 'image/png' }), 'assinatura.png');
  form.set('confirmation_id', sig.confirmationId);
  form.set('sale_id', sig.saleId);
  form.set('document_hash', sig.documentHash);
  form.set('terms_version', sig.termsVersion);
  form.set('captured_at', sig.capturedAt);

  const { data, error } = await client.functions.invoke<{ status: UploadResult }>('signature-upload', { body: form });
  if (error) throw await toUploadError(error);
  if (!data || !['FINALIZED', 'DUPLICATE', 'SKIPPED'].includes(data.status)) {
    throw new AppError('Resposta inesperada ao enviar a assinatura.', 'unknown', 'SERVER');
  }
  return data.status;
}

/** Rede/servidor = tentar de novo; 401 = sessão; resto = permanente (com o código LDR_*). */
async function toUploadError(error: unknown): Promise<AppError> {
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) {
    return new AppError('Não foi possível falar com o servidor. Verifique a internet.', 'network', 'NETWORK', error);
  }
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let body: { error?: string; message?: string } = {};
    try {
      body = (await res.json()) as typeof body;
    } catch {
      /* corpo vazio */
    }
    if (res.status === 401) return new AppError('Sua sessão expirou. Entre de novo.', 'session', 'SESSION', error);
    if (res.status >= 500 || res.status === 408 || res.status === 429) {
      return new AppError('O servidor está com problemas. Vamos tentar de novo em instantes.', 'unknown', 'SERVER', error);
    }
    const translated = toAppError({ message: body.error ?? '', code: res.status === 403 ? '42501' : 'P0001' });
    return translated.code.startsWith('LDR_')
      ? translated
      : new AppError(body.message ?? 'Assinatura recusada.', 'validation', body.error ?? `HTTP_${res.status}`, error);
  }
  return toAppError(error);
}

/** Endereço temporário (2 min) da assinatura válida de uma venda, ou null se não houver. */
export async function signatureUrl(client: Client, saleId: string): Promise<string | null> {
  const { data, error } = await client
    .from('sale_confirmations')
    .select('signature_storage_path')
    .eq('sale_id', saleId)
    .eq('confirmation_type', 'DRAWN_SIGNATURE')
    .order('received_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(error);
  if (!data?.signature_storage_path) return null;
  const signed = await client.storage.from('sale-signatures').createSignedUrl(data.signature_storage_path, 120);
  throwIfError(signed.error ? { message: signed.error.message } : null);
  return signed.data?.signedUrl ?? null;
}
