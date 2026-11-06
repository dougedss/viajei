import {
  CAR_ACCESSORIES,
  CAR_COLORS,
  CAR_MODELS,
  CAR_STICKER_MAX,
  type AchievementKey,
  type CarAccessoryKey,
  type CarColor,
  type CarModel,
} from '@shared/constants.ts';
import { joinPt } from '@/art/cars/describe.ts';
import {
  isLaneItem,
  isStickerKey,
  knownKeys,
  placeAccessories,
  type LaneItem,
} from '@/art/cars/placement.ts';
import { PROFILES } from '@/art/cars/profiles/index.ts';
import type { CarSpec } from '@/art/cars/types.ts';
import { levelName, type TeamProgress } from '@/features/progression/team.ts';
import type { Trip } from '@/lib/db/schema.ts';

/**
 * As regras da garagem, puras. O que está liberado vem do progresso do time; o que a viagem já usa
 * e o progresso de agora não libera (um membro saiu, por exemplo) continua (`kept`), só não volta a
 * ser escolhido depois de trocado. Tocar em algo bloqueado nunca grava: o palco mostra a prévia com
 * a frase do que falta. A regra é uma só: o palco é o carro da viagem sempre que tudo nele está
 * liberado; se algo bloqueado entra, é prévia.
 */
export type Need = { level: number } | { achievement: AchievementKey };

export type ItemState =
  { status: 'available' } | { status: 'kept' } | { status: 'locked'; need: Need; hint: string };

const AVAILABLE: ItemState = { status: 'available' };
const KEPT: ItemState = { status: 'kept' };

export function isUnlocked(state: ItemState): boolean {
  return state.status !== 'locked';
}

// ------------------------------------------------------------------ o que falta
export function modelHint(model: CarModel): string {
  const { label, level } = CAR_MODELS[model];
  return `${label}: no nível ${level} (${levelName(level)})`;
}

export function colorHint(color: CarColor): string {
  const { label, level } = CAR_COLORS[color];
  return `${label}: no nível ${level} (${levelName(level)})`;
}

export function accessoryHint(key: CarAccessoryKey): string {
  const def = CAR_ACCESSORIES[key];
  return `${def.label}: ${def.hint}`;
}

// ------------------------------------------------------------------ estados
export function modelState(model: CarModel, progress: TeamProgress, trip: CarSpec): ItemState {
  const level = CAR_MODELS[model].level;
  if (progress.level >= level) return AVAILABLE;
  if (trip.model === model) return KEPT;
  return { status: 'locked', need: { level }, hint: modelHint(model) };
}

export function colorState(color: CarColor, progress: TeamProgress, trip: CarSpec): ItemState {
  const level = CAR_COLORS[color].level;
  if (progress.level >= level) return AVAILABLE;
  if (trip.color === color) return KEPT;
  return { status: 'locked', need: { level }, hint: colorHint(color) };
}

export function accessoryState(
  key: CarAccessoryKey,
  progress: TeamProgress,
  trip: CarSpec,
): ItemState {
  const achievement = CAR_ACCESSORIES[key].achievement;
  if (progress.achievements.has(achievement)) return AVAILABLE;
  if (trip.accessories.includes(key)) return KEPT;
  return { status: 'locked', need: { achievement }, hint: accessoryHint(key) };
}

// ------------------------------------------------------------------ a leitura da viagem
type TripCar = Pick<Trip, 'name' | 'car_model' | 'car_color' | 'car_accessories'>;

function isModel(v: string): v is CarModel {
  return Object.hasOwn(CAR_MODELS, v);
}
function isColor(v: string): v is CarColor {
  return Object.hasOwn(CAR_COLORS, v);
}

/**
 * A viagem como carro desenhável, sem nunca quebrar a cena: modelo e cor inválidos voltam ao hatch
 * Pôr do sol; chaves desconhecidas saem; havendo item de teto, o rack aparece; o que passa das
 * faixas do teto ou dos 3 adesivos sai, pela ordem (dado velho, ou duas colunas gravadas por
 * aparelhos diferentes ao mesmo tempo). Só lê: a próxima escolha na garagem grava o que se vê.
 */
export function normalizeCar(trip: TripCar): CarSpec {
  const model = isModel(trip.car_model) ? trip.car_model : 'hatch';
  const color = isColor(trip.car_color) ? trip.car_color : 'sunset';
  let keys = knownKeys(Array.isArray(trip.car_accessories) ? trip.car_accessories : []);
  if (keys.some(isLaneItem) && !keys.includes('rack')) keys = ['rack', ...keys];
  const { overflow } = placeAccessories(PROFILES[model], keys);
  keys = keys.filter((k) => !overflow.includes(k));
  return { model, color, accessories: keys, plate: trip.name };
}

// ------------------------------------------------------------------ estrutura: teto e adesivos
const ROOF_NAMES: Record<LaneItem, string> = {
  bike: 'a bicicleta',
  board: 'a prancha',
  box: 'a mala',
};

function joinOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ou ${items[items.length - 1] ?? ''}`;
}

function capitalize(s: string): string {
  return s.charAt(0).toLocaleUpperCase('pt-BR') + s.slice(1);
}

export function roofLanes(model: CarModel): number {
  return PROFILES[model].anchors.roof.lanes.length;
}

export type ToggleResult = { car: CarSpec } | { refuse: string };

/**
 * Liga ou desliga um acessório, só pela estrutura do carro: ligar um item de teto liga o rack;
 * desligar o rack desliga o que depende dele; o teto tem as faixas do modelo e cabem 3 adesivos.
 * O que não cabe é recusado com a explicação. Se o item está liberado, quem decide é `decide`.
 */
export function toggleAccessory(car: CarSpec, key: CarAccessoryKey): ToggleResult {
  const current = car.accessories;
  if (current.includes(key)) {
    const dependsOnIt = (k: CarAccessoryKey) =>
      (CAR_ACCESSORIES[k].requires as readonly string[]).includes(key);
    return {
      car: { ...car, accessories: current.filter((k) => k !== key && !dependsOnIt(k)) },
    };
  }
  if (isLaneItem(key)) {
    const used = current.filter(isLaneItem);
    const lanes = roofLanes(car.model);
    if (used.length >= lanes) {
      return {
        refuse: `No teto do ${CAR_MODELS[car.model].label} cabem ${lanes} itens: tire ${joinOr(used.map((k) => ROOF_NAMES[k]))} para pôr ${ROOF_NAMES[key]}.`,
      };
    }
  }
  if (isStickerKey(key) && current.filter(isStickerKey).length >= CAR_STICKER_MAX) {
    return { refuse: `Cabem ${CAR_STICKER_MAX} adesivos: tire um para pôr este.` };
  }
  const requires = (CAR_ACCESSORIES[key].requires as readonly string[]).filter(
    (r): r is CarAccessoryKey => !current.includes(r as CarAccessoryKey),
  );
  return { car: { ...car, accessories: [...current, ...requires, key] } };
}

/** Troca o modelo e reencaixa o teto: o que não cabe nas faixas do novo sai (os últimos escolhidos). */
export function fitToModel(
  car: CarSpec,
  model: CarModel,
): { car: CarSpec; dropped: CarAccessoryKey[] } {
  const lanes = roofLanes(model);
  const dropped: CarAccessoryKey[] = car.accessories.filter(isLaneItem).slice(lanes);
  return {
    car: { ...car, model, accessories: car.accessories.filter((k) => !dropped.includes(k)) },
    dropped,
  };
}

/** "A prancha saiu: no teto do Sedã cabem 2 itens." */
export function droppedMessage(dropped: readonly CarAccessoryKey[], model: CarModel): string {
  const names = dropped.filter(isLaneItem).map((k) => ROOF_NAMES[k]);
  const verb = names.length > 1 ? 'saíram' : 'saiu';
  return `${capitalize(joinPt(names))} ${verb}: no teto do ${CAR_MODELS[model].label} cabem ${roofLanes(model)} itens.`;
}

// ------------------------------------------------------------------ a decisão de um toque
export type Tap =
  | { kind: 'model'; model: CarModel }
  | { kind: 'color'; color: CarColor }
  | { kind: 'accessory'; key: CarAccessoryKey };

export type TripCarPatch = Partial<Pick<Trip, 'car_model' | 'car_color' | 'car_accessories'>>;

export type Outcome =
  | { kind: 'trip'; car: CarSpec; patch: TripCarPatch; dropped: CarAccessoryKey[] }
  | { kind: 'preview'; car: CarSpec; hints: string[]; dropped: CarAccessoryKey[] }
  | { kind: 'refuse'; reason: string };

/** As frases do que falta para tudo o que está no carro e o progresso não libera. */
export function lockedHints(car: CarSpec, trip: CarSpec, progress: TeamProgress): string[] {
  const hints: string[] = [];
  const m = modelState(car.model, progress, trip);
  if (m.status === 'locked') hints.push(m.hint);
  const c = colorState(car.color, progress, trip);
  if (c.status === 'locked') hints.push(c.hint);
  for (const k of car.accessories) {
    const a = accessoryState(k, progress, trip);
    if (a.status === 'locked') hints.push(a.hint);
  }
  return hints;
}

/** Só as colunas que mudaram: a outbox funde toques seguidos na mesma coluna. */
export function patchFor(trip: CarSpec, next: CarSpec): TripCarPatch {
  const patch: TripCarPatch = {};
  if (trip.model !== next.model) patch.car_model = next.model;
  if (trip.color !== next.color) patch.car_color = next.color;
  if (trip.accessories.join(',') !== next.accessories.join(',')) {
    patch.car_accessories = [...next.accessories];
  }
  return patch;
}

/**
 * Um toque na garagem: aplica ao que está no palco (`shown`, que é o carro da viagem ou a prévia)
 * e diz o que acontece. Tudo liberado: é o carro da viagem, e grava só as colunas que mudaram.
 * Algo bloqueado: é prévia, com as frases do que falta, e nada se grava. Não cabe: recusa.
 */
export function decide(trip: CarSpec, shown: CarSpec, tap: Tap, progress: TeamProgress): Outcome {
  let next: CarSpec;
  let dropped: CarAccessoryKey[] = [];
  if (tap.kind === 'model') {
    ({ car: next, dropped } = fitToModel(shown, tap.model));
  } else if (tap.kind === 'color') {
    next = { ...shown, color: tap.color };
  } else {
    const r = toggleAccessory(shown, tap.key);
    if ('refuse' in r) return { kind: 'refuse', reason: r.refuse };
    next = r.car;
  }
  const hints = lockedHints(next, trip, progress);
  if (hints.length > 0) return { kind: 'preview', car: next, hints, dropped };
  return { kind: 'trip', car: next, patch: patchFor(trip, next), dropped };
}

/** Dois carros iguais: mesmo modelo, cor, placa e acessórios na mesma ordem. */
export function sameCar(a: CarSpec, b: CarSpec): boolean {
  return (
    a.model === b.model &&
    a.color === b.color &&
    a.plate === b.plate &&
    a.accessories.join(',') === b.accessories.join(',')
  );
}
