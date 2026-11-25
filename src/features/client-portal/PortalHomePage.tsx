import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { BellRing, CheckCircle2, ChevronRight, Clock, QrCode, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Controls';
import { SelectField } from '@/components/Field';
import { ErrorState, LoadingState } from '@/components/States';
import { formatBRL } from '@/domain/money';
import { firstName, formatDate, formatDateTime, greeting } from '@/domain/period';
import { errorMessage, toAppError } from '@/lib/supabase/errors';
import { useAuth } from '@/features/auth/AuthProvider';
import { StatementEntryRow } from '@/features/shared/StatementEntryRow';
import type { PortalFilter, PortalNotice, PortalSummary } from '@/services/portal';
import { usePortalStatement, usePortalSummary } from './portalData';

const FILTERS: { value: PortalFilter; label: string }[] = [
  { value: 'ALL', label: 'Tudo' },
  { value: 'TO_CONFIRM', label: 'A confirmar' },
  { value: 'OPEN', label: 'Em aberto' },
  { value: 'SALES', label: 'Compras' },
  { value: 'PAYMENTS', label: 'Pagamentos' },
];

/** Portal do cliente: saldo, avisos de pagamento e extrato com filtros. */
export function PortalHomePage() {
  const { identity, signOut } = useAuth();
  const location = useLocation();
  const welcome = (location.state as { welcome?: boolean } | null)?.welcome === true;
  const summary = usePortalSummary();
  const [filter, setFilter] = useState<PortalFilter>('ALL');
  const [place, setPlace] = useState<string>('');
  const name = firstName(identity?.customer?.fullName ?? summary.data?.customerName ?? '');

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pt-4 pb-10">
      <div>
        <h1 className="text-2xl font-black text-brown">
          {greeting(new Date())}
          {name ? `, ${name}` : ''}!
        </h1>
        <p className="text-brown-soft">Sua conta no {identity?.customer?.businessName ?? 'Lanches da Rose'}</p>
      </div>

      {welcome && (
        <p role="status" className="flex gap-2 rounded-2xl bg-success/10 px-4 py-3 font-bold text-success">
          <CheckCircle2 className="h-6 w-6 shrink-0" aria-hidden="true" />
          Pronto! Sua conta está ligada ao seu cadastro.
        </p>
      )}

      {summary.isPending ? (
        <LoadingState />
      ) : summary.isError ? (
        toAppError(summary.error).kind === 'network' ? (
          <p className="rounded-card bg-white/70 px-5 py-6 text-center text-brown-soft ring-1 ring-line">
            Sem conexão com o servidor. Tente de novo quando a internet voltar.
          </p>
        ) : (
          <ErrorState message={errorMessage(summary.error)} onRetry={() => void summary.refetch()} />
        )
      ) : (
        <>
          <BalanceCard summary={summary.data} />
          {summary.data.toConfirm > 0 && (
            <button
              type="button"
              onClick={() => setFilter('TO_CONFIRM')}
              className="flex min-h-14 w-full items-center gap-3 rounded-card bg-peach px-4 py-3 text-left font-bold text-brown ring-2 ring-orange/40 active:bg-cream-deep"
            >
              <BellRing className="h-6 w-6 shrink-0 text-orange-darker" aria-hidden="true" />
              <span className="flex-1">
                {summary.data.toConfirm === 1
                  ? '1 compra esperando você confirmar'
                  : `${summary.data.toConfirm} compras esperando você confirmar`}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0" aria-hidden="true" />
            </button>
          )}
          {summary.data.notices.length > 0 && <Notices notices={summary.data.notices} />}
        </>
      )}

      <section aria-labelledby="extrato" className="space-y-3">
        <h2 id="extrato" className="text-xl font-black text-brown">
          Suas compras e pagamentos
        </h2>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Filtrar extrato">
          {FILTERS.map((f) => (
            <Chip key={f.value} selected={filter === f.value} onClick={() => setFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
        {(summary.data?.establishments.length ?? 0) > 1 && (
          <SelectField
            label="Local"
            value={place}
            onChange={(e) => setPlace(e.target.value)}
            options={[
              { value: '', label: 'Todos os locais' },
              ...(summary.data?.establishments ?? []).map((e) => ({ value: e.id, label: e.name })),
            ]}
          />
        )}
        <Statement filter={filter} establishmentId={place || null} />
      </section>

      <footer className="space-y-2 pt-2">
        <Link to="/conta/privacidade" className="flex min-h-11 items-center justify-center gap-2 font-bold text-brown-soft">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          Privacidade e seus dados
        </Link>
        <Button variant="ghost" block onClick={() => void signOut()}>
          Sair da conta
        </Button>
      </footer>
    </main>
  );
}

function BalanceCard({ summary: s }: { summary: PortalSummary }) {
  const owes = s.balanceCents > 0;
  return (
    <section
      aria-label="Seu saldo"
      className={`rounded-card p-5 text-white shadow-warm ${
        owes ? 'bg-linear-to-br from-orange-deep to-brown' : 'bg-linear-to-br from-success to-[#1a6437]'
      }`}
    >
      <p className="font-bold text-white/90">{owes ? 'Você deve' : s.balanceCents < 0 ? 'Você tem de crédito' : 'Sua conta está em dia'}</p>
      <p className="tabular text-4xl font-black">{formatBRL(Math.abs(s.balanceCents))}</p>
      {s.lastPaymentAt && <p className="mt-1 text-sm text-white/90">Último pagamento: {formatDate(new Date(s.lastPaymentAt))}</p>}
      {owes && s.pixConfigured && (
        <Link
          to="/conta/pagar"
          className="mt-4 flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-5 text-lg font-extrabold text-brown shadow-soft active:bg-cream"
        >
          <QrCode className="h-6 w-6 text-orange-darker" aria-hidden="true" />
          Pagar com Pix
        </Link>
      )}
      {owes && !s.pixConfigured && <p className="mt-3 text-sm text-white/90">Para pagar, fale com a Rose.</p>}
    </section>
  );
}

const NOTICE_LOOK = {
  PENDING: { icon: Clock, text: 'Esperando a Rose conferir', cls: 'text-orange-darker' },
  CONFIRMED: { icon: CheckCircle2, text: 'Pagamento confirmado', cls: 'text-success' },
  REJECTED: { icon: XCircle, text: 'Não confirmado', cls: 'text-danger' },
} as const;

function Notices({ notices }: { notices: PortalNotice[] }) {
  // O servidor manda só os pendentes e os resolvidos nos últimos 7 dias.
  return (
    <section aria-labelledby="avisos" className="space-y-2">
      <h2 id="avisos" className="text-lg font-black text-brown">
        Seus avisos de pagamento
      </h2>
      <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
        {notices.map((n) => {
          const look = NOTICE_LOOK[n.status];
          const Icon = look.icon;
          return (
            <li key={n.id} className="flex gap-3 px-4 py-3">
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${look.cls}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-bold text-brown">
                  {n.amountCents ? formatBRL(n.amountCents) : 'Pagamento'} · {look.text}
                </p>
                <p className="text-sm text-brown-soft">Enviado em {formatDateTime(new Date(n.createdAt))}</p>
                {n.status === 'REJECTED' && n.resolutionNote && <p className="text-sm text-brown">Motivo: {n.resolutionNote}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Statement({ filter, establishmentId }: { filter: PortalFilter; establishmentId: string | null }) {
  const query = usePortalStatement(filter, establishmentId);
  const entries = query.data?.pages.flat() ?? [];

  if (query.isPending) return <LoadingState />;
  if (query.isError) {
    return toAppError(query.error).kind === 'network' ? (
      <p className="rounded-card bg-white/70 px-5 py-6 text-center text-brown-soft ring-1 ring-line">
        Sem internet: o extrato aparece quando a conexão voltar.
      </p>
    ) : (
      <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  }
  return (
    <>
      {entries.length === 0 ? (
        <p className="rounded-card bg-white/70 px-5 py-6 text-center text-brown-soft ring-1 ring-line">
          {filter === 'TO_CONFIRM' ? 'Nenhuma compra esperando confirmação.' : 'Nada por aqui ainda.'}
        </p>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
          {entries.map((e) => (
            <StatementEntryRow
              key={`${e.kind}-${e.id}`}
              entry={e}
              to={e.kind === 'SALE' ? `/conta/compras/${e.id}` : null}
              audience="customer"
            />
          ))}
        </ul>
      )}
      {query.hasNextPage && (
        <Button variant="secondary" block loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
          Ver mais antigos
        </Button>
      )}
    </>
  );
}
