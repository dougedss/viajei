import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { authErrorMessage } from '@/lib/auth/errors.ts';
import { signInSchema, type SignInInput } from '@/lib/auth/schemas.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { AuthCard } from '../components/AuthCard.tsx';

export default function EntrarPage() {
  const form = useForm<SignInInput>({ resolver: zodResolver(signInSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    const { error } = await supabase.auth.signInWithPassword(values);
    if (error) form.setError('root', { message: authErrorMessage(error) });
    // com sucesso, o AuthLayout percebe a sessão e redireciona
  });

  return (
    <AuthCard
      title="Entrar"
      footer={
        <>
          <Link to="/recuperar-senha" className="font-semibold text-accent-ink">
            Esqueci a senha
          </Link>
          <span className="text-ink-2">
            Primeira vez aqui?{' '}
            <Link to="/criar-conta" className="font-semibold text-accent-ink">
              Criar conta
            </Link>
          </span>
        </>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          inputMode="email"
          error={errors.email?.message}
          {...form.register('email')}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register('password')}
        />
        {errors.root?.message ? (
          <p
            role="alert"
            className="rounded-field bg-late/10 px-4 py-3 text-[15px] font-semibold text-late-ink"
          >
            {errors.root.message}
          </p>
        ) : null}
        <Button type="submit" loading={isSubmitting}>
          Entrar
        </Button>
      </form>
    </AuthCard>
  );
}
