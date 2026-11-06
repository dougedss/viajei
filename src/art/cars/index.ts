import type { CarModel } from '@shared/constants.ts';
import { PROFILES } from './profiles/index.ts';
import { buildFromProfile } from './rig.ts';
import type { BuildOptions, CarRig, CarSpec } from './types.ts';

export type { AttachOptions, BuildOptions, CarRig, CarSpec, RigAnchors } from './types.ts';

/**
 * A garagem de código: um construtor por modelo. Hoje os cinco saem do mesmo construtor genérico,
 * cada um com o próprio perfil (o que é de um modelo só, como a caçamba da picape, o estepe do SUV
 * e a saia e blusa da kombi, está nos dados do perfil). Quem usa (maquete, garagem, retrospectiva)
 * só conhece o `CarRig`: trocar um modelo por um de artista é trocar a entrada aqui.
 */
type Builder = (spec: CarSpec, opts?: BuildOptions) => CarRig;

const fromProfile =
  (model: CarModel): Builder =>
  (spec, opts) =>
    buildFromProfile(PROFILES[model], spec, opts);

export const BUILDERS: Record<CarModel, Builder> = {
  hatch: fromProfile('hatch'),
  sedan: fromProfile('sedan'),
  suv: fromProfile('suv'),
  pickup: fromProfile('pickup'),
  kombi: fromProfile('kombi'),
};

export function buildCar(spec: CarSpec, opts?: BuildOptions): CarRig {
  return BUILDERS[spec.model](spec, opts);
}
