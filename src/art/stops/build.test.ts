import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3, type Material, type MeshStandardMaterial } from 'three/webgpu';
import { STOP_KIND_KEYS } from '@shared/constants.ts';
import { buildMiniature, MINIATURE_BOX } from './index.ts';

/**
 * O que quebraria o 3D (como a D66 fez com os carros e a D178 com as miniaturas): cada peça cabe na
 * caixa do tipo, assenta no chão, fica centrada (o layout a põe ao lado da estrada pela caixa: o que
 * passar dela invadiria a estrada) e descarta uma vez só. Fase 22: as peças são grandes e fundidas por
 * material (poucas chamadas de desenho), e a noite acende as janelas e a poça de luz sem luz nova.
 */
describe.each(STOP_KIND_KEYS)('a peça de %s', (kind) => {
  it('cabe na caixa do tipo, assenta no chão e fica centrada', () => {
    const mini = buildMiniature(kind, 7);
    expect(mini.kind).toBe(kind);
    expect(mini.group.children.length).toBeGreaterThan(0);
    // a poça de luz fica de fora da conta: é um disco maior que a peça, apagado de dia
    const box = new Box3();
    for (const child of mini.group.children) {
      if (child.visible) box.expandByObject(child);
    }
    const size = box.getSize(new Vector3());
    const limit = MINIATURE_BOX[kind];
    expect(size.x, 'largura').toBeLessThanOrEqual(limit.w + 0.01);
    expect(size.y, 'altura').toBeLessThanOrEqual(limit.h + 0.01);
    expect(size.z, 'profundidade').toBeLessThanOrEqual(limit.d + 0.01);
    // grande como as peças do esboço: pelo menos dois terços da caixa de frente
    expect(size.x).toBeGreaterThan(limit.w * 0.66);
    // assenta no chão: nada abaixo de zero, e algo encosta nele
    expect(box.min.y).toBeGreaterThan(-0.01);
    expect(box.min.y).toBeLessThan(0.2);
    // centrada: o lado da estrada é decidido pela meia caixa
    expect(Math.abs(box.min.x + box.max.x) / 2).toBeLessThan(limit.w * 0.25);
    expect(Math.abs(box.min.z + box.max.z) / 2).toBeLessThan(limit.d * 0.3);
    mini.dispose();
  });

  it('é poucas malhas: uma por material, e todas com sombra', () => {
    const mini = buildMiniature(kind, 7);
    const meshes = mini.group.children.filter((c): c is Mesh => c instanceof Mesh);
    const materials = new Set<Material>(meshes.map((m) => m.material as Material));
    expect(meshes.length).toBe(materials.size);
    expect(meshes.length).toBeLessThanOrEqual(24);
    for (const m of meshes) {
      if (!m.visible) continue;
      expect(m.castShadow).toBe(true);
    }
    mini.dispose();
  });

  it('a mesma semente dá a mesma peça; sementes diferentes só mudam o detalhe', () => {
    const a = buildMiniature(kind, 3);
    const b = buildMiniature(kind, 3);
    const c = buildMiniature(kind, 99);
    expect(a.group.children.length).toBe(b.group.children.length);
    const size = (m: typeof a) => new Box3().setFromObject(m.group).getSize(new Vector3());
    expect(size(a).toArray()).toEqual(size(b).toArray());
    expect(size(a).toArray()).toEqual(size(c).toArray());
    a.dispose();
    b.dispose();
    c.dispose();
  });

  it('a noite acende as janelas, as lâmpadas e a poça de luz, e o dia apaga', () => {
    const mini = buildMiniature(kind, 1);
    const meshes = mini.group.children.filter((c): c is Mesh => c instanceof Mesh);
    const pool = meshes.find((m) => m.renderOrder === 2)!;
    expect(pool).toBeDefined();
    const poolMat = pool.material as MeshStandardMaterial;
    const emissive = meshes
      .map((m) => m.material as MeshStandardMaterial)
      .filter((m) => m !== poolMat && 'emissive' in m);
    const glow = () => emissive.reduce((acc, m) => acc + m.emissiveIntensity, 0);
    mini.setNight(0);
    expect(pool.visible).toBe(false);
    expect(poolMat.opacity).toBe(0);
    const day = glow();
    mini.setNight(1);
    expect(pool.visible).toBe(true);
    expect(poolMat.opacity).toBeGreaterThan(0.5);
    // as peças com janelas ou postes acendem; as outras (o abrigo, o bosque, a placa) só a poça
    const lit = new Set(['origin', 'winery', 'hotel', 'food', 'event', 'city', 'fuel']);
    if (lit.has(kind)) expect(glow()).toBeGreaterThan(day);
    else expect(glow()).toBe(day);
    mini.setNight(0);
    expect(pool.visible).toBe(false);
    mini.dispose();
  });

  it('dispose descarta uma vez só e tira a peça da cena', () => {
    const mini = buildMiniature(kind, 1);
    mini.dispose();
    mini.dispose();
    expect(mini.group.parent).toBeNull();
  });
});
