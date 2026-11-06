import { describe, expect, it } from 'vitest';
import seedDay1 from '@/lib/geo/__fixtures__/seed-dia-1.json';
import type { TravelEvent } from '@/features/travel-mode/events.ts';
import type { DayRoute, TravelState } from '@/lib/db/schema.ts';
import type { PlaceReading } from '@/lib/geo/index.ts';
import { makeStop, UID } from '@/test/factories.ts';
import { gemeoStops } from '@/test/fixtures/dia-gemeo.ts';
import { buildLayout } from './layout.ts';
import {
  CURIOSITY_LONG_MS,
  CURIOSITY_SHORT_MS,
  dayEvents,
  daySpan,
  EVENT_SLOT_MS,
  LIVE_MAX_MS,
  LIVE_MIN_MS,
  MAX_CURIOSITIES,
  pickCuriosities,
  planLiveAdvance,
  planReplay,
  photoCues,
  planReview,
  REPLAY_MAX_MS,
  REPLAY_MIN_MS,
  REVIEW_MAX_CURIOSITIES,
  REVIEW_MAX_MS,
  SMALL_ADVANCE,
} from './replay.ts';

const route: Pick<DayRoute, 'geometry' | 'elevation' | 'legs'> = {
  geometry: seedDay1.geometry as [number, number][],
  elevation: seedDay1.elevation as [number, number][],
  legs: seedDay1.legs,
};
const total_m = route.legs.reduce((a, l) => a + l.distance_m, 0);
/** leitura do lugar sintética: cenários e curiosidades em posições conhecidas */
const place: PlaceReading = {
  segments: [
    { kind: 'field', from_m: 0, to_m: 150_000 },
    { kind: 'serra', from_m: 150_000, to_m: 300_000 },
    { kind: 'beach', from_m: 300_000, to_m: 400_000 },
    { kind: 'city', from_m: 400_000, to_m: total_m, pop: 500_000 },
  ],
  curiosities: [
    { kind: 'highest', at_m: 100_000, caption: 'ponto mais alto do dia: 1.200 m' },
    { kind: 'scenery', at_m: 150_000, caption: 'entrando na serra (serra)', scenery: 'serra' },
    { kind: 'descent', at_m: 200_000, caption: 'desce 600 m em 9 km' },
    { kind: 'scenery', at_m: 300_000, caption: 'chegando ao litoral (praia)', scenery: 'beach' },
    { kind: 'sea', at_m: 320_000, caption: 'o mar a menos de 3 km' },
    {
      kind: 'scenery',
      at_m: 400_000,
      caption: 'cidade grande à frente (cidade grande)',
      scenery: 'city',
    },
  ],
};
const stops = gemeoStops();
const layout = buildLayout({
  dayId: 'r',
  stops,
  route,
  place,
  viewport: { width: 390, height: 520, hudTop: 36, hudBottom: 64 },
});
const node = (i: number) => layout.nodes[i]!;
const prev = (over: Partial<TravelState> = {}): TravelState => ({
  trip_day_id: 'd',
  trip_id: 't',
  fraction: null,
  at: null,
  done_stop_ids: [],
  skipped_stop_ids: [],
  seen_event_ids: [],
  updated_at: '2026-12-11T10:00:00.000Z',
  ...over,
});
const ev = (
  kind: TravelEvent['kind'],
  stopIndex: number,
  by: string | null = UID,
): TravelEvent => ({
  id: `${kind}:${stops[stopIndex]!.id}`,
  kind,
  stop_id: stops[stopIndex]!.id,
  stop_name: stops[stopIndex]!.name,
  at: '2026-12-11T13:40:00.000Z',
  by,
});
const base = { layout, reducedMotion: false, events: [] as TravelEvent[] };

