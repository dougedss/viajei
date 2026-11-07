import { useEffect, useState, useSyncExternalStore } from 'react';
import { connectivity, isNetworkError, useOnline } from '@/lib/db/connectivity.ts';
import { geocode } from '@/lib/geocode/nominatim.ts';
import { locate, type GeoState, type GeoTarget } from './geocode.ts';

/**
 * A fila de localização das paradas importadas, uma por vez: o Nominatim já espaça as requisições
 * (1 por segundo) e guarda cada consulta no cache do aparelho, então a mesma parada nunca vai duas
 * vezes à rede. Sem rede, as paradas que faltam ficam `offline` e voltam para a fila quando a rede
 * voltar. A fila só descobre; quem decide pela parada é a revisão (`applyGeo`).
 */
class GeoQueue {
  #states: Record<string, GeoState> = {};
  #queue: GeoTarget[] = [];
  #busy = false;
  /** a tela está aberta: fora dela a fila para (e retoma de onde estava) */
  #active = false;
  readonly #listeners = new Set<() => void>();

  readonly subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };
  readonly snapshot = () => this.#states;

  #set(key: string, state: GeoState) {
    this.#states = { ...this.#states, [key]: state };
    for (const l of this.#listeners) l();
  }

  /** Põe na fila o que ainda não foi procurado (ou ficou sem rede da última vez). */
  enqueue(targets: readonly GeoTarget[]) {
    for (const t of targets) {
      const state = Object.hasOwn(this.#states, t.key) ? this.#states[t.key] : undefined;
      if (state && state.kind !== 'offline') continue;
      if (this.#queue.some((q) => q.key === t.key)) continue;
      this.#queue.push(t);
      this.#set(t.key, { kind: 'waiting' });
    }
    void this.#pump();
  }

  async #pump() {
    if (this.#busy || !this.#active) return;
    this.#busy = true;
    try {
      // `stop()` no meio de uma busca: ela termina, e a fila para antes da próxima
      while (this.#isActive()) {
        const target = this.#queue.shift();
        if (!target) break;
        this.#set(target.key, { kind: 'searching' });
        try {
          this.#set(target.key, await locate(target, (q) => geocode(q)));
        } catch (err) {
          if (isNetworkError(err) || !connectivity.canTry()) {
            // a rede caiu: esta e as que faltam esperam a volta, sem martelar o Nominatim
            for (const t of [target, ...this.#queue]) this.#set(t.key, { kind: 'offline' });
            this.#queue = [];
            connectivity.markOffline();
          } else {
            // o Nominatim recusou esta busca: a parada fica sem local, e a fila segue
            this.#set(target.key, { kind: 'none' });
          }
        }
      }
    } finally {
      this.#busy = false;
    }
  }

  #isActive() {
    return this.#active;
  }

  start() {
    this.#active = true;
    void this.#pump();
  }

  stop() {
    this.#active = false;
  }
}

/** O estado da localização de cada parada, pela chave da revisão (`d0s1`). */
export function useGeocoding(targets: readonly GeoTarget[]): Readonly<Record<string, GeoState>> {
  const [queue] = useState(() => new GeoQueue());
  const online = useOnline();
  const states = useSyncExternalStore(queue.subscribe, queue.snapshot, queue.snapshot);
  // a lista muda de identidade a cada pedaço do stream; a fila só liga para as chaves novas
  const signature = targets.map((t) => t.key).join(',');

  useEffect(() => {
    if (online) queue.enqueue(targets);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` resume `targets`
  }, [queue, signature, online]);

  useEffect(() => {
    queue.start();
    return () => queue.stop();
  }, [queue]);
  return states;
}
