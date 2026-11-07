import { CAR_COLORS, CAR_MODELS, LEVELS, type CarColor, type CarModel } from '@shared/constants.ts';

/**
 * Nível a partir do XP, puro. O nível de cada pessoa sai da soma do próprio XP; o do time (o que o
 * carro usa) é o maior entre os membros aceitos, e a barra da viagem mostra o XP de quem está mais
 * adiante, sem nome: sem ranking, a equipe sobe junto.
 */
export type LevelInfo = (typeof LEVELS)[number];

export function levelOf(xp: number): LevelInfo {
  let current: LevelInfo = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) current = l;
  return current;
}

export type LevelProgress = {
  level: LevelInfo;
  xp: number;
  /** o próximo nível, ou null no último */
  next: LevelInfo | null;
  /** quanto do caminho até o próximo nível (0 a 1); 1 no último */
  fraction: number;
  /** XP que falta para o próximo nível */
  toNext: number;
};

export function levelProgress(xp: number): LevelProgress {
  const level = levelOf(xp);
  const next = LEVELS.find((l) => l.level === level.level + 1) ?? null;
  if (!next) return { level, xp, next: null, fraction: 1, toNext: 0 };
  const span = next.xp - level.xp;
  return {
    level,
    xp,
    next,
    fraction: Math.min(1, Math.max(0, (xp - level.xp) / span)),
    toNext: next.xp - xp,
  };
}

/** O que um nível libera na garagem: os modelos e as cores daquele nível. */
export function unlocksAt(level: number): { models: CarModel[]; colors: CarColor[] } {
  const models = (Object.keys(CAR_MODELS) as CarModel[]).filter(
    (m) => CAR_MODELS[m].level === level,
  );
  const colors = (Object.keys(CAR_COLORS) as CarColor[]).filter(
    (c) => CAR_COLORS[c].level === level,
  );
  return { models, colors };
}

/** Com o artigo, como se fala: "o sedã", "o SUV", "a picape". */
const MODEL_NAME: Record<CarModel, string> = {
  hatch: 'o hatch',
  sedan: 'o sedã',
  suv: 'o SUV',
  pickup: 'a picape',
  kombi: 'a kombi',
};

export function modelName(model: CarModel): string {
  return MODEL_NAME[model];
}

function joinPt(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1] ?? ''}`;
}

/** "que libera o sedã", "que libera a kombi e o dourado"; vazio quando o nível não libera nada. */
export function unlockPhrase(level: number): string {
  // o nível 1 é o começo: o que ele tem (o hatch, as sete cores) ninguém precisa liberar
  if (level <= 1) return '';
  const { models, colors } = unlocksAt(level);
  const names = [
    ...models.map((m) => MODEL_NAME[m]),
    ...colors.map((c) => `o ${CAR_COLORS[c].label.toLocaleLowerCase('pt-BR')}`),
  ];
  return names.length > 0 ? `que libera ${joinPt(names)}` : '';
}

/**
 * A frase debaixo da barra: "Mais 126 XP e vocês viram Viajante, que libera o sedã." No time,
 * "vocês"; no Perfil, a pessoa ("Mais 288 XP para Estradeiro, que libera a picape."). No último
 * nível, o que já foi conquistado.
 */
export function levelPhrase(p: LevelProgress, who: 'team' | 'me', solo = false): string {
  if (!p.next) return who === 'team' && !solo ? 'Vocês chegaram ao último nível.' : 'Último nível.';
  const unlock = unlockPhrase(p.next.level);
  const tail = unlock ? `, ${unlock}` : '';
  if (who === 'team' && !solo) return `Mais ${p.toNext} XP e vocês viram ${p.next.name}${tail}.`;
  return `Mais ${p.toNext} XP para ${p.next.name}${tail}.`;
}
