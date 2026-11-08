import { useSyncExternalStore } from 'react';
import { isNetworkError } from './network-error.ts';

/**
 * Conectividade = eventos online/offline do navegador + resultado real das requisições.
 * `navigator.onLine` sozinho mente (Wi-Fi sem internet, sinal fraco na estrada); uma requisição que
 * falha de rede marca offline, e qualquer resposta do servidor marca online de novo.
 *
 * Só o "sem rede" do navegador (modo avião, cabo fora) é certeza: aí nada é tentado, e o evento
 * `online` avisa a volta. Depois de uma falha com o navegador dizendo "online", evento nenhum vai
 * chegar; por isso quem faz requisições é chamado a tentar de novo (`onRetry`), cada vez mais
 * espaçado, até a primeira resposta do servidor (D111).
 */

/** Espera até a próxima tentativa depois da n-ésima falha de rede seguida: 3 s, 10 s, 30 s, 60 s. */
export const RETRY_DELAYS_MS = [3_000, 10_000, 30_000, 60_000] as const;

export function retryDelay(failures: number): number {
  const i = Math.min(Math.max(failures, 1), RETRY_DELAYS_MS.length) - 1;
  return RETRY_DELAYS_MS[i] ?? 60_000;
}

const browserOnline = () => typeof navigator === 'undefined' || navigator.onLine;

let online = browserOnline();
let failures = 0;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const retryListeners = new Set<() => void>();
let started = false;

function set(value: boolean) {
  if (online === value) return;
  online = value;
  for (const l of listeners) l();
}

function cancelRetry() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry() {
  cancelRetry();
  retryTimer = setTimeout(() => {
    retryTimer = null;
    for (const l of retryListeners) l();
  }, retryDelay(failures));
}

/** O servidor respondeu, ou o navegador avisou a volta: sem falhas contadas nem tentativa marcada. */
function recovered(value: boolean) {
  failures = 0;
  cancelRetry();
  set(value);
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  // o evento é o próprio navegador dizendo que a rede voltou
  window.addEventListener('online', () => recovered(true));
  window.addEventListener('offline', () => {
    // o navegador avisa a volta pelo `online`: não há o que tentar até lá
    cancelRetry();
    set(false);
  });
}

export const connectivity = {
  isOnline: () => online,
  /** Vale tentar a rede? Só o "sem rede" do navegador impede; uma falha de requisição, não. */
  canTry: browserOnline,
  // uma resposta que chega depois de o navegador avisar "sem rede" (o pedido saiu antes) não
  // desmente o navegador: sem isso o chip voltava a "N pendentes" com a rede cortada e, como nada
  // é tentado sem rede, nenhuma falha o corrigia (fase 14, visto na CI)
  markOnline: () => recovered(browserOnline()),
  markOffline: () => {
    failures += 1;
    set(false);
    if (browserOnline()) scheduleRetry();
  },
  subscribe: (listener: () => void) => {
    start();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** Chamado quando vale tentar de novo depois de uma falha de rede com o navegador "online". */
  onRetry: (listener: () => void) => {
    start();
    retryListeners.add(listener);
    return () => {
      retryListeners.delete(listener);
    };
  },
};

export { isNetworkError };

export function useOnline(): boolean {
  return useSyncExternalStore(connectivity.subscribe, connectivity.isOnline, () => true);
}
