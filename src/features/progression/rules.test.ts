import { describe, expect, it } from 'vitest';
import { SEA_NEAR_M } from '@/lib/geo/curiosities.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import type { DayRoute, TripTrack } from '@/lib/db/schema.ts';
import {
  DAY_ID,
  makeAttachment,
  makeDay,
  makeExpense,
  makeItem,
  makeMember,
  makeMemory,
  makeReservation,
  makeStop,
  makeTrip,
  OTHER_UID,
  TRIP_ID,
  UID,
} from '@/test/factories.ts';
import { missingRows, progressRows } from './ids.ts';
import {
  COAST_NEAR_M,
  departures,
  deriveProgress,
  importsOf,
  isOnTime,
  isTripConcluded,
  maxDescent,
  type ProgressSnapshot,
} from './rules.ts';

/** 12/12 às 12h de São Paulo: a viagem do seed (11 a 14/12) está em andamento. */
const DURING = Date.parse('2026-12-12T15:00:00Z');
/** 15/12 às 9h: o dia seguinte ao fim, a viagem está concluída. */
const AFTER = Date.parse('2026-12-15T12:00:00Z');
/** 'HH:mm' de São Paulo no dia 11/12 como ISO (UTC-3) */
const at = (hhmm: string, date = '2026-12-11') =>
  new Date(`${date}T${hhmm}:00-03:00`).toISOString();

const OTHER_TRIP = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OTHER_DAY = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

/** Parada com posição em ordem de criação (as posições da fábrica não ordenam passando de 9). */
let pos = 0;
function newStop(over: Parameters<typeof makeStop>[0] = {}) {
  pos += 1;
  return makeStop({ position: `p${String(pos).padStart(5, '0')}`, ...over });
}

function snap(over: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return {
    uid: UID,
    now: DURING,
    trips: [makeTrip()],
    members: [makeMember()],
    days: [makeDay()],
    stops: [],
    memories: [],
    attachments: [],
    items: [],
    expenses: [],
    reservations: [],
    tracks: [],
    routes: [],
    offlineSynced: null,
    imports: [],
    coastDistance: null,
    ...over,
  };
}

function makeTrack(over: Partial<TripTrack> = {}): TripTrack {
  return {
    id: 'f0000000-0000-5000-8000-000000000000',
    trip_id: TRIP_ID,
    trip_day_id: DAY_ID,
    user_id: UID,
    points: [],
    created_at: '2026-12-11T10:00:00.000Z',
    updated_at: '2026-12-11T10:00:00.000Z',
    synced_at: null,
    deleted_at: null,
    ...over,
  };
}

function route(over: Partial<DayRoute> = {}): DayRoute {
  return {
    trip_day_id: DAY_ID,
    trip_id: TRIP_ID,
    hash: 'h',
    provider: 'ors',
    fetched_at: '2026-12-01T10:00:00.000Z',
    geometry: [],
    legs: [],
    elevation: [],
    ...over,
  };
}

const xpOf = (s: ProgressSnapshot) =>
  deriveProgress(s).xp.map((x) => `${x.kind}:${x.ref_id}:${x.points}`);
const keysOf = (s: ProgressSnapshot) => deriveProgress(s).achievements.map((a) => a.key);
const achOf = (s: ProgressSnapshot, key: string) =>
  deriveProgress(s).achievements.find((a) => a.key === key) ?? null;

const otherMember = makeMember({
  id: '4c0e0b5e-6b9b-5d38-8c2a-0d3c7f9e1a11',
  user_id: OTHER_UID,
  role: 'member',
  invited_email: 'ana@exemplo.com',
  updated_at: '2026-11-20T10:00:00.000Z',
});

