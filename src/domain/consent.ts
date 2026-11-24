// Textos de confirmação de compra. Iguais à tabela public.consent_texts
// (migração 0100). Uma versão publicada nunca muda: texto novo = versão nova.
export const CONSENT_TEXTS = {
  v1: 'Confirmo que recebi os produtos ou valores descritos nesta compra e reconheço o lançamento informado.',
} as const;

export type ConsentVersion = keyof typeof CONSENT_TEXTS;

export const CURRENT_CONSENT_VERSION: ConsentVersion = 'v1';
