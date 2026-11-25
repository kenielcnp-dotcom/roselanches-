import { useQuery } from '@tanstack/react-query';
import { WifiOff } from 'lucide-react';
import { Chip } from '@/components/Controls';
import { SelectField, TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { formatRange, presetRange, type PeriodPreset } from '@/domain/report-period';
import { supabase } from '@/lib/supabase/client';
import { toAppError } from '@/lib/supabase/errors';
import { useCustomers, useEstablishments } from '@/features/registry/queries';
import { fetchPlacesReport, fetchReportSummary } from '@/services/reports';
import { PlacesTab } from './PlacesTab';
import { SalesTab } from './SalesTab';
import { SummaryTab } from './SummaryTab';
import { useReportParams, type ReportTab } from './useReportParams';

const PRESET_LABELS: Record<PeriodPreset, string> = {
  TODAY: 'Hoje',
  WEEK: 'Semana',
  MONTH: 'Mês',
  LAST_MONTH: 'Mês passado',
  CUSTOM: 'Escolher datas',
};

const TAB_LABELS: Record<ReportTab, string> = { resumo: 'Resumo', locais: 'Por local', vendas: 'Vendas' };

/** Relatórios: período, filtros e três visões (resumo, locais, lista de vendas). */
export function ReportsPage() {
  const p = useReportParams();
  const establishments = useEstablishments();
  const customers = useCustomers();
  const ready = !p.problem;

  const summary = useQuery({
    queryKey: ['report', 'summary', p.filters],
    queryFn: () => fetchReportSummary(supabase, p.filters),
    enabled: ready && p.tab === 'resumo',
  });
  const places = useQuery({
    queryKey: ['report', 'places', p.range],
    queryFn: () => fetchPlacesReport(supabase, p.range),
    enabled: ready && p.tab === 'locais',
  });

  const placeName = establishments.data?.find((e) => e.id === p.filters.establishmentId)?.name;
  const customerName = customers.data?.find((c) => c.id === p.filters.customerId)?.fullName;

  return (
    <>
      <PageHeader title="Relatórios" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <section aria-label="Filtros" className="space-y-3">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1" role="group" aria-label="Período">
            {(Object.keys(PRESET_LABELS) as PeriodPreset[]).map((key) => (
              <Chip
                key={key}
                selected={p.preset === key}
                onClick={() =>
                  key === 'CUSTOM'
                    ? p.update({ periodo: key, de: p.range.from || presetRange('MONTH').from, ate: p.range.to || presetRange('MONTH').to })
                    : p.update({ periodo: key, de: null, ate: null })
                }
              >
                {PRESET_LABELS[key]}
              </Chip>
            ))}
          </div>
          {p.preset === 'CUSTOM' && (
            <div className="grid grid-cols-2 gap-3">
              <TextField label="De" type="date" value={p.range.from} onChange={(e) => p.update({ de: e.target.value })} />
              <TextField label="Até" type="date" value={p.range.to} onChange={(e) => p.update({ ate: e.target.value })} />
            </div>
          )}
          {p.problem && (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
              {p.problem}
            </p>
          )}
          {p.tab !== 'locais' && (
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Local"
                value={p.filters.establishmentId ?? ''}
                onChange={(e) => p.update({ local: e.target.value })}
                options={[{ value: '', label: 'Todos' }, ...(establishments.data ?? []).map((e) => ({ value: e.id, label: e.name }))]}
              />
              <SelectField
                label="Cliente"
                value={p.filters.customerId ?? ''}
                onChange={(e) => p.update({ cliente: e.target.value })}
                options={[
                  { value: '', label: 'Todos' },
                  ...[...(customers.data ?? [])]
                    .sort((a, b) => a.fullName.localeCompare(b.fullName, 'pt-BR'))
                    .map((c) => ({ value: c.id, label: c.fullName })),
                ]}
              />
            </div>
          )}
          <p className="text-sm text-brown-soft">
            {formatRange(p.range.from && p.range.to ? p.range : presetRange('TODAY'))}
            {p.tab !== 'locais' && placeName ? ` · ${placeName}` : ''}
            {p.tab !== 'locais' && customerName ? ` · ${customerName}` : ''}
          </p>
        </section>

        <div className="grid grid-cols-3 gap-1 rounded-2xl bg-cream-deep p-1" role="tablist" aria-label="Visão do relatório">
          {(Object.keys(TAB_LABELS) as ReportTab[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={p.tab === key}
              onClick={() => p.update({ aba: key === 'resumo' ? null : key })}
              className={`min-h-11 rounded-xl text-base font-extrabold ${p.tab === key ? 'bg-white text-brown shadow-soft' : 'text-brown-soft'}`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>

        {ready && p.tab === 'resumo' && <SummaryTab query={summary} establishmentFiltered={!!p.filters.establishmentId} />}
        {ready && p.tab === 'locais' && <PlacesTab query={places} />}
        {ready && p.tab === 'vendas' && (
          <SalesTab
            filters={p.filters}
            payment={p.payment}
            confirmation={p.confirmation}
            onPayment={(v) => p.update({ pagamento: v === 'ALL' ? null : v })}
            onConfirmation={(v) => p.update({ confirmacao: v === 'ALL' ? null : v })}
          />
        )}
      </main>
    </>
  );
}

/** Relatório depende do servidor: sem internet, um aviso claro em vez de números velhos. */
export function ReportError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const offline = toAppError(error).kind === 'network';
  return (
    <div role="alert" className="space-y-3 rounded-card bg-white/80 px-5 py-6 text-center ring-1 ring-line">
      {offline && <WifiOff className="mx-auto h-8 w-8 text-orange-deep" aria-hidden="true" />}
      <p className="text-brown">
        {offline ? 'Os relatórios precisam de internet. As vendas no celular continuam salvas.' : toAppError(error).message}
      </p>
      <button type="button" onClick={onRetry} className="min-h-11 font-extrabold text-orange-deep">
        Tentar de novo
      </button>
    </div>
  );
}
