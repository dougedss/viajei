import {
  CAR_COLORS,
  CAR_FINISHES,
  CAR_MODELS,
  CAR_WHEELS,
  LEVELS,
  OWN_CAR,
  type CarColor,
  type CarFinish,
  type CarModel,
  type CarWheels,
} from '@shared/constants.ts';

/**
 * Nível a partir do XP, puro. O nível de cada pessoa sai da soma do próprio XP, e é ele que libera o
 * que vai no carro dela (fase 16). O do time é o maior entre os membros aceitos: a barra da viagem
 * mostra o XP de quem está mais adiante, sem nome: sem ranking, a equipe sobe junto.
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

/**
 * O que um nível libera na garagem (a escada da fase 16): as cores, os acabamentos e as rodas
 * daquele nível, e, no último, o seu carro (a fase 20). Os modelos são todos do nível 1.
 */
export type Unlocks = {
  models: CarModel[];
  colors: CarColor[];
  finishes: CarFinish[];
  wheels: CarWheels[];
  ownCar: boolean;
};

export function unlocksAt(level: number): Unlocks {
  const at = <K extends string>(table: Record<K, { level: number }>): K[] =>
    (Object.keys(table) as K[]).filter((k) => table[k].level === level);
  return {
    models: at(CAR_MODELS),
    colors: at(CAR_COLORS),
    finishes: at(CAR_FINISHES),
    wheels: at(CAR_WHEELS),
    ownCar: level === OWN_CAR.level,
  };
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

/** Os nomes do que um nível libera, com o artigo: "o metálico", "a roda de cinco raios", "o dourado". */
export function unlockNames(level: number): string[] {
  // o nível 1 é o começo: o que ele tem (os cinco carros, as sete cores, a tinta lisa e a roda
  // clássica) ninguém precisa liberar
  if (level <= 1) return [];
  const u = unlocksAt(level);
  return [
    ...u.models.map((m) => MODEL_NAME[m]),
    ...u.colors.map((c) => `o ${CAR_COLORS[c].label.toLocaleLowerCase('pt-BR')}`),
    ...u.finishes.map((f) => CAR_FINISHES[f].short),
    ...u.wheels.map((w) => CAR_WHEELS[w].short),
    ...(u.ownCar ? [`${OWN_CAR.short} de verdade, numa versão futura`] : []),
  ];
}

/** "que libera o metálico e a roda de cinco raios"; vazio quando o nível não libera nada. */
export function unlockPhrase(level: number): string {
  const names = unlockNames(level);
  return names.length > 0 ? `que libera ${joinPt(names)}` : '';
}

/**
 * A frase debaixo da barra. No Perfil (e na viagem de uma pessoa só), o que o próximo nível libera
 * no carro dela: "Mais 288 XP para Estradeiro, que libera o fosco e a roda de aço." No time, só o
 * nível ("Mais 126 XP e vocês viram Viajante."): o carro é de cada um e cada um libera pelo próprio
 * progresso (fase 16), então o nível do time não libera nada. No último nível, o que já foi
 * conquistado.
 */
export function levelPhrase(p: LevelProgress, who: 'team' | 'me', solo = false): string {
  if (!p.next) return who === 'team' && !solo ? 'Vocês chegaram ao último nível.' : 'Último nível.';
  if (who === 'team' && !solo) return `Mais ${p.toNext} XP e vocês viram ${p.next.name}.`;
  const unlock = unlockPhrase(p.next.level);
  const tail = unlock ? `, ${unlock}` : '';
  return `Mais ${p.toNext} XP para ${p.next.name}${tail}.`;
}
