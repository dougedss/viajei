import { looksLikeViajei } from '@/features/import/format.ts';
import type { IntakePath } from './start.ts';
import { isToday } from './today-rule.ts';

export { isToday };

/**
 * O campo da lista de viagens (fase 17): "Conte a viagem, cole o roteiro ou diga 'quero sair hoje'".
 * O que a pessoa escreve decide o caminho, sem perguntar qual é. Puro.
 *
 * 1. **O formato do Viajei** (`viajei/1`, ou o JSON do schema): lido no aparelho, sem IA, sem rede.
 * 2. **Um roteiro em texto livre** (WhatsApp, Notas): a importação da fase 10, que cria a viagem.
 * 3. **A saída de hoje** ("quero sair hoje", "agora", "bate e volta"): a conversa com a pergunta de
 *    alcance, e uma viagem de um dia, hoje.
 * 4. **A conversa**: uma descrição ou uma vontade ("Serra Gaúcha em dezembro, 4 dias"): até 3
 *    perguntas ditas antes, e o roteiro só com lugares conferidos no OSM.
 *
 * A régua do roteiro é a cara de roteiro: várias linhas com horários e datas, ou um texto longo. Uma
 * frase com uma data ("Serra Gaúcha, 11 a 14 de dezembro") é uma vontade, não um roteiro: a conversa
 * monta. Sem rede, só o formato segue; os outros esperam com o texto guardado.
 */
export type { IntakePath };
export type IntakeDecision =
  | { kind: 'empty' }
  | { kind: 'go'; path: IntakePath }
  /** sem rede, o caminho que precisa da IA espera: o texto fica no rascunho */
  | { kind: 'offline'; path: Exclude<IntakePath, 'format'> };

const plain = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

/** "7h", "13h30", "07:00", "às 9" não conta (sem o h); "8h da manhã" conta. */
const TIME = /(?:^|[^\d])(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)(?![\d])/g;
/** "11/12", "dia 13", "sexta", "1º dia", "primeiro dia", "segundo dia" */
const DATE =
  /\b\d{1,2}\/\d{1,2}\b|\bdia \d{1,2}\b|\b(?:segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:-feira)?\b|\b(?:primeiro|segundo|terceiro|quarto|quinto|\d+o) dia\b/g;
const count = (re: RegExp, s: string) => (s.match(re) ?? []).length;

/** O texto tem cara de roteiro: várias linhas com horários e datas, ou um texto longo de várias linhas. */
export function looksLikeItinerary(text: string): boolean {
  const s = plain(text);
  const lines = s.split('\n').filter((l) => l.trim() !== '').length;
  const times = count(TIME, s);
  const dates = count(DATE, s);
  if (lines >= 4 && (times >= 2 || (times >= 1 && dates >= 1))) return true;
  // um esqueleto de dias ("Dia 1: Gramado", "Sábado: Canela"…), uma data por linha, também é roteiro
  if (lines >= 3 && dates >= 3) return true;
  return s.length > 600 && lines >= 3;
}

export function decideIntake(text: string, online: boolean): IntakeDecision {
  if (text.trim() === '') return { kind: 'empty' };
  if (looksLikeViajei(text)) return { kind: 'go', path: 'format' };
  const path: Exclude<IntakePath, 'format'> = looksLikeItinerary(text)
    ? 'itinerary'
    : isToday(text)
      ? 'today'
      : 'conversation';
  return online ? { kind: 'go', path } : { kind: 'offline', path };
}
