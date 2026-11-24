// Utilitários dos serviços: conversão de linhas das views (que o gerador de
// tipos marca como anuláveis) e tradução de erros com mensagens específicas.
import { AppError, toAppError } from '@/lib/supabase/errors';

interface PgErrorLike {
  code?: string;
  message?: string;
}

/** Valor obrigatório vindo de uma view; null indica bug de schema, não dado do usuário. */
export function need<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) throw new Error(`Campo ${field} veio vazio do servidor.`);
  return value;
}

/** Reenvio após a resposta se perder: a chave primária já existe, então já foi gravado. */
export function isDuplicateOfSameRecord(error: PgErrorLike | null): boolean {
  return error?.code === '23505' && /_pkey/.test(error.message ?? '');
}

/** Lança AppError em português; nomes repetidos ganham mensagem própria. */
export function throwIfError(error: PgErrorLike | null, duplicateMessage?: string): void {
  if (!error) return;
  if (duplicateMessage && error.code === '23505' && !/_pkey/.test(error.message ?? '')) {
    throw new AppError(duplicateMessage, 'conflict', '23505', error);
  }
  throw toAppError(error);
}
