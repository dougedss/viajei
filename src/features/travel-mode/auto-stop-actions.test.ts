import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db/schema.ts';
import type { ReverseRow } from '@/lib/geocode/nominatim.ts';
import { comparePosition } from '@/lib/ids/position.ts';
import { DAY_ID, makeStop, OTHER_UID, TRIP_ID, UID } from '@/test/factories.ts';
import { metersAt } from './__fixtures__/tracks.ts';
import {
  autoKeys,
  endAutoStop,
  nameAutoStop,
  parseUndone,
  pendingNames,
  registerAutoStop,
  removeDuplicateAutoStops,
  type AutoStopStart,
  type Lookup,
} from './auto-stop-actions.ts';

/**
 * As escritas da parada automática no Dexie de mentira: registrar com o lugar do OSM ou sem sinal,
 * a parada do outro celular que já chegou, desfazer, a saída medida, o nome quando a rede volta e a
 * duplicada da corrida rara. O Nominatim é forjado: nada sai para a rede.
 */
const reverse = vi.hoisted(() => ({ row: null as ReverseRow | null, fail: false }));
// as escritas só usam o `reverseGeocode` do módulo
vi.mock('@/lib/geocode/nominatim.ts', () => ({
  reverseGeocode: () =>
    reverse.fail ? Promise.reject(new Error('sem rede')) : Promise.resolve(reverse.row),
}));

const [lng, lat] = metersAt(5100, 80);
function metersAtPlace(x: number, y: number) {
  const [plng, plat] = metersAt(x, y);
  return { lng: plng, lat: plat };
}
const ARRIVED = Date.parse('2026-12-12T17:20:00Z');
const start: AutoStopStart = {
  kind: 'start',
  arrivedAt: ARRIVED,
  center: { lng, lat },
  roadM: 80,
  rule: 'off-road',
};
const posto = {
  name: 'Posto da Serra',
  kind: 'fuel' as const,
  address: 'Posto da Serra, Serra Alta',
};
const online: Lookup = () => Promise.resolve({ place: posto, answered: true });
const offline: Lookup = () => Promise.resolve({ place: null, answered: false });

const origin = makeStop({
  id: 'o',
  position: 'a0',
  kind: 'origin',
  done_at: '2026-12-12T13:00:00.000Z',
});
const park = makeStop({ id: 'p', position: 'a1', kind: 'nature' });

beforeEach(async () => {
  await db.delete();
  await db.open();
  await db.stops.bulkPut([origin, park]);
  reverse.row = null;
  reverse.fail = false;
});

const register = (lookup: Lookup, uid = UID) =>
  registerAutoStop({ tripId: TRIP_ID, dayId: DAY_ID, uid, start, lookup });

describe('registrar a parada automática', () => {
  it('com o OSM: o nome e o tipo dele, a hora medida, depois da última feita, na outbox', async () => {
    const result = await register(online);
    expect(result.kind).toBe('created');
    const stop = await db.stops.get(result.stop.id);
    expect(stop).toMatchObject({
      source: 'auto',
      kind: 'fuel',
      name: 'Posto da Serra',
      address: 'Posto da Serra, Serra Alta',
      done_at: new Date(ARRIVED).toISOString(),
      done_by: UID,
      departed_at: null,
      time: null,
    });
    expect(comparePosition(stop?.position ?? '', 'a0')).toBeGreaterThan(0);
    expect(comparePosition(stop?.position ?? '', 'a1')).toBeLessThan(0);
    const ops = await db.outbox.toArray();
    expect(ops.map((o) => [o.table, o.op, o.row_id])).toEqual([
      ['stops', 'upsert', result.stop.id],
    ]);
    expect(await pendingNames()).toEqual([]);
  });

  it('sem sinal: "Parada às 14h20", Outro, com as coordenadas, e o nome na fila', async () => {
    const result = await register(offline);
    expect(result.stop).toMatchObject({ name: 'Parada às 14h20', kind: 'other', lat, lng });
    expect(await pendingNames()).toEqual([[result.stop.id, { lat, lng, name: 'Parada às 14h20' }]]);
  });

  it('a do outro celular que já chegou pelo sync vale como a mesma: nada novo', async () => {
    const theirs = makeStop({
      id: 'theirs',
      position: 'a0V',
      source: 'auto',
      kind: 'fuel',
      ...metersAtPlace(5110, 75),
      done_at: new Date(ARRIVED - 60_000).toISOString(),
      done_by: OTHER_UID,
    });
    await db.stops.put(theirs);
    const result = await register(online);
    expect(result).toEqual({ kind: 'existing', stop: theirs });
    expect(await db.stops.count()).toBe(3);
    expect(await db.outbox.count()).toBe(0);
  });

  it('a mesma linha (o mesmo id) que o outro celular já gravou aqui também', async () => {
    const first = await register(online, OTHER_UID);
    await db.outbox.clear();
    const second = await register(online);
    expect(second.kind).toBe('existing');
    expect(second.stop.id).toBe(first.stop.id);
    expect(await db.outbox.count()).toBe(0);
  });

  it('desfazer apaga a parada e lembra o lugar por 2 h', async () => {
    const result = await register(offline);
    if (result.kind !== 'created') throw new Error('não criou');
    await result.undo();
    expect((await db.stops.get(result.stop.id))?.deleted_at).not.toBeNull();
    expect(await pendingNames()).toEqual([]);
    const undone = (await db.sync_state.get(autoKeys.undone(DAY_ID)))?.value;
    const now = Date.now();
    expect(parseUndone(undone, now)).toHaveLength(1);
    expect(parseUndone(undone, now + 2 * 60 * 60_000 + 1)).toHaveLength(0);
  });
});

