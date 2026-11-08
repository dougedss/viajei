import { describe, expect, it } from 'vitest';
import { Box3, Vector3 } from 'three/webgpu';
import { STOP_KIND_KEYS } from '@shared/constants.ts';
import { buildMiniature, MINIATURE_BOX } from './index.ts';

/**
 * O que quebraria o 3D (como a D66 fez com os carros): cada miniatura cabe na caixa do tipo, assenta
 * no chão, fica centrada (o layout a põe ao lado da estrada pela caixa: o que passar dela invadiria a
 * estrada) e descarta uma vez só.
 */
describe.each(STOP_KIND_KEYS)('a miniatura de %s', (kind) => {
  it('cabe na caixa do tipo, assenta no chão e fica centrada', () => {
    const mini = buildMiniature(kind, 7);
    expect(mini.kind).toBe(kind);
    expect(mini.group.children.length).toBeGreaterThan(0);
    const box = new Box3().setFromObject(mini.group);
    const size = box.getSize(new Vector3());
    const limit = MINIATURE_BOX[kind];
    expect(size.x, 'largura').toBeLessThanOrEqual(limit.w + 0.01);
    expect(size.y, 'altura').toBeLessThanOrEqual(limit.h + 0.01);
    expect(size.z, 'profundidade').toBeLessThanOrEqual(limit.d + 0.01);
    // assenta no chão: nada abaixo de zero, e algo encosta nele
    expect(box.min.y).toBeGreaterThan(-0.01);
    expect(box.min.y).toBeLessThan(0.2);
    // centrada: o lado da estrada é decidido pela meia caixa
    expect(Math.abs(box.min.x + box.max.x) / 2).toBeLessThan(limit.w * 0.25);
    expect(Math.abs(box.min.z + box.max.z) / 2).toBeLessThan(limit.d * 0.3);
    mini.dispose();
  });

  it('a mesma semente dá a mesma miniatura; sementes diferentes só mudam o detalhe', () => {
    const a = buildMiniature(kind, 3);
    const b = buildMiniature(kind, 3);
    const c = buildMiniature(kind, 99);
    expect(a.group.children.length).toBe(b.group.children.length);
    expect(a.group.children.length).toBe(c.group.children.length);
    const size = (m: typeof a) => new Box3().setFromObject(m.group).getSize(new Vector3());
    expect(size(a).toArray()).toEqual(size(c).toArray());
    a.dispose();
    b.dispose();
    c.dispose();
  });

  it('dispose descarta uma vez só e tira a miniatura da cena', () => {
    const mini = buildMiniature(kind, 1);
    mini.dispose();
    mini.dispose();
    expect(mini.group.parent).toBeNull();
  });
});