describe('XP: paradas, quem recebe e viagens de que não é membro', () => {
  it('parada concluída vale 10 para cada membro do time, inclusive quem não marcou', () => {
    const stop = newStop({ done_at: at('13:20'), done_by: OTHER_UID });
    expect(xpOf(snap({ stops: [stop], members: [makeMember(), otherMember] }))).toContain(
      `stop_done:${stop.id}:10`,
    );
  });

  it('nada de viagem em que a pessoa não é membro aceito, nem de viagem excluída', () => {
    const stop = newStop({ done_at: at('13:20') });
    expect(xpOf(snap({ stops: [stop], members: [makeMember({ status: 'pending' })] }))).toEqual([]);
    expect(xpOf(snap({ stops: [stop], members: [] }))).toEqual([]);
    expect(xpOf(snap({ stops: [stop], trips: [makeTrip({ deleted_at: at('20:00') })] }))).toEqual(
      [],
    );
  });

  it('quem entrou depois leva o que já tinha acontecido (a equipe conquista junto)', () => {
    const stop = newStop({ done_at: at('09:00'), done_by: OTHER_UID });
    const lateJoiner = makeMember({ updated_at: at('20:00') });
    expect(xpOf(snap({ stops: [stop], members: [lateJoiner] }))).toContain(
      `stop_done:${stop.id}:10`,
    );
  });

  it('parada excluída não conta', () => {
    const stop = newStop({ done_at: at('13:20'), deleted_at: at('14:00') });
    expect(xpOf(snap({ stops: [stop] }))).toEqual([]);
  });
});

describe('ids determinísticos e idempotência', () => {
  it('XP v5(user_id, kind:ref_id) e conquista v5(user_id, achievement:key)', async () => {
    const stop = newStop({ done_at: at('13:20') });
    const rows = await progressRows(UID, deriveProgress(snap({ stops: [stop] })), at('15:00'));
    expect(rows.xp[0]?.id).toBe(await uuidV5(UID, `stop_done:${stop.id}`));
    expect(rows.achievements[0]).toMatchObject({
      id: await uuidV5(UID, 'achievement:first_stop'),
      key: 'first_stop',
      trip_id: TRIP_ID,
      unlocked_at: at('13:20'),
    });
  });

  it('desmarcar não tira e remarcar não dá de novo: o que já está gravado não muda', async () => {
    const stop = newStop({ done_at: at('13:20') });
    const first = await progressRows(UID, deriveProgress(snap({ stops: [stop] })), at('15:00'));
    const saved = new Set([...first.xp, ...first.achievements].map((r) => r.id));
    // desmarcou: as regras não pedem nada, e nada é apagado (somente-anexar)
    const unmarked = await progressRows(
      UID,
      deriveProgress(snap({ stops: [{ ...stop, done_at: null }] })),
      at('15:10'),
    );
    expect(unmarked.xp).toEqual([]);
    // remarcou mais tarde: o mesmo id, então nada falta
    const again = await progressRows(
      UID,
      deriveProgress(snap({ stops: [{ ...stop, done_at: at('15:20') }] })),
      at('15:30'),
    );
    expect(missingRows(again.xp, saved)).toEqual([]);
    expect(missingRows(again.achievements, saved)).toEqual([]);
  });
});

