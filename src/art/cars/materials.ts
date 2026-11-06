import { CAR_COLORS, type CarColor } from '@shared/constants.ts';
import { DoubleSide, MeshPhysicalMaterial, MeshStandardMaterial } from 'three/webgpu';

/**
 * Os materiais dos carros: tinta com verniz (metálica mais no dourado e na névoa), vidro escuro,
 * cromado, borracha, e as luzes emissivas que a noite acende. Compartilhados pelos cinco modelos.
 */
export function paintMaterial(color: CarColor): MeshPhysicalMaterial {
  const mat = new MeshPhysicalMaterial({
    color: CAR_COLORS[color].hex,
    metalness: 0.5,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
  });
  applyPaint(mat, color);
  return mat;
}

export function applyPaint(mat: MeshPhysicalMaterial, color: CarColor): void {
  mat.color.set(CAR_COLORS[color].hex);
  if (color === 'gold') {
    mat.metalness = 0.9;
    mat.roughness = 0.28;
  } else if (color === 'mist') {
    mat.metalness = 0.8;
    mat.roughness = 0.3;
  } else {
    mat.metalness = 0.5;
    mat.roughness = 0.32;
  }
}

export type CarMaterials = {
  dark: MeshStandardMaterial;
  glass: MeshPhysicalMaterial;
  chrome: MeshStandardMaterial;
  rubber: MeshStandardMaterial;
  head: MeshStandardMaterial;
  tail: MeshStandardMaterial;
  dispose: () => void;
};

export function carMaterials(): CarMaterials {
  const dark = new MeshStandardMaterial({ color: 0x1b1d22, roughness: 0.6 });
  const glass = new MeshPhysicalMaterial({
    color: 0x0d1319,
    roughness: 0.08,
    metalness: 0.2,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    side: DoubleSide,
  });
  const chrome = new MeshStandardMaterial({ color: 0xd9dde3, metalness: 0.95, roughness: 0.25 });
  const rubber = new MeshStandardMaterial({ color: 0x15171a, roughness: 0.95 });
  const head = new MeshStandardMaterial({
    color: 0xeef2ff,
    emissive: 0xffffff,
    emissiveIntensity: 0,
    roughness: 0.3,
  });
  const tail = new MeshStandardMaterial({
    color: 0x8a1c1c,
    emissive: 0xff2a1a,
    emissiveIntensity: 0,
    roughness: 0.4,
  });
  return {
    dark,
    glass,
    chrome,
    rubber,
    head,
    tail,
    dispose: () => {
      for (const m of [dark, glass, chrome, rubber, head, tail]) m.dispose();
    },
  };
}
