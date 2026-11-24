import { useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/Button';
import { MoneyField, Switch } from '@/components/Controls';
import { TextField } from '@/components/Field';
import { PageHeader } from '@/components/PageHeader';
import { ErrorState, LoadingState } from '@/components/States';
import { useToast } from '@/components/Toast';
import { productFormSchema, type ProductForm } from '@/domain/registry';
import { errorMessage } from '@/lib/supabase/errors';
import type { Product } from '@/services/products';
import { useProducts, useSaveProduct } from '@/features/registry/queries';

export function ProductFormPage() {
  const { id } = useParams();
  const query = useProducts();
  if (query.isPending) return <LoadingState />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  const existing = id ? query.data.find((p) => p.id === id) : undefined;
  if (id && !existing) return <ErrorState message="Produto não encontrado." />;
  const categories = [...new Set(query.data.map((p) => p.category).filter((c): c is string => !!c))].sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  );
  return <ProductFormView existing={existing} categories={categories} />;
}

function ProductFormView({ existing, categories }: { existing: Product | undefined; categories: string[] }) {
  const navigate = useNavigate();
  const toast = useToast();
  const save = useSaveProduct();
  const [newId] = useState(() => crypto.randomUUID());
  const listId = useId();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: existing?.name ?? '',
      priceCents: existing?.priceCents ?? 0,
      category: existing?.category ?? '',
      isActive: existing?.isActive ?? true,
    },
  });

  const onSubmit = handleSubmit(async (form) => {
    setServerError(null);
    try {
      await save.mutateAsync({ id: existing?.id ?? newId, form, isNew: !existing });
    } catch (e) {
      setServerError(errorMessage(e));
      return;
    }
    toast.show(existing ? 'Produto atualizado.' : 'Produto cadastrado.');
    navigate('/produtos', { replace: true });
  });

  return (
    <>
      <PageHeader title={existing ? 'Editar produto' : 'Novo produto'} back="/produtos" />
      <main className="mx-auto max-w-lg px-4 pt-2 pb-6">
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <TextField label="Nome" placeholder="Ex.: Coxinha" autoFocus={!existing} error={errors.name?.message} {...register('name')} />
          <Controller
            control={control}
            name="priceCents"
            render={({ field }) => (
              <MoneyField
                label="Preço"
                valueCents={field.value}
                onChange={field.onChange}
                error={errors.priceCents?.message}
                hint={existing ? 'Mudar o preço não altera vendas já registradas.' : 'Digite só os números: 650 vira R$ 6,50.'}
              />
            )}
          />
          <TextField
            label="Categoria (opcional)"
            placeholder="Ex.: Salgados, Bebidas"
            list={listId}
            autoComplete="off"
            error={errors.category?.message}
            {...register('category')}
          />
          <datalist id={listId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {existing && (
            <Controller
              control={control}
              name="isActive"
              render={({ field }) => (
                <div className="rounded-2xl bg-white p-4 ring-1 ring-line">
                  <Switch
                    label="À venda"
                    description="Desativado, ele some da tela de vendas. Vendas antigas continuam iguais."
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
