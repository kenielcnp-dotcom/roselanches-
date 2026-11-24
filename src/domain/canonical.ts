// Resumo canônico de uma compra (versão 1) e seu hash SHA-256.
//
// É o "documento" que o cliente vê ao assinar ou confirmar. O formato é
// IDÊNTICO a private.sale_document_text() no banco (migração 0300): o servidor
// recalcula o hash a partir do que gravou e recusa a confirmação se não bater.
// Texto linha a linha (não JSON) para não depender de ordem de chaves nem de
// formatação de números; datas em epoch ms; textos em NFC.
import type { SaleMode } from '@/types/domain';

export const CANONICAL_HEADER = 'LDR-SALE-CONFIRMATION|1';

export interface CanonicalSale {
  saleId: string;
  customerId: string;
  establishmentId: string;
  occurredAt: string | Date;
  mode: SaleMode;
  /** Na ordem da posição (1, 2, 3…). Vazio no modo AMOUNT. */
  items: ReadonlyArray<{
    productId: string;
    quantity: number;
    unitPriceCents: number;
    subtotalCents: number;
    productName: string;
  }>;
  description: string | null;
  totalCents: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CONTROL = /\p{Cc}/u;

function uuid(value: string, label: string): string {
  const v = value.toLowerCase();
  if (!UUID.test(v)) throw new Error(`${label} inválido no resumo canônico`);
  return v;
}

function text(value: string, label: string): string {
  if (CONTROL.test(value)) throw new Error(`${label} contém caracteres de controle`);
  return value.normalize('NFC');
}

function int(value: number, label: string): string {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} precisa ser inteiro`);
  return String(value);
}

export function canonicalSaleText(sale: CanonicalSale, termsVersion: string): string {
  const ms = new Date(sale.occurredAt).getTime();
  if (!Number.isFinite(ms)) throw new Error('data da venda inválida no resumo canônico');
  if (!/^v[0-9]+$/.test(termsVersion)) throw new Error('versão do termo inválida');

  const lines = [
    CANONICAL_HEADER,
    `sale:${uuid(sale.saleId, 'sale')}`,
    `customer:${uuid(sale.customerId, 'customer')}`,
    `establishment:${uuid(sale.establishmentId, 'establishment')}`,
    `occurred_at_ms:${int(ms, 'data')}`,
    `mode:${sale.mode}`,
  ];

  if (sale.mode === 'ITEMS') {
    for (const item of sale.items) {
      lines.push(
        `item:${uuid(item.productId, 'product')}|${int(item.quantity, 'quantidade')}|${int(item.unitPriceCents, 'preço')}` +
          `|${int(item.subtotalCents, 'subtotal')}|${text(item.productName, 'nome do produto')}`,
      );
    }
  } else {
    if (sale.description === null) throw new Error('venda por valor sem descrição');
    lines.push(`description:${text(sale.description, 'descrição')}`);
  }

  lines.push(`total:${int(sale.totalCents, 'total')}`, `terms:${termsVersion}`);
  return lines.join('\n');
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function canonicalSaleHash(sale: CanonicalSale, termsVersion: string): Promise<string> {
  return sha256Hex(canonicalSaleText(sale, termsVersion));
}
