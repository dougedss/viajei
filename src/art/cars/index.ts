import { CAR_COLORS, CAR_MODELS, type CarColor, type CarModel } from '@shared/constants.ts';
import { buildHatch } from './hatch.ts';
import type { CarRig } from './types.ts';

export type { CarAccessoryKey, CarRig } from './types.ts';
export { CAR_ACCESSORY_KEYS } from './types.ts';

/**
 * A garagem de código: um construtor por modelo. Nesta fase só o hatch existe; os outros quatro
 * (sedã, SUV, picape, kombi) são da fase 6 e, até lá, qualquer `car_model` desenha o hatch. Quem
 * usa (maquete, garagem, retrospectiva) só conhece o `CarRig`.
 */
const BUILDERS: Record<CarModel, (color: CarColor, accessories: readonly string[]) => CarRig> = {
  hatch: buildHatch,
  sedan: buildHatch,
  suv: buildHatch,
  pickup: buildHatch,
  kombi: buildHatch,
};

export function asCarModel(value: string | null | undefined): CarModel {
  return value && Object.hasOwn(CAR_MODELS, value) ? (value as CarModel) : 'hatch';
}

export function asCarColor(value: string | null | undefined): CarColor {
  return value && Object.hasOwn(CAR_COLORS, value) ? (value as CarColor) : 'sunset';
}

export function buildCar(
  model: string | null | undefined,
  color: string | null | undefined,
  accessories: readonly string[] = [],
): CarRig {
  return BUILDERS[asCarModel(model)](asCarColor(color), accessories);
}
