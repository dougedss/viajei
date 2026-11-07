import { describe, expect, it } from 'vitest';
import type { DayRoute, TripDay } from '@/lib/db/schema.ts';
import {
  DAY_ID,
  makeAttachment,
  makeDay,
  makeExpense,
  makeItem,
  makeMemory,
  makeStop,
  makeTrip,
  OTHER_UID,
  TRIP_ID,
} from '@/test/factories.ts';
import { FilmClock, filmCamera } from './film.ts';
import { chooseVideo, fileSlug, VIDEO_FRAMES } from './export-format.ts';
import {
  CUE_MS,
  dayLabel,
  doneQuests,
  drivenLegs,
  FILM_MS,
  filmNumbers,
  FINAL_MS,
  finalTexts,
  FLIGHT_MS,
  MAX_PHOTO_CUES,
  MIN_DAY_MS,
  nodePhotos,
  OPENING_MS,
  periodLong,
  planFilm,
  retroState,
  sAt,
  spliceTrip,
  splitAtStops,
  tAt,
  type FilmNode,
} from './rules.ts';

let pos = 0;
function newStop(over: Parameters<typeof makeStop>[0] = {}) {
  pos += 1;
  return makeStop({ position: `p${String(pos).padStart(5, '0')}`, ...over });
}

const DAY2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
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

describe('quando a retrospectiva abre', () => {
  const trip = makeTrip();
  const done = newStop({ done_at: '2026-12-11T15:00:00.000Z' });
  it('do dia seguinte ao fim em diante, se a viagem aconteceu', () => {
    expect(retroState(trip, [done], '2026-12-14')).toEqual({
      status: 'soon',
      opensOn: '2026-12-15',
    });
    expect(retroState(trip, [done], '2026-12-15')).toEqual({ status: 'ready' });
    expect(retroState(trip, [newStop()], '2026-12-20')).toEqual({ status: 'empty' });
  });
});

describe('os números do card final', () => {
  const a = newStop({ lat: -26, lng: -50, done_at: '2026-12-11T10:00:00.000Z' });
  const b = newStop({ lat: -27, lng: -51, done_at: '2026-12-11T14:00:00.000Z' });
  const c = newStop({ lat: -28, lng: -52 });
  const r = route({
    legs: [
      { distance_m: 230_400, duration_s: 4 * 3600 },
      { distance_m: 100_000, duration_s: 2 * 3600 },
    ],
  });

  it('km e horas só dos trechos rodados (as duas pontas concluídas), pela rota real', () => {
    expect(drivenLegs([a, b, c], r)).toHaveLength(1);
    const n = filmNumbers({
      trip: makeTrip({ budget: 3000 }),
      days: [{ day: makeDay(), stops: [a, b, c] }],
      routes: [r],
      expenses: [makeExpense({ amount: 2741 }), makeExpense({ amount: 0.5, deleted_at: 'x' })],
    });
    expect(n).toMatchObject({
      days: 1,
      stops: 2,
      km: 230,
      hours: 4,
      partial: false,
      spentCents: 274_100,
      budgetCents: 300_000,
      onBudget: true,
    });
  });

  it('sem rota guardada, km e horas não aparecem (nunca inventados) e o card avisa que é parcial', () => {
    const n = filmNumbers({
      trip: makeTrip({ budget: null }),
      days: [{ day: makeDay(), stops: [a, b, c] }],
      routes: [],
      expenses: [],
    });
    expect(n).toMatchObject({ km: null, hours: null, partial: true, onBudget: null });
    expect(finalTexts(n)).toEqual({
      stats: [
        { value: '1', label: 'dia' },
        { value: '2', label: 'paradas' },
      ],
      budget: '',
    });
  });

  it('o texto do card: "4 dias · 17 paradas · 18 h de estrada · 1.150 km" e o orçamento', () => {
    const t = finalTexts({
      days: 4,
      stops: 17,
      km: 1150,
      hours: 18,
      partial: false,
      spentCents: 274_100,
      budgetCents: 300_000,
      onBudget: true,
    });
    expect(t.stats.map((s) => `${s.value} ${s.label}`)).toEqual([
      '4 dias',
      '17 paradas',
      '18 h de estrada',
      '1.150 km',
    ]);
    expect(t.budget).toBe('R$ 2.741 de R$ 3.000 · dentro do orçamento');
    expect(
      finalTexts({
        days: 1,
        stops: 1,
        km: null,
        hours: null,
        partial: false,
        spentCents: 320_000,
        budgetCents: 300_000,
        onBudget: false,
      }).budget,
    ).toBe('R$ 3.200 de R$ 3.000 · acima do orçamento');
  });

  it('as datas e o dia, sem fuso', () => {
    expect(periodLong('2026-12-11', '2026-12-14')).toBe('11 a 14 de dezembro de 2026');
    expect(periodLong('2026-12-28', '2027-01-02')).toBe(
      '28 de dezembro de 2026 a 2 de janeiro de 2027',
    );
    expect(dayLabel(2, '2026-12-12')).toBe('Dia 2 · sábado');
  });
});

