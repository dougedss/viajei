import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isAutoStop, isLocated } from '@/features/itinerary/rules.ts';
import { useOnline } from '@/lib/db/connectivity.ts';
import { db, type DayRoute, type Stop } from '@/lib/db/schema.ts';
import type { Fix } from '@/lib/geo/geofence.ts';
import { indexRoute, projectOntoRoute } from '@/lib/geo/project.ts';
import { knownAutoStops } from './auto-stop.ts';
import {
  autoKeys,
  endAutoStop,
  nameAutoStop,
  parseUndone,
  pendingNames,
  registerAutoStop,
  removeDuplicateAutoStops,
} from './auto-stop-actions.ts';
import { createStopDetector, type DetectorContext } from './stop-detector.ts';

/**
 * A parada que se registra sozinha com o mapa aberto (fase 15): o detector recebe cada leitura do
 * acompanhamento (`useLivePosition`), e o que ele diz vira uma parada pelo mesmo caminho de tudo,
 * na outbox, visível ao time. Nada pergunta nada a ninguém, e nada acontece com o app fechado.
 */
export type AutoStopsArgs = {
  tripId: string;
  dayId: string;
  uid: string;
  /** o dia é hoje e a viagem está acontecendo */
  active: boolean;
  /** as paradas ativas do dia, em ordem */
  stops: readonly Stop[];
  route: Pick<DayRoute, 'geometry'> | null;
  /** a parada nasceu neste aparelho: o toast com Desfazer */
  onRegistered: (stop: Stop, undo: () => Promise<void>) => void;
};

export function useAutoStops({
  tripId,
  dayId,
  uid,
  active,
  stops,
  route,
  onRegistered,
}: AutoStopsArgs): { onFix: (fix: Fix) => void } {
  // um detector por tela do dia (a tela é refeita a cada dia); o buraco entre leituras ele mesmo mede
  const [detector] = useState(createStopDetector);
  const undone = useLiveQuery(() => db.sync_state.get(autoKeys.undone(dayId)), [dayId]);
  const roadIndex = useMemo(
    () => (route && route.geometry.length >= 2 ? indexRoute(route.geometry) : null),
    [route],
  );

  // o que a leitura precisa saber, sem refazer nada a cada render (o acompanhamento chama `onFix`)
  const latest = useRef({ tripId, uid, active, stops, roadIndex, undone, onRegistered });
  useEffect(() => {
    latest.current = { tripId, uid, active, stops, roadIndex, undone, onRegistered };
  }, [tripId, uid, active, stops, roadIndex, undone, onRegistered]);

  // as escritas em fila: a saída nunca passa à frente do registro da parada que ela fecha
  const queue = useRef<Promise<void>>(Promise.resolve());
  const open = useRef<string | null>(null);

  const onFix = useCallback(
    (fix: Fix) => {
      const now = latest.current;
      if (!now.uid || !now.active) return;
      const index = now.roadIndex;
      const ctx: DetectorContext = {
        roadDistanceM: (p) => (index ? projectOntoRoute(index, p).distance_m : null),
        planned: now.stops
          .filter((s) => !isAutoStop(s))
          .flatMap((s) => (isLocated(s) ? [{ lng: s.lng, lat: s.lat }] : [])),
        known: [...knownAutoStops(now.stops), ...parseUndone(now.undone?.value, fix.t)],
      };
      for (const event of detector.push(fix, ctx)) {
        queue.current = queue.current
          .then(async () => {
            if (event.kind === 'start') {
              const result = await registerAutoStop({
                tripId: now.tripId,
                dayId,
                uid: now.uid,
                start: event,
              });
              open.current = result.stop.id;
              if (result.kind === 'created') latest.current.onRegistered(result.stop, result.undo);
            } else if (open.current) {
              await endAutoStop(open.current, event.leftAt);
              open.current = null;
            }
          })
          .catch((err: unknown) => {
            console.warn('viajei: parada automática', err);
          });
      }
    },
    [detector, dayId],
  );

  // a corrida rara: duas automáticas do mesmo lugar e hora (dois celulares, chaves diferentes)
  const autoIds = stops
    .filter(isAutoStop)
    .map((s) => s.id)
    .sort()
    .join(',');
  useEffect(() => {
    if (!active || !uid || !autoIds.includes(',')) return;
    void removeDuplicateAutoStops(dayId, uid);
  }, [active, uid, dayId, autoIds]);

  return { onFix };
}

/**
 * O nome que faltava (a parada que nasceu sem sinal, "Parada às 14h20"): quando a rede volta, uma
 * chamada ao OSM por parada, na fila de uma requisição por vez, e um patch normal pela outbox. Fica
 * no layout do app, não na tela da viagem: a rede volta em qualquer tela.
 */
export function useAutoStopNaming(): void {
  const online = useOnline();
  const pending = useLiveQuery(
    () => db.sync_state.where('key').startsWith(autoKeys.namingPrefix).count(),
    [],
    0,
  );
  const running = useRef(false);
  useEffect(() => {
    if (!online || pending === 0 || running.current) return;
    running.current = true;
    void (async () => {
      try {
        for (const [stopId, entry] of await pendingNames()) await nameAutoStop(stopId, entry);
      } catch (err) {
        // sem rede de novo, ou o OSM fora: a fila espera a próxima volta da rede
        console.warn('viajei: nome da parada', err);
      } finally {
        running.current = false;
      }
    })();
  }, [online, pending]);
}
