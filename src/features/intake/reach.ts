// caminhos relativos: a medição do laboratório (`scripts/lab`) roda este módulo sem os atalhos
import type { PlanQuestion, Reach } from '../../../supabase/functions/_shared/plan-protocol.ts';
import { radiusForHours } from './search.ts';

/**
 * O alcance, numa regra só (fase 25, D273): quanto tempo a pessoa tem, lido da resposta à pergunta do
 * app ("Quanto tempo vocês têm?") ou da IA ("Até quanto tempo de carro?"), e o raio da busca que sai
 * disso. Até a fase 24 duas funções liam a mesma resposta com regras diferentes (`reachOfAnswer` em
 * `flow.ts` e `reachOf` em `today.ts`, que mandava "2h" e "duas horas" para a manhã) e havia dois raios
 * padrão. A resposta que não vira tempo nem parte do dia é **não entendida**: a tela pergunta de novo
 * (D274), nunca cai num raio padrão em silêncio.
 */

/** A parte do dia que a pessoa tem: o que o app oferece na saída de hoje, pela hora de agora. */
export type Span = 'morning' | 'afternoon' | 'evening' | 'day' | 'overnight';

export type ReachAnswer = {
  /** a parte do dia, quando a resposta a diz ("a manhã", "só a tarde", "até amanhã") */
  span: Span | null;
  /** as horas de carro, quando a resposta as diz ("1h30", "2 horas", "1:30 no máximo") */
  hours: number | null;
};

const plain = (s: string) =>
  s
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');

const WORDS: Readonly<Record<string, number>> = { uma: 1, duas: 2, tres: 3, quatro: 4, cinco: 5 };
const numberOf = (s: string | undefined): number | null => {
  if (s === undefined) return null;
  const t = s.trim();
  if (t === '') return null;
  if (t === 'meia') return 0.5;
  return WORDS[t] ?? Number(t.replace(',', '.'));
};
const hoursIfSane = (h: number): number | null =>
  Number.isFinite(h) && h > 0 && h <= 24 ? Math.round(h * 100) / 100 : null;

/**
 * "2 horas", "1h30", "1:30 no máximo", "hora e meia", "uma hora e meia", "1 hora e 30 minutos",
 * "90 min", "meia hora": o alcance em horas; null quando não é um tempo. A tabela da ideia de 20/11 é a
 * especificação (cada linha é um caso do teste). O que a versão de antes perdia: o formato `h:mm`; "e
 * meia" depois de "hora"; "hora e meia" sem número; e a alternativa `h` da expressão casava a primeira
 * letra de "hora" antes de "horas", e os minutos de "1 hora e 30" se perdiam.
 */
export function hoursOf(answer: string): number | null {
  const s = plain(answer);
  // 1:30, 1:30 no máximo (dois dígitos nos minutos: "1:3O", com a letra O, não é um tempo)
  const hm = /(?<!\d)(\d{1,2}):(\d{2})(?!\d)/.exec(s);
  if (hm) {
    const m = Number(hm[2]);
    return m < 60 ? hoursIfSane(Number(hm[1]) + m / 60) : null;
  }
  // hora e meia, uma hora e meia, 1 hora e meia, 1h e meia, duas horas e meia
  const half = /(?:(\d+(?:[.,]\d+)?|uma|duas|tres|quatro|cinco)\s*)?(?:horas?|h)\s*e\s*meia\b/.exec(
    s,
  );
  if (half) return hoursIfSane((numberOf(half[1]) ?? 1) + 0.5);
  // 2 horas, 1h30, 1 h 30, 1 hora e 30 minutos, 1,5 hora, 1.5h, umas 2h, até 2 horas
  const h =
    /(\d+(?:[.,]\d+)?)\s*(?:horas?|h)(?![a-z])\s*(?:e\s*)?(\d{1,2})?\s*(?:min(?:utos?)?)?/.exec(s);
  if (h) return hoursIfSane((numberOf(h[1]) ?? 0) + Number(h[2] ?? 0) / 60);
  // 90 min, uns 40 minutos
  const min = /(\d+)\s*min(?:utos?)?\b/.exec(s);
  if (min) return hoursIfSane(Number(min[1]) / 60);
  // duas horas, tres horas
  const words = /\b(uma|duas|tres|quatro|cinco)\s*(?:horas?|h)\b/.exec(s);
  if (words) return hoursIfSane(numberOf(words[1]) ?? 0);
  if (/\bmeia hora\b/.test(s)) return 0.5;
  return null;
}

/**
 * A parte do dia, pela opção do app ou pelas palavras da pessoa: "até amanhã" e "dormir fora" são
 * uma noite fora; "o dia" e "até a noite" são o dia; "hoje à noite" é a noite; "a tarde" é a tarde;
 * "a manhã", "antes do almoço" e "cedo" são a manhã. Null quando a resposta não diz.
 */
