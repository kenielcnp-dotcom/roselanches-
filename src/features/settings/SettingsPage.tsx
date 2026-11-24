import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogOut } from 'lucide-react';
import { Button } from '@/components/Button';
import { MoneyField, Switch } from '@/components/Controls';
import { SelectField, TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { formatBRL } from '@/domain/money';
import { PERIOD_LABELS } from '@/domain/period';
import { SALE_HARD_MAX_CENTS } from '@/domain/sale';
import { BRAZIL_TIME_ZONES, deviceTimeZone, isBrazilTimeZone, timeZoneLabel } from '@/domain/timezone';
import { errorMessage } from '@/lib/supabase/errors';
import type { BusinessSettings } from '@/services/settings';
import { useAuth } from '@/features/auth/AuthProvider';
import { useSaveSalesSettings, useSettings } from '@/features/registry/queries';
import { useOptionalSync } from '@/features/sync/SyncProvider';

export function SettingsPage() {
  const { identity, signOut } = useAuth();
  const staff = identity?.staff;
  return (
    <>
      <PageHeader title="Configurações" />
      <main className="mx-auto max-w-lg space-y-4 px-4 pt-2 pb-6">
        <section className="rounded-card bg-white/90 p-5 shadow-soft ring-1 ring-line">
          <h2 className="text-lg font-extrabold text-brown">Sua conta</h2>
          <dl className="mt-3 space-y-2 text-brown">
            <div>
              <dt className="text-sm text-brown-soft">Nome</dt>
              <dd className="font-bold">{identity?.displayName || '—'}</dd>
            </div>
            <div>
              <dt className="text-sm text-brown-soft">Negócio</dt>
              <dd className="font-bold">{staff?.businessName ?? '—'}</dd>
            </div>
          </dl>
        </section>
        {staff && <SalesSettingsSection businessId={staff.businessId} canEdit={staff.role === 'OWNER'} />}
        <p className="px-1 text-brown-soft">Os dados do Pix ficam aqui na etapa de recebimentos.</p>
        <Button variant="secondary" block onClick={() => void signOut()}>
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Sair da conta
        </Button>
      </main>
    </>
  );
}

function SalesSettingsSection({ businessId, canEdit }: { businessId: string; canEdit: boolean }) {
  const query = useSettings(businessId);
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  return <SalesSettingsForm businessId={businessId} canEdit={canEdit} settings={query.data} />;
}

const AUTO = 'AUTO';

const schema = z.object({
  timezone: z.string().refine(isBrazilTimeZone, 'Escolha um fuso da lista.'),
  defaultSalePeriod: z.enum([AUTO, 'MORNING', 'AFTERNOON', 'NIGHT']),
  requireSignature: z.boolean(),
  saleMaxCents: z
    .number()
    .int()
    .min(100, 'O limite precisa ser de pelo menos R$ 1,00.')
    .max(SALE_HARD_MAX_CENTS, `No máximo ${formatBRL(SALE_HARD_MAX_CENTS)}.`),
  itemMaxQty: z.number({ error: 'Informe um número.' }).int('Use um número inteiro.').min(1, 'Pelo menos 1.').max(999, 'No máximo 999.'),
});
type Form = z.infer<typeof schema>;

function SalesSettingsForm({ businessId, canEdit, settings }: { businessId: string; canEdit: boolean; settings: BusinessSettings }) {
  const save = useSaveSalesSettings(businessId);
  const { refreshIdentity } = useAuth();
  const sync = useOptionalSync();
  const toast = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  const device = deviceTimeZone();

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
    reset,
  } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: {
      timezone: settings.timezone,
      defaultSalePeriod: settings.defaultSalePeriod ?? AUTO,
      requireSignature: settings.requireSignature,
      saleMaxCents: settings.saleMaxCents,
      itemMaxQty: settings.itemMaxQty,
    },
  });
  const timezone = useWatch({ control, name: 'timezone' });

  const onSubmit = handleSubmit(async (form) => {
    setServerError(null);
    try {
      await save.mutateAsync({
        timezone: form.timezone,
        defaultSalePeriod: form.defaultSalePeriod === AUTO ? null : form.defaultSalePeriod,
        requireSignature: form.requireSignature,
        saleMaxCents: form.saleMaxCents,
        itemMaxQty: form.itemMaxQty,
      });
    } catch (e) {
      setServerError(errorMessage(e));
      return;
    }
    // O fuso vale para o app inteiro (datas, "hoje", períodos).
    await refreshIdentity();
    // O celular passa a usar as novas regras de venda (assinatura obrigatória, limites) já.
    await sync?.refreshCatalogNow();
    reset(form);
    toast.show('Configurações salvas.');
  });

  return (
    <section className="rounded-card bg-white/90 p-5 shadow-soft ring-1 ring-line">
      <h2 className="text-lg font-extrabold text-brown">Vendas</h2>
      {!canEdit && <p className="mt-1 text-sm text-brown-soft">Só a dona do negócio altera estas opções.</p>}
      <form onSubmit={onSubmit} noValidate className="mt-3 space-y-4">
        <fieldset disabled={!canEdit} className="space-y-4">
          <div>
            <SelectField
              label="Fuso horário do negócio"
              options={BRAZIL_TIME_ZONES.map((z) => ({ value: z.id, label: z.label }))}
              hint='Define o que é "hoje", o período da venda e os horários mostrados.'
              error={errors.timezone?.message}
              {...register('timezone')}
            />
            {canEdit && device && device !== timezone && (
              <button
                type="button"
                onClick={() => setValue('timezone', device, { shouldDirty: true })}
                className="mt-2 text-left text-sm font-extrabold text-orange-deep underline"
              >
                Este celular está em {timeZoneLabel(device)}. Usar este fuso
              </button>
            )}
          </div>
          <SelectField
            label="Período da venda"
            options={[
              { value: AUTO, label: 'Automático, pela hora' },
              { value: 'MORNING', label: `Sempre ${PERIOD_LABELS.MORNING.toLowerCase()}` },
              { value: 'AFTERNOON', label: `Sempre ${PERIOD_LABELS.AFTERNOON.toLowerCase()}` },
              { value: 'NIGHT', label: `Sempre ${PERIOD_LABELS.NIGHT.toLowerCase()}` },
            ]}
            hint="Dá para trocar em cada venda."
            {...register('defaultSalePeriod')}
          />
          <Controller
            control={control}
            name="requireSignature"
            render={({ field }) => (
              <div className="rounded-2xl bg-cream p-4 ring-1 ring-line">
                <Switch
                  label="Assinatura obrigatória"
                  description="Ligado, toda venda pede a assinatura do cliente na tela. Desligado, você escolhe em cada venda."
                  checked={field.value}
                  onChange={field.onChange}
                  disabled={!canEdit}
                />
              </div>
            )}
          />
          <Controller
            control={control}
            name="saleMaxCents"
            render={({ field }) => (
              <MoneyField
                label="Valor máximo por venda"
                valueCents={field.value}
                onChange={field.onChange}
                error={errors.saleMaxCents?.message}
                hint="Acima disso, o app pede para conferir o valor. Evita erro de digitação."
              />
            )}
          />
          <TextField
            label="Quantidade máxima de um produto"
            type="number"
            inputMode="numeric"
            min={1}
            max={999}
            error={errors.itemMaxQty?.message}
            {...register('itemMaxQty', { valueAsNumber: true })}
          />
        </fieldset>
        {serverError && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
            {serverError}
          </p>
        )}
        {canEdit && (
          <Button type="submit" block loading={save.isPending} disabled={!isDirty}>
            Salvar configurações
          </Button>
        )}
      </form>
    </section>
  );
}
