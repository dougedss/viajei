import { beforeAll, describe, expect, it } from 'vitest';
import { validateImport, type ImportData } from '@shared/import-schema.ts';
import raw from '../../../supabase/seed/viagem-rs.json';
import { comparePosition } from '@/lib/ids/position.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import type { TripDay } from '@/lib/db/schema.ts';
import {
  makeContact,
  makeDay,
  makeItem,
  makeReservation,
  makeStop,
  makeTrip,
  TRIP_ID,
  UID,
} from '@/test/factories.ts';
import {
  canExtendTo,
  datesNeeded,
  planCounts,
  planImport,
  planWrites,
  positionsFor,
  rangeFor,
  reviewOf,
  type Existing,
  type PlanContext,
  type Review,
} from './plan.ts';
import { setDayIncluded, setLooseDestination } from './review-edit.ts';

const seed = validateImport(raw);
/** o que a IA devolve para o texto do seed: o seed sem coordenada */
const fromAi: ImportData = {
  ...seed,
  days: seed.days.map((d) => ({
    ...d,
    stops: d.stops.map((s) => ({ ...s, lat: null, lng: null })),
  })),
};
const DATES = ['2026-12-11', '2026-12-12', '2026-12-13', '2026-12-14'];
const NOW = '2026-11-20T12:00:00.000Z';

let days: TripDay[] = [];
const dayIds: Record<string, string> = {};
beforeAll(async () => {
  for (const date of [...DATES, '2026-12-10', '2026-12-15', '2027-03-01']) {
    dayIds[date] = await uuidV5(TRIP_ID, date);
  }
  days = DATES.map((date) => makeDay({ id: dayIds[date] ?? '', date }));
});

