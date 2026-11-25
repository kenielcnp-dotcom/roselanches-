import { useState } from 'react';
import { Link } from 'react-router';
import { ChevronRight, Plus, ReceiptText, Send } from 'lucide-react';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Controls';
import { PageHeader } from '@/components/PageHeader';
import { EmptyState, LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import { formatShortDate, formatTime, localDateISO } from '@/domain/period';
import { errorMessage } from '@/lib/supabase/errors';
import { SaleBadges } from './SaleBadges';
import { useSalesSince } from './salesData';
import { useSync } from '@/features/sync/SyncProvider';

export function SalesPage() {
  const [days, setDays] = useState(1);
  const { server, sales } = useSalesSince(days);
  const active = sales?.filter((s) => s.status === 'ACTIVE') ?? [];
  const total = active.reduce((sum, s) => sum + s.totalCents, 0);
  const today = localDateISO(new Date());
  const { counts, requestSync } = useSync();
  const waiting = counts.pendingSales - counts.failed + counts.pendingOther;
  const [sending, setSending] = useState(false);

  return (
    <>
      <PageHeader title="Vendas" back="/" showSync compactSync={false} />
      <main className="mx-auto max-w-lg space-y-3 px-4 pt-2 pb-6">
        <Link
          to="/vender"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-orange-deep px-5 text-lg font-extrabold text-white shadow-warm active:bg-orange-darker"
        >
          <Plus className="h-6 w-6" strokeWidth={3} aria-hidden="true" />
          Nova venda
        </Link>
        {waiting > 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-peach px-4 py-3">
            <p className="min-w-0 flex-1 font-bold text-brown">
              {counts.pendingSales - counts.failed === 1 ? '1 venda aguardando internet.' : `Você tem ${counts.pendingSales - counts.failed} vendas aguardando internet.`}
            </p>
            <Button
              variant="secondary"
              loading={sending}
              onClick={async () => {
                setSending(true);
                await requestSync({ force: true });
                setSending(false);
              }}
            >
              <Send className="h-5 w-5" aria-hidden="true" />
              Enviar agora
            </Button>
          </div>
        )}
        <div className="flex gap-2" role="group" aria-label="Período">
          <Chip selected={days === 1} onClick={() => setDays(1)}>
            Hoje
          </Chip>
          <Chip selected={days === 7} onClick={() => setDays(7)}>
            Últimos 7 dias
          </Chip>
        </div>

        {server.isError && (
          <p role="status" className="rounded-2xl bg-peach px-4 py-3 text-brown">
            Sem conexão com o servidor: mostrando só as vendas feitas neste celular. ({errorMessage(server.error)})
          </p>
        )}

        {!sales ? (
          <LoadingState />
        ) : sales.length === 0 && !server.isPending ? (
          <EmptyState icon={<ReceiptText className="h-10 w-10" />} title={days === 1 ? 'Nenhuma venda hoje' : 'Nenhuma venda nesses dias'} />
        ) : (
          <>
            <p className="text-brown-soft">
              {active.length} {active.length === 1 ? 'venda' : 'vendas'} · <strong className="tabular text-brown">{formatBRL(total)}</strong>
            </p>
            <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
              {sales.map((s) => {
                const when = new Date(s.occurredAt);
                const cancelled = s.status === 'CANCELLED';
                return (
                  <li key={s.id}>
                    <Link to={`/vendas/${s.id}`} className="flex min-h-18 items-center gap-3 px-4 py-2.5 active:bg-cream-deep">
                      <span className="tabular w-12 shrink-0 text-sm font-bold text-brown-soft">
                        {localDateISO(when) === today ? formatTime(when) : formatShortDate(when)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate font-extrabold ${cancelled ? 'text-brown-soft line-through' : 'text-brown'}`}>
                          {s.customerName}
                        </span>
                        <span className="block truncate text-sm text-brown-soft">
                          {s.establishmentName} · {s.summary}
                        </span>
                        <SaleBadges sale={s} />
                      </span>
                      <span className={`tabular shrink-0 font-black ${cancelled ? 'text-brown-soft line-through' : 'text-brown'}`}>
                        {formatBRL(s.totalCents)}
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-brown-soft" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </main>
    </>
  );
}
