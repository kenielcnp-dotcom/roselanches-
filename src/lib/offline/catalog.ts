// Cópia do catálogo no celular: estabelecimentos, clientes, produtos e
// configurações de venda. Renovada por inteiro (são poucas centenas de linhas),
// o que é mais simples e mais seguro do que sincronizar só as diferenças.
import type { Client } from '@/lib/supabase/client';
import { listCustomers } from '@/services/customers';
import { listEstablishments } from '@/services/establishments';
import { listProducts } from '@/services/products';
import { fetchSettings } from '@/services/settings';
import { setMeta, type CachedSettings, type LocalDb } from './db';

export const CATALOG_UPDATED_AT = 'catalogUpdatedAt';
export const SETTINGS_KEY = 'settings';

export async function refreshCatalog(db: LocalDb, client: Client, businessId: string, now = Date.now()): Promise<void> {
  const [establishments, customers, products, settings] = await Promise.all([
    listEstablishments(client),
    listCustomers(client),
    listProducts(client),
    fetchSettings(client, businessId),
  ]);
  const cachedSettings: CachedSettings = {
    saleMaxCents: settings.saleMaxCents,
    itemMaxQty: settings.itemMaxQty,
    defaultSalePeriod: settings.defaultSalePeriod,
    requireSignature: settings.requireSignature,
  };

  await db.transaction('rw', [db.establishments, db.customers, db.products, db.meta], async () => {
    await Promise.all([db.establishments.clear(), db.customers.clear(), db.products.clear()]);
    await db.establishments.bulkPut(
      establishments.map((e) => ({ id: e.id, name: e.name, nickname: e.nickname, isActive: e.isActive, customerCount: e.customerCount })),
    );
    await db.customers.bulkPut(
      customers.map((c) => ({
        id: c.id,
        fullName: c.fullName,
        phoneE164: c.phoneE164,
        // Só o começo da observação: basta para diferenciar homônimos.
        notes: c.notes ? c.notes.slice(0, 60) : null,
        isActive: c.isActive,
        establishmentIds: c.establishmentIds,
        balanceCents: c.balanceCents,
        lastSaleAt: c.lastSaleAt,
      })),
    );
    await db.products.bulkPut(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        priceCents: p.priceCents,
        category: p.category,
        isActive: p.isActive,
        units90d: p.units90d,
      })),
    );
    await setMeta(db, SETTINGS_KEY, cachedSettings);
    await setMeta(db, CATALOG_UPDATED_AT, now);
  });
}
