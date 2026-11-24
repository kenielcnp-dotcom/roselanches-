// Traduz qualquer erro (Postgres, PostgREST, Auth, Storage, rede) em uma
// mensagem curta em português, sem termos técnicos, e classifica o erro para a
// fila de sincronização: transitório (tentar de novo), sessão ou permanente.

export type ErrorKind = 'network' | 'session' | 'permission' | 'validation' | 'conflict' | 'unknown';

export class AppError extends Error {
  constructor(
    message: string,
    readonly kind: ErrorKind,
    readonly code: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }

  /** Vale a pena tentar de novo sozinho, mais tarde? */
  get transient(): boolean {
    return this.kind === 'network' || this.code === 'RATE_LIMIT' || this.code === 'SERVER';
  }
}

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

// Códigos LDR_* são lançados pelas nossas funções no banco.
const LDR_MESSAGES: Record<string, string> = {
  LDR_NOT_ALLOWED: 'Você não tem permissão para fazer isso.',
  LDR_DELETE_FORBIDDEN: 'Este registro faz parte do histórico e não pode ser apagado.',
  LDR_SALE_IMMUTABLE: 'Uma venda registrada não pode ser alterada. Cancele e registre de novo.',
  LDR_SALE_ALREADY_CANCELLED: 'Esta venda já foi cancelada.',
  LDR_SALE_ITEMS_TOTAL: 'O total da venda não confere com os produtos.',
  LDR_SALE_AMOUNT_WITH_ITEMS: 'Venda por valor direto não leva produtos.',
  LDR_SALE_ITEMS_IMMUTABLE: 'Os produtos de uma venda registrada não podem ser alterados.',
  LDR_PAYMENT_IMMUTABLE: 'Um pagamento registrado não pode ser alterado. Estorne e registre de novo.',
  LDR_PAYMENT_ALREADY_REVERSED: 'Este pagamento já foi estornado.',
  LDR_RECORD_IMMUTABLE: 'Este lançamento não pode ser alterado. Cancele e registre de novo.',
  LDR_RECORD_ALREADY_CANCELLED: 'Este lançamento já foi cancelado.',
  LDR_CONFIRMATION_IMMUTABLE: 'Uma confirmação registrada não pode ser alterada.',
  LDR_CONFIRMATION_ALREADY_CANCELLED: 'Esta confirmação já foi invalidada.',
  LDR_CONSENT_TEXT_IMMUTABLE: 'O texto de confirmação publicado não pode ser alterado.',
  LDR_AUDIT_IMMUTABLE: 'O histórico de auditoria não pode ser alterado.',
  LDR_UNKNOWN_TERMS: 'Versão do texto de confirmação desconhecida.',
  LDR_TOO_MANY_ESTABLISHMENTS: 'Escolha no máximo 50 estabelecimentos.',
  LDR_INVALID_SALE: 'Os dados da venda estão incompletos. Confira e registre de novo.',
  LDR_SALE_IN_FUTURE: 'A data da venda está no futuro. Confira o relógio do celular.',
  LDR_SALE_TOO_OLD: 'Esta venda tem mais de 30 dias e não pode mais ser enviada. Registre de novo com a data de hoje.',
  LDR_SALE_OVER_LIMIT: 'Valor acima do limite por venda. Verifique o valor antes de continuar.',
  LDR_CUSTOMER_NOT_FOUND: 'Cliente não encontrado. Ele pode ter sido apagado do celular; atualize os dados.',
  LDR_ESTABLISHMENT_NOT_FOUND: 'Estabelecimento não encontrado. Atualize os dados.',
  LDR_INVALID_DESCRIPTION: 'Escreva uma descrição de até 150 caracteres.',
  LDR_INVALID_ITEMS: 'Confira os produtos da venda.',
  LDR_ITEM_QUANTITY: 'Quantidade fora do limite. Verifique antes de continuar.',
  LDR_PRODUCT_NOT_FOUND: 'Um dos produtos não foi encontrado. Atualize os dados.',
  LDR_INVALID_PAYMENT: 'Informe como o cliente pagou.',
  LDR_PAYMENT_ID_CONFLICT: 'Este pagamento já foi usado em outra venda.',
  LDR_SALE_NOT_FOUND: 'Venda não encontrada.',
  LDR_INVALID_REASON: 'Escreva o motivo (pelo menos 3 letras).',
  LDR_HASH_MISMATCH: 'A assinatura não confere com os dados desta venda.',
  LDR_ALREADY_SIGNED: 'Esta venda já tem uma assinatura válida.',
  LDR_CONFIRMATION_CONFLICT: 'Já existe outra assinatura com este código.',
  LDR_INVALID_SIGNATURE: 'O arquivo da assinatura é inválido.',
};

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  email_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.',
  over_email_send_rate_limit: 'Muitos e-mails enviados. Aguarde alguns minutos e tente de novo.',
  over_request_rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  email_address_invalid: 'E-mail inválido.',
  validation_failed: 'Confira os dados informados.',
  signup_disabled: 'Novos cadastros estão desativados.',
  session_expired: 'Sua sessão expirou. Entre de novo.',
  session_not_found: 'Sua sessão expirou. Entre de novo.',
  refresh_token_not_found: 'Sua sessão expirou. Entre de novo.',
  refresh_token_already_used: 'Sua sessão expirou. Entre de novo.',
  bad_jwt: 'Sua sessão expirou. Entre de novo.',
};

