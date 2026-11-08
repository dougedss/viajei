import { describe, expect, it } from 'vitest';
import { indexRoute, projectOntoRoute } from '@/lib/geo/project.ts';
import { ForgedTrack, metersAt, ROAD } from './__fixtures__/tracks.ts';
import {
  ANY_DWELL_MS,
  createStopDetector,
  OFF_ROAD_DWELL_MS,
  SAME_PLACE_MS,
  type DetectorContext,
  type DetectorEvent,
  type KnownAutoStop,
} from './stop-detector.ts';

/**
 * O detector com trilhas forjadas (fase 15): uma estrada reta e o carro que para num posto, num
 * restaurante da rua paralela, no congestionamento, no semáforo, dá a volta no quarteirão, entra no
 * GPS econômico e some com o app fechado. Cada evento leva a hora da leitura que o fez sair.
 */
const route = indexRoute(ROAD);
const onRoad: DetectorContext = {
  roadDistanceM: (p) => projectOntoRoute(route, p).distance_m,
  planned: [],
  known: [],
};

type Emitted = DetectorEvent & { emittedAt: number };

/**
 * Passa a trilha pelo detector. Com `remember`, faz o que o hook faz: cada parada que começa entra
 * nas conhecidas (e a saída fecha o horário dela), para o "um lugar só a cada 2 h".
 */
function run(
  track: ForgedTrack,
  ctx: DetectorContext = onRoad,
  { remember = false }: { remember?: boolean } = {},
): Emitted[] {
  const detector = createStopDetector();
  const known: KnownAutoStop[] = [...ctx.known];
  const out: Emitted[] = [];
  for (const fix of track.fixes()) {
    for (const e of detector.push(fix, { ...ctx, known })) {
      out.push({ ...e, emittedAt: fix.t });
      if (!remember) continue;
      if (e.kind === 'start') known.push({ ...e.center, from: e.arrivedAt, to: null });
      else {
        const last = known.at(-1);
        if (last) last.to = e.leftAt;
      }
    }
  }
  return out;
}

const min = (ms: number) => ms / 60_000;
const placeAt = (x: number, y: number) => {
  const [lng, lat] = metersAt(x, y);
  return { lng, lat };
};

