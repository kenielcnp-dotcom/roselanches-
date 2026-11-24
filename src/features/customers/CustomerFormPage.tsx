import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/Button';
import { Chip, Switch } from '@/components/Controls';
import { TextAreaField, TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { formatPhone, normalizePhone } from '@/domain/phone';
import { customerFormSchema, findPossibleDuplicates, phoneToE164, type CustomerForm } from '@/domain/registry';
import { errorMessage } from '@/lib/supabase/errors';
import type { Customer } from '@/services/customers';
import { useCurrentEstablishmentId } from '@/features/establishments/useCurrentEstablishment';
import { useCustomers, useEstablishments, useSaveCustomer } from '@/features/registry/queries';

export function CustomerFormPage() {
  const { id } = useParams();
  const customers = useCustomers();
  const establishments = useEstablishments();
  if (customers.isPending || establishments.isPending) return <LoadingState />;
  if (customers.isError || establishments.isError) {
    return (
      <ErrorState
        message={errorMessage(customers.error ?? establishments.error)}
        onRetry={() => void Promise.all([customers.refetch(), establishments.refetch()])}
      />
    );
  }
  const existing = id ? customers.data.find((c) => c.id === id) : undefined;
  if (id && !existing) return <ErrorState message="Cliente não encontrado." />;
  return <CustomerFormView existing={existing} customers={customers.data} />;
}

function CustomerFormView({ existing, customers }: { existing: Customer | undefined; customers: Customer[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const save = useSaveCustomer();
  const establishments = useEstablishments();
  const [currentId] = useCurrentEstablishmentId();
  const [newId] = useState(() => crypto.randomUUID());
  const [serverError, setServerError] = useState<string | null>(null);

  const places = (establishments.data ?? []).filter((e) => e.isActive || existing?.establishmentIds.includes(e.id));
  const defaultPlaces = existing?.establishmentIds ?? (currentId && places.some((p) => p.id === currentId) ? [currentId] : []);

  const {
    register,
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<CustomerForm>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      fullName: existing?.fullName ?? '',
      phone: existing?.phoneE164 ? formatPhone(existing.phoneE164) : '',
      notes: existing?.notes ?? '',
      isActive: existing?.isActive ?? true,
      establishmentIds: defaultPlaces,
    },
  });

  const [fullName, phone] = useWatch({ control, name: ['fullName', 'phone'] });
  const duplicates = useMemo(
    () =>
      findPossibleDuplicates(
        { id: existing?.id ?? null, fullName, phoneE164: phoneToE164(phone) },
        customers,
      ),
    [customers, existing?.id, fullName, phone],
  );

  const onSubmit = handleSubmit(async (form) => {
    setServerError(null);
    const id = existing?.id ?? newId;
    try {
      await save.mutateAsync({ id, form });
    } catch (e) {
      setServerError(errorMessage(e));
      return;
    }
    toast.show(existing ? 'Cliente atualizado.' : 'Cliente cadastrado.');
    navigate(`/clientes/${id}`, { replace: true });
  });

  const phoneField = register('phone');

  return (
    <>
      <PageHeader title={existing ? 'Editar cliente' : 'Novo cliente'} back={existing ? `/clientes/${existing.id}` : '/clientes'} />
      <main className="mx-auto max-w-lg px-4 pt-2 pb-6">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <TextField
            label="Nome completo"
            placeholder="Ex.: Maria Silva"
            autoComplete="off"
            autoCapitalize="words"
            autoFocus={!existing}
            error={errors.fullName?.message}
            {...register('fullName')}
          />
          <TextField
            label="Telefone (opcional)"
            placeholder="(11) 98765-4321"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            error={errors.phone?.message}
            {...phoneField}
            onBlur={(e) => {
              void phoneField.onBlur(e);
              const r = normalizePhone(e.target.value);
              if (r.ok) setValue('phone', formatPhone(r.e164));
            }}
          />

          {duplicates.length > 0 && (
            <div role="status" className="flex gap-3 rounded-2xl bg-peach px-4 py-3 text-brown">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-orange-deep" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-bold">Confira se não é a mesma pessoa:</p>
                <ul className="space-y-1">
                  {duplicates.map((d) => (
                    <li key={d.id}>
                      <Link to={`/clientes/${d.id}`} className="font-extrabold text-orange-deep underline">
                        {d.fullName}
                      </Link>{' '}
                      ({d.reason === 'phone' ? 'mesmo telefone' : 'mesmo nome'})
                    </li>
                  ))}
                </ul>
                <p className="text-sm">Se for a mesma pessoa em outro lugar, edite o cadastro dela e marque mais um estabelecimento.</p>
              </div>
            </div>
          )}

          <Controller
            control={control}
            name="establishmentIds"
            render={({ field }) => (
              <fieldset>
                <legend className="mb-1.5 text-base font-bold text-brown">Onde compra</legend>
                {places.length === 0 ? (
                  <p className="text-brown-soft">
                    Nenhum estabelecimento cadastrado.{' '}
                    <Link to="/estabelecimentos/novo" className="font-extrabold text-orange-deep underline">
                      Cadastrar
                    </Link>
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {places.map((p) => {
                      const selected = field.value.includes(p.id);
                      return (
                        <Chip
                          key={p.id}
                          selected={selected}
                          onClick={() => field.onChange(selected ? field.value.filter((v) => v !== p.id) : [...field.value, p.id])}
                        >
                          {p.name}
                        </Chip>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1.5 text-sm text-brown-soft">Pode marcar mais de um lugar.</p>
              </fieldset>
            )}
          />

          <TextAreaField
            label="Observações (opcional)"
            hint="Só você vê. Ex.: trabalha no caixa 2; paga às sextas."
            error={errors.notes?.message}
            {...register('notes')}
          />

          {existing && (
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
                  <Switch
                    label="Ativo"
                    description="Desativado, ele some da busca de vendas. Saldo e histórico continuam guardados."
                    checked={field.value}
                    onChange={field.onChange}
                  />
                </div>
              )}
            />
          )}

          {serverError && (
            <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
              {serverError}
            </p>
          )}
          <Button type="submit" block loading={save.isPending} className="min-h-14 text-lg">
            Salvar
          </Button>
        </form>
      </main>
    </>
  );
}
