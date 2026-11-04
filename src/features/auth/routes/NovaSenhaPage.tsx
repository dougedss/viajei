import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button.tsx';
import { TextField } from '@/components/ui/TextField.tsx';
import { useToast } from '@/components/ui/toast-context.ts';
import { authErrorMessage } from '@/lib/auth/errors.ts';
import { newPasswordSchema, type NewPasswordInput } from '@/lib/auth/schemas.ts';
import { supabase } from '@/lib/supabase/client.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { AuthCard } from '../components/AuthCard.tsx';

/** Destino do link de recuperação: o supabase-js lê o token da URL e abre uma sessão só para trocar a senha. */
export default function NovaSenhaPage() {
  const { status } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const form = useForm<NewPasswordInput>({ resolver: zodResolver(newPasswordSchema) });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async ({ password }) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      form.setError('root', { message: authErrorMessage(error) });
      return;
    }
    toast.show({ title: 'Senha trocada', kind: 'ok' });
    void navigate('/', { replace: true });
  });

  if (status === 'signed-out') {
    return (
      <AuthCard
        title="Link inválido ou expirado"
        subtitle="Abra o link mais recente do e-mail de recuperação, neste mesmo celular."
      >
        <Link to="/recuperar-senha" className="font-semibold text-accent-ink">
          Pedir um link novo
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Nova senha">
      <form onSubmit={(e) => void onSubmit(e)} noValidate className="grid gap-4">
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          hint="Pelo menos 8 caracteres."
          error={errors.password?.message}
          {...form.register('password')}
        />
        <TextField
          label="Repita a senha"
          type="password"
          autoComplete="new-password"
          error={errors.confirm?.message}
          {...form.register('confirm')}
        />
        {errors.root?.message ? (
          <p
            role="alert"
            className="rounded-field bg-late/10 px-4 py-3 text-[15px] font-semibold text-late-ink"
          >
            {errors.root.message}
          </p>
        ) : null}
        <Button type="submit" loading={isSubmitting || status === 'loading'}>
          Salvar senha
        </Button>
      </form>
    </AuthCard>
  );
}
