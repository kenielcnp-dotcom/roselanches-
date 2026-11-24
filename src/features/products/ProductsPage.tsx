import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Package, Plus, TrendingUp } from 'lucide-react';
import { SearchField } from '@/components/Controls';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import { matchesWords, normalizeText } from '@/domain/search';
import { errorMessage } from '@/lib/supabase/errors';
import type { Product } from '@/services/products';
import { useProducts } from '@/features/registry/queries';

const NO_CATEGORY = 'Sem categoria';
const TOP_COUNT = 5;

/** Agrupa por categoria (sem diferenciar maiúsculas/acentos), "Sem categoria" por último. */
export function groupByCategory(products: readonly Product[]): { category: string; items: Product[] }[] {
  const groups = new Map<string, { category: string; items: Product[] }>();
  for (const p of products) {
    const label = p.category?.trim() || NO_CATEGORY;
    const key = label === NO_CATEGORY ? '￿' : normalizeText(label);
    const g = groups.get(key) ?? { category: label, items: [] };
    g.items.push(p);
    groups.set(key, g);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'pt-BR'))
    .map(([, g]) => ({ ...g, items: g.items.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) }));
}

export function ProductsPage() {
  const query = useProducts();
  const [search, setSearch] = useState('');

  const { top, groups, inactive } = useMemo(() => {
    const all = (query.data ?? []).filter((p) => matchesWords(`${p.name} ${p.category ?? ''}`, search));
    const active = all.filter((p) => p.isActive);
    return {
      top: search === '' ? [...active].filter((p) => p.units90d > 0).sort((a, b) => b.units90d - a.units90d).slice(0, TOP_COUNT) : [],
      groups: groupByCategory(active),
      inactive: all.filter((p) => !p.isActive),
    };
  }, [query.data, search]);

  return (
    <>
      <PageHeader title="Produtos" back="/" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <Link
          to="/produtos/novo"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange-deep px-5 text-lg font-extrabold text-white shadow-warm active:bg-orange-darker"
        >
          <Plus className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
          Novo produto
        </Link>
        {(query.data?.length ?? 0) > 0 && <SearchField label="Buscar produto" value={search} onChange={setSearch} />}

        {query.isPending ? (
          <LoadingState />
        ) : query.isError ? (
          <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : query.data.length === 0 ? (
          <EmptyState icon={<Package className="h-10 w-10" />} title="Nenhum produto ainda">
            Cadastre seus lanches e bebidas com o preço. Na hora da venda, é só tocar no produto.
          </EmptyState>
        ) : (
          <>
            {top.length > 0 && (
              <section aria-labelledby="mais-vendidos">
                <h2 id="mais-vendidos" className="mb-2 flex items-center gap-2 text-lg font-black text-brown">
                  <TrendingUp className="h-5 w-5 text-orange" aria-hidden="true" />
                  Mais vendidos (90 dias)
                </h2>
                <ul className="divide-y divide-line overflow-hidden rounded-card bg-white ring-1 ring-line">
                  {top.map((p) => (
                    <ProductRow key={p.id} product={p} detail={`${p.units90d} ${p.units90d === 1 ? 'unidade' : 'unidades'}`} />
                  ))}
                </ul>
              </section>
            )}
            {groups.length === 0 && inactive.length === 0 && <p className="py-6 text-center text-brown-soft">Nenhum produto encontrado.</p>}
            {groups.map((g) => (
              <section key={g.category} aria-label={g.category}>
                <h2 className="mb-2 text-sm font-extrabold tracking-wide text-brown-soft uppercase">{g.category}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
                  {g.items.map((p) => (
                    <ProductRow key={p.id} product={p} />
                  ))}
                </ul>
              </section>
            ))}
            {inactive.length > 0 && (
              <section aria-label="Desativados">
                <h2 className="mb-2 text-sm font-extrabold tracking-wide text-brown-soft uppercase">Desativados</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-card bg-white/60 ring-1 ring-line">
                  {inactive.map((p) => (
                    <ProductRow key={p.id} product={p} />
                  ))}
                </ul>
              </section>
            )}
          </>
        )}
      </main>
    </>
  );
}

function ProductRow({ product: p, detail }: { product: Product; detail?: string }) {
  return (
    <li>
      <Link to={`/produtos/${p.id}/editar`} className="flex min-h-15 items-center gap-3 px-4 py-2 active:bg-cream-deep">
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-lg font-extrabold ${p.isActive ? 'text-brown' : 'text-brown-soft line-through'}`}>{p.name}</span>
          {detail && <span className="block text-sm text-brown-soft">{detail}</span>}
        </span>
        <span className="tabular shrink-0 text-lg font-black text-brown">{formatBRL(p.priceCents)}</span>
        <ChevronRight className="h-5 w-5 shrink-0 text-brown-soft" aria-hidden="true" />
      </Link>
    </li>
  );
}
