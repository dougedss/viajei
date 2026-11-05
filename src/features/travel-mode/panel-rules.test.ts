import { describe, expect, it } from 'vitest';
import type { Fix } from '@/lib/geo/geofence.ts';
import { makeStop } from '@/test/factories.ts';
import { departureStop, panelDecision, pushFix } from './panel-rules.ts';

const PARK = { lng: -50.0, lat: -25.91 };
const HOTEL = { lng: -50.0, lat: -25.82 };
const park = () => makeStop({ id: 'p', position: 'a1', kind: 'nature', name: 'Parque', ...PARK });
const hotel = () => makeStop({ id: 'h', position: 'a2', kind: 'hotel', name: 'Hotel', ...HOTEL });
const origin = () =>
  makeStop({ id: 'o', position: 'a0', kind: 'origin', name: 'Saída', lng: -50.0, lat: -26.0 });

const MIN = 60_000;
const fix = (p: { lng: number; lat: number }, t: number, dLng = 0): Fix => ({
  lng: p.lng + dLng,
  lat: p.lat,
  t,
});

describe('modo painel', () => {
  it('Partiu! automático só depois de ter visto o carro na parada', () => {
    const state = { at: { ...park(), done_at: 'x' }, next: hotel(), onRoad: false };
    const far = [fix(PARK, 0, 0.01)]; // 1 km do parque, sem nunca ter estado lá
    expect(panelDecision(far, state, 0).autoDepart).toBe(false);
    const there = pushFix(pushFix([], fix(PARK, 0)), fix(PARK, MIN, 0.004)); // 400 m depois
    expect(panelDecision(there, state, MIN).autoDepart).toBe(true);
  });

  it('a saída do nó de origem usa o próprio nó quando ainda não há at', () => {
    const state = { at: null, next: origin(), onRoad: false };
    expect(departureStop(state)?.id).toBe('o');
    const fixes = pushFix(
      pushFix([], fix({ lng: -50.0, lat: -26.0 }, 0)),
      fix({ lng: -50.0, lat: -26.0 }, MIN, 0.005),
    );
    expect(panelDecision(fixes, state, MIN).autoDepart).toBe(true);
    expect(
      departureStop({ at: { ...park(), departed_at: 'x' }, next: hotel(), onRoad: true }),
    ).toBeNull();
  });

  it('Chegamos! automático depois de 3 min no raio da próxima, nunca num nó de saída', () => {
    const state = {
      at: { ...park(), done_at: 'x', departed_at: 'x' },
      next: hotel(),
      onRoad: true,
    };
    let fixes: Fix[] = [];
    for (let i = 0; i <= 2; i++) fixes = pushFix(fixes, fix(HOTEL, i * MIN, 0.0003));
    expect(panelDecision(fixes, state, 2 * MIN).autoArrive).toBe(false);
    fixes = pushFix(fixes, fix(HOTEL, 3 * MIN, 0.0003));
    expect(panelDecision(fixes, state, 3 * MIN).autoArrive).toBe(true);
    const node = { at: null, next: origin(), onRoad: false };
    expect(panelDecision(fixes, node, 3 * MIN).autoArrive).toBe(false);
  });

  it('parado por 10 min: baixa precisão; andou: volta ao normal', () => {
    const state = { at: null, next: park(), onRoad: false };
    let fixes: Fix[] = [];
    for (let i = 0; i <= 10; i++) fixes = pushFix(fixes, fix(HOTEL, i * MIN, 0.0002 * (i % 2)));
    expect(panelDecision(fixes, state, 10 * MIN).lowPower).toBe(true);
    fixes = pushFix(fixes, fix(HOTEL, 11 * MIN, 0.01));
    expect(panelDecision(fixes, state, 11 * MIN).lowPower).toBe(false);
  });

  it('o buffer guarda só 15 min', () => {
    const fixes = pushFix(pushFix([], fix(PARK, 0)), fix(PARK, 16 * MIN));
    expect(fixes).toHaveLength(1);
    expect(panelDecision([], { at: null, next: null, onRoad: false }, 0)).toEqual({
      autoDepart: false,
      autoArrive: false,
      lowPower: false,
    });
  });
});
