import { CAR_ACCESSORIES, CAR_COLORS, CAR_MODELS } from '@shared/constants.ts';
import { placeAccessories, placedKeys } from './placement.ts';
import { PROFILES } from './profiles/index.ts';
import type { CarSpec } from './types.ts';

/** "a", "a e b", "a, b e c". */
export function joinPt(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} e ${items[items.length - 1] ?? ''}`;
}

/** O rótulo acessível do carro: "Hatch Pôr do sol com rack e bicicleta". */
export function describeCar(car: CarSpec): string {
  const base = `${CAR_MODELS[car.model].label} ${CAR_COLORS[car.color].label}`;
  const placement = placeAccessories(PROFILES[car.model], car.accessories);
  const items = placedKeys(placement, car.accessories).map((k) => CAR_ACCESSORIES[k].short);
  return items.length > 0 ? `${base} com ${joinPt(items)}` : base;
}
