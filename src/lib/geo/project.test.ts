import { describe, expect, it } from 'vitest';
import type { LngLat } from '@shared/geo.ts';
import { indexRoute, projectFrom, projectOntoRoute, waypointAlongs } from './project.ts';

// ida e volta pela mesma estrada: 10 km para o norte e de volta (0.01° de latitude ≈ 1,11 km)
const HOME: LngLat = [-50.0, -26.0];
const TURN: LngLat = [-50.0, -25.91];
const ROUND = indexRoute([HOME, [-50.0, -25.955], TURN, [-50.0, -25.955], HOME]);

describe('projectFrom: a projeção na rota a partir de um piso (fase 24)', () => {
  it('sem piso, na ida vale o primeiro trecho da mesma estrada (não a volta)', () => {
    const p = projectFrom(ROUND, [-50.0, -25.97], 0);
    expect(p.fraction).toBeCloseTo(0.17, 2);
  });

  it('com o piso no meio, o mesmo ponto cai na volta', () => {
    const p = projectFrom(ROUND, [-50.0, -25.97], ROUND.total_m / 2);
    expect(p.fraction).toBeCloseTo(0.83, 2);
    // pelo ponto mais perto da rota inteira, a ida: o defeito de 15/11
    expect(projectOntoRoute(ROUND, [-50.0, -25.97]).fraction).toBeLessThan(0.5);
  });

  it('um ponto um pouco antes do piso fica no piso (o GPS parado não faz a fração voltar)', () => {
    const floor = ROUND.total_m * 0.6;
    const p = projectFrom(ROUND, [-50.0, -25.9265], floor); // ~170 m antes do piso, na volta
    expect(p.along_m).toBeCloseTo(floor, -1);
  });

  it('nada a até 2 km dali em diante: o ponto mais perto da rota inteira (fora da rota)', () => {
    const p = projectFrom(ROUND, [-50.05, -25.97], ROUND.total_m / 2);
    expect(p.distance_m).toBeGreaterThan(2000);
  });
});

describe('waypointAlongs: cada ponto de passagem no trecho dele', () => {
  it('a saída no começo e a chegada no fim, mesmo com a mesma coordenada', () => {
    const at = waypointAlongs(
      ROUND,
      [{ distance_m: 10_500 }, { distance_m: 10_500 }],
      ['saida', 'cafe', 'chegada'],
    );
    expect(at?.get('saida')).toBe(0);
    expect(at?.get('cafe')).toBeCloseTo(ROUND.total_m / 2, 0);
    expect(at?.get('chegada')).toBeCloseTo(ROUND.total_m, 0);
  });

  it('trechos que não batem com os pontos: null (quem chama projeta pelo mais perto)', () => {
    expect(waypointAlongs(ROUND, [{ distance_m: 1 }], ['a', 'b', 'c'])).toBeNull();
    expect(waypointAlongs(ROUND, null, ['a', 'b'])).toBeNull();
  });
});