describe('saídas e pontualidade', () => {
  // o dia 1 do seed, com horários de teste
  const origin = newStop({
    kind: 'origin',
    name: 'Saída de Papanduva',
    time: '07:00',
    departed_at: at('07:04'),
    done_at: at('07:04'),
  });
  const salto = newStop({
    kind: 'nature',
    name: 'Park Salto Ventoso',
    time: '13:30',
    travel_minutes_to_next: 60,
    done_at: at('13:20'),
    departed_at: at('14:31'),
  });
  const hotel = newStop({
    kind: 'hotel',
    name: 'Hotel Steffen',
    time: '16:00',
    done_at: at('15:30'),
    departed_at: at('19:10'),
  });
  const jantar = newStop({
    kind: 'transit',
    name: 'Saída para o jantar',
    time: '19:00',
    done_at: at('19:10'),
    departed_at: at('19:10'),
  });
  const casa = newStop({
    kind: 'origin',
    name: 'Chegada em casa',
    time: '23:00',
    done_at: at('23:10'),
    departed_at: at('23:10'),
  });
  const trip = (stops: ReturnType<typeof makeStop>[]) => ({
    trip: makeTrip(),
    days: [{ day: makeDay(), stops }],
    stops,
  });

  it('nó de saída no começo do dia: o "sair às" é o horário dele, e 4 min depois é pontual', () => {
    const [d] = departures(trip([origin]), []);
    expect(d?.target).toBe(Date.parse(at('07:00')));
    expect(isOnTime(d ?? { at: 0, target: null })).toBe(true);
  });

  it('parada comum: o horário da próxima menos o deslocamento; sair antes é pontual', () => {
    const ds = departures(trip([origin, salto, hotel]), []);
    const d = ds.find((x) => x.stop.id === salto.id);
    expect(d?.target).toBe(Date.parse(at('15:00')));
    expect(isOnTime(d ?? { at: 0, target: null })).toBe(true);
  });

  it('o hotel e o nó de saída do mesmo toque são uma saída só; a chegada em casa não é saída', () => {
    const ds = departures(trip([origin, salto, hotel, jantar, casa]), []);
    expect(ds.map((d) => d.stop.name)).toEqual([
      'Saída de Papanduva',
      'Park Salto Ventoso',
      'Hotel Steffen',
    ]);
    // sem deslocamento informado, o "sair às" é o horário do nó de saída: 19:10 é atraso
    const h = ds.find((d) => d.stop.id === hotel.id);
    expect(h?.target).toBe(Date.parse(at('19:00')));
    expect(isOnTime(h ?? { at: 0, target: null })).toBe(false);
  });

  it('XP de pontualidade só para as saídas no horário; o atraso não ganha', () => {
    const xp = xpOf(snap({ stops: [origin, salto, hotel, jantar, casa] }));
    expect(xp.filter((x) => x.startsWith('departure_on_time'))).toEqual([
      `departure_on_time:${origin.id}:15`,
      `departure_on_time:${salto.id}:15`,
    ]);
  });

  it('a hora real da trilha vale mais que o toque atrasado', () => {
    const cascata = newStop({
      kind: 'nature',
      time: '09:00',
      lat: -26,
      lng: -50,
      travel_minutes_to_next: 30,
      done_at: at('08:00'),
      // o toque veio às 10:10, mas o carro saiu às 9:58 (a trilha viu)
      departed_at: at('10:10'),
    });
    const next = newStop({ kind: 'city', time: '10:30' });
    const track = makeTrack({
      points: [
        [-50, -26, Date.parse(at('09:40')) / 1000],
        [-50, -26.01, Date.parse(at('09:58')) / 1000],
      ],
    });
    const [d] = departures(trip([cascata, next]), [track]);
    expect(d?.at).toBe(Date.parse(at('09:58')));
    expect(isOnTime(d ?? { at: 0, target: null })).toBe(true);
    // sem a trilha, o toque decide: atrasado
    const [tap] = departures(trip([cascata, next]), []);
    expect(isOnTime(tap ?? { at: 0, target: null })).toBe(false);
  });

  it('saída sem "sair às" é neutra: não conta e não quebra a sequência de três', () => {
    const mk = (time: string | null, departed: string, travel: number | null) => [
      newStop({
        kind: 'nature',
        travel_minutes_to_next: travel,
        done_at: departed,
        departed_at: departed,
      }),
      newStop({ kind: 'city', time }),
    ];
    // pontual, neutra, pontual, pontual → a terceira pontual destrava
    const day1 = [...mk('09:00', at('08:00'), 30), ...mk(null, at('10:00'), null)];
    const day2 = [
      ...mk('13:00', '2026-12-12T15:00:00.000Z', 30),
      ...mk('17:00', '2026-12-12T19:00:00.000Z', 30),
    ];
    const DAY2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const s = snap({
      now: AFTER,
      days: [makeDay(), makeDay({ id: DAY2, date: '2026-12-12' })],
      stops: [...day1, ...day2.map((st) => ({ ...st, trip_day_id: DAY2 }))],
    });
    expect(achOf(s, 'on_time_3')?.unlocked_at).toBe('2026-12-12T19:00:00.000Z');
  });

  it('um atraso quebra a sequência', () => {
    const s = snap({
      stops: [
        newStop({ travel_minutes_to_next: 30, done_at: at('08:00'), departed_at: at('08:20') }),
        newStop({
          time: '09:00',
          travel_minutes_to_next: 30,
          done_at: at('08:50'),
          departed_at: at('10:20'),
        }),
        newStop({
          time: '10:30',
          travel_minutes_to_next: 30,
          done_at: at('10:00'),
          departed_at: at('10:30'),
        }),
        newStop({
          time: '11:30',
          travel_minutes_to_next: 30,
          done_at: at('11:00'),
          departed_at: at('11:00'),
        }),
        newStop({ time: '12:00' }),
      ],
    });
    expect(keysOf(s)).not.toContain('on_time_3');
  });

  it('Madrugador: Partiu! antes das 7h de São Paulo', () => {
    const early = { ...origin, departed_at: at('06:50'), done_at: at('06:50') };
    expect(achOf(snap({ stops: [early] }), 'early_bird')?.unlocked_at).toBe(at('06:50'));
    const seven = { ...origin, departed_at: at('07:00'), done_at: at('07:00') };
    expect(keysOf(snap({ stops: [seven] }))).not.toContain('early_bird');
    // a "Chegada em casa" marcada pelo Partiu! antes das 7h (com a saída já feita) não é saída
    const passage = { ...casa, departed_at: at('06:00'), done_at: at('06:00') };
    const late = { ...origin, departed_at: at('08:00'), done_at: at('08:00') };
    expect(keysOf(snap({ stops: [late, passage] }))).not.toContain('early_bird');
  });
});

