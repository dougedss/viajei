import { Navigate, Outlet, useLocation } from 'react-router';
import { useSession } from '@/lib/supabase/session.ts';
import { Splash } from './Splash.tsx';

/** Espera o getSession() do storage (sem rede) e manda para /entrar quem não tem sessão. */
export function RequireSession() {
  const { status } = useSession();
  const location = useLocation();
  if (status === 'loading') return <Splash />;
  if (status === 'signed-out') {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