function ctx(source: 'ai' | 'user' = 'ai'): PlanContext {
  let n = 0;
  return {
    uid: UID,
    now: NOW,
    dayIds,
    newId: () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, '0')}`,
    source,
  };
}

function existing(over: Partial<Existing> = {}): Existing {
  return {
    trip: makeTrip(),
    days,
    stops: [],
    reservations: [],
    contacts: [],
    items: [],
    ...over,
  };
}

const ordered = (positions: readonly string[]) =>
  positions.every((p, i) => i === 0 || comparePosition(positions[i - 1] ?? '', p) < 0);

describe('importar numa viagem vazia', () => {
  it('o seed inteiro entra: 18 paradas nos 4 dias, na ordem do texto, com a origem ai', () => {
    const review = reviewOf(fromAi, existing());
    const plan = planImport(review, existing(), ctx());
    expect(planCounts(plan)).toEqual({
      days: 4,
      stops: 18,
      reservations: 2,
      contacts: 6,
      items: 15,
    });
    expect(plan.trip).toBeNull();
    expect(plan.newDays).toEqual([]);
    expect(plan.stops.every((s) => s.source === 'ai' && s.lat === null && s.lng === null)).toBe(
      true,
    );
    for (const date of DATES) {
      const dayStops = plan.stops.filter((s) => s.trip_day_id === dayIds[date]);
      const fromText = fromAi.days.find((d) => d.date === date)?.stops.map((s) => s.name);
      expect(dayStops.map((s) => s.name)).toEqual(fromText);
      expect(ordered(dayStops.map((s) => s.position))).toBe(true);
    }
    // o título do texto vai para o dia que estava sem
    expect(plan.dayPatches).toHaveLength(4);
    expect(plan.dayPatches[0]?.changes).toEqual({ title: 'Papanduva → Serra Gaúcha' });
  });

  it('sem horário no texto continua sem horário; nada é inventado', () => {
    const plan = planImport(reviewOf(fromAi, existing()), existing(), ctx());
    for (const [i, stop] of plan.stops.entries()) {
      const source = fromAi.days.flatMap((d) => d.stops)[i];
      expect(stop.time).toBe(source?.time);
      expect(stop.closes_at).toBe(source?.closes_at);
      expect(stop.travel_minutes_to_next).toBe(source?.travel_minutes_to_next);
    }
  });

  it('reservas ligadas às paradas novas pelo nome; listas ativas, revisadas, com a origem ai', () => {
    const plan = planImport(reviewOf(fromAi, existing()), existing(), ctx());
    const hotel = plan.stops.find((s) => s.name === 'Hotel Steffen');
    expect(plan.reservations[0]?.stop_id).toBe(hotel?.id);
    expect(plan.reservations.every((r) => r.created_by === UID)).toBe(true);
    expect(plan.items.every((i) => i.source === 'ai' && i.status === 'active')).toBe(true);
    expect(plan.items.filter((i) => i.kind === 'quest').some((q) => q.stop_id !== null)).toBe(true);
  });

  it('o carregador do exemplo passa pelo mesmo caminho, com a origem user e as coordenadas do arquivo', () => {
    const plan = planImport(reviewOf(seed, existing()), existing(), ctx('user'));
    expect(plan.stops.every((s) => s.source === 'user')).toBe(true);
    expect(plan.items.every((i) => i.source === 'user')).toBe(true);
    expect(plan.stops.filter((s) => s.lat !== null)).toHaveLength(
      seed.days.flatMap((d) => d.stops).filter((s) => s.lat !== null).length,
    );
  });
});

describe('acrescentar a uma viagem que já tem roteiro', () => {
  const day1 = () => dayIds['2026-12-11'] ?? '';
  const known = () => [
    makeStop({ trip_day_id: day1(), name: 'Saída de Papanduva', time: '07:00:00', position: 'a0' }),
    makeStop({ trip_day_id: day1(), name: 'Almoço na estrada', time: '12:00:00', position: 'a1' }),
  ];

  it('o que já existe começa desmarcado e nada do que existe é tocado', () => {
    const before = existing({
      stops: known(),
      days: days.map((d) => (d.date === '2026-12-11' ? { ...d, title: 'Ida' } : d)),
      reservations: [makeReservation({ name: 'Hotel Steffen' })],
      contacts: [makeContact({ phone: '+5551997527596' })],
      items: [makeItem({ kind: 'pack', text: 'Carregador do celular' })],
    });
    const review = reviewOf(fromAi, before);
    const first = review.days[0]?.stops[0];
    expect(first?.name).toBe('Saída de Papanduva');
    expect(first?.repeated).toBe('trip');
    expect(first?.include).toBe(false);
    expect(review.reservations.find((r) => r.name === 'Hotel Steffen')?.include).toBe(false);
    expect(review.contacts.filter((c) => !c.include)).toHaveLength(1);

    const plan = planImport(review, before, ctx());
    expect(plan.stops.some((s) => s.name === 'Saída de Papanduva')).toBe(false);
    // o dia que já tinha título fica com o dele
    expect(plan.dayPatches.find((p) => p.id === day1())).toBeUndefined();
    expect(plan.reservations.map((r) => r.name)).toEqual(['Vila Suzana Parque Hotel']);
    // nenhuma escrita em linha que já existia, além do título dos dias sem título
    const writes = planWrites(plan, TRIP_ID);
    const known_ids = new Set(before.stops.map((s) => s.id));
    expect(writes.some((w) => w.kind === 'patch' && known_ids.has(w.id))).toBe(false);
    expect(writes.filter((w) => w.kind === 'patch').every((w) => w.table === 'trip_days')).toBe(
      true,
    );
  });

  it('cada parada nova entra depois da última que já existia com horário menor ou igual', () => {
    const incoming = [{ time: '08:00' }, { time: '13:30' }, { time: null }];
    const existingStops = known();
    const positions = positionsFor(existingStops, incoming);
    const all = [
      ...existingStops.map((s) => ({ name: s.name, position: s.position })),
      ...['Café', 'Parque', 'Sem hora'].map((name, i) => ({ name, position: positions[i] ?? '' })),
    ].sort((a, b) => comparePosition(a.position, b.position));
    expect(all.map((s) => s.name)).toEqual([
      'Saída de Papanduva',
      'Café',
      'Almoço na estrada',
      'Parque',
      'Sem hora',
    ]);
  });

  it('a ordem do texto nunca se inverte, e sem horário no roteiro tudo vai para o fim', () => {
    const existingStops = known();
    const late = positionsFor(existingStops, [{ time: '13:00' }, { time: '09:00' }]);
    expect(comparePosition('a1', late[0] ?? '')).toBeLessThan(0);
    expect(ordered(late)).toBe(true);
    const untimed = existingStops.map((s) => ({ ...s, time: null }));
    const atEnd = positionsFor(untimed, [{ time: '06:00' }, { time: null }]);
    expect(atEnd.every((p) => comparePosition('a1', p) < 0)).toBe(true);
    expect(ordered(atEnd)).toBe(true);
  });

  it('importar o mesmo texto duas vezes não duplica nada', () => {
    const first = planImport(reviewOf(fromAi, existing()), existing(), ctx());
    const after = existing({
      stops: first.stops.map((s) => ({ ...s, synced_at: null })),
      reservations: first.reservations.map((r) => ({ ...r, synced_at: null })),
      contacts: first.contacts.map((c) => ({ ...c, synced_at: null })),
      items: first.items.map((i) => ({ ...i, synced_at: null })),
    });
    expect(planCounts(planImport(reviewOf(fromAi, after), after, ctx()))).toEqual({
      days: 0,
      stops: 0,
      reservations: 0,
      contacts: 0,
      items: 0,
    });
  });
});

describe('dias fora das datas, repetidas e não classificados', () => {
  const extra: ImportData = {
    ...fromAi,
    days: [
      ...fromAi.days,
      {
        date: '2026-12-15',
        title: 'Dia extra',
        stops: [
          {
            time: null,
            kind: 'city',
            name: 'Gramado',
            address: null,
            closes_at: null,
            travel_minutes_to_next: null,
            notes: null,
            url: null,
            lat: null,
            lng: null,
          },
          {
            time: null,
            kind: 'city',
            name: 'gramado ',
            address: null,
            closes_at: null,
            travel_minutes_to_next: null,
            notes: null,
            url: null,
            lat: null,
            lng: null,
          },
        ],
      },
    ],
    unclassified: ['Levar o carregador do carro', 'Ver se o hotel aceita pet', 'Bobagem'],
  };

  it('o dia fora fica de fora até a pessoa ampliar; ampliar cria o dia e muda as datas', () => {
    const review = reviewOf(extra, existing());
    const outside = review.days.at(-1);
    expect(outside?.outside).toBe(true);
    expect(outside?.include).toBe(false);
    expect(planImport(review, existing(), ctx()).stops).toHaveLength(18);

    const extended = setDayIncluded(review, '2026-12-15', true);
    expect(rangeFor(makeTrip(), extended)).toEqual({
      start_date: '2026-12-11',
      end_date: '2026-12-15',
    });
    expect(datesNeeded(extended, makeTrip())).toContain('2026-12-15');
    const plan = planImport(extended, existing(), ctx());
    expect(plan.trip).toEqual({ start_date: '2026-12-11', end_date: '2026-12-15' });
    expect(plan.newDays).toEqual([
      expect.objectContaining({ date: '2026-12-15', title: 'Dia extra', id: dayIds['2026-12-15'] }),
    ]);
    expect(planWrites(plan, TRIP_ID)[0]).toEqual({
      kind: 'patch',
      table: 'trips',
      id: TRIP_ID,
      changes: { start_date: '2026-12-11', end_date: '2026-12-15' },
    });
  });

  it('ampliar não passa do limite de dias de uma viagem', () => {
    const far: Review = {
      ...reviewOf(extra, existing()),
      days: [{ date: '2027-03-01', title: null, stops: [], outside: true, include: false }],
    };
    expect(canExtendTo(makeTrip(), far, '2027-03-01')).toBe(false);
    expect(canExtendTo(makeTrip(), reviewOf(extra, existing()), '2026-12-15')).toBe(true);
  });

  it('a mesma parada duas vezes no mesmo dia é marcada, sem ser tirada', () => {
    const day = reviewOf(extra, existing()).days.at(-1);
    expect(day?.stops.map((s) => [s.repeated, s.include])).toEqual([
      [null, true],
      ['text', true],
    ]);
  });

  it('cada não classificado vai para onde a pessoa mandou', () => {
    let review = reviewOf(extra, existing());
    const steffen = review.days[0]?.stops.find((s) => s.name === 'Hotel Steffen');
    review = setLooseDestination(review, 'u0', { kind: 'pack' });
    review = setLooseDestination(review, 'u1', { kind: 'stop_note', stop: steffen?.key ?? '' });
    review = setLooseDestination(review, 'u2', { kind: 'discard' });
    const plan = planImport(review, existing(), ctx());
    expect(plan.items.filter((i) => i.kind === 'pack').at(-1)?.text).toBe(
      'Levar o carregador do carro',
    );
    expect(plan.stops.find((s) => s.name === 'Hotel Steffen')?.notes).toMatch(
      /\nVer se o hotel aceita pet$/,
    );
    expect(JSON.stringify(plan)).not.toContain('Bobagem');

    const toDay = planImport(
      setLooseDestination(reviewOf(extra, existing()), 'u0', {
        kind: 'day_note',
        date: '2026-12-12',
      }),
      existing(),
      ctx(),
    );
    expect(toDay.dayPatches.find((p) => p.id === dayIds['2026-12-12'])?.changes).toEqual({
      title: 'Cascatas de Alto Feliz e Montenegro',
      notes: 'Levar o carregador do carro',
    });
  });
});
