import { useMemo, useState } from 'react';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { Chip, MoneyField } from '@/components/Controls';
import { TextField } from '@/components/Field';
import { formatBRL } from '@/domain/money';
import { DESCRIPTION_MAX } from '@/domain/sale';
import type { CachedProduct } from '@/lib/offline/db';
import type { SaleMode } from '@/types/domain';

const TOP = '__top__';
const QUICK_DESCRIPTIONS = ['Lanches da manhã', 'Lanches da tarde', 'Lanche', 'Bebida'];

interface Props {
  mode: SaleMode;
  onModeChange: (mode: SaleMode) => void;
  products: CachedProduct[];
  quantities: Map<string, number>;
  onQuantity: (productId: string, quantity: number) => void;
  itemMaxQty: number;
  amountCents: number;
  onAmount: (cents: number) => void;
  description: string;
  onDescription: (text: string) => void;
}

export function ItemsStep(props: Props) {
  const { mode, onModeChange } = props;
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Como registrar" className="grid grid-cols-2 gap-1 rounded-2xl bg-cream-deep p-1">
        {(['ITEMS', 'AMOUNT'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => onModeChange(m)}
            className={`min-h-12 rounded-xl text-base font-extrabold ${mode === m ? 'bg-white text-brown shadow-soft' : 'text-brown-soft'}`}
          >
            {m === 'ITEMS' ? 'Produtos' : 'Valor direto'}
          </button>
        ))}
      </div>
      {mode === 'ITEMS' ? <ProductsPicker {...props} /> : <AmountForm {...props} />}
    </div>
  );
}

function ProductsPicker({ products, quantities, onQuantity, itemMaxQty }: Props) {
  const [category, setCategory] = useState(TOP);
  const active = useMemo(
    () => products.filter((p) => p.isActive).sort((a, b) => b.units90d - a.units90d || a.name.localeCompare(b.name, 'pt-BR')),
    [products],
  );
  const categories = useMemo(
    () => [...new Set(active.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [active],
  );
  const shown = category === TOP ? active : active.filter((p) => p.category === category);
  const chosen = products.filter((p) => (quantities.get(p.id) ?? 0) > 0);

  if (active.length === 0) {
    return (
      <p className="rounded-card bg-white/80 px-5 py-6 text-center text-brown-soft ring-1 ring-line">
        Nenhum produto à venda. Cadastre em Produtos ou use "Valor direto".
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {categories.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Categoria">
          <Chip selected={category === TOP} onClick={() => setCategory(TOP)}>
            Todos
          </Chip>
          {categories.map((c) => (
            <Chip key={c} selected={category === c} onClick={() => setCategory(c)}>
              {c}
            </Chip>
          ))}
        </div>
      )}
      <ul className="grid grid-cols-2 gap-3">
        {shown.map((p) => {
          const qty = quantities.get(p.id) ?? 0;
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onQuantity(p.id, Math.min(itemMaxQty, qty + 1))}
                aria-label={`${p.name}, ${formatBRL(p.priceCents)}${qty > 0 ? `, ${qty} na venda` : ''}. Tocar soma 1.`}
                className={`relative flex min-h-24 w-full flex-col justify-between rounded-card px-3.5 py-3 text-left shadow-soft active:scale-[0.98] ${
                  qty > 0 ? 'bg-peach ring-3 ring-orange-deep' : 'bg-white ring-1 ring-line'
                }`}
              >
                <span className="pr-7 text-base leading-tight font-extrabold text-brown">{p.name}</span>
                <span className="tabular text-lg font-black text-orange-deep">{formatBRL(p.priceCents)}</span>
                {qty > 0 && (
                  <span className="tabular absolute top-2 right-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-orange-deep px-1.5 text-base font-black text-white">
                    {qty}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {chosen.length > 0 && (
        <section aria-label="Itens da venda" className="rounded-card bg-white p-3 ring-1 ring-line">
          <ul className="divide-y divide-line">
            {chosen.map((p) => {
              const qty = quantities.get(p.id) ?? 0;
              return (
                <li key={p.id} className="flex items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold text-brown">{p.name}</span>
                    <span className="tabular text-sm text-brown-soft">{formatBRL(p.priceCents * qty)}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={qty === 1 ? `Tirar ${p.name}` : `Menos um ${p.name}`}
                    onClick={() => onQuantity(p.id, qty - 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-cream-deep text-brown active:bg-peach"
                  >
                    {qty === 1 ? <Trash2 className="h-5 w-5" aria-hidden="true" /> : <Minus className="h-5 w-5" aria-hidden="true" />}
                  </button>
                  <span className="tabular w-8 text-center text-lg font-black text-brown">{qty}</span>
                  <button
                    type="button"
                    aria-label={`Mais um ${p.name}`}
                    disabled={qty >= itemMaxQty}
                    onClick={() => onQuantity(p.id, qty + 1)}
                    className="flex h-11 w-11 items-center justify-center rounded-full bg-orange-deep text-white active:bg-orange-darker disabled:opacity-40"
                  >
                    <Plus className="h-5 w-5" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function AmountForm({ amountCents, onAmount, description, onDescription }: Props) {
  return (
    <div className="space-y-4">
      <MoneyField label="Valor da venda" valueCents={amountCents} onChange={onAmount} autoFocus hint="Digite só os números: 1850 vira R$ 18,50." />
      <div>
        <TextField
          label="Descrição"
          placeholder="Ex.: Lanches da tarde"
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(e) => onDescription(e.target.value)}
          hint={`${description.length}/${DESCRIPTION_MAX}`}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {QUICK_DESCRIPTIONS.map((d) => (
            <Chip key={d} selected={description === d} onClick={() => onDescription(d)}>
              {d}
            </Chip>
          ))}
        </div>
      </div>
    </div>
  );
}