describe('planReplay: quando há replay', () => {
  it('sem travel_state anterior não há replay; com reduzir movimento também não', () => {
    expect(planReplay({ ...base, prev: null, current_s: node(1).s })).toBeNull();
    expect(
      planReplay({ ...base, prev: prev(), current_s: node(1).s, reducedMotion: true }),
    ).toBeNull();
  });

  it('avanço pequeno sem eventos: o carro só aparece no lugar', () => {
    const from = node(0).s;
    const span = daySpan(layout);
    const tiny = from + span * SMALL_ADVANCE * 0.5;
    expect(planReplay({ ...base, prev: prev(), current_s: tiny })).toBeNull();
    const bigger = from + span * SMALL_ADVANCE * 1.5;
    expect(planReplay({ ...base, prev: prev(), current_s: bigger })).not.toBeNull();
  });

  it('avanço pequeno com evento ganha o replay mínimo', () => {
    const plan = planReplay({
      ...base,
      prev: prev(),
      current_s: node(0).s + 1,
      events: [ev('departed', 0)],
    });
    expect(plan?.duration_ms).toBeGreaterThanOrEqual(REPLAY_MIN_MS);
    expect(plan?.duration_ms).toBeLessThan(REPLAY_MIN_MS + 100);
    expect(plan?.cues).toHaveLength(1);
    expect(plan?.event_ids).toEqual([`departed:${stops[0]!.id}`]);
  });
});

describe('planReplay: de onde sai', () => {
  it('da fração anterior, quando existe', () => {
    const plan = planReplay({ ...base, prev: prev({ fraction: 0.25 }), current_s: node(3).s });
    expect(plan?.from_s).toBeCloseTo(layout.fractionToS(0.25), 6);
    expect(plan?.to_s).toBe(node(3).s);
  });

  it('sem fração, do nó da última concluída de então', () => {
    const plan = planReplay({ ...base, prev: prev({ at: stops[1]!.id }), current_s: node(3).s });
    expect(plan?.from_s).toBe(node(1).s);
  });

  it('sem fração e sem última concluída, do primeiro nó', () => {
    const plan = planReplay({ ...base, prev: prev(), current_s: node(2).s });
    expect(plan?.from_s).toBe(node(0).s);
  });

  it('o carro nunca anda para trás: anterior adiante do atual vira um replay parado com as deixas', () => {
    // 0,99 do comprimento real cai depois do nó 1 (que está a 448 de 479 km)
    const plan = planReplay({
      ...base,
      prev: prev({ fraction: 0.99 }),
      current_s: node(1).s,
      events: [ev('skipped', 2)],
    });
    expect(plan?.from_s).toBe(node(1).s);
    expect(plan?.to_s).toBe(node(1).s);
    expect(plan?.cues.map((c) => c.s)).toEqual([node(1).s]);
  });
});

