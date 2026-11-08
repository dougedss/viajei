import { describe, expect, it } from 'vitest';
import { indexRoute, projectOntoRoute } from '@/lib/geo/project.ts';
import { comparePosition } from '@/lib/ids/position.ts';
import { makeStop } from '@/test/factories.ts';
import { ForgedTrack, metersAt, ROAD } from './__fixtures__/tracks.ts';
import {
  autoStopId,
  autoStopKey,
  autoStopPosition,
  CELL_DEG,
  duplicatesToRemove,
  knownAutoStops,
  sameAutoStop,
} from './auto-stop.ts';
import { createStopDetector, type KnownAutoStop } from './stop-detector.ts';

const DAY = '0b0b0b0b-0000-4000-8000-000000000001';
const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const at = (iso: string) => Date.parse(iso);
const place = (x: number, y: number) => {
  const [lng, lat] = metersAt(x, y);
  return { lng, lat };
};

function autoStop(over: Parameters<typeof makeStop>[0] = {}) {
  const { lng, lat } = place(5100, 80);
  return makeStop({
    source: 'auto',
    kind: 'fuel',
    name: 'Posto da estrada',
    lat,
    lng,
    done_at: '2026-12-12T16:20:00.000Z',
    done_by: ME,
    ...over,
  });
}

describe('o id da parada automática (dois celulares no mesmo carro)', () => {
  it('o mesmo lugar a poucos metros e a mesma chegada a poucos segundos dão o mesmo id', async () => {
    const a = place(5100, 80);
    const b = place(5104, 83);
    const id = await autoStopId(DAY, a, at('2026-12-12T16:20:00Z'));
    expect(await autoStopId(DAY, b, at('2026-12-12T16:20:04Z'))).toBe(id);
    // determinístico, em outro dia muda
    expect(await autoStopId(DAY, a, at('2026-12-12T16:20:00Z'))).toBe(id);
    expect(
      await autoStopId('0b0b0b0b-0000-4000-8000-000000000002', a, at('2026-12-12T16:20:00Z')),
    ).not.toBe(id);
  });

  it('outro lugar ou outra janela de 2 h, outra chave', () => {
    const a = place(5100, 80);
    expect(autoStopKey(place(5600, 80), at('2026-12-12T16:20:00Z'))).not.toBe(
      autoStopKey(a, at('2026-12-12T16:20:00Z')),
    );
    expect(autoStopKey(a, at('2026-12-12T18:20:00Z'))).not.toBe(
      autoStopKey(a, at('2026-12-12T16:20:00Z')),
    );
    // na borda de uma célula, dois centros a 2 m caem em chaves diferentes: é o caso das regras abaixo
    const edge = Math.ceil(a.lat / CELL_DEG) * CELL_DEG;
    expect(autoStopKey({ ...a, lat: edge - 0.00001 }, 0)).not.toBe(
      autoStopKey({ ...a, lat: edge + 0.00001 }, 0),
    );
  });
});

describe('a mesma parada, vista pelo sync', () => {
  it('a menos de 150 m e com horário sobreposto é a mesma; longe ou em outra hora, não', () => {
    const base: KnownAutoStop = { ...place(5100, 80), from: 1_000, to: 9_000 };
    expect(sameAutoStop(base, { ...place(5180, 120), from: 5_000, to: null })).toBe(true);
    expect(sameAutoStop(base, { ...place(5400, 80), from: 5_000, to: null })).toBe(false);
    expect(sameAutoStop(base, { ...place(5100, 80), from: 9_500, to: 12_000 })).toBe(false);
  });

  it('a parada do outro celular que já chegou pelo sync segura o detector deste: uma só', () => {
    const route = indexRoute(ROAD);
    const theirs = autoStop({
      done_by: OTHER,
      done_at: new Date((new ForgedTrack().t + 240) * 1000).toISOString(),
    });
    const track = new ForgedTrack().drive(5000, 0, 80).drive(5100, 80, 20).stay(12);
    const detector = createStopDetector();
    const events = track.fixes().flatMap((fix) =>
      detector.push(fix, {
        roadDistanceM: (p) => projectOntoRoute(route, p).distance_m,
        planned: [],
        known: knownAutoStops([theirs]),
      }),
    );
    expect(events).toEqual([]);
  });

  it('as conhecidas são só as automáticas vivas, com lugar e chegada', () => {
    const stops = [
      autoStop(),
      autoStop({ deleted_at: '2026-12-12T16:30:00.000Z' }),
      makeStop({ source: 'user', ...place(5100, 80), done_at: '2026-12-12T16:00:00.000Z' }),
      autoStop({ departed_at: '2026-12-12T16:40:00.000Z' }),
    ];
    const known = knownAutoStops(stops);
    expect(known).toHaveLength(2);
    expect(known[1]?.to).toBe(at('2026-12-12T16:40:00.000Z'));
  });
});