describe('conquistas de paradas', () => {
  it('Primeiro pé na estrada: a primeira parada concluída, com a hora dela', () => {
    const a = newStop({ done_at: at('13:00') });
    const b = newStop({ done_at: at('09:00') });
    expect(achOf(snap({ stops: [a, b] }), 'first_stop')).toEqual({
      key: 'first_stop',
      trip_id: TRIP_ID,
      unlocked_at: at('09:00'),
    });
  });

  it('Caçador de cascatas soma as viagens; vale a hora e a viagem da terceira', () => {
    const otherTrip = makeTrip({ id: OTHER_TRIP });
    const s = snap({
      trips: [makeTrip(), otherTrip],
      members: [makeMember(), makeMember({ id: 'x', trip_id: OTHER_TRIP })],
      days: [makeDay(), makeDay({ id: OTHER_DAY, trip_id: OTHER_TRIP, date: '2027-01-10' })],
      stops: [
        newStop({ kind: 'nature', done_at: at('09:00') }),
        newStop({ kind: 'nature', done_at: at('11:00') }),
        newStop({
          kind: 'nature',
          done_at: '2027-01-10T13:00:00.000Z',
          trip_id: OTHER_TRIP,
          trip_day_id: OTHER_DAY,
        }),
        newStop({ kind: 'city', done_at: at('10:00') }),
      ],
    });
    expect(achOf(s, 'nature_3')).toEqual({
      key: 'nature_3',
      trip_id: OTHER_TRIP,
      unlocked_at: '2027-01-10T13:00:00.000Z',
    });
    expect(keysOf(snap({ stops: s.stops.slice(0, 2) }))).not.toContain('nature_3');
  });

  it('Enólogo: duas vinícolas no mesmo dia; em dias diferentes, não', () => {
    const DAY2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    const same = snap({
      stops: [
        newStop({ kind: 'winery', done_at: at('13:30') }),
        newStop({ kind: 'winery', done_at: at('16:00') }),
      ],
    });
    expect(achOf(same, 'winery_2')?.unlocked_at).toBe(at('16:00'));
    const split = snap({
      days: [makeDay(), makeDay({ id: DAY2, date: '2026-12-12' })],
      stops: [
        newStop({ kind: 'winery', done_at: at('13:30') }),
        newStop({ kind: 'winery', done_at: '2026-12-12T16:00:00.000Z', trip_day_id: DAY2 }),
      ],
    });
    expect(keysOf(split)).not.toContain('winery_2');
  });

  it('Viajei!: nenhuma pendente; pulada não impede; pendente impede', () => {
    const done = newStop({ done_at: at('10:00') });
    const skipped = newStop({ skipped: true });
    const last = newStop({ done_at: at('18:00') });
    expect(achOf(snap({ stops: [done, skipped, last] }), 'trip_done')?.unlocked_at).toBe(
      at('18:00'),
    );
    expect(keysOf(snap({ stops: [done, newStop()] }))).not.toContain('trip_done');
    expect(keysOf(snap({ stops: [skipped] }))).not.toContain('trip_done');
  });
});

