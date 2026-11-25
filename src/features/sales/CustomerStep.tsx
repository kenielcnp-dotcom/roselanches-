import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { AlertTriangle, ChevronRight, Globe, UserPlus } from 'lucide-react';
import { Button } from '@/components/Button';
import { SearchField } from '@/components/Controls';
import { maskPhone } from '@/domain/phone';
import { matchesPerson, rankByName } from '@/domain/search';
import type { CachedCustomer, CachedEstablishment } from '@/lib/offline/db';

interface Props {
  establishment: CachedEstablishment;
  customers: CachedCustomer[];
  onSelect: (customer: CachedCustomer, link: boolean) => void;
  /** Vincular ao local precisa do servidor. */
  canLink: boolean;
}

/**
 * Busca priorizando os clientes do lugar atual. Cada linha traz nome completo,
 * telefone mascarado e o começo da observação, para não confundir homônimos.
 */
export function CustomerStep({ establishment, customers, onSelect, canLink }: Props) {
  const [search, setSearch] = useState('');
  const [everywhere, setEverywhere] = useState(false);
  const [outsider, setOutsider] = useState<CachedCustomer | null>(null);

  const active = useMemo(() => customers.filter((c) => c.isActive), [customers]);
  const isLocal = (c: CachedCustomer) => c.establishmentIds.includes(establishment.id);
  const homonyms = useMemo(() => {
    const count = new Map<string, number>();
    for (const c of active) count.set(c.fullName.toLowerCase(), (count.get(c.fullName.toLowerCase()) ?? 0) + 1);
    return count;
  }, [active]);

  const { shown, elsewhere } = useMemo(() => {
    const matching = active.filter((c) => matchesPerson({ name: c.fullName, phoneE164: c.phoneE164 }, search));
    const local = matching.filter(isLocal);
    const pool = everywhere ? matching : local;
    const sorted =
      search.trim() === ''
        ? [...pool].sort(
            (a, b) => (b.lastSaleAt ?? '').localeCompare(a.lastSaleAt ?? '') || a.fullName.localeCompare(b.fullName, 'pt-BR'),
          )
        : rankByName(pool, search, (c) => c.fullName);
    return { shown: sorted.slice(0, 60), elsewhere: matching.length - local.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, search, everywhere, establishment.id]);

  const choose = (c: CachedCustomer) => (isLocal(c) ? onSelect(c, false) : setOutsider(c));

  return (
    <div className="space-y-3">
      <SearchField label="Buscar cliente por nome ou telefone" value={search} onChange={setSearch} autoFocus />

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold text-brown-soft">
          {everywhere ? 'Todos os estabelecimentos' : `Clientes de ${establishment.nickname ?? establishment.name}`}
        </p>
        <button
          type="button"
          onClick={() => setEverywhere((v) => !v)}
          aria-pressed={everywhere}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-white px-3 text-sm font-extrabold text-orange-darker ring-1 ring-line active:bg-cream-deep"
        >
          <Globe className="h-4 w-4" aria-hidden="true" />
          {everywhere ? 'Só deste lugar' : 'Buscar em todos os estabelecimentos'}
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="rounded-card bg-white/80 px-5 py-6 text-center ring-1 ring-line">
          <p className="font-bold text-brown">Nenhum cliente encontrado{everywhere ? '' : ' neste lugar'}.</p>
          {!everywhere && elsewhere > 0 && (
            <button type="button" onClick={() => setEverywhere(true)} className="mt-2 font-extrabold text-orange-darker underline">
              Ver {elsewhere} {elsewhere === 1 ? 'cliente' : 'clientes'} de outros lugares
            </button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
          {shown.map((c) => {
            const twin = (homonyms.get(c.fullName.toLowerCase()) ?? 0) > 1;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => choose(c)}
                  className="flex min-h-18 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-cream-deep"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-lg font-extrabold text-brown">{c.fullName}</span>
                    <span className="block truncate text-sm text-brown-soft">
                      {c.phoneE164 ? maskPhone(c.phoneE164) : 'Sem telefone'}
                      {c.notes ? ` · ${c.notes}` : ''}
                    </span>
                    {(twin || !isLocal(c)) && (
                      <span className="mt-0.5 flex flex-wrap gap-1.5">
                        {twin && <span className="rounded-full bg-peach px-2 text-xs font-bold text-brown">nome igual a outro cliente</span>}
                        {!isLocal(c) && <span className="rounded-full bg-cream-deep px-2 text-xs font-bold text-brown-soft">de outro lugar</span>}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-brown-soft" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <Link
        to="/clientes/novo"
        className="flex min-h-12 items-center justify-center gap-2 rounded-2xl font-extrabold text-orange-darker active:bg-peach"
      >
        <UserPlus className="h-5 w-5" aria-hidden="true" />
        Cadastrar cliente novo
      </Link>

      {outsider && (
        <div role="dialog" aria-modal="true" aria-labelledby="aviso-fora" className="fixed inset-0 z-40 flex items-end bg-brown/40 p-3 sm:items-center sm:justify-center">
          <div className="w-full max-w-md space-y-3 rounded-card bg-white p-5 shadow-warm">
            <div className="flex gap-3">
              <AlertTriangle className="mt-1 h-6 w-6 shrink-0 text-orange-darker" aria-hidden="true" />
              <div>
                <h2 id="aviso-fora" className="text-lg font-black text-brown">
                  Este cliente não está cadastrado neste estabelecimento. Deseja continuar?
                </h2>
                <p className="mt-1 text-brown-soft">
                  {outsider.fullName}
                  {outsider.phoneE164 ? ` · ${maskPhone(outsider.phoneE164)}` : ''} — vendendo em {establishment.name}.
                </p>
              </div>
            </div>
            <Button block onClick={() => (onSelect(outsider, false), setOutsider(null))}>
              Continuar
            </Button>
            {canLink && (
              <Button variant="secondary" block onClick={() => (onSelect(outsider, true), setOutsider(null))}>
                Vincular a {establishment.nickname ?? establishment.name} e continuar
              </Button>
            )}
            <Button variant="ghost" block onClick={() => setOutsider(null)}>
              Voltar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
