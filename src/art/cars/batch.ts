import {
  Mesh,
  type BufferGeometry,
  type Material,
  type Matrix4,
  type Object3D,
} from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Kit } from './kit.ts';

/**
 * Junta as peças paradas de um carro que dividem o material numa malha só por material: a
 * carroceria com os retrovisores e a caçamba, todos os vidros, as luzes, os frisos. Cada malha vira
 * um objeto de render em cada passe (o principal, a sombra e o reflexo), e montar esses objetos na
 * primeira vez é o que custa quando um carro entra em cena: de cerca de 70 malhas por carro para
 * cerca de 20, a troca de modelo deixa de engasgar. O que gira ou anima (rodas, acessórios) fica
 * fora do lote.
 */
const KEEP = new Set(['position', 'normal', 'uv']);

function normalized(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) if (!KEEP.has(name)) g.deleteAttribute(name);
  g.clearGroups();
  g.applyMatrix4(matrix);
  return g;
}

export class StaticBatch {
  private readonly pieces = new Map<Material, BufferGeometry[]>();

  /** Uma peça no espaço de quem vai receber o lote (a matriz leva a posição e a rotação). */
  add(geometry: BufferGeometry, material: Material, matrix: Matrix4): void {
    const list = this.pieces.get(material) ?? [];
    list.push(normalized(geometry, matrix));
    this.pieces.set(material, list);
  }

  /** Uma malha já posicionada (filha direta de quem recebe o lote). */
  addMesh(mesh: Mesh): void {
    mesh.updateMatrix();
    this.add(mesh.geometry, mesh.material as Material, mesh.matrix);
  }

  /** As malhas juntas, uma por material, com as geometrias guardadas no kit para o descarte. */
  bake(kit: Kit, noShadow: ReadonlySet<Material> = new Set()): Mesh[] {
    const out: Mesh[] = [];
    for (const [material, list] of this.pieces) {
      const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
      if (list.length > 1) for (const g of list) g.dispose();
      if (!merged) continue;
      const mesh = new Mesh(kit.own(merged), material);
      mesh.castShadow = !noShadow.has(material);
      mesh.receiveShadow = true;
      out.push(mesh);
    }
    this.pieces.clear();
    return out;
  }
}

/** Junta peças soltas (geometria + objeto posicionado) numa malha só, para os acessórios. */
export function mergedMesh(
  kit: Kit,
  material: Material,
  pieces: readonly (readonly [BufferGeometry, Object3D])[],
): Mesh {
  const batch = new StaticBatch();
  for (const [geometry, at] of pieces) {
    at.updateMatrix();
    batch.add(geometry, material, at.matrix);
  }
  const [mesh] = batch.bake(kit);
  return mesh ?? new Mesh();
}
