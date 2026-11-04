import { useSyncExternalStore } from 'react';

/**
 * Instalação do PWA. No Android o Chrome dispara `beforeinstallprompt`, que guardamos para abrir
 * o pedido quando a pessoa tocar em "Instalar". No iPhone não existe pedido: a folha explica
 * "Compartilhar → Adicionar à Tela de Início". Insistir vale a pena: o Safari pode apagar o
 * IndexedDB após 7 dias sem uso quando o app não está instalado, e o push só funciona instalado.
 */
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export type InstallSnapshot = {
  /** já roda como app instalado (standalone) */
  installed: boolean;
  /** o navegador ofereceu o pedido nativo (Android) */
  canPrompt: boolean;
  ios: boolean;
};

let deferred: BeforeInstallPromptEvent | null = null;
let snapshot: InstallSnapshot = { installed: false, canPrompt: false, ios: false };
const listeners = new Set<() => void>();
let started = false;

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) ||
    (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1)
  );
}

function set(patch: Partial<InstallSnapshot>) {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l();
}

function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  snapshot = { installed: isStandalone(), canPrompt: false, ios: isIOS() };
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ installed: true, canPrompt: false });
  });
  window.matchMedia('(display-mode: standalone)').addEventListener('change', (e) => {
    set({ installed: e.matches });
  });
}

export const install = {
  subscribe: (listener: () => void) => {
    start();
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot: () => snapshot,
  /** Abre o pedido nativo (Android). */
  prompt: async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    if (!deferred) return 'unavailable';
    const event = deferred;
    deferred = null;
    set({ canPrompt: false });
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  },
};

export function useInstall(): InstallSnapshot {
  return useSyncExternalStore(install.subscribe, install.getSnapshot, install.getSnapshot);
}

/** Pede ao navegador para não descartar o IndexedDB sob pressão de espaço. Melhor pedir instalado. */
export async function persistStorage(): Promise<boolean> {
  try {
    if (typeof navigator === 'undefined' || !('storage' in navigator)) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

const DISMISS_KEY = 'viajei:install:dismissed-at';
const DISMISS_DAYS = 7;

/** Conveniência por aparelho: o convite para instalar some por 7 dias quando a pessoa dispensa. */
export function installDismissed(now = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY));
    return at > 0 && now - at < DISMISS_DAYS * 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}
export function dismissInstall(now = Date.now()): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(now));
  } catch {
    /* sem storage, sem memória: o convite volta na próxima abertura */
  }
}
