import { describe, expect, it } from 'vitest';
import { declutterLabels, LABEL_CHAR_PX, LABEL_HEIGHT_PX, type PlaceLabel } from './project.ts';

const label = (index: number, name: string, x: number, y: number, pop: number): PlaceLabel => ({
  index,
  x,
  y,
  w: name.length * LABEL_CHAR_PX,
  h: LABEL_HEIGHT_PX,
  pop,
});

describe('os nomes das cidades de passagem (fase 24)', () => {
  it('longe um do outro: os dois ficam onde estão', () => {
    const out = declutterLabels([
      label(0, 'JARAGUÁ DO SUL', 120, 300, 180_000),
      label(1, 'SÃO BENTO DO SUL', 120, 380, 85_000),
    ]);
    expect(out).toEqual([
      { index: 0, y: 300, hidden: false },
      { index: 1, y: 380, hidden: false },
    ]);
  });

  it('cruzados (o teste de 15/11): a cidade maior fica, a menor desce uma linha', () => {
    const out = declutterLabels([
      label(0, 'SÃO BENTO DO SUL', 130, 306, 85_000),
      label(1, 'JARAGUÁ DO SUL', 120, 300, 180_000),
    ]);
    const jaragua = out.find((l) => l.index === 1);
    const saoBento = out.find((l) => l.index === 0);
    expect(jaragua).toEqual({ index: 1, y: 300, hidden: false });
    expect(saoBento?.hidden).toBe(false);
    expect(saoBento?.y).toBeGreaterThanOrEqual(300 + LABEL_HEIGHT_PX);
  });

  it('sem lugar nem uma linha abaixo: a menor some', () => {
    const out = declutterLabels([
      label(0, 'LAGES', 120, 300, 160_000),
      label(1, 'CAMPO BELO DO SUL', 120, 320, 70_000),
      label(2, 'CAPÃO ALTO', 120, 302, 2_700),
    ]);
    expect(out.find((l) => l.index === 2)?.hidden).toBe(true);
    expect(out.filter((l) => !l.hidden)).toHaveLength(2);
  });
});
