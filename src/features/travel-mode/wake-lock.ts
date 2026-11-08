import { useEffect } from 'react';
import { useLocalValue, writeLocal } from '@/lib/storage/local.ts';

/**
 * "Tela acesa" (fase 14): o que sobrou do modo painel. Um toggle manual, lembrado por aparelho, que
 * só mantém a tela acesa (Wake Lock) enquanto a tela da viagem está visível; repedido ao voltar à
 * aba, porque o navegador solta o lock quando a página some. O acompanhamento da posição é outro
 * assunto (`useLivePosition`): a tela acesa é o que permite que ele continue por horas.
 */
export const SCREEN_AWAKE_KEY = 'viajei:screen-awake';

export function useScreenAwakePref(): boolean {
  return useLocalValue(SCREEN_AWAKE_KEY, (raw) => raw === 'on');
}
export function writeScreenAwakePref(on: boolean): void {
  writeLocal(SCREEN_AWAKE_KEY, on ? 'on' : null);
}

// a lib do TS declara wakeLock como obrigatório; nem todo navegador o tem
type WakeLockNavigator = Partial<Pick<Navigator, 'wakeLock'>>;

export function wakeLockSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav: WakeLockNavigator = navigator;
  return nav.wakeLock !== undefined;
}

/** Mantém a tela acesa enquanto `on`; solta ao desligar e ao sair da tela. */
export function useWakeLock(on: boolean): void {
  useEffect(() => {
    if (!on || !wakeLockSupported()) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const request = async () => {
      const nav: WakeLockNavigator = navigator;
      if (!nav.wakeLock || document.visibilityState !== 'visible') return;
      try {
        const got = await nav.wakeLock.request('screen');
        if (stopped) void got.release();
        else lock = got;
      } catch {
        /* sem Wake Lock agora (bateria baixa, aba oculta): tudo bem */
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release();
    };
  }, [on]);
}
