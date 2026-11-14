import type { CarWheels } from '@shared/constants.ts';

/**
 * Os estilos de roda (fase 16), como dado puro: a mesma fonte para o 3D (`rig.ts`, que monta a face
 * de cada roda) e para a vista lateral (`CarSide`), como o perfil dos carros (D66, D67). As medidas
 * são frações do raio da roda; a borracha é a mesma em todos.
 *
 * - **Clássica**: o disco cheio de sempre, com o cubo escuro (o desenho das fases 5 a 15, intocado).
 * - **Cinco raios**: o aro vazado, cinco raios largos do cubo à borda, o fundo escuro entre eles.
 * - **Raiada**: muitos raios finos, como as rodas de arame, com a borda e o cubo cromados.
 * - **Aço**: o disco de aço pintado, com seis furos redondos e a tampinha no centro.
 *
 * Nada remete a velocidade (regra 10.2): são estilos de roda de estrada, não de corrida.
 */
export type WheelDesign = {
  /** o disco do aro: cheio (a clássica, a de aço) ou vazado (os raios sobre o fundo escuro) */
  face: 'disc' | 'spokes';
  /** o tom do aro e dos raios */
  tone: 'alloy' | 'chrome' | 'steel';
  /** quantos raios e a largura de cada um (vazado) */
  spokes: { count: number; width: number } | null;
  /** os furos do disco: quantos, a que distância do centro e o raio de cada um */
  holes: { count: number; at: number; r: number } | null;
};

/** O raio de fora do aro e o do cubo, em frações do raio da roda. */
export const RIM_R = 0.62;
export const HUB_R = 0.18;

export const WHEEL_DESIGNS: Record<CarWheels, WheelDesign> = {
  classic: { face: 'disc', tone: 'alloy', spokes: null, holes: null },
  five: { face: 'spokes', tone: 'alloy', spokes: { count: 5, width: 0.2 }, holes: null },
  wire: { face: 'spokes', tone: 'chrome', spokes: { count: 14, width: 0.045 }, holes: null },
  steel: { face: 'disc', tone: 'steel', spokes: null, holes: { count: 6, at: 0.4, r: 0.085 } },
};

/** As cores de cada tom na vista lateral (no 3D, os materiais equivalentes do `carMaterials`). */
export const WHEEL_TONE_HEX: Record<WheelDesign['tone'], string> = {
  alloy: '#9AA2AD',
  chrome: '#D9DDE3',
  steel: '#6F7781',
};

/** O fundo escuro do aro vazado (o tambor por trás dos raios). */
export const WHEEL_BARREL_HEX = '#2A2F38';

/** O ângulo de cada raio (ou furo), em radianos, começando em cima. */
export function spokeAngles(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.PI / 2 + (i * 2 * Math.PI) / count);
}
