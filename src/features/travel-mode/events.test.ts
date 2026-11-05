import { describe, expect, it } from 'vitest';
import type { TravelState } from '@/lib/db/schema.ts';
import { DAY_ID, makeStop, TRIP_ID, UID } from '@/test/factories.ts';
import { eventsSince, snapshotTravelState } from './events.ts';

const origin = () =>
  makeStop({ id: 'o', position: 'a0', kind: 'origin', name: 'Saída de Papanduva' });
const park = () => makeStop({ id: 'p', position: 'a1', kind: 'nature', name: 'Parque' });
const hotel = () => makeStop({ id: 'h', position: 'a2', kind: 'hotel', name: 'Hotel' });

const prev = (over: Partial<TravelState> = {}): TravelState => ({
  trip_day_id: DAY_ID,
  trip_id: TRIP_ID,
  fraction: 0,
  at: null,
  done_stop_ids: [],
  skipped_stop_ids: [],
  seen_event_ids: [],
  updated_at: '2026-12-11T09:00:00.000Z',
  ...over,
});

describe('eventsSince', () => {
  it('sem estado anterior não há "desde a última vez"', () => {
    expect(eventsSince(null, [{ ...origin(), done_at: 'x' }], UID)).toEqual([]);
  });

  it('saída, chegada minha, chegada do time e pulada, em ordem do dia', () => {
    const stops = [
      { ...origin(), done_at: '2026-12-11T10:00:00.000Z', departed_at: 'x', done_by: UID },
      { ...park(), done_at: '2026-12-11T16:40:00.000Z', done_by: 'ana' },
      { ...hotel(), skipped: true },
    ];
    const events = eventsSince(prev(), stops, UID);
    expect(events.map((e) => e.kind)).toEqual(['departed', 'team_arrived', 'skipped']);
    expect(events[1]).toEqual({
      id: 'team_arrived:p',
      kind: 'team_arrived',
      stop_id: 'p',
      stop_name: 'Parque',
      at: '2026-12-11T16:40:00.000Z',
      by: 'ana',
    });
    expect(eventsSince(prev(), [{ ...park(), done_at: 'x', done_by: UID }], UID)[0]?.kind).toBe(
      'arrived',
    );
  });

  it('o que já estava concluído ou já foi visto não volta', () => {
    const stops = [
      { ...origin(), done_at: 'x' },
      { ...park(), done_at: 'y', done_by: 'ana' },
    ];
    expect(eventsSince(prev({ done_stop_ids: ['o'] }), stops, UID).map((e) => e.id)).toEqual([
      'team_arrived:p',
    ]);
    expect(
      eventsSince(prev({ seen_event_ids: ['departed:o', 'team_arrived:p'] }), stops, UID),
    ).toEqual([]);
  });

  it('paradas passadas entram como pergunta, sem hora', () => {
    const events = eventsSince(prev(), [origin(), park()], UID, [park()]);
    expect(events).toEqual([
      { id: 'passed:p', kind: 'passed', stop_id: 'p', stop_name: 'Parque', at: null, by: null },
    ]);
  });
});

describe('snapshotTravelState', () => {
  it('guarda concluídas, puladas, onde o carro está e os eventos vistos, sem repetir', () => {
    const o = { ...origin(), done_at: 'x' };
    const s = snapshotTravelState(
      DAY_ID,
      TRIP_ID,
      [o, { ...park(), skipped: true }, hotel()],
      o,
      0.42,
      ['departed:o', 'departed:o'],
      new Date('2026-12-11T12:00:00.000Z'),
    );
    expect(s).toEqual({
      trip_day_id: DAY_ID,
      trip_id: TRIP_ID,
      fraction: 0.42,
      at: 'o',
      done_stop_ids: ['o'],
      skipped_stop_ids: ['p'],
      seen_event_ids: ['departed:o'],
      updated_at: '2026-12-11T12:00:00.000Z',
    });
  });
});