describe('listas, missões, memórias, gastos e reservas', () => {
  it('lista completa: Antes e Mala, cada uma com item e tudo marcado; vale para o time', () => {
    const s = snap({
      items: [
        makeItem({ kind: 'before', done_at: at('09:00', '2026-12-01'), done_by: OTHER_UID }),
        makeItem({ kind: 'pack', done_at: at('09:00', '2026-12-01'), done_by: OTHER_UID }),
        makeItem({ kind: 'pack', done_at: null }),
        makeItem({ kind: 'pack', status: 'dismissed' }),
      ],
    });
    expect(xpOf(s).filter((x) => x.startsWith('checklist_complete'))).toEqual([
      `checklist_complete:${TRIP_ID}:before:20`,
    ]);
  });

  it('item marcado: 2 para quem marcou; missão: os pontos dela para o time, sem os 2', () => {
    const mine = makeItem({ kind: 'before', done_at: at('09:00'), done_by: UID });
    const theirs = makeItem({ kind: 'pack', done_at: at('09:00'), done_by: OTHER_UID });
    const quest = makeItem({ kind: 'quest', points: 20, done_at: at('14:00'), done_by: OTHER_UID });
    const xp = xpOf(snap({ items: [mine, theirs, quest] }));
    expect(xp).toContain(`checklist_item:${mine.id}:2`);
    expect(xp).not.toContain(`checklist_item:${theirs.id}:2`);
    expect(xp).toContain(`quest_done:${quest.id}:20`);
    expect(xp.some((x) => x.startsWith(`checklist_item:${quest.id}`))).toBe(false);
  });

  it('Pronto para partir: as duas listas fechadas antes do primeiro dia (São Paulo)', () => {
    const before = makeItem({ kind: 'before', done_at: '2026-12-10T22:00:00.000Z' });
    const pack = makeItem({ kind: 'pack', done_at: '2026-12-11T02:59:00.000Z' });
    expect(achOf(snap({ items: [before, pack] }), 'ready_to_go')?.unlocked_at).toBe(
      '2026-12-11T02:59:00.000Z',
    );
    // 00:01 do dia 11 em São Paulo já é a viagem
    const late = { ...pack, done_at: '2026-12-11T03:01:00.000Z' };
    expect(keysOf(snap({ items: [before, late] }))).not.toContain('ready_to_go');
    expect(keysOf(snap({ items: [before] }))).not.toContain('ready_to_go');
  });

  it('nota: 5 para quem avaliou; foto: 10 para quem fotografou, uma por parada', () => {
    const stop = newStop({ done_at: at('10:00') });
    const s = snap({
      stops: [stop],
      memories: [
        makeMemory({ stop_id: stop.id, rating: 5 }),
        makeMemory({ id: 'm2', stop_id: stop.id, user_id: OTHER_UID, rating: 4 }),
      ],
      attachments: [
        makeAttachment({ stop_id: stop.id }),
        makeAttachment({ stop_id: stop.id }),
        makeAttachment({ stop_id: stop.id, created_by: OTHER_UID }),
      ],
    });
    const xp = xpOf(s);
    expect(xp.filter((x) => x.startsWith('memory_'))).toEqual([
      `memory_photo:${stop.id}:10`,
      `memory_rating:${stop.id}:5`,
    ]);
  });

  it('Fotógrafo de estrada: fotos minhas em 5 paradas diferentes, somando as viagens', () => {
    const stops = Array.from({ length: 5 }, () => newStop({ done_at: at('10:00') }));
    const photos = stops.map((st, i) =>
      makeAttachment({ stop_id: st.id, created_at: `2026-12-11T1${i}:00:00.000Z` }),
    );
    const extra = makeAttachment({
      stop_id: stops[0]?.id ?? '',
      created_at: '2026-12-11T09:00:00.000Z',
    });
    const s = snap({ stops, attachments: [...photos, extra] });
    expect(achOf(s, 'photographer')?.unlocked_at).toBe('2026-12-11T14:00:00.000Z');
    expect(keysOf(snap({ stops, attachments: photos.slice(0, 4) }))).not.toContain('photographer');
  });

  it('Cronista: o dia terminado com todas as concluídas avaliadas por mim (nó de saída não pede nota)', () => {
    const origin = newStop({ kind: 'origin', done_at: at('07:00'), departed_at: at('07:00') });
    const a = newStop({ kind: 'nature', done_at: at('10:00') });
    const b = newStop({ kind: 'food', done_at: at('13:00') });
    const memories = [
      makeMemory({ id: 'ma', stop_id: a.id, rating: 5, updated_at: at('10:30') }),
      makeMemory({ id: 'mb', stop_id: b.id, rating: 4, updated_at: at('13:40') }),
    ];
    expect(achOf(snap({ stops: [origin, a, b], memories }), 'chronicler')?.unlocked_at).toBe(
      at('13:40'),
    );
    // a nota do outro não vale; o dia com parada pendente e ainda não passado não vale
    const theirs = memories.map((m) => ({ ...m, user_id: OTHER_UID }));
    expect(keysOf(snap({ stops: [origin, a, b], memories: theirs }))).not.toContain('chronicler');
    const pending = newStop({ kind: 'city' });
    expect(
      keysOf(snap({ now: Date.parse(at('14:00')), stops: [origin, a, b, pending], memories })),
    ).not.toContain('chronicler');
    // no dia seguinte, a pendente não segura mais
    expect(keysOf(snap({ stops: [origin, a, b, pending], memories }))).toContain('chronicler');
  });

  it('gasto e reserva: para quem lançou e quem cadastrou', () => {
    const mine = makeExpense({ created_by: UID });
    const theirs = makeExpense({ created_by: OTHER_UID });
    const res = makeReservation({ created_by: UID });
    const xp = xpOf(snap({ expenses: [mine, theirs], reservations: [res] }));
    expect(xp).toContain(`expense_logged:${mine.id}:2`);
    expect(xp).not.toContain(`expense_logged:${theirs.id}:2`);
    expect(xp).toContain(`reservation_added:${res.id}:5`);
  });
});

