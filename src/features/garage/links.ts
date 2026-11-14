import { useLocation } from 'react-router';

/**
 * A garagem é do perfil (fase 16): `/perfil/garagem`. Quem leva até lá diz de onde a pessoa veio
 * (`state.back`), e o "voltar" da garagem a devolve para lá: a visão geral da viagem, o perfil, o
 * cartão de desbloqueio. Sem isso, volta ao perfil.
 */
export const GARAGE_PATH = '/perfil/garagem';

export type GarageState = { back?: string };

/** O destino do "voltar": só um caminho do próprio app ("/…", nunca "//outro-site"). */
export function garageBack(state: unknown): string {
  const back = (state as GarageState | null)?.back;
  return typeof back === 'string' && back.startsWith('/') && !back.startsWith('//')
    ? back
    : '/perfil';
}

/** O link para a garagem a partir da tela de agora: `to` e `state` para o `Link`. */
export function useGarageLink(): { to: string; state: GarageState } {
  const { pathname, search } = useLocation();
  return { to: GARAGE_PATH, state: { back: `${pathname}${search}` } };
}
