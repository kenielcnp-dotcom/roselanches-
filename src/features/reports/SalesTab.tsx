import { useState } from 'react';
import { Link } from 'react-router';
import { useInfiniteQuery } from '@tanstack/react-query';
import { ChevronRight, Download } from 'lucide-react';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Controls';
import { SelectField } from '@/components/Field';
import { LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { csvMoney, toCsv } from '@/domain/csv';
import { CONFIRMATION_LABELS, paymentLabel } from '@/domain/labels';
import { formatBRL } from '@/domain/money';
import { formatDate, formatDateTime, formatTime, PERIOD_LABELS } from '@/domain/period';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import {
  fetchReportSales,
  type ConfirmationFilter,
  type PaymentFilter,
  type ReportFilters,
  type ReportSaleRow,
} from '@/services/reports';
import { ReportError } from './ReportsPage';

const PAGE = 30;
const CSV_LIMIT = 2000;

const PAYMENT_LABELS: Record<PaymentFilter, string> = {
  ALL: 'Todas',
  OPEN: 'Em aberto',
  PARTIAL: 'Pagas em parte',
  SETTLED: 'Quitadas',
  PAID_NOW: 'Pagas na hora',
  CANCELLED: 'Canceladas',
};

const CONFIRMATION_OPTIONS: { value: ConfirmationFilter; label: string }[] = [
  { value: 'ALL', label: 'Todas' },
  { value: 'PENDING', label: 'Sem confirmação' },
  { value: 'SIGNED', label: 'Assinadas' },
  { value: 'CONFIRMED_ONLINE', label: 'Confirmadas no app' },
  { value: 'DISPUTED', label: 'Contestadas' },
];

interface Props {
  filters: ReportFilters;
  payment: PaymentFilter;
  confirmation: ConfirmationFilter;
  onPayment: (v: PaymentFilter) => void;
  onConfirmation: (v: ConfirmationFilter) => void;
}

export function SalesTab({ filters, payment, confirmation, onPayment, onConfirmation }: Props) {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const all = { ...filters, payment, confirmation };
  const query = useInfiniteQuery({
    queryKey: ['report', 'sales', all],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => fetchReportSales(supabase, all, PAGE, pageParam),
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.rows.length, 0);
      return last.rows.length === PAGE && loaded < last.totalCount ? loaded : undefined;
    },
  });
  const first = query.data?.pages[0];
  const rows = query.data?.pages.flatMap((p) => p.rows) ?? [];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const page = await fetchReportSales(supabase, all, CSV_LIMIT, 0);
      const csv = toCsv(
        ['Data', 'Hora', 'Turno', 'Cliente', 'Local', 'Compra', 'Total', 'Pagamento', 'Em aberto', 'Situação', 'Confirmação'],
        page.rows.map((r) => {
          const when = new Date(r.occurredAt);
          return [
            formatDate(when),
            formatTime(when),
            PERIOD_LABELS[r.period],
            r.customerName,
            r.establishmentName,
            r.summary,
            csvMoney(r.totalCents),
            paymentLabel(r.paymentKind, r.paidMethod),
            csvMoney(r.openCents),
            r.status === 'CANCELLED' ? `Cancelada: ${r.cancelReason ?? ''}` : 'Ativa',
            CONFIRMATION_LABELS[r.confirmationStatus],
          ];
        }),
      );
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `vendas-${filters.from}-a-${filters.to}.csv`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast.show(
        page.totalCount > CSV_LIMIT
          ? `Planilha com as ${CSV_LIMIT} vendas mais recentes de ${page.totalCount}. Diminua o período para ver todas.`
          : `Planilha com ${page.rows.length} ${page.rows.length === 1 ? 'venda' : 'vendas'} baixada.`,
        page.totalCount > CSV_LIMIT ? 'info' : 'success',
      );
    } catch (e) {
      toast.show(errorMessage(e), 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Situação do pagamento">
        {(Object.keys(PAYMENT_LABELS) as PaymentFilter[]).map((k) => (
          <Chip key={k} selected={payment === k} onClick={() => onPayment(k)}>
            {PAYMENT_LABELS[k]}
          </Chip>
        ))}
      </div>
      <SelectField
        label="Confirmação do cliente"
        value={confirmation}
        onChange={(e) => onConfirmation(e.target.value as ConfirmationFilter)}
        options={CONFIRMATION_OPTIONS}
      />

      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ReportError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <p className="text-brown" role="status">
            <strong>
              {first?.totalCount ?? 0} {first?.totalCount === 1 ? 'venda' : 'vendas'}
            </strong>{' '}
            · <span className="tabular font-black">{formatBRL(first?.sumCents ?? 0)}</span>
            {(first?.sumOpenCents ?? 0) > 0 && (
              <>
                {' '}
                · em aberto <span className="tabular font-black text-orange-deep">{formatBRL(first?.sumOpenCents ?? 0)}</span>
              </>
            )}
          </p>
          {rows.length === 0 ? (
            <p className="rounded-card bg-white/70 px-5 py-6 text-center text-brown-soft ring-1 ring-line">Nenhuma venda com esses filtros.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-card bg-white shadow-soft ring-1 ring-line">
              {rows.map((r) => (
                <SaleRow key={r.id} sale={r} />
              ))}
            </ul>
          )}
          {query.hasNextPage && (
            <Button variant="secondary" block loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              Ver mais
            </Button>
          )}
          {rows.length > 0 && (
            <Button variant="ghost" block loading={exporting} onClick={() => void exportCsv()}>
              <Download className="h-5 w-5" aria-hidden="true" />
              Baixar planilha (CSV)
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function SaleRow({ sale: s }: { sale: ReportSaleRow }) {
  const cancelled = s.status === 'CANCELLED';
  return (
    <li>
      <Link to={`/vendas/${s.id}`} className="flex items-start gap-3 px-4 py-3 active:bg-cream-deep">
        <span className="min-w-0 flex-1">
          <span className={`block truncate font-extrabold ${cancelled ? 'text-brown-soft line-through' : 'text-brown'}`}>{s.customerName}</span>
          <span className="block truncate text-sm text-brown">{s.summary}</span>
          <span className="block text-xs text-brown-soft">
            {formatDateTime(new Date(s.occurredAt))} · {s.establishmentName}
          </span>
          <span className="mt-0.5 flex flex-wrap gap-1.5 text-xs font-bold">
            {cancelled ? (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 text-danger">Cancelada{s.cancelReason ? `: ${s.cancelReason}` : ''}</span>
            ) : s.paymentKind === 'PAID_NOW' ? (
              <span className="rounded-full bg-success/10 px-2 py-0.5 text-success">{paymentLabel(s.paymentKind, s.paidMethod)}</span>
            ) : (
              <span className={`rounded-full px-2 py-0.5 ${s.openCents === 0 ? 'bg-success/10 text-success' : 'bg-peach text-orange-deep'}`}>
                {s.openCents === 0 ? 'Fiado quitado' : s.openCents === s.totalCents ? 'Fiado em aberto' : `Falta ${formatBRL(s.openCents ?? 0)}`}
              </span>
            )}
            {!cancelled && s.confirmationStatus !== 'PENDING' && (
              <span className={`rounded-full px-2 py-0.5 ${s.confirmationStatus === 'DISPUTED' ? 'bg-danger/10 text-danger' : 'bg-cream-deep text-brown'}`}>
                {CONFIRMATION_LABELS[s.confirmationStatus]}
              </span>
            )}
          </span>
        </span>
        <span className={`tabular shrink-0 font-black ${cancelled ? 'text-brown-soft line-through' : 'text-brown'}`}>{formatBRL(s.totalCents)}</span>
        <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-brown-soft" aria-hidden="true" />
      </Link>
    </li>
  );
}
