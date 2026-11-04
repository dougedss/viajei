import { Navigate, Outlet, useLocation } from 'react-router';
import { Wordmark } from '@/components/ui/Wordmark.tsx';
import { useSession } from '@/lib/supabase/session.ts';

/** Telas de entrar, criar conta e senha. Quem já tem sessão volta para onde estava. */
export function AuthLayout() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'signed-in' && location.pathname !== '/nova-senha') {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? '/'} replace />;
  }
  return (
    <main className="min-h-full bg-[linear-gradient(180deg,var(--color-sky-a)_0%,var(--color-paper)_55%)] py-10 safe-x">
      <div className="mx-auto grid w-full max-w-[420px] gap-6">
        <header className="grid gap-1">
          <Wordmark className="text-[56px]" />
          <p className="text-[15px] text-ink-2">Seu roteiro de viagem, inteiro, mesmo sem sinal.</p>
        </header>
        <Outlet />
      </div>
    </main>
  );
}