describe('o detector de paradas', () => {
  it('um posto à beira da estrada: 8 min a 80 m da linha viram parada, e a saída fecha', () => {
    const track = new ForgedTrack().drive(5000, 0, 80).drive(5100, 80, 20);
    const arrived = track.t * 1000;
    track.stay(12);
    const left = track.t * 1000;
    track.drive(5200, 0, 20).drive(9000, 0, 80);
    const events = run(track);
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    const [start, end] = events;
    if (start?.kind !== 'start' || end?.kind !== 'end') throw new Error('eventos');
    expect(start.rule).toBe('off-road');
    expect(start.roadM).toBeGreaterThan(70);
    expect(start.roadM).toBeLessThan(90);
    // a chegada medida é a da primeira leitura do grupo: poucos segundos antes de parar
    expect(Math.abs(start.arrivedAt - arrived)).toBeLessThan(30_000);
    // e a parada só se registra depois dos 8 min
    expect(start.emittedAt - start.arrivedAt).toBeGreaterThanOrEqual(OFF_ROAD_DWELL_MS);
    expect(start.emittedAt - start.arrivedAt).toBeLessThan(OFF_ROAD_DWELL_MS + 10_000);
    expect(start.center.lat).toBeCloseTo(placeAt(5100, 80).lat, 4);
    // a saída é a primeira leitura a mais de 60 m, segundos depois de o carro andar
    expect(end.leftAt - left).toBeGreaterThan(0);
    expect(end.leftAt - left).toBeLessThan(20_000);
  });

  it('um restaurante numa rua paralela, a 300 m da estrada', () => {
    const track = new ForgedTrack()
      .drive(3000, 0, 60)
      .drive(3000, 300, 30)
      .stay(45, { everyS: 10 })
      .drive(3000, 0, 30)
      .drive(8000, 0, 60);
    const events = run(track);
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    const start = events[0];
    if (start?.kind !== 'start') throw new Error('início');
    expect(start.rule).toBe('off-road');
    expect(start.roadM).toBeGreaterThan(280);
  });

  it('um congestionamento de 15 min na estrada é trânsito: nada', () => {
    const track = new ForgedTrack()
      .drive(4000, 0, 80)
      .drive(4000, 3, 5)
      .stay(15)
      .drive(9000, 0, 80);
    expect(run(track)).toEqual([]);
  });

  it('parado 25 min em cima da estrada vira parada pela regra dos 20 min, com o Desfazer na tela', () => {
    // a curva de 20 min é a mesma da calçada do restaurante na rua da rota: o detector não as separa
    const track = new ForgedTrack().drive(4000, 0, 80).drive(4000, 3, 5);
    const stopped = track.t * 1000;
    track.stay(25).drive(9000, 0, 80);
    const events = run(track);
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    const start = events[0];
    if (start?.kind !== 'start') throw new Error('início');
    expect(start.rule).toBe('long');
    expect(start.roadM).toBeLessThan(25);
    expect(start.emittedAt - stopped).toBeGreaterThanOrEqual(ANY_DWELL_MS - 30_000);
  });

  it('o semáforo, na estrada ou numa rua da cidade: nada', () => {
    const track = new ForgedTrack()
      .drive(2000, 0, 60)
      .stay(1.5, { everyS: 2 })
      .drive(2600, 150, 30)
      .stay(2, { everyS: 2 })
      .drive(6000, 0, 60);
    expect(run(track)).toEqual([]);
  });

  it('a volta no quarteirão procurando vaga, por 10 min: nada', () => {
    const track = new ForgedTrack().drive(1000, 0, 60).drive(1000, 200, 20);
    for (let lap = 0; lap < 4; lap++) {
      track.drive(1100, 200, 10).drive(1100, 300, 10).drive(1000, 300, 10).drive(1000, 200, 10);
    }
    track.drive(1000, 0, 20).drive(5000, 0, 60);
    expect(run(track)).toEqual([]);
  });

  it('com o GPS econômico (uma leitura por minuto depois de 10 min parado), a parada e a saída', () => {
    const track = new ForgedTrack().drive(5000, 0, 80).drive(5100, 90, 20);
    track.stay(10, { everyS: 2 }).stay(20, { everyS: 60, accuracy: 30 });
    const left = track.t * 1000;
    track.drive(5200, 0, 20, 60).drive(9000, 0, 80);
    const events = run(track);
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    const end = events[1];
    if (end?.kind !== 'end') throw new Error('fim');
    // a primeira leitura fora chega até um minuto depois de o carro andar
    expect(end.leftAt - left).toBeLessThanOrEqual(61_000);
  });

  it('parado na estrada com o GPS econômico: as leituras esparsas ainda contam os 20 min', () => {
    const track = new ForgedTrack()
      .drive(4000, 0, 80)
      .drive(4000, 2, 5)
      .stay(10, { everyS: 3 })
      .stay(15, { everyS: 60, accuracy: 25 })
      .drive(9000, 0, 80);
    expect(run(track).map((e) => e.kind)).toEqual(['start', 'end']);
  });

  it('um buraco de 40 min (o app no plano de fundo) não é parada: ninguém sabe onde o carro esteve', () => {
    const track = new ForgedTrack()
      .drive(5000, 0, 80)
      .drive(5100, 80, 20)
      .stay(6)
      .gap(40)
      .stay(6)
      .drive(5200, 0, 20)
      .drive(9000, 0, 80);
    expect(run(track)).toEqual([]);
  });

  it('a parada que já era parada continua aberta depois do buraco; a saída é a última leitura dentro', () => {
    const track = new ForgedTrack().drive(5000, 0, 80).drive(5100, 80, 20).stay(10);
    const lastInside = track.readings.at(-1)?.point[2] ?? 0;
    // o app fecha no posto e abre 40 min depois, a 15 km dali
    track.gap(40).jump(20_000, 0).drive(25_000, 0, 80);
    const events = run(track);
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    const end = events[1];
    if (end?.kind !== 'end') throw new Error('fim');
    expect(end.leftAt).toBe(lastInside * 1000);
  });

  it('um ponto solto do GPS e uma leitura sem precisão não encerram a parada', () => {
    const track = new ForgedTrack().drive(5000, 0, 80).drive(5100, 80, 20).stay(9);
    track.stray(5190, 80).stay(1).stray(5600, 400, 300).stay(1);
    const left = track.t * 1000;
    track.drive(5200, 0, 20).drive(9000, 0, 80);
    const events = run(track);
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    const end = events[1];
    if (end?.kind !== 'end') throw new Error('fim');
    expect(end.leftAt).toBeGreaterThan(left);
  });

  it('no raio de chegada de uma parada do dia, quem marca é o Chegamos!: nada aqui', () => {
    const track = new ForgedTrack()
      .drive(5000, 0, 80)
      .drive(5100, 80, 20)
      .stay(30)
      .drive(9000, 0, 80);
    expect(run(track, { ...onRoad, planned: [placeAt(5150, 120)] })).toEqual([]);
  });

  it('o mesmo lugar duas vezes em 2 h é uma parada só; depois de 2 h, outra', () => {
    const track = new ForgedTrack().drive(5000, 0, 80).drive(5100, 80, 20).stay(10);
    const before = track.t * 1000;
    // a parada de antes, no mesmo posto, que terminou há 30 min (de outro aparelho, ou desfeita)
    const recent: KnownAutoStop = {
      ...placeAt(5110, 70),
      from: before - 70 * 60_000,
      to: before - 30 * 60_000,
    };
    expect(run(track, { ...onRoad, known: [recent] })).toEqual([]);
    const old: KnownAutoStop = { ...recent, to: before - SAME_PLACE_MS - 10 * 60_000 };
    expect(run(track, { ...onRoad, known: [old] }).map((e) => e.kind)).toEqual(['start']);
    // e a volta no quarteirão que termina no mesmo posto, minutos depois, também não repete
    const back = new ForgedTrack()
      .drive(5000, 0, 80)
      .drive(5100, 80, 20)
      .stay(10)
      .drive(5200, 0, 20)
      .drive(6000, 0, 40)
      .gap(1)
      .drive(5200, 0, 40)
      .drive(5100, 80, 20)
      .stay(10);
    // sem lembrar da primeira, o detector veria duas; o hook lembra
    expect(run(back).filter((e) => e.kind === 'start')).toHaveLength(2);
    expect(run(back, onRoad, { remember: true }).map((e) => e.kind)).toEqual(['start', 'end']);
  });

  it('sem a rota em cache, só a regra dos 20 min: 12 min no posto não bastam, 25 min bastam', () => {
    const noRoute: DetectorContext = { ...onRoad, roadDistanceM: () => null };
    const short = new ForgedTrack()
      .drive(5000, 0, 80)
      .drive(5100, 80, 20)
      .stay(12)
      .drive(9000, 0, 80);
    expect(run(short, noRoute)).toEqual([]);
    const long = new ForgedTrack()
      .drive(5000, 0, 80)
      .drive(5100, 80, 20)
      .stay(25)
      .drive(9000, 0, 80);
    const events = run(long, noRoute);
    expect(events.map((e) => e.kind)).toEqual(['start', 'end']);
    expect(events[0]?.kind === 'start' && events[0].rule).toBe('long');
    expect(events[0]?.kind === 'start' && events[0].roadM).toBeNull();
  });

  it('as trilhas forjadas estão no formato de trip_tracks.points', () => {
    const points = new ForgedTrack().drive(500, 0, 60).stay(1).points();
    for (const p of points) {
      expect(p).toHaveLength(3);
      expect(Number.isInteger(p[2])).toBe(true);
    }
    expect(min((points.at(-1)?.[2] ?? 0) * 1000 - (points[0]?.[2] ?? 0) * 1000)).toBeGreaterThan(1);
  });
});
