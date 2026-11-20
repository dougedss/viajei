import { describe, expect, it } from 'vitest';
import { ESTUFA_CURITIBA } from '@/art/landmarks/samples/estufa-curitiba.ts';
import { MINIATURE_BOX } from '@/art/stops/types.ts';
import { landmarkFallbacks, pieceFor } from './piece-for.ts';

/**
 * A porta única da D219 (fase 23): a peça do lugar quando há receita publicada; senão, e em toda falha
 * (receita inválida, que não monta, pela metade), a miniatura do tipo, sem erro na tela.
 */
describe('pieceFor', () => {
  it('com a receita publicada, a peça do lugar, na caixa do tipo da parada', () => {
    const { mini, landmark } = pieceFor('nature', 7, ESTUFA_CURITIBA);
    expect(landmark).toBe(true);
    expect(mini.kind).toBe('nature');
    expect(mini.box).toEqual(MINIATURE_BOX.nature);
    expect(mini.group.name).toBe('landmark');
    mini.dispose();
  });

  it('sem catálogo (null, undefined), a miniatura do tipo', () => {
    for (const recipe of [null, undefined]) {
      const { mini, landmark } = pieceFor('nature', 7, recipe);
      expect(landmark).toBe(false);
      expect(mini.group.name).toBe('stop:nature');
      mini.dispose();
    }
  });

  it('a receita inválida, a vazia e a que monta menos da metade viram a peça do tipo e contam', () => {
    const before = landmarkFallbacks.count;
    const bad = [
      { v: 1, shapes: [{ k: 'teapot' }] },
      'lixo',
      { v: 1, shapes: [] },
      // só formas que não montam (o torno sem perfil)
      {
        v: 1,
        shapes: [
          {
            k: 'lathe',
            m: 'wall',
            m2: 'none',
            x: 0,
            y: 0,
            z: 0,
            w: 1,
            h: 1,
            d: 1,
            ry: 0,
            p: 0,
            q: 0,
            rep: 'one',
            n: 1,
            sx: 0,
            sz: 0,
            mir: 'none',
            pts: [],
          },
        ],
      },
    ];
    for (const recipe of bad) {
      const { mini, landmark } = pieceFor('hotel', 1, recipe);
      expect(landmark).toBe(false);
      expect(mini.group.name).toBe('stop:hotel');
      mini.dispose();
    }
    expect(landmarkFallbacks.count - before).toBe(bad.length);
  });

  it('a cidade de passagem usa a caixa da cidade', () => {
    const { mini } = pieceFor('city', 3, ESTUFA_CURITIBA, MINIATURE_BOX.city);
    expect(mini.box).toEqual(MINIATURE_BOX.city);
    mini.dispose();
  });
});