export function spanOf(answer: string): Span | null {
  const s = plain(answer);
  if (/amanha|dormir|noite fora|pernoit|fim de semana|duas noites/.test(s)) return 'overnight';
  if (/ate a noite|o dia todo|o dia inteiro|\bo dia\b|dia todo|dia inteiro/.test(s)) return 'day';
  if (/\bnoite\b|\bjantar\b/.test(s)) return 'evening';
  if (/\btarde\b/.test(s)) return 'afternoon';
  if (/manha|almoco|cedo|\bpouco\b/.test(s)) return 'morning';
  return null;
}

/** A resposta de alcance lida inteira; **null quando não foi entendida** (nem tempo, nem parte do dia). */
export function readReach(answer: string): ReachAnswer | null {
  const hours = hoursOf(answer);
  const span = spanOf(answer);
  return hours === null && span === null ? null : { span, hours };
}

/**
 * O alcance como a IA e o protocolo o conhecem (`Reach`, três valores: o schema não muda nesta fase).
 * A tarde e a noite são "o dia" (volta-se hoje); só as horas de carro também: a resposta inteira vai
 * junto, em `<perguntas>`, para a IA ler o que a pessoa disse.
 */
export function reachOf(read: ReachAnswer | null): Reach {
  switch (read?.span) {
    case 'morning':
      return 'morning';
    case 'overnight':
      return 'overnight';
    default:
      return 'day';
  }
}

/** A parte do dia que uma `Reach` da IA quer dizer (a intenção lida do pedido). */
export function spanOfReach(reach: Reach | null): Span | null {
  return reach;
}

/**
 * O raio da busca, em km, numa regra só (a D207 e a D228 juntas): as horas de carro ditas valem pela
 * mesma estimativa dos cartões; senão a parte do dia (meio dia de passeio, 50 km de ida, cerca de
 * 1 h; o dia, 120; uma noite fora, 220); senão o padrão (200 numa viagem, 120 numa saída de hoje).
 * Com uma área dita ("em Pomerode"), quem decide é `AREA_RADIUS_KM`, não isto.
 */
export function radiusFor(kind: 'plan' | 'today', read: ReachAnswer | null): number {
  if (read?.hours) return radiusForHours(read.hours);
  switch (read?.span) {
    case 'morning':
    case 'afternoon':
    case 'evening':
      return 50;
    case 'day':
      return 120;
    case 'overnight':
      return 220;
    default:
      return kind === 'plan' ? 200 : 120;
  }
}

// --------------------------------------------------------------- a pergunta de alcance do app
export const REACH_QUESTION_TEXT = 'Quanto tempo vocês têm?';

/**
 * As opções da saída de hoje pela hora de agora (D275): o que ainda cabe no dia. Antes das 11h, a
 * manhã, o dia ou até amanhã; das 11h às 17h, a tarde, até a noite ou até amanhã; depois, hoje à
 * noite ou até amanhã. A regra de leitura (`spanOf`) entende todas.
 */
export function reachOptions(time: string): string[] {
  const hour = Number(time.split(':')[0] ?? '0');
  if (hour < 11) return ['A manhã', 'O dia', 'Até amanhã'];
  if (hour < 17) return ['A tarde', 'Até a noite', 'Até amanhã'];
  return ['Hoje à noite', 'Até amanhã'];
}

export function reachQuestion(time: string): PlanQuestion {
  return { text: REACH_QUESTION_TEXT, options: reachOptions(time), topic: 'reach' };
}

/** A pergunta é de alcance: a do app, ou a da IA com o assunto `reach`. */
export function isReachQuestion(q: Pick<PlanQuestion, 'text' | 'topic'>): boolean {
  return q.topic === 'reach' || q.text === REACH_QUESTION_TEXT;
}

/** O que a tela diz quando não entendeu o tempo (D274). */
export const UNREAD_REACH_HINT =
  'Não entendi quanto tempo: diga em horas (1 hora, 1h30, 2 horas) ou escolha uma opção.';

/**
 * A primeira pergunta de alcance cuja resposta livre não foi entendida (D274): uma opção escolhida é
 * sempre entendida; a resposta em branco não é resposta (quem a cobra é `canPlan`). Null quando tudo
 * o que foi respondido se entende.
 */
export function unreadReach(
  questions: readonly Pick<PlanQuestion, 'text' | 'topic' | 'options'>[],
  answers: readonly string[],
): number | null {
  for (const [i, q] of questions.entries()) {
    const a = (answers[i] ?? '').trim();
    if (a === '' || !isReachQuestion(q) || q.options.includes(a)) continue;
    if (readReach(a) === null) return i;
  }
  return null;
}