describe('as fotos dos nós', () => {
  it('a foto da memória mais bem avaliada da parada, só com arquivo no aparelho', () => {
    const st = newStop({ done_at: '2026-12-11T10:00:00.000Z' });
    const mine = makeAttachment({ stop_id: st.id, created_at: '2026-12-11T10:01:00.000Z' });
    const theirs = makeAttachment({
      stop_id: st.id,
      created_by: OTHER_UID,
      created_at: '2026-12-11T10:02:00.000Z',
    });
    const memories = [
      makeMemory({ stop_id: st.id, rating: 4 }),
      makeMemory({ id: 'm2', stop_id: st.id, user_id: OTHER_UID, rating: 5 }),
    ];
    const all = new Set([mine.id, theirs.id]);
    expect(
      nodePhotos({ stops: [st], memories, attachments: [mine, theirs], available: all }),
    ).toEqual([{ stop_id: st.id, attachment_id: theirs.id, rating: 5, user_id: OTHER_UID }]);
    // sem o arquivo da melhor, fica a que o aparelho tem
    expect(
      nodePhotos({
        stops: [st],
        memories,
        attachments: [mine, theirs],
        available: new Set([mine.id]),
      })[0]?.attachment_id,
    ).toBe(mine.id);
  });
});

describe('a emenda das rotas', () => {
  const d1: TripDay = makeDay();
  const d2: TripDay = makeDay({ id: DAY2, date: '2026-12-12' });
  const a = newStop({ lat: -26, lng: -50, done_at: 'x' });
  const b = newStop({ lat: -26.5, lng: -50.5, done_at: 'x' });
  const c = newStop({ trip_day_id: DAY2, lat: -27, lng: -51, done_at: 'x' });
  const e = newStop({ trip_day_id: DAY2, lat: -27.5, lng: -51.5 });
  const r1 = route({
    geometry: [
      [-50, -26],
      [-50.25, -26.25],
      [-50.5, -26.5],
    ],
    legs: [{ distance_m: 70_000, duration_s: 3600 }],
    elevation: [
      [0, 800],
      [70_000, 900],
    ],
  });
  const r2 = route({
    trip_day_id: DAY2,
    geometry: [
      [-51, -27],
      [-51.5, -27.5],
    ],
    legs: [{ distance_m: 75_000, duration_s: 3600 }],
    elevation: [
      [0, 900],
      [75_000, 10],
    ],
  });

  it('um caminho só: os trechos dos dias, uma ponte reta na noite e a altitude emendada', () => {
    const sp = spliceTrip([
      { day: d1, stops: [a, b], route: r1, tracks: [] },
      { day: d2, stops: [c, e], route: r2, tracks: [] },
    ]);
    expect(sp.stops.map((s) => s.id)).toEqual([a.id, b.id, c.id, e.id]);
    expect(sp.dayStarts).toEqual([0, 2]);
    expect(sp.route?.legs).toHaveLength(3);
    expect(sp.route?.legs[1]?.duration_s).toBe(0); // a ponte da noite
    const elev = sp.route?.elevation ?? [];
    expect(elev.map(([d]) => d)).toEqual([...elev.map(([d]) => d)].sort((x, y) => x - y));
  });

  it('sem a rota de um dia, o caminho é estilizado (null)', () => {
    const sp = spliceTrip([
      { day: d1, stops: [a, b], route: r1, tracks: [] },
      { day: d2, stops: [c, e], route: null, tracks: [] },
    ]);
    expect(sp.route).toBeNull();
    expect(sp.stops).toHaveLength(4);
  });

  it('a geometria se corta nas paradas', () => {
    expect(
      splitAtStops(
        [
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ],
        [
          [0, 0],
          [2, 0.01],
          [3, 0],
        ],
      ),
    ).toEqual([
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [
        [2, 0],
        [3, 0],
      ],
    ]);
  });
});

