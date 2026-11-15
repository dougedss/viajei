/**
 * O que o campo da lista manda para `/viagens/nova` (fase 17), pelo estado da navegação: qual leitura
 * começar. A tela começa uma vez por entrada do histórico e tira o sinal logo depois, para recarregar
 * não ler de novo (uma leitura gasta cota). E o caminho de volta: a lista com o campo em foco.
 */
export const INTAKE_PATH = '/viagens/nova';

/** O rótulo do campo da lista (e o nome dele para os testes). */
export const INTAKE_LABEL = "Conte a viagem, cole o roteiro ou diga 'quero sair hoje'";

/** Os caminhos do campo (`decide.ts`). Aqui, sem dependência: os testes de ponta a ponta importam. */
export type IntakePath = 'format' | 'itinerary' | 'today' | 'conversation';

export type IntakeStart = { start: Exclude<IntakePath, 'format'> };
export type IntakeBack = { focusIntake: true };

const PATHS: readonly string[] = ['itinerary', 'today', 'conversation'];

export function startOf(state: unknown): IntakeStart['start'] | null {
  if (typeof state !== 'object' || state === null || !('start' in state)) return null;
  const { start } = state;
  return typeof start === 'string' && PATHS.includes(start)
    ? (start as IntakeStart['start'])
    : null;
}

export function wantsFocus(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { focusIntake?: unknown }).focusIntake === true
  );
}