describe('viagem concluída e orçamento', () => {
  const stop = newStop({ done_at: at('10:00') });

  it('concluída no dia seguinte ao fim, com parada concluída', () => {
    expect(isTripConcluded(makeTrip(), [stop], DURING)).toBe(false);
    // 14/12 às 23h59 de São Paulo ainda é a viagem
    expect(isTripConcluded(makeTrip(), [stop], Date.parse('2026-12-15T02:59:00Z'))).toBe(false);
    expect(isTripConcluded(makeTrip(), [stop], Date.parse('2026-12-15T03:00:00Z'))).toBe(true);
    expect(isTripConcluded(makeTrip(), [newStop()], AFTER)).toBe(false);
  });

  it('viagem concluída: 100 para o time', () => {
    expect(xpOf(snap({ now: AFTER, stops: [stop] }))).toContain(`trip_completed:${TRIP_ID}:100`);
    expect(xpOf(snap({ now: DURING, stops: [stop] }))).not.toContain(
      `trip_completed:${TRIP_ID}:100`,
    );
  });

  it('Dentro do orçamento: soma em centavos ≤ orçamento, com gasto e orçamento definidos', () => {
    const base = { now: AFTER, stops: [stop] };
    const spent = [makeExpense({ amount: 2741 }), makeExpense({ amount: 259 })];
    expect(achOf(snap({ ...base, expenses: spent }), 'on_budget')).toEqual({
      key: 'on_budget',
      trip_id: TRIP_ID,
      unlocked_at: '2026-12-15T03:00:00.000Z',
    });
    expect(
      keysOf(snap({ ...base, expenses: [...spent, makeExpense({ amount: 0.01 })] })),
    ).not.toContain('on_budget');
    expect(keysOf(snap({ ...base, expenses: [] }))).not.toContain('on_budget');
    expect(
      keysOf(snap({ ...base, trips: [makeTrip({ budget: null })], expenses: spent })),
    ).not.toContain('on_budget');
    expect(keysOf(snap({ now: DURING, stops: [stop], expenses: spent }))).not.toContain(
      'on_budget',
    );
  });
});