describe('o roteiro de 15 s', () => {
  const nodes: FilmNode[] = [
    { stop_id: 'a', name: 'Saída', day: 0, s: 0 },
    { stop_id: 'b', name: 'Salto Ventoso', day: 0, s: 40 },
    { stop_id: 'c', name: 'Cascata', day: 1, s: 60 },
    { stop_id: 'd', name: 'Gramado', day: 1, s: 200 },
  ];
  const days = [
    { day: 0, label: 'Dia 1 · sexta' },
    { day: 1, label: 'Dia 2 · sábado' },
  ];

  it('abertura, sobrevoo e card final somam 15 s', () => {
    const plan = planFilm({ nodes, days, photos: [], quests: [] });
    expect(OPENING_MS + FLIGHT_MS + FINAL_MS).toBe(FILM_MS);
    expect(plan.duration).toBe(FILM_MS);
    expect(plan.opening).toEqual({ t0: 0, t1: OPENING_MS });
    expect(plan.final).toEqual({ t0: OPENING_MS + FLIGHT_MS, t1: FILM_MS });
    expect(plan.keys[0]).toEqual({ t: OPENING_MS, s: 0 });
    expect(plan.keys.at(-1)).toEqual({ t: OPENING_MS + FLIGHT_MS, s: 200 });
  });

  it('cada dia tem pelo menos 1,2 s, e o carro anda sempre para a frente', () => {
    const plan = planFilm({ nodes, days, photos: [], quests: [] });
    const [, end1] = plan.keys;
    expect((end1?.t ?? 0) - OPENING_MS).toBeGreaterThanOrEqual(MIN_DAY_MS);
    let prev = -1;
    for (let t = 0; t <= FILM_MS; t += 100) {
      const s = sAt(plan, t);
      expect(s).toBeGreaterThanOrEqual(prev);
      prev = s;
    }
    expect(sAt(plan, 0)).toBe(0);
    expect(sAt(plan, FILM_MS)).toBe(200);
  });

  it('as fotos aparecem quando o carro passa pelo nó, as de maior nota primeiro, sem sobrepor', () => {
    const photos = nodes.map((n, i) => ({
      stop_id: n.stop_id,
      attachment_id: `f${i}`,
      rating: i === 2 ? 5 : 3,
      user_id: 'u',
    }));
    const plan = planFilm({ nodes, days, photos, quests: [{ stop_id: 'd', text: 'Mate' }] });
    const cues = plan.cues.filter((c) => c.kind === 'photo');
    expect(cues.length).toBeLessThanOrEqual(MAX_PHOTO_CUES);
    expect(cues.some((c) => c.stop_id === 'c')).toBe(true);
    for (let i = 1; i < cues.length; i++) {
      expect((cues[i]?.t ?? 0) - (cues[i - 1]?.t ?? 0)).toBeGreaterThanOrEqual(CUE_MS);
    }
    const c = cues.find((x) => x.stop_id === 'c');
    expect(Math.abs((c?.t ?? 0) - tAt(plan, 60))).toBeLessThan(30);
    // na ordem do tempo, e todas dentro do sobrevoo
    expect(plan.cues.map((x) => x.t)).toEqual([...plan.cues.map((x) => x.t)].sort((x, y) => x - y));
    expect(plan.cues.every((x) => x.t >= OPENING_MS && x.until <= OPENING_MS + FLIGHT_MS)).toBe(
      true,
    );
  });

  it('sem foto: só os chips dos dias; um dia só, nem chip', () => {
    const plan = planFilm({ nodes, days, photos: [], quests: [] });
    expect(plan.cues.map((c) => c.kind)).toEqual(['day', 'day']);
    const one = planFilm({
      nodes: nodes.slice(0, 2),
      days: days.slice(0, 1),
      photos: [],
      quests: [],
    });
    expect(one.cues).toEqual([]);
  });

  it('as missões feitas entram onde sobra lugar', () => {
    const q = makeItem({
      kind: 'quest',
      points: 20,
      stop_id: 'b',
      done_at: 'x',
      text: 'Registrar o rótulo',
    });
    expect(doneQuests([q, makeItem({ kind: 'quest', points: 10, stop_id: 'c' })])).toEqual([
      { stop_id: 'b', text: 'Registrar o rótulo' },
    ]);
    const plan = planFilm({ nodes, days, photos: [], quests: doneQuests([q]) });
    expect(plan.cues.find((c) => c.kind === 'quest')).toMatchObject({
      stop_id: 'b',
      text: 'Registrar o rótulo',
    });
  });
});

