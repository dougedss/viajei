import { CAR_ACCESSORIES, CAR_COLORS, CAR_MODELS } from '@shared/constants.ts';
import { placeAccessories, placedKeys } from './placement.ts';
import { PROFILES } from './profiles/index.ts';
import type { CarSpec } from './types.ts';

/** "a", "a e b", "a, b e c". */
export function joinPt(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1] ?? ''}`;
}

/** O acabamento e as rodas no rótulo, só quando não são os de sempre (fase 16). */
const FINISH_TEXT = {
  solid: '',
  metallic: 'tinta metálica',
  pearl: 'tinta perolada',
  matte: 'tinta fosca',
} as const;
const WHEELS_TEXT = {
  classic: '',
  five: 'rodas de cinco raios',
  wire: 'rodas raiadas',
  steel: 'rodas de aço',
} as const;

/**
 * O rótulo acessível do carro: "Hatch Pôr do sol com rack e bicicleta"; com o acabamento e as rodas
 * quando não são os de sempre: "SUV Céu, tinta perolada, rodas raiadas, com rack".
 */
export function describeCar(car: CarSpec): string {
  const extras = [FINISH_TEXT[car.finish], WHEELS_TEXT[car.wheels]].filter((t) => t !== '');
  const head = [`${CAR_MODELS[car.model].label} ${CAR_COLORS[car.color].label}`, ...extras].join(
    ', ',
  );
  const placement = placeAccessories(PROFILES[car.model], car.accessories);
  const items = placedKeys(placement, car.accessories).map((k) => CAR_ACCESSORIES[k].short);
  if (items.length === 0) return head;
  return `${head}${extras.length > 0 ? ',' : ''} com ${joinPt(items)}`;
}