describe('time, sem sinal, costa e serra', () => {
  it('Equipe formada: vale para os dois lados; convite pendente não', () => {
    const s = snap({ members: [makeMember(), otherMember] });
    expect(achOf(s, 'team')?.unlocked_at).toBe('2026-11-20T10:00:00.000Z');
    const asGuest = snap({
      uid: OTHER_UID,
      members: [makeMember(), otherMember],
    });
    expect(keysOf(asGuest)).toContain('team');
    expect(
      keysOf(snap({ members: [makeMember(), { ...otherMember, status: 'pending' }] })),
    ).not.toContain('team');
  });

  it('Sem sinal, sem problema: a marca da outbox, com a viagem quando a pessoa ainda é membro', () => {
    const offlineSynced = { at: at('15:00'), trip_id: TRIP_ID };
    expect(achOf(snap({ offlineSynced }), 'offline_hero')).toEqual({
      key: 'offline_hero',
      trip_id: TRIP_ID,
      unlocked_at: at('15:00'),
    });
    expect(
      achOf(snap({ offlineSynced: { ...offlineSynced, trip_id: OTHER_TRIP } }), 'offline_hero')
        ?.trip_id,
    ).toBeNull();
  });

  it('Planejador: a primeira parada importada com a IA de cada viagem, para o time todo', () => {
    const typed = newStop({ created_at: '2026-11-20T09:00:00.000Z' });
    const first = newStop({ source: 'ai', created_at: '2026-11-21T10:00:00.000Z' });
    const later = newStop({ source: 'ai', created_at: '2026-11-21T10:00:00.000Z' });
    const elsewhere = newStop({
      source: 'ai',
      trip_id: OTHER_TRIP,
      trip_day_id: OTHER_DAY,
      created_at: '2026-11-19T08:00:00.000Z',
    });
    const stops = [typed, later, first, elsewhere];
    expect(importsOf(stops)).toEqual([
      { trip_id: OTHER_TRIP, at: '2026-11-19T08:00:00.000Z' },
      { trip_id: TRIP_ID, at: '2026-11-21T10:00:00.000Z' },
    ]);
    // a viagem de que a pessoa não é membro conta sem viagem; a mais antiga decide
    expect(achOf(snap({ imports: importsOf(stops) }), 'planner')).toEqual({
      key: 'planner',
      trip_id: null,
      unlocked_at: '2026-11-19T08:00:00.000Z',
    });
    expect(achOf(snap({ imports: importsOf([typed, first]) }), 'planner')?.trip_id).toBe(TRIP_ID);
    // quem viaja junto ganha o mesmo, pela mesma parada
    expect(
      keysOf(
        snap({ uid: OTHER_UID, members: [makeMember(), otherMember], imports: importsOf([first]) }),
      ),
    ).toContain('planner');
    // paradas digitadas não contam
    expect(importsOf([typed])).toEqual([]);
    expect(keysOf(snap({ imports: importsOf([typed]) }))).not.toContain('planner');
  });

  it('Pé na areia: um ponto real a até 3 km do mar; sem a distância da costa, espera', () => {
    expect(COAST_NEAR_M).toBe(SEA_NEAR_M);
    const t = Date.parse(at('11:00')) / 1000;
    const tracks = [
      makeTrack({
        points: [
          [-48.6, -27.6, t + 60],
          [-48.5, -27.6, t],
        ],
      }),
    ];
    const near = (lng: number) => (lng === -48.5 ? 2_500 : 3_500);
    expect(achOf(snap({ tracks, coastDistance: near }), 'coast')?.unlocked_at).toBe(at('11:00'));
    expect(keysOf(snap({ tracks, coastDistance: () => 3_500 }))).not.toContain('coast');
    expect(keysOf(snap({ tracks, coastDistance: null }))).not.toContain('coast');
    // a trilha de quem não compartilha a posição não entra
    const hidden = [makeTrack({ user_id: OTHER_UID, points: [[-48.5, -27.6, t]] })];
    expect(
      keysOf(
        snap({
          tracks: hidden,
          members: [makeMember(), { ...otherMember, share_position: false }],
          coastDistance: near,
        }),
      ),
    ).not.toContain('coast');
  });

  it('Serra abaixo: 500 m de queda nos trechos rodados, do ponto mais alto ao mais baixo depois dele', () => {
    const a = newStop({ lat: -29.3, lng: -50.8, done_at: at('09:00') });
    const b = newStop({ lat: -29.4, lng: -50.9, done_at: at('10:00') });
    const c = newStop({ lat: -29.5, lng: -51.0, done_at: at('11:30') });
    const r = route({
      legs: [
        { distance_m: 10_000, duration_s: 600 },
        { distance_m: 20_000, duration_s: 1_200 },
      ],
      elevation: [
        [0, 900],
        [5_000, 1_000],
        [10_000, 800],
        [20_000, 450],
        [30_000, 300],
      ],
    });
    expect(maxDescent([a, b, c], r)).toEqual({ drop: 700, until: c });
    expect(achOf(snap({ stops: [a, b, c], routes: [r] }), 'downhill')?.unlocked_at).toBe(
      at('11:30'),
    );
    // o trecho da descida não foi rodado: só a subida conta
    const notYet = { ...c, done_at: null };
    expect(maxDescent([a, b, notYet], r)?.drop).toBe(200);
    expect(keysOf(snap({ stops: [a, b, notYet], routes: [r] }))).not.toContain('downhill');
    // sem rota guardada, espera
    expect(keysOf(snap({ stops: [a, b, c] }))).not.toContain('downhill');
  });
});