describe('o relógio e a câmera do filme', () => {
  it('o relógio anda, para no fim e segura o "Pular"', () => {
    const clock = new FilmClock(FILM_MS);
    expect(clock.t(1000)).toBe(0);
    clock.play(1000);
    expect(clock.t(4000)).toBe(3000);
    expect(clock.settle(4000)).toBe(false);
    expect(clock.settle(1000 + FILM_MS)).toBe(true);
    expect(clock.playing).toBe(false);
    expect(clock.t(99_999)).toBe(FILM_MS);
    clock.hold(12_500);
    expect(clock.t(0)).toBe(12_500);
  });

  it('a câmera desce da viagem inteira até o carro, segue e sobe no fim (função pura de t)', () => {
    const plan = planFilm({
      nodes: [
        { stop_id: 'a', name: 'A', day: 0, s: 0 },
        { stop_id: 'b', name: 'B', day: 0, s: 100 },
      ],
      days: [{ day: 0, label: 'Dia 1' }],
      photos: [],
      quests: [],
    });
    const layout = {
      camera: { target: [0, 0, 50] as [number, number, number], distance: 300, tilt: 1.1, fov: 30 },
      pathAt: (s: number) => ({ x: 0, y: 0, z: s }),
    };
    expect(filmCamera(layout, plan, 0).distance).toBe(300);
    const mid = filmCamera(layout, plan, OPENING_MS + FLIGHT_MS / 2);
    expect(mid.distance).toBeLessThan(150);
    expect(filmCamera(layout, plan, 7000)).toEqual(filmCamera(layout, plan, 7000));
    expect(filmCamera(layout, plan, FILM_MS).distance).toBeGreaterThan(mid.distance);
  });
});

describe('a exportação', () => {
  it('a escolha do formato pela detecção: H.264 em MP4, VP9 em WebM, MediaRecorder, nada', () => {
    const none = { avc: false, vp9: false, vp8: false };
    const noRec = { mp4: null, webm: null };
    expect(chooseVideo({ webcodecs: { ...none, avc: true, vp9: true }, recorder: noRec })).toEqual({
      path: 'webcodecs',
      codec: 'avc',
      container: 'mp4',
    });
    expect(chooseVideo({ webcodecs: { ...none, vp9: true }, recorder: noRec })).toMatchObject({
      codec: 'vp9',
      container: 'webm',
    });
    expect(
      chooseVideo({ webcodecs: none, recorder: { mp4: 'video/mp4', webm: 'video/webm' } }),
    ).toEqual({ path: 'recorder', container: 'mp4', mime: 'video/mp4' });
    expect(chooseVideo({ webcodecs: none, recorder: noRec })).toEqual({ path: 'none' });
  });

  it('450 quadros (15 s a 30 fps) e o nome do arquivo sem acento', () => {
    expect(VIDEO_FRAMES).toBe(450);
    expect(fileSlug('RS — concurso em Montenegro')).toBe('viajei-rs-concurso-em-montenegro');
    expect(fileSlug('!!!')).toBe('viajei');
  });
});
