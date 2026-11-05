import { describe, expect, it } from 'vitest';
import {
  comparePosition,
  positionAtEnd,
  positionBetween,
  positionForMove,
  positionsBetween,
} from './position.ts';

describe('posição fracionária', () => {
  it('gera posições ordenadas, do fim e entre vizinhos', () => {
    const a = positionAtEnd([]);
    const b = positionAtEnd([a]);
    const ab = positionBetween(a, b);
    expect([b, ab, a].sort(comparePosition)).toEqual([a, ab, b]);
  });

  it('gera n posições de uma vez, em ordem', () => {
    const ps = positionsBetween(null, null, 4);
    expect(ps).toHaveLength(4);
    expect([...ps].sort(comparePosition)).toEqual(ps);
  });

  it('mover para baixo cai entre os vizinhos que terá', () => {
    const ps = positionsBetween(null, null, 4);
    const moved = positionForMove(ps, 0, 2);
    expect(moved).not.toBeNull();
    expect(comparePosition(moved!, ps[2]!)).toBe(1);
    expect(comparePosition(moved!, ps[3]!)).toBe(-1);
  });

  it('mover para o topo e para o fim', () => {
    const ps = positionsBetween(null, null, 3);
    expect(comparePosition(positionForMove(ps, 2, 0)!, ps[0]!)).toBe(-1);
    expect(comparePosition(positionForMove(ps, 0, 2)!, ps[2]!)).toBe(1);
  });

  it('não move para o mesmo lugar nem para fora da lista', () => {
    const ps = positionsBetween(null, null, 3);
    expect(positionForMove(ps, 1, 1)).toBeNull();
    expect(positionForMove(ps, 1, 3)).toBeNull();
    expect(positionForMove(ps, -1, 0)).toBeNull();
  });

  it('a ordem é por code unit, como o collate "C"', () => {
    expect(comparePosition('a0', 'a1')).toBe(-1);
    expect(comparePosition('Zz', 'a0')).toBe(-1);
    expect(comparePosition('a0', 'a0')).toBe(0);
  });
});
