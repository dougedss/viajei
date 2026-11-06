import type { CarColor, CarModel } from '@shared/constants.ts';
import type {
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SpotLight,
} from 'three/webgpu';

/**
 * O que um carro por código expõe para a maquete, a garagem (fase 6) e a retrospectiva (fase 9):
 * o grupo para posicionar, a tinta para pintar, as rodas para girar, as luzes para a noite e os
 * acessórios para ligar e desligar. Trocar o modelo não muda quem usa.
 */
export type CarAccessoryKey = 'rack' | 'board' | 'box' | 'bike';
export const CAR_ACCESSORY_KEYS: readonly CarAccessoryKey[] = ['rack', 'board', 'box', 'bike'];

export type CarRig = {
  model: CarModel;
  group: Group;
  paint: MeshPhysicalMaterial;
  wheels: Group[];
  headMat: MeshStandardMaterial;
  tailMat: MeshStandardMaterial;
  spots: SpotLight[];
  accessories: Record<CarAccessoryKey, Group | Mesh>;
  setColor: (color: CarColor) => void;
  setAccessories: (keys: readonly string[]) => void;
  /** 0 = dia, 1 = noite: faróis, lanternas e feixes */
  setNight: (t: number) => void;
  /** gira as rodas por um deslocamento em unidades da cena */
  roll: (distance: number) => void;
  dispose: () => void;
};
