import {
  CAR_ACCESSORIES,
  CAR_COLORS,
  CAR_FINISHES,
  CAR_MODELS,
  CAR_STICKER_MAX,
  CAR_WHEELS,
  type AchievementKey,
  type CarAccessoryKey,
  type CarColor,
  type CarFinish,
  type CarModel,
  type CarWheels,
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
import type { Profile } from '@/lib/db/schema.ts';

/**
 * As regras da garagem, puras. O carro é da pessoa (fase 16): mora no perfil e é o mesmo em
 * qualquer viagem. O que está liberado vem do progresso; o que o carro já usa e o progresso de agora
 * não libera continua (`kept`), só não volta a ser escolhido depois de trocado. Tocar em algo
 * bloqueado nunca grava: o palco mostra a prévia com a frase do que falta. A regra é uma só: o palco
 * é o carro gravado sempre que tudo nele está liberado; se algo bloqueado entra, é prévia.
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

export function finishHint(finish: CarFinish): string {
  const { label, level } = CAR_FINISHES[finish];
  return `Tinta ${label.toLocaleLowerCase('pt-BR')}: no nível ${level} (${levelName(level)})`;
}

/** "roda de cinco raios", "roda raiada", "roda de aço": o nome do estilo, sem o artigo. */
export function wheelsName(wheels: CarWheels): string {
  return CAR_WHEELS[wheels].short.replace(/^a /, '');
}

export function wheelsHint(wheels: CarWheels): string {
  const { level } = CAR_WHEELS[wheels];
  const name = wheelsName(wheels);
  return `${name.charAt(0).toLocaleUpperCase('pt-BR')}${name.slice(1)}: no nível ${level} (${levelName(level)})`;
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

export function finishState(finish: CarFinish, progress: TeamProgress, mine: CarSpec): ItemState {
  const level = CAR_FINISHES[finish].level;
  if (progress.level >= level) return AVAILABLE;
  if (mine.finish === finish) return KEPT;
  return { status: 'locked', need: { level }, hint: finishHint(finish) };
}

export function wheelsState(wheels: CarWheels, progress: TeamProgress, mine: CarSpec): ItemState {
  const level = CAR_WHEELS[wheels].level;
  if (progress.level >= level) return AVAILABLE;
  if (mine.wheels === wheels) return KEPT;
  return { status: 'locked', need: { level }, hint: wheelsHint(wheels) };
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

/**
 * O que o carro gravado tem e o progresso de agora não libera (`kept`): veio de quando o carro era da
 * viagem e o nível era o do time (a cópia da 0014), ou de um aparelho com mais progresso. Continua,
 * e só volta com o progresso se for trocado. "Dourado, tinta metálica e bicicleta".
 */
export function keptNames(mine: CarSpec, progress: TeamProgress): string[] {
  const lower = (t: string) => t.toLocaleLowerCase('pt-BR');
  const names: string[] = [];
  if (colorState(mine.color, progress, mine).status === 'kept')
    names.push(lower(CAR_COLORS[mine.color].label));
  if (finishState(mine.finish, progress, mine).status === 'kept')
    names.push(`tinta ${lower(CAR_FINISHES[mine.finish].label)}`);
  if (wheelsState(mine.wheels, progress, mine).status === 'kept')
    names.push(wheelsName(mine.wheels));
  for (const k of mine.accessories) {
    if (accessoryState(k, progress, mine).status === 'kept') {
      names.push(lower(CAR_ACCESSORIES[k].label));
    }
  }
  return names;
}

// ------------------------------------------------------------------ a leitura do perfil
/**
 * De onde o carro é lido: as colunas do perfil (fase 16). Podem faltar num perfil puxado antes da
 * 0014 ou num perfil que ainda não chegou ao aparelho: aí vale o padrão.
 */
type CarColumns = 'car_model' | 'car_color' | 'car_finish' | 'car_wheels' | 'car_accessories';
export type CarSource = Partial<Pick<Profile, CarColumns>>;

/** As colunas que a garagem grava no perfil: só as que mudaram. */
export type CarPatch = Partial<Pick<Profile, CarColumns>>;

function isModel(v: unknown): v is CarModel {
  return typeof v === 'string' && Object.hasOwn(CAR_MODELS, v);
}
function isColor(v: unknown): v is CarColor {
  return typeof v === 'string' && Object.hasOwn(CAR_COLORS, v);
}
function isFinish(v: unknown): v is CarFinish {
  return typeof v === 'string' && Object.hasOwn(CAR_FINISHES, v);
}
function isWheels(v: unknown): v is CarWheels {
  return typeof v === 'string' && Object.hasOwn(CAR_WHEELS, v);
}

/**
 * O perfil como carro desenhável, sem nunca quebrar a cena (D70): modelo e cor inválidos voltam ao
 * hatch Pôr do sol; chaves desconhecidas saem; havendo item de teto, o rack aparece; o que passa das
 * faixas do teto ou dos 3 adesivos sai, pela ordem (dado velho, ou duas colunas gravadas por
 * aparelhos diferentes ao mesmo tempo). Só lê: a próxima escolha na garagem grava o que se vê. A
 * placa é de quem desenha: o nome da viagem na tela da viagem, o da pessoa fora dela.
 */
export function normalizeCar(source: CarSource | null | undefined, plate: string | null): CarSpec {
  const model = isModel(source?.car_model) ? source.car_model : 'hatch';
  const color = isColor(source?.car_color) ? source.car_color : 'sunset';
  const finish = isFinish(source?.car_finish) ? source.car_finish : 'solid';
  const wheels = isWheels(source?.car_wheels) ? source.car_wheels : 'classic';
  const raw: unknown = source?.car_accessories;
  let keys = knownKeys(Array.isArray(raw) ? raw.filter((k) => typeof k === 'string') : []);
  if (keys.some(isLaneItem) && !keys.includes('rack')) keys = ['rack', ...keys];
  const { overflow } = placeAccessories(PROFILES[model], keys);
  keys = keys.filter((k) => !overflow.includes(k));
  return { model, color, finish, wheels, accessories: keys, plate };
}

/** O carro de uma pessoa: o do perfil dela, normalizado, com a placa de quem desenha. */
export function carOf(profile: CarSource | null | undefined, plate: string | null): CarSpec {
  return normalizeCar(profile, plate);
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
  | { kind: 'finish'; finish: CarFinish }
  | { kind: 'wheels'; wheels: CarWheels }
  | { kind: 'accessory'; key: CarAccessoryKey };

/**
 * `swapped`: o que um toque trocou sem a pessoa pedir, com a frase. As calotas cromadas cobrem o
 * aro: escolher uma roda tira as calotas; pôr as calotas volta a roda à clássica.
 */
export type Outcome =
  | {
      kind: 'save';
      car: CarSpec;
      patch: CarPatch;
      dropped: CarAccessoryKey[];
      swapped: string | null;
    }
  | {
      kind: 'preview';
      car: CarSpec;
      hints: string[];
      dropped: CarAccessoryKey[];
      swapped: string | null;
    }
  | { kind: 'refuse'; reason: string };

/** As frases do que falta para tudo o que está no carro e o progresso não libera. */
export function lockedHints(car: CarSpec, trip: CarSpec, progress: TeamProgress): string[] {
  const hints: string[] = [];
  const m = modelState(car.model, progress, trip);
  if (m.status === 'locked') hints.push(m.hint);
  const c = colorState(car.color, progress, trip);
  if (c.status === 'locked') hints.push(c.hint);
  const f = finishState(car.finish, progress, trip);
  if (f.status === 'locked') hints.push(f.hint);
  const w = wheelsState(car.wheels, progress, trip);
  if (w.status === 'locked') hints.push(w.hint);
  for (const k of car.accessories) {
    const a = accessoryState(k, progress, trip);
    if (a.status === 'locked') hints.push(a.hint);
  }
  return hints;
}

/** Só as colunas que mudaram: a outbox funde toques seguidos na mesma coluna. */
export function patchFor(trip: CarSpec, next: CarSpec): CarPatch {
  const patch: CarPatch = {};
  if (trip.model !== next.model) patch.car_model = next.model;
  if (trip.color !== next.color) patch.car_color = next.color;
  if (trip.finish !== next.finish) patch.car_finish = next.finish;
  if (trip.wheels !== next.wheels) patch.car_wheels = next.wheels;
  if (trip.accessories.join(',') !== next.accessories.join(',')) {
    patch.car_accessories = [...next.accessories];
  }
  return patch;
}

/**
 * Um toque na garagem: aplica ao que está no palco (`shown`, que é o carro gravado ou a prévia)
 * e diz o que acontece. Tudo liberado: é o carro, e grava só as colunas que mudaram. Algo
 * bloqueado: é prévia, com as frases do que falta, e nada se grava. Não cabe: recusa.
 */
export function decide(trip: CarSpec, shown: CarSpec, tap: Tap, progress: TeamProgress): Outcome {
  let next: CarSpec;
  let dropped: CarAccessoryKey[] = [];
  let swapped: string | null = null;
  if (tap.kind === 'model') {
    ({ car: next, dropped } = fitToModel(shown, tap.model));
  } else if (tap.kind === 'color') {
    next = { ...shown, color: tap.color };
  } else if (tap.kind === 'finish') {
    next = { ...shown, finish: tap.finish };
  } else if (tap.kind === 'wheels') {
    next = { ...shown, wheels: tap.wheels };
    if (tap.wheels !== 'classic' && shown.accessories.includes('hubcaps')) {
      next = { ...next, accessories: shown.accessories.filter((k) => k !== 'hubcaps') };
      swapped = 'As calotas saíram: elas cobrem o aro.';
    }
  } else {
    const r = toggleAccessory(shown, tap.key);
    if ('refuse' in r) return { kind: 'refuse', reason: r.refuse };
    next = r.car;
    if (
      tap.key === 'hubcaps' &&
      next.accessories.includes('hubcaps') &&
      next.wheels !== 'classic'
    ) {
      next = { ...next, wheels: 'classic' };
      swapped = 'A roda voltou à clássica: as calotas cobrem o aro.';
    }
  }
  const hints = lockedHints(next, trip, progress);
  if (hints.length > 0) return { kind: 'preview', car: next, hints, dropped, swapped };
  return { kind: 'save', car: next, patch: patchFor(trip, next), dropped, swapped };
}

/**
 * Vários toques seguidos, como um só (o "Usar no carro" do nível novo põe o acabamento e a roda de
 * uma vez). Para no primeiro que não é gravável: a recusa ou a prévia dele.
 */
export function decideAll(
  mine: CarSpec,
  taps: readonly Tap[],
  progress: TeamProgress,
): Outcome | null {
  let shown = mine;
  let last: Outcome | null = null;
  for (const tap of taps) {
    last = decide(mine, shown, tap, progress);
    if (last.kind !== 'save') return last;
    shown = last.car;
  }
  return last;
}

/** Dois carros iguais: mesmo modelo, cor, acabamento, rodas, placa e acessórios na mesma ordem. */
export function sameCar(a: CarSpec, b: CarSpec): boolean {
  return (
    a.model === b.model &&
    a.color === b.color &&
    a.finish === b.finish &&
    a.wheels === b.wheels &&
    a.plate === b.plate &&
    a.accessories.join(',') === b.accessories.join(',')
  );
}
