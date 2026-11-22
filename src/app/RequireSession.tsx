import { Navigate, Outlet, useLocation } from 'react-router';
import { useFontsReady } from '@/lib/fonts.ts';
import { useSession } from '@/lib/supabase/session.ts';
import { Splash } from './Splash.tsx';

/**
 * Espera o getSession() do storage (sem rede) e manda para /entrar quem não tem sessão. Espera também
 * as fontes do app (fase 27, a 3.0): a tela de quem entrou só pinta texto com a Barlow no lugar, para
 * a troca de fonte não empurrar o que já estava na tela (a causa do CLS da `nova_viagem`, D281). Com o
 * teto de `loadFonts`, uma fonte que não vem não segura o app.
 */
export function RequireSession() {
  const { status } = useSession();
  const fonts = useFontsReady();
  const location = useLocation();
  if (status === 'loading' || (status === 'signed-in' && !fonts)) return <Splash />;
  if (status === 'signed-out') {
    return <Navigate to="/entrar" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}
