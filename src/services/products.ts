// Produtos e preços. Mudar o preço não altera vendas antigas: cada item de
// venda guarda o nome e o preço do momento.
import { emptyToNull, type ProductForm } from '@/domain/registry';
import type { Client } from '@/lib/supabase/client';
import { isDuplicateOfSameRecord, need, throwIfError } from './shared';

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  category: string | null;
  isActive: boolean;
  /** Unidades vendidas nos últimos 90 dias. */
  units90d: number;
  lastSoldAt: string | null;
}

const DUPLICATE_NAME = 'Já existe um produto com esse nome.';

export async function listProducts(client: Client): Promise<Product[]> {
  const { data, error } = await client
    .from('product_overview')
    .select('id, name, price_cents, category, is_active, units_90d, last_sold_at')
    .order('name');
  throwIfError(error);
  return (data ?? []).map((r) => ({
    id: need(r.id, 'id'),
    name: need(r.name, 'name'),
    priceCents: need(r.price_cents, 'price_cents'),
    category: r.category,
    isActive: need(r.is_active, 'is_active'),
    units90d: r.units_90d ?? 0,
    lastSoldAt: r.last_sold_at,
  }));
}

function columns(form: ProductForm) {
  return {
    name: form.name.trim(),
    price_cents: form.priceCents,
    category: emptyToNull(form.category),
    is_active: form.isActive,
  };
}

export async function createProduct(client: Client, id: string, form: ProductForm): Promise<void> {
  const { error } = await client.from('products').insert({ id, ...columns(form) });
  if (isDuplicateOfSameRecord(error)) return;
  throwIfError(error, DUPLICATE_NAME);
}

export async function updateProduct(client: Client, id: string, form: ProductForm): Promise<void> {
  const { error } = await client.from('products').update(columns(form)).eq('id', id);
  throwIfError(error, DUPLICATE_NAME);
}
