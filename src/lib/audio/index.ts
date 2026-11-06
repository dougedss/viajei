import { readReducedMotion } from '@/lib/reduced-motion.ts';
import { readLocal, useLocalValue, writeLocal } from '@/lib/storage/local.ts';
import { bell, engine, horn, snap, type EngineHandle } from './synth.ts';

/**
 * Sons do app (Modo Viagem e garagem) com a regra de quando tocar: toggle por aparelho em `localStorage`, ligado
 * por padrão, e desligado sob `prefers-reduced-motion`. O `AudioContext` nasce no primeiro som e
 * tenta retomar a cada toque (o iPhone só libera áudio depois de um gesto na página).
 */
export const SOUND_KEY = 'viajei:sound';

export function parseSoundPref(raw: string | null): boolean {
  return raw !== 'off';
}

export function readSoundPref(): boolean {
  return parseSoundPref(readLocal(SOUND_KEY));
}

export function writeSoundPref(on: boolean): void {
  writeLocal(SOUND_KEY, on ? 'on' : 'off');
}

export function useSoundPref(): boolean {
  return useLocalValue(SOUND_KEY, parseSoundPref);
}

/** Se um som deve sair agora: a preferência e o movimento reduzido, nessa ordem. */
export function soundsEnabled(input: { pref: boolean; reducedMotion: boolean }): boolean {
  return input.pref && !input.reducedMotion;
}

type Synth = {
  horn: (ctx: AudioContext) => void;
  bell: (ctx: AudioContext) => void;
  snap: (ctx: AudioContext) => void;
  engine: (ctx: AudioContext) => EngineHandle;
};

export type AudioDeps = {
  /** cria (uma vez) o contexto; `null` quando o navegador não tem Web Audio */
  createContext: () => AudioContext | null;
  readPref: () => boolean;
  reducedMotion: () => boolean;
  synth?: Synth;
};

export type Audio = {
  horn: () => void;
  bell: () => void;
  /** o encaixe de um acessório na garagem */
  snap: () => void;
  /** liga o ronco; devolve a função que desliga (idempotente) */
  engineStart: () => () => void;
  engineStop: () => void;
  enabled: () => boolean;
};

export function createAudio(deps: AudioDeps): Audio {
  const synth: Synth = deps.synth ?? { horn, bell, snap, engine };
  let ctx: AudioContext | null | undefined;
  let running: EngineHandle | null = null;

  const enabled = () =>
    soundsEnabled({ pref: deps.readPref(), reducedMotion: deps.reducedMotion() });
  const context = (): AudioContext | null => {
    if (!enabled()) return null;
    if (ctx === undefined) ctx = deps.createContext();
    if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
    return ctx;
  };
  const engineStop = () => {
    running?.stop();
    running = null;
  };

  return {
    enabled,
    horn: () => {
      const c = context();
      if (c) synth.horn(c);
    },
    bell: () => {
      const c = context();
      if (c) synth.bell(c);
    },
    snap: () => {
      const c = context();
      if (c) synth.snap(c);
    },
    engineStart: () => {
      const c = context();
      if (c && !running) running = synth.engine(c);
      return engineStop;
    },
    engineStop,
  };
}

function defaultContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  try {
    return new AudioContext();
  } catch {
    return null;
  }
}

/** O áudio do app: um só, compartilhado pelas telas. */
export const audio: Audio = createAudio({
  createContext: defaultContext,
  readPref: readSoundPref,
  reducedMotion: readReducedMotion,
});
