import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { authErrorMessage } from '@/lib/auth/errors.ts';
import { resetSchema, type ResetInput } from '@/lib/auth/schemas.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { AuthCard } from '../components/AuthCard.tsx';

export default function RecuperarSenhaPage() {
  const [sent, setSent] = useState(false);
  const form = useForm<ResetInput>({ resolver: zodResolver(resetSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ email }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nova-senha`,
    });
    if (error) {
      form.setError('root', { message: authErrorMessage(error) });
      return;
    }
    setSent(true);
  });

  return (
    <AuthCard
      title="Recuperar senha"
      subtitle="Mandamos um link para você escolher uma senha nova."
      footer={
        <Link
          to="/entrar"
          className="inline-flex min-h-12 items-center font-semibold text-accent-ink"
        >
          Voltar para entrar
        </Link>
      }
    >
      {sent ? (
        <div className="grid justify-items-center gap-3 text-center">
          <MailCheck className="size-12 text-on-time" aria-hidden="true" />
          <p className="text-ink-2">
            Se existir uma conta com este e-mail, o link já está a caminho. Abra-o neste celular.
          </p>
        </div>
      ) : (
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
          <TextField
            label="E-mail"
            type="email"
            autoComplete="email"
            inputMode="email"
            error={errors.email?.message}
            {...form.register('email')}
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
            Enviar link
          </Button>
        </form>
      )}
    </AuthCard>
  );
}
