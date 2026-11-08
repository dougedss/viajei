import { haversineM } from '@shared/geo.ts';
import { activeStops } from '@/features/itinerary/rules.ts';
import type { Stop } from '@/lib/db/schema.ts';
import { positionBetween } from '@/lib/ids/position.ts';
import { uuidV5 } from '@/lib/ids/uuid.ts';
import { isDepartureNode } from './rules.ts';
import { SAME_PLACE_M, SAME_PLACE_MS, type KnownAutoStop, type Place } from './stop-detector.ts';

/**
 * As regras puras da parada que se registra sozinha (fase 15): o id que dois celulares no mesmo
 * carro calculam igual, quando duas paradas automáticas são a mesma, qual sai quando viraram duas,
 * e onde a parada entra na lista do dia.
 */

/** A célula do lugar: 0,0015° (uns 165 m de norte a sul e 145 m de leste a oeste no Sul do Brasil). */
export const CELL_DEG = 0.0015;
/** A janela de tempo: a mesma do "um lugar só a cada 2 h". */
export const WINDOW_MS = SAME_PLACE_MS;

export function isAutoStop(stop: Pick<Stop, 'source'>): boolean {
  return stop.source === 'auto';
}

/**
 * A chave natural: o lugar (a célula do centro) e a hora (a janela de 2 h da chegada). Os dois
 * celulares do carro veem o mesmo centro a poucos metros e a mesma chegada a poucos segundos, e
 * escrevem a mesma linha (o `sync_push` funde coluna a coluna). Na borda de uma célula ou de uma
 * janela as chaves diferem: aí valem `sameAutoStop` antes de criar e `duplicatesToRemove` depois.
 */
export function autoStopKey(center: Place, arrivedAt: number): string {
  const row = Math.floor(center.lat / CELL_DEG);
  const col = Math.floor(center.lng / CELL_DEG);
  const window = Math.floor(arrivedAt / WINDOW_MS);
  return `auto:${String(row)}:${String(col)}:${String(window)}`;
}

/** `v5(trip_day_id, chave)`: o id da parada automática. */
export function autoStopId(dayId: string, center: Place, arrivedAt: number): Promise<string> {
  return uuidV5(dayId, autoStopKey(center, arrivedAt));
}

/** As paradas automáticas vivas do dia, como o detector as conhece (lugar e horário em ms). */
export function knownAutoStops(stops: readonly Stop[]): (KnownAutoStop & { stop: Stop })[] {
  return stops.flatMap((stop) =>
    isAutoStop(stop) &&
    stop.deleted_at === null &&
    stop.lat !== null &&
    stop.lng !== null &&
    stop.done_at !== null
      ? [
          {
            stop,
            lng: stop.lng,
            lat: stop.lat,
            from: Date.parse(stop.done_at),
            to: stop.departed_at ? Date.parse(stop.departed_at) : null,
          },
        ]
      : [],
  );
}

/** Duas paradas automáticas são a mesma: a menos de 150 m uma da outra e com horário sobreposto. */
export function sameAutoStop(a: KnownAutoStop, b: KnownAutoStop): boolean {
  const near = haversineM([a.lng, a.lat], [b.lng, b.lat]) <= SAME_PLACE_M;
  const overlap = a.from <= (b.to ?? Infinity) && b.from <= (a.to ?? Infinity);
  return near && overlap;
}

/**
 * Quando a corrida rara aconteceu (os dois celulares criaram ao mesmo tempo com chaves diferentes,
 * cada um sem ver a do outro), fica a que chegou primeiro (empate: o menor id) e sai a outra. Quem
 * tira é o aparelho de quem a criou (`done_by`), e só se ninguém escreveu memória nela: uma memória
 * nunca se perde por isso (aí as duas ficam).
 */
export function duplicatesToRemove(
  stops: readonly Stop[],
  input: { uid: string; withMemory: ReadonlySet<string> },
): string[] {
  const auto = knownAutoStops(stops).sort(
    (a, b) => a.from - b.from || a.stop.id.localeCompare(b.stop.id),
  );
  const out: string[] = [];
  auto.forEach((later, i) => {
    const kept = auto.slice(0, i).find((earlier) => sameAutoStop(earlier, later));
    if (!kept) return;
    if (later.stop.done_by !== input.uid || input.withMemory.has(later.stop.id)) return;
    out.push(later.stop.id);
  });
  return out;
}

/**
 * Onde a parada automática entra na lista do dia: logo depois da última parada feita antes da
 * chegada (a ordem do horário), antes da próxima. Sem nenhuma feita, depois dos nós de saída do
 * começo (a origem que ninguém marcou continua antes: o carro saiu dela, e o "Vocês passaram
 * por…" pergunta a hora).
 */
export function autoStopPosition(stops: readonly Stop[], arrivedAt: number): string {
  const ordered = activeStops(stops);
  let anchor = -1;
  ordered.forEach((s, i) => {
    if (s.done_at !== null && Date.parse(s.done_at) <= arrivedAt) anchor = i;
  });
  if (anchor === -1) {
    while (anchor + 1 < ordered.length) {
      const s = ordered[anchor + 1];
      if (!s || !isDepartureNode(s) || s.done_at !== null) break;
      anchor += 1;
    }
  }
  const before = ordered[anchor]?.position ?? null;
  const after = ordered[anchor + 1]?.position ?? null;
  return positionBetween(before, after);
}
