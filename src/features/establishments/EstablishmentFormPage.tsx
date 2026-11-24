import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/Button';
import { Switch } from '@/components/Controls';
import { TextAreaField, TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { establishmentFormSchema, type EstablishmentForm } from '@/domain/registry';
import { errorMessage } from '@/lib/supabase/errors';
import type { Establishment } from '@/services/establishments';
import { useEstablishments, useSaveEstablishment } from '@/features/registry/queries';
import { useCurrentEstablishmentId } from './useCurrentEstablishment';

export function EstablishmentFormPage() {
  const { id } = useParams();
  const query = useEstablishments();
  if (!id) return <EstablishmentFormView />;
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const existing = query.data.find((e) => e.id === id);
  if (!existing) return <ErrorState message="Estabelecimento não encontrado." />;
  return <EstablishmentFormView existing={existing} />;
}

function EstablishmentFormView({ existing }: { existing?: Establishment }) {
  const navigate = useNavigate();
  const toast = useToast();
  const save = useSaveEstablishment();
  const [currentId, setCurrentId] = useCurrentEstablishmentId();
  // Id criado ao abrir a tela: dois toques em "Salvar" não criam dois lugares.
  const [newId] = useState(() => crypto.randomUUID());
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EstablishmentForm>({
    resolver: zodResolver(establishmentFormSchema),
    defaultValues: {
      name: existing?.name ?? '',
      nickname: existing?.nickname ?? '',
      address: existing?.address ?? '',
      notes: existing?.notes ?? '',
      isActive: existing?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (form) => {
    setServerError(null);
    const id = existing?.id ?? newId;
    try {
      await save.mutateAsync({ id, form, isNew: !existing });
    } catch (e) {
      setServerError(errorMessage(e));
      return;
    }
    if (!existing && !currentId) setCurrentId(id);
    if (existing && !form.isActive && currentId === id) setCurrentId(null);
    toast.show(existing ? 'Estabelecimento atualizado.' : 'Estabelecimento cadastrado.');
    navigate(`/estabelecimentos/${id}`, { replace: true });
  });

  return (
    <>
      <PageHeader title={existing ? 'Editar estabelecimento' : 'Novo estabelecimento'} back="/estabelecimentos" />
      <main className="mx-auto max-w-lg px-4 pt-2 pb-6">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <TextField label="Nome do lugar" placeholder="Ex.: Mercado Central" autoFocus={!existing} error={errors.name?.message} {...register('name')} />
          <TextField
            label="Apelido (opcional)"
            placeholder="Ex.: Mercado"
            hint="Um nome curto, se você costuma chamar assim."
            error={errors.nickname?.message}
            {...register('nickname')}
          />
          <TextField label="Endereço (opcional)" error={errors.address?.message} {...register('address')} />
          <TextAreaField
            label="Observações (opcional)"
            hint="Ex.: horário em que você passa lá."
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
                    description="Desativado, ele some da seleção de vendas. O histórico continua guardado."
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