describe('planReplay: duração e deixas', () => {
  it('dura de 3 a 8 s conforme a distância, com o dia inteiro no máximo', () => {
    const whole = planReplay({ ...base, prev: prev(), current_s: node(3).s });
    expect(whole?.duration_ms).toBe(REPLAY_MAX_MS);
    expect(daySpan(layout)).toBeCloseTo(node(3).s - node(0).s, 6);
    const part = planReplay({ ...base, prev: prev(), current_s: node(1).s });
    expect(part?.duration_ms).toBeGreaterThan(REPLAY_MIN_MS);
    expect(part?.duration_ms).toBeLessThan(REPLAY_MAX_MS);
  });

  it('as deixas ficam no s do nó, em ordem, e a curiosidade entre os nós', () => {
    const plan = planReplay({
      ...base,
      prev: prev(),
      current_s: node(3).s,
      events: [ev('team_arrived', 2, 'ana'), ev('arrived', 1), ev('departed', 0)],
    });
    expect(plan).not.toBeNull();
    const ss = plan!.cues.map((c) => c.s);
    expect([...ss].sort((a, b) => a - b)).toEqual(ss);
    const kinds = plan!.cues.flatMap((c) => (c.kind === 'event' ? [c.event.kind] : []));
    expect(kinds).toEqual(['departed', 'arrived', 'team_arrived']);
    expect(plan!.cues.some((c) => c.kind === 'curiosity')).toBe(true);
  });

  it('no máximo 3 curiosidades, encurtadas, com prioridade serra, mar, ponto mais alto, cenário', () => {
    const plan = planReplay({ ...base, prev: prev(), current_s: node(3).s });
    const curiosities = plan!.cues.flatMap((c) => (c.kind === 'curiosity' ? [c] : []));
    expect(curiosities).toHaveLength(MAX_CURIOSITIES);
    const kinds = curiosities.map((c) => c.curiosity);
    expect(kinds).toContain('descent');
    expect(kinds).toContain('sea');
    expect(kinds).toContain('highest');
    expect(kinds).not.toContain('scenery');
    for (const c of curiosities) expect(c.duration_ms).toBe(CURIOSITY_SHORT_MS);
    // em ordem de s depois da escolha
    const ss = curiosities.map((c) => c.s);
    expect([...ss].sort((a, b) => a - b)).toEqual(ss);
  });

  it('o excedente de eventos vira "+N" e todos ficam marcados como vistos', () => {
    const many: TravelEvent[] = Array.from({ length: 9 }, (_, i) => ({
      id: `passed:x${i}`,
      kind: 'passed',
      stop_id: `x${i}`,
      stop_name: `P${i}`,
      at: null,
      by: null,
    }));
    const plan = planReplay({ ...base, prev: prev(), current_s: node(0).s + 1, events: many });
    const slots = Math.max(3, Math.floor(REPLAY_MIN_MS / EVENT_SLOT_MS));
    expect(plan?.cues.filter((c) => c.kind === 'event')).toHaveLength(slots);
    expect(plan?.overflow).toBe(9 - slots);
    expect(plan?.event_ids).toHaveLength(9);
  });

  it('um evento de nó desconhecido dispara no fim', () => {
    const plan = planReplay({
      ...base,
      prev: prev(),
      current_s: node(2).s,
      events: [
        {
          id: 'passed:ghost',
          kind: 'passed',
          stop_id: 'ghost',
          stop_name: 'Fantasma',
          at: null,
          by: null,
        },
      ],
    });
    expect(plan?.cues.find((c) => c.kind === 'event')?.s).toBe(node(2).s);
  });
});

describe('pickCuriosities', () => {
  it('fora do trecho nada entra; com teto 1, entra a de maior prioridade', () => {
    expect(pickCuriosities(layout.curiosities, node(3).s, node(3).s + 5, 3, 1000)).toEqual([]);
    const one = pickCuriosities(layout.curiosities, 0, layout.pathLength, 1, 1000);
    expect(one.flatMap((c) => (c.kind === 'curiosity' ? [c.curiosity] : []))).toEqual(['descent']);
  });
});

describe('planLiveAdvance', () => {
  it('nada a avançar e nenhum evento: null', () => {
    expect(planLiveAdvance(10, 10, [], layout)).toBeNull();
    expect(planLiveAdvance(10, 5, [], layout)).toBeNull();
  });

  it('dura de 1 a 3 s, leva o evento e no máximo uma curiosidade longa', () => {
    const plan = planLiveAdvance(node(0).s, node(3).s, [ev('team_arrived', 3, 'ana')], layout);
    expect(plan?.mode).toBe('live');
    expect(plan?.duration_ms).toBe(LIVE_MAX_MS);
    const curiosities = plan!.cues.flatMap((c) => (c.kind === 'curiosity' ? [c] : []));
    expect(curiosities).toHaveLength(1);
    expect(curiosities[0]?.duration_ms).toBe(CURIOSITY_LONG_MS);
    const short = planLiveAdvance(node(0).s, node(0).s + 1, [], layout);
    expect(short?.duration_ms).toBeGreaterThanOrEqual(LIVE_MIN_MS);
    expect(short?.duration_ms).toBeLessThan(LIVE_MIN_MS + 50);
  });

  it('a suavização do painel pode fixar a duração', () => {
    expect(planLiveAdvance(0, 3, [], layout, { duration_ms: 1000 })?.duration_ms).toBe(1000);
  });
});

