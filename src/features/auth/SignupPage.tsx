import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/Button';
import { TextField } from '@/components/Field';
import { supabase } from '@/lib/supabase/client';
import { errorMessage } from '@/lib/supabase/errors';
import { AuthLayout } from './AuthLayout';

const schema = z
  .object({
    displayName: z.string().trim().min(2, 'Informe seu nome.').max(80, 'Nome muito longo.'),
    email: z.string().trim().min(1, 'Informe o e-mail.').pipe(z.email('E-mail inválido.')),
    password: z.string().min(8, 'Use pelo menos 8 caracteres.').max(72, 'Senha muito longa.'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'As senhas não são iguais.' });
type Form = z.infer<typeof schema>;

export function SignupPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: { data: { display_name: values.displayName }, emailRedirectTo: window.location.origin },
    });
    if (error) {
      setServerError(errorMessage(error));
      return;
    }
    if (data.session) navigate('/', { replace: true });
    else setNeedsConfirmation(true);
  });

  if (needsConfirmation) {
    return (
      <AuthLayout title="Confirme seu e-mail">
        <p className="text-brown">Enviamos um link para o seu e-mail. Abra o link e depois entre no app.</p>
        <Link to="/entrar" className="mt-5 block text-center font-extrabold text-orange-deep">
          Ir para Entrar
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar conta">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField label="Seu nome" autoComplete="name" error={errors.displayName?.message} {...register('displayName')} />
        <TextField label="E-mail" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres."
          error={errors.password?.message}
          {...register('password')}
        />
        <TextField label="Confirme a senha" type="password" autoComplete="new-password" error={errors.confirm?.message} {...register('confirm')} />
        {serverError && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
            {serverError}
          </p>
        )}
        <Button type="submit" block loading={isSubmitting}>
          Criar conta
        </Button>
      </form>
      <p className="mt-5 text-center text-brown-soft">
        Já tem conta?{' '}
        <Link to="/entrar" className="font-extrabold text-orange-deep underline-offset-2 hover:underline">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
