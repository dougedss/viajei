import type { LngLat } from '@shared/geo.ts';
import type { Fix } from '@/lib/geo/geofence.ts';
import type { TrackPoint } from '../track.ts';

/**
 * Trilhas forjadas para os testes do detector (fase 15), no formato de `trip_tracks.points`
 * (`[lng, lat, epoch_s]`): uma estrada reta de leste a oeste num lugar inventado e um carro que
 * anda, para e some em metros e minutos. Nenhuma coordenada de viagem de verdade entra aqui (o
 * repositório é público); a conversão metro → grau é a mesma projeção local de `_shared/geo.ts`.
 */
const M_PER_DEG = (6371008.8 * Math.PI) / 180;
export const ROAD_LAT = -29.5;
export const ROAD_LNG = -51.3;
const COS = Math.cos((ROAD_LAT * Math.PI) / 180);

/** O ponto a `x` metros para leste do começo da estrada e `y` metros ao norte dela. */
export function metersAt(x: number, y: number): LngLat {
  return [ROAD_LNG + x / (M_PER_DEG * COS), ROAD_LAT + y / M_PER_DEG];
}

/** A linha da estrada: 40 km em linha reta, com um vértice a cada 500 m, como uma rota em cache. */
export const ROAD: LngLat[] = Array.from({ length: 81 }, (_, i) => metersAt(i * 500, 0));

/** 13h de um dia de viagem, em segundos. */
export const T0_S = Date.parse('2026-12-12T13:00:00-03:00') / 1000;

/** Uma leitura com precisão (em metros), quando o teste quer dizer. */
type Reading = { point: TrackPoint; accuracy?: number };

export class ForgedTrack {
  readonly readings: Reading[] = [];
  t = T0_S;
  x = 0;
  y = 0;
  #i = 0;

  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  #push(x: number, y: number, accuracy?: number) {
    const [lng, lat] = metersAt(x, y);
    this.readings.push({
      point: [lng, lat, Math.round(this.t)],
      ...(accuracy === undefined ? {} : { accuracy }),
    });
  }

  /** Anda em linha reta até (x, y) a `kmh`, uma leitura a cada `everyS`. */
  drive(x: number, y: number, kmh: number, everyS = 2): this {
    const dist = Math.hypot(x - this.x, y - this.y);
    const seconds = dist / (kmh / 3.6);
    const steps = Math.max(1, Math.round(seconds / everyS));
    const [x0, y0] = [this.x, this.y];
    for (let k = 1; k <= steps; k++) {
      this.t += seconds / steps;
      this.#push(x0 + ((x - x0) * k) / steps, y0 + ((y - y0) * k) / steps);
    }
    this.x = x;
    this.y = y;
    return this;
  }

  /** Fica parado `minutes`, uma leitura a cada `everyS`, com o tremor do GPS (determinístico). */
  stay(minutes: number, { everyS = 5, jitterM = 4, accuracy }: StayOptions = {}): this {
    const end = this.t + minutes * 60;
    while (this.t + everyS <= end + 1e-6) {
      this.t += everyS;
      this.#i += 1;
      this.#push(
        this.x + Math.sin(this.#i * 1.7) * jitterM,
        this.y + Math.cos(this.#i * 2.3) * jitterM,
        accuracy,
      );
    }
    this.t = end;
    return this;
  }

  /** Uma leitura solta em (x, y), sem mover o carro (o ponto que o GPS erra). */
  stray(x: number, y: number, accuracy?: number): this {
    this.t += 5;
    this.#push(x, y, accuracy);
    return this;
  }

  /** O app no plano de fundo: o tempo passa sem leitura nenhuma. */
  gap(minutes: number): this {
    this.t += minutes * 60;
    return this;
  }

  /** Reaparece em (x, y) depois de um buraco (sem as leituras do caminho). */
  jump(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /** O formato de `trip_tracks.points`. */
  points(): TrackPoint[] {
    return this.readings.map((r) => r.point);
  }

  /** As leituras como o acompanhamento as entrega ao detector. */
  fixes(): Fix[] {
    return this.readings.map(({ point: [lng, lat, s], accuracy }) => ({
      lng,
      lat,
      t: s * 1000,
      ...(accuracy === undefined ? {} : { accuracy }),
    }));
  }
}

type StayOptions = { everyS?: number; jitterM?: number; accuracy?: number };