describe('planReview e dayEvents', () => {
  const done = stops.map((s, i) =>
    i <= 1
      ? {
          ...s,
          done_at: '2026-12-11T12:00:00.000Z',
          done_by: i === 0 ? UID : 'ana',
          departed_at: i === 0 ? '2026-12-11T07:00:00.000Z' : null,
        }
      : i === 2
        ? { ...s, skipped: true }
        : s,
  );

  it('constrói os eventos do dia das paradas', () => {
    const events = dayEvents(done, UID);
    expect(events.map((e) => e.kind)).toEqual(['departed', 'team_arrived', 'skipped']);
    expect(
      dayEvents([makeStop({ deleted_at: '2026-12-11T00:00:00.000Z', done_at: 'x' })], UID),
    ).toEqual([]);
  });

  it('do primeiro nó ao agora, até 20 s, até 5 curiosidades, sem marcar nada como visto', () => {
    const plan = planReview(layout, done, UID, layout.pathLength);
    expect(plan?.mode).toBe('review');
    expect(plan?.from_s).toBe(node(0).s);
    expect(plan?.to_s).toBe(layout.pathLength);
    expect(plan?.duration_ms).toBe(REVIEW_MAX_MS);
    expect(plan?.cues.filter((c) => c.kind === 'curiosity').length).toBeLessThanOrEqual(
      REVIEW_MAX_CURIOSITIES,
    );
    expect(plan?.cues.filter((c) => c.kind === 'event')).toHaveLength(3);
    expect(plan?.event_ids).toEqual([]);
    expect(plan?.overflow).toBe(0);
  });

  it('nada feito e carro no início: nada a rever', () => {
    expect(planReview(layout, stops, UID, node(0).s)).toBeNull();
  });

  it('as fotos aparecem nos nós, depois do evento, a primeira com +N', () => {
    const at = (i: number) => done[i]?.id ?? '';
    const photos = [
      {
        attachment_id: 'f2',
        stop_id: at(1),
        created_by: 'ana',
        created_at: '2026-12-11T13:50:00Z',
      },
      { attachment_id: 'f1', stop_id: at(1), created_by: UID, created_at: '2026-12-11T13:45:00Z' },
      { attachment_id: 'f3', stop_id: at(0), created_by: UID, created_at: '2026-12-11T07:01:00Z' },
    ];
    const plan = planReview(layout, done, UID, layout.pathLength, photos);
    const cues = plan?.cues ?? [];
    const photo = cues.filter((c) => c.kind === 'photo');
    expect(photo).toHaveLength(2);
    expect(photo[1]).toMatchObject({
      stop_id: at(1),
      attachment_id: 'f1',
      created_by: UID,
      extra: 1,
    });
    // no mesmo nó, o evento antes da foto
    const i1 = cues.findIndex((c) => c.kind === 'event' && c.event.stop_id === at(1));
    const p1 = cues.findIndex((c) => c.kind === 'photo' && c.stop_id === at(1));
    expect(i1).toBeLessThan(p1);
  });

  it('foto de nó fora do trecho ou de parada desconhecida não entra', () => {
    const at0 = done[0]?.id ?? '';
    const last = done.at(-1)?.id ?? '';
    const photos = [
      {
        attachment_id: 'x',
        stop_id: 'nao-existe',
        created_by: UID,
        created_at: '2026-12-11T12:00:00Z',
      },
      { attachment_id: 'y', stop_id: last, created_by: UID, created_at: '2026-12-11T12:00:00Z' },
      { attachment_id: 'z', stop_id: at0, created_by: UID, created_at: '2026-12-11T12:00:00Z' },
    ];
    const cues = photoCues(photos, layout, node(0).s, node(1).s);
    expect(cues.map((c) => (c.kind === 'photo' ? c.attachment_id : ''))).toEqual(['z']);
  });

  it('o replay ao abrir nunca mostra fotos', () => {
    const plan = planReplay({
      prev: {
        trip_day_id: 'd',
        trip_id: 't',
        fraction: null,
        at: null,
        done_stop_ids: [],
        skipped_stop_ids: [],
        seen_event_ids: [],
        updated_at: '2026-12-11T10:00:00Z',
      },
      current_s: layout.pathLength,
      events: [],
      layout,
      reducedMotion: false,
    });
    expect(plan?.cues.some((c) => c.kind === 'photo')).toBe(false);
  });
});