describe('a saída e o nome que faltava', () => {
  it('a saída medida fecha a parada aberta; um Partiu! tocado antes vale mais', async () => {
    const result = await register(online);
    await endAutoStop(result.stop.id, ARRIVED + 15 * 60_000);
    expect((await db.stops.get(result.stop.id))?.departed_at).toBe(
      new Date(ARRIVED + 15 * 60_000).toISOString(),
    );
    await endAutoStop(result.stop.id, ARRIVED + 30 * 60_000);
    expect((await db.stops.get(result.stop.id))?.departed_at).toBe(
      new Date(ARRIVED + 15 * 60_000).toISOString(),
    );
  });

  it('quando a rede volta, o nome do OSM chega por um patch, e a fila esvazia', async () => {
    const result = await register(offline);
    reverse.row = {
      category: 'amenity',
      type: 'fuel',
      name: 'Posto da Serra',
      display_name: 'Posto da Serra, Serra Alta',
      lat: String(lat),
      lon: String(lng),
    };
    const [[id, entry] = ['', { lat: 0, lng: 0, name: '' }]] = await pendingNames();
    await nameAutoStop(id, entry);
    expect(await db.stops.get(result.stop.id)).toMatchObject({
      name: 'Posto da Serra',
      kind: 'fuel',
      address: 'Posto da Serra, Serra Alta',
    });
    const patch = (await db.outbox.toArray()).at(-1);
    expect(patch?.op).toBe('patch');
    expect(Object.keys(patch?.values ?? {}).sort()).toEqual(['address', 'kind', 'name']);
    expect(await pendingNames()).toEqual([]);
  });

  it('sem rede de novo, fica na fila; renomeada por alguém, sai da fila sem mexer no nome', async () => {
    const result = await register(offline);
    const [[id, entry] = ['', { lat: 0, lng: 0, name: '' }]] = await pendingNames();
    reverse.fail = true;
    await expect(nameAutoStop(id, entry)).rejects.toThrow();
    expect(await pendingNames()).toHaveLength(1);
    await db.stops.update(result.stop.id, { name: 'Lanche da tarde' });
    reverse.fail = false;
    await nameAutoStop(id, entry);
    expect((await db.stops.get(result.stop.id))?.name).toBe('Lanche da tarde');
    expect(await pendingNames()).toEqual([]);
  });
});

describe('a duplicada da corrida rara', () => {
  it('sai a minha, que chegou depois, se ninguém escreveu memória nela', async () => {
    const theirs = makeStop({
      id: 'aaaaaaaa-0000-4000-8000-000000000001',
      position: 'a0V',
      source: 'auto',
      ...metersAtPlace(5100, 80),
      done_at: new Date(ARRIVED).toISOString(),
      done_by: OTHER_UID,
    });
    const mine = {
      ...theirs,
      id: 'bbbbbbbb-0000-4000-8000-000000000002',
      done_by: UID,
      done_at: new Date(ARRIVED + 3_000).toISOString(),
    };
    await db.stops.bulkPut([theirs, mine]);
    await removeDuplicateAutoStops(DAY_ID, UID);
    expect((await db.stops.get(mine.id))?.deleted_at).not.toBeNull();
    expect((await db.stops.get(theirs.id))?.deleted_at).toBeNull();
  });
});
