// Textos curtos e sem termos técnicos para estados e formas de pagamento.
import type { ConfirmationStatus, PaymentKind, PaymentMethod, SyncState } from '@/types/domain';

export const METHOD_LABELS: Record<PaymentMethod, string> = { CASH: 'Dinheiro', PIX: 'Pix' };

export function paymentLabel(kind: PaymentKind, method: PaymentMethod | null): string {
  if (kind === 'CREDIT') return 'Fiado';
  return method ? `Pago na hora (${METHOD_LABELS[method]})` : 'Pago na hora';
}

export const CONFIRMATION_LABELS: Record<ConfirmationStatus, string> = {
  PENDING: 'Sem confirmação do cliente',
  SIGNED: 'Assinada pelo cliente',
  CONFIRMED_ONLINE: 'Confirmada pelo cliente no app',
  DISPUTED: 'Contestada pelo cliente',
  CANCELLED: 'Confirmação invalidada',
};

export const SYNC_LABELS: Record<SyncState, string> = {
  PENDING: 'Salva no celular, aguardando internet',
  SYNCING: 'Enviando…',
  SYNCED: 'Sincronizada',
  FAILED: 'Não enviada: precisa de revisão',
};
