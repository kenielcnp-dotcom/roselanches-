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

const schema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail.').pipe(z.email('E-mail inválido.')),
  password: z.string().min(1, 'Informe a senha.'),
});
type Form = z.infer<typeof schema>;

export function LoginPage() {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: values.email, password: values.password });
    if (error) {
      setServerError(errorMessage(error));
      return;
    }
    navigate('/', { replace: true });
  });

  return (
    <AuthLayout title="Entrar">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField label="E-mail" type="email" autoComplete="email" inputMode="email" error={errors.email?.message} {...register('email')} />
        <TextField label="Senha" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
        {serverError && (
          <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 font-semibold text-danger">
            {serverError}
          </p>
        )}
        <Button type="submit" block loading={isSubmitting}>
          Entrar
        </Button>
      </form>
      <p className="mt-5 text-center text-brown-soft">
        Ainda não tem conta?{' '}
        <Link to="/criar-conta" className="font-extrabold text-orange-deep underline-offset-2 hover:underline">
          Criar conta
        </Link>
      </p>
      <p className="mt-3 text-center text-sm text-brown-soft">Cliente? Abra o link de convite que a Rose mandou para você.</p>
    </AuthLayout>
  );
}