describe('quando viraram duas (os dois criaram ao mesmo tempo, com chaves diferentes)', () => {
  const first = autoStop({ id: 'aaaaaaaa-0000-4000-8000-000000000001', done_by: OTHER });
  const mine = autoStop({
    id: 'bbbbbbbb-0000-4000-8000-000000000002',
    done_at: '2026-12-12T16:20:03.000Z',
    ...place(5103, 82),
  });

  it('sai a que chegou depois, pelo aparelho de quem a criou', () => {
    expect(duplicatesToRemove([first, mine], { uid: ME, withMemory: new Set() })).toEqual([
      mine.id,
    ]);
    // o outro aparelho não mexe na parada que não é dele
    expect(duplicatesToRemove([first, mine], { uid: OTHER, withMemory: new Set() })).toEqual([]);
  });

  it('com a mesma chegada, fica a de menor id', () => {
    const same = { ...mine, done_at: first.done_at };
    expect(
      duplicatesToRemove([same, { ...first, done_by: ME }], { uid: ME, withMemory: new Set() }),
    ).toEqual([same.id]);
  });

  it('uma memória nunca se perde: com memória, as duas ficam', () => {
    expect(duplicatesToRemove([first, mine], { uid: ME, withMemory: new Set([mine.id]) })).toEqual(
      [],
    );
  });

  it('duas paradas de verdade no mesmo posto, com horas diferentes, ficam as duas', () => {
    const later = autoStop({
      id: 'cccccccc-0000-4000-8000-000000000003',
      done_at: '2026-12-12T19:00:00.000Z',
    });
    const closed = { ...first, departed_at: '2026-12-12T16:35:00.000Z' };
    expect(duplicatesToRemove([closed, later], { uid: ME, withMemory: new Set() })).toEqual([]);
  });
});

describe('a posição na lista do dia, pela hora', () => {
  const origin = makeStop({ kind: 'origin', position: 'a0', done_at: '2026-12-12T10:00:00.000Z' });
  const park = makeStop({ kind: 'nature', position: 'a1', done_at: '2026-12-12T13:00:00.000Z' });
  const lunch = makeStop({ kind: 'food', position: 'a2' });
  const hotel = makeStop({ kind: 'hotel', position: 'a3' });

  it('entre a última feita e a próxima', () => {
    const pos = autoStopPosition([origin, park, lunch, hotel], at('2026-12-12T14:00:00Z'));
    expect(comparePosition(pos, park.position)).toBeGreaterThan(0);
    expect(comparePosition(pos, lunch.position)).toBeLessThan(0);
  });

  it('uma feita depois da chegada fica depois dela (a ordem do horário)', () => {
    const pos = autoStopPosition([origin, park, lunch, hotel], at('2026-12-12T12:00:00Z'));
    expect(comparePosition(pos, origin.position)).toBeGreaterThan(0);
    expect(comparePosition(pos, park.position)).toBeLessThan(0);
  });

  it('sem nenhuma feita, depois da origem que ninguém marcou', () => {
    const fresh = [{ ...origin, done_at: null }, { ...park, done_at: null }, lunch];
    const pos = autoStopPosition(fresh, at('2026-12-12T09:00:00Z'));
    expect(comparePosition(pos, origin.position)).toBeGreaterThan(0);
    expect(comparePosition(pos, park.position)).toBeLessThan(0);
  });

  it('com o dia todo feito, no fim; num dia vazio, a primeira', () => {
    const done = [origin, park, { ...lunch, done_at: '2026-12-12T15:00:00.000Z' }];
    const pos = autoStopPosition(done, at('2026-12-12T16:00:00Z'));
    expect(comparePosition(pos, 'a2')).toBeGreaterThan(0);
    expect(autoStopPosition([], 0)).toMatch(/^a/);
  });
});
