import type { CarModel } from '@shared/constants.ts';
import type { CarProfile } from '../profile.ts';
import { HATCH } from './hatch.ts';
import { KOMBI } from './kombi.ts';
import { PICKUP } from './pickup.ts';
import { SEDAN } from './sedan.ts';
import { SUV } from './suv.ts';

/** Os cinco perfis, por modelo: o 3D, a vista lateral e as regras do teto leem daqui. */
export const PROFILES: Record<CarModel, CarProfile> = {
  hatch: HATCH,
  sedan: SEDAN,
  suv: SUV,
  pickup: PICKUP,
  kombi: KOMBI,
};
