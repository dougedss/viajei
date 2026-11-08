import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { authErrorMessage } from '@/lib/auth/errors.ts';
import { signUpSchema, type SignUpInput } from '@/lib/auth/schemas.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { AuthCard } from '../components/AuthCard.tsx';

export default function CriarContaPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm<SignUpInput>({ resolver: zodResolver(signUpSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ name, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name }, emailRedirectTo: `${window.location.origin}/entrar` },
    });
    if (error) {
      form.setError('root', { message: authErrorMessage(error) });
      return;
    }
    // sem sessão = confirmação por e-mail pendente (ou e-mail já cadastrado: a resposta é a mesma, de propósito)
    if (!data.session) setSentTo(email);
  });

  if (sentTo) {
    return (
      <AuthCard title="Confira seu e-mail">
        <div className="grid justify-items-center gap-3 text-center">
          <MailCheck className="size-12 text-on-time" aria-hidden="true" />
          <p className="text-ink-2">
            Enviamos um link de confirmação para <b className="text-ink">{sentTo}</b>. Abra-o neste
            celular para entrar.
          </p>
          <Link
            to="/entrar"
            className="inline-flex min-h-12 items-center font-semibold text-accent-ink"
          >
            Voltar para entrar
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Criar conta"
      subtitle="Seu nome aparece para quem viaja com você."
      footer={
        <span className="text-ink-2">
          Já tem conta?{' '}
          <Link to="/entrar" className="font-semibold text-accent-ink">
            Entrar
          </Link>
        </span>
      }
    >
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
        <TextField
          label="Nome"
          autoComplete="name"
          error={errors.name?.message}
          {...form.register('name')}
        />
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
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres."
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
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}