export function isNetworkError(e: ErrorLike): boolean {
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.name === 'AuthRetryableFetchError' ||
    e.name === 'AbortError' ||
    e.name === 'TimeoutError' ||
    (e.name === 'TypeError' && /fetch|network|load failed/.test(msg)) ||
    /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out/.test(msg)
  );
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const e = (typeof error === 'object' && error !== null ? error : { message: String(error) }) as ErrorLike;
  const message = e.message ?? '';

  if (isNetworkError(e)) {
    return new AppError('Não foi possível falar com o servidor. Verifique a internet.', 'network', 'NETWORK', error);
  }

  const ldr = /\bLDR_[A-Z_]+\b/.exec(message)?.[0];
  if (ldr) {
    const kind: ErrorKind = e.code === '42501' ? 'permission' : 'validation';
    return new AppError(LDR_MESSAGES[ldr] ?? 'Operação recusada.', kind, ldr, error);
  }

  const code = e.code ?? '';
  if (code && AUTH_MESSAGES[code]) {
    const kind: ErrorKind = /session|token|jwt/.test(code) ? 'session' : 'validation';
    return new AppError(AUTH_MESSAGES[code]!, kind, code, error);
  }

  // JWT expirado/inválido (PostgREST) ou sessão ausente (Auth).
  if (code === 'PGRST301' || code === 'PGRST302' || /jwt expired|invalid jwt|auth session missing/i.test(message)) {
    return new AppError('Sua sessão expirou. Entre de novo.', 'session', 'SESSION', error);
  }

  switch (code) {
    case '42501':
      return new AppError('Você não tem permissão para fazer isso.', 'permission', code, error);
    case '23505':
      return new AppError('Já existe um cadastro com esses dados.', 'conflict', code, error);
    case '23503':
      return new AppError('Este registro faz referência a algo que não existe.', 'conflict', code, error);
    case '23514':
    case '22P02':
    case '22003':
    case '23502':
      return new AppError('Dados inválidos. Confira os campos e tente de novo.', 'validation', code, error);
    case '40001':
    case '40P01':
      return new AppError('Outra alteração aconteceu ao mesmo tempo. Tente de novo.', 'conflict', code, error);
  }

  if (e.status === 401) return new AppError('Sua sessão expirou. Entre de novo.', 'session', 'SESSION', error);
  if (e.status === 403) return new AppError('Você não tem permissão para fazer isso.', 'permission', 'FORBIDDEN', error);
  if (e.status === 408 || e.status === 429) {
    return new AppError('O servidor está ocupado. Vamos tentar de novo em instantes.', 'network', 'RATE_LIMIT', error);
  }
  if (e.status !== undefined && e.status >= 500) {
    return new AppError('O servidor está com problemas. Vamos tentar de novo em instantes.', 'unknown', 'SERVER', error);
  }

  return new AppError('Algo deu errado. Tente de novo em instantes.', 'unknown', 'UNKNOWN', error);
}

export function errorMessage(error: unknown): string {
  return toAppError(error).message;
}
