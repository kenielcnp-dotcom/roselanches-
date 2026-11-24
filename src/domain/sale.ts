// Regras de uma venda: totais e validações. O servidor repete todas elas na
// RPC create_sale; estas existem para a Rose ver o problema antes de salvar.
import { z } from 'zod';
import { formatBRL, isCents, multiplyCents, sumCents } from './money';
import type { SaleDraft, SaleItemDraft, SaleLimits } from '@/types/domain';

export const DESCRIPTION_MAX = 150;
export const SALE_ITEMS_MAX = 50;
/** Teto absoluto do banco para uma venda (R$ 100.000,00). */
export const SALE_HARD_MAX_CENTS = 10_000_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL = /\p{Cc}/u;

export function hasControlChars(value: string): boolean {
  return CONTROL.test(value);
}

export function buildItem(product: { id: string; name: string; priceCents: number }, quantity: number): SaleItemDraft {
  return {
    productId: product.id,
    productName: product.name.trim().normalize('NFC'),
    quantity,
    unitPriceCents: product.priceCents,
    subtotalCents: multiplyCents(product.priceCents, quantity),
  };
}

export function itemsTotal(items: readonly SaleItemDraft[]): number {
  return sumCents(items.map((i) => multiplyCents(i.unitPriceCents, i.quantity)));
}

/** "2× Coxinha + 1× Suco" */
export function describeItems(items: readonly Pick<SaleItemDraft, 'productName' | 'quantity'>[]): string {
  return items.map((i) => `${i.quantity}× ${i.productName}`).join(' + ');
}

export function saleSummary(draft: Pick<SaleDraft, 'mode' | 'items' | 'description'>): string {
  return draft.mode === 'ITEMS' ? describeItems(draft.items) : (draft.description ?? '');
}

export type SaleIssueField = 'sale' | 'customer' | 'establishment' | 'items' | 'description' | 'total' | 'payment';
export interface SaleIssue {
  field: SaleIssueField;
  message: string;
}

/** Lista de problemas em português. Vazia = pode salvar. */
export function validateSaleDraft(draft: SaleDraft, limits: SaleLimits): SaleIssue[] {
  const issues: SaleIssue[] = [];
  const add = (field: SaleIssueField, message: string) => issues.push({ field, message });

  if (!UUID.test(draft.id)) add('sale', 'Identificador da venda inválido. Abra a venda de novo.');
  if (!UUID.test(draft.customerId)) add('customer', 'Escolha o cliente.');
  if (!UUID.test(draft.establishmentId)) add('establishment', 'Escolha o estabelecimento.');
  if (!Number.isFinite(new Date(draft.occurredAt).getTime())) add('sale', 'Data da venda inválida.');

  if (draft.mode === 'ITEMS') {
    if (draft.items.length === 0) add('items', 'Escolha pelo menos um produto.');
    if (draft.items.length > SALE_ITEMS_MAX) add('items', `No máximo ${SALE_ITEMS_MAX} produtos por venda.`);
    for (const item of draft.items) {
      if (!Number.isSafeInteger(item.quantity) || item.quantity < 1) {
        add('items', `Quantidade de ${item.productName} precisa ser um número inteiro maior que zero.`);
      } else if (item.quantity > limits.itemMaxQty) {
        add('items', `Quantidade de ${item.productName} acima do limite (${limits.itemMaxQty}). Verifique antes de continuar.`);
      }
      if (!isCents(item.unitPriceCents) || item.unitPriceCents < 1) add('items', `Preço de ${item.productName} inválido.`);
      if (!UUID.test(item.productId)) add('items', 'Produto inválido.');
      if (item.productName.trim() === '' || hasControlChars(item.productName)) add('items', 'Nome de produto inválido.');
      if (
        Number.isSafeInteger(item.quantity) &&
        isCents(item.unitPriceCents) &&
        item.subtotalCents !== item.quantity * item.unitPriceCents
      ) {
        add('items', `Subtotal de ${item.productName} não confere.`);
      }
    }
    if (draft.description !== null) add('description', 'Venda por produtos não leva descrição.');
    if (issues.length === 0 && draft.totalCents !== itemsTotal(draft.items)) {
      add('total', 'O total não confere com os produtos.');
    }
  } else {
    if (draft.items.length > 0) add('items', 'Venda por valor direto não leva produtos.');
    const description = draft.description?.trim() ?? '';
    if (description === '') add('description', 'Escreva uma descrição curta.');
    else if (description.length > DESCRIPTION_MAX) add('description', `Descrição com no máximo ${DESCRIPTION_MAX} caracteres.`);
    else if (hasControlChars(description)) add('description', 'A descrição tem caracteres inválidos.');
  }

  if (!isCents(draft.totalCents) || draft.totalCents <= 0) {
    add('total', 'O valor precisa ser maior que zero.');
  } else if (draft.totalCents > Math.min(limits.saleMaxCents, SALE_HARD_MAX_CENTS)) {
    add('total', `Valor acima do limite de ${formatBRL(limits.saleMaxCents)} por venda. Verifique o valor antes de continuar.`);
  }

  if (draft.paymentKind === 'PAID_NOW') {
    if (!draft.paidNow || !UUID.test(draft.paidNow.paymentId)) add('payment', 'Informe como o cliente pagou.');
  } else if (draft.paidNow) {
    add('payment', 'Venda fiada não leva pagamento.');
  }

  return issues;
}

/** Formulário do modo "valor direto". */
export const amountSaleFormSchema = z.object({
  amountCents: z
    .number()
    .int('Use no máximo duas casas decimais.')
    .min(1, 'O valor precisa ser maior que zero.')
    .max(SALE_HARD_MAX_CENTS, 'Valor alto demais. Verifique o valor antes de continuar.'),
  description: z
    .string()
    .trim()
    .min(1, 'Escreva uma descrição curta.')
    .max(DESCRIPTION_MAX, `No máximo ${DESCRIPTION_MAX} caracteres.`)
    .refine((v) => !hasControlChars(v), 'A descrição tem caracteres inválidos.'),
});

export type AmountSaleForm = z.infer<typeof amountSaleFormSchema>;
