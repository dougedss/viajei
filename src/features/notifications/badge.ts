/**
 * Selo no ícone (Badging API, iOS 16.4+ e Chrome). Ao abrir e ao ficar visível, limpa; ao ir para
 * o plano de fundo durante a viagem, o número de pendências (paradas passadas sem resposta) ou 1
 * quando a próxima saída está a menos de 30 min. O servidor manda `app_badge` no push e o SW
 * aplica no Chrome (o Safari aplica sozinho). Sem suporte, nada acontece.
 */
export const BADGE_SOON_MINUTES = 30;

export type BadgeInput = {
  /** perguntas em aberto ("Vocês passaram por…") */
  pendingQuestions: number;
  leaveAt: Date | null;
  now: Date;
};

export function badgeCount({ pendingQuestions, leaveAt, now }: BadgeInput): number {
  if (pendingQuestions > 0) return pendingQuestions;
  if (!leaveAt) return 0;
  const minutes = (leaveAt.getTime() - now.getTime()) / 60_000;
  return minutes <= BADGE_SOON_MINUTES ? 1 : 0;
}

// a lib do TS declara a Badging API como obrigatória; nem todo navegador a tem
type BadgeNavigator = Partial<Pick<Navigator, 'setAppBadge' | 'clearAppBadge'>>;

export function badgeSupported(nav: Navigator = navigator): boolean {
  const b: BadgeNavigator = nav;
  return typeof b.setAppBadge === 'function';
}

export async function applyBadge(n: number, nav: Navigator = navigator): Promise<void> {
  const b: BadgeNavigator = nav;
  try {
    if (n <= 0) await b.clearAppBadge?.();
    else await b.setAppBadge?.(n);
  } catch {
    /* sem permissão ou sem suporte: o selo é um extra */
  }
}

export function clearBadge(nav: Navigator = navigator): Promise<void> {
  return applyBadge(0, nav);
}
