import { afterEach, describe, expect, it, vi } from 'vitest';
import { writeLocal } from '@/lib/storage/local.ts';
import {
  createAudio,
  parseSoundPref,
  readSoundPref,
  SOUND_KEY,
  soundsEnabled,
  writeSoundPref,
} from './index.ts';

afterEach(() => writeLocal(SOUND_KEY, null));

function fakeDeps(over: { pref?: boolean; reduced?: boolean; context?: boolean } = {}) {
  const stop = vi.fn();
  const synth = {
    horn: vi.fn(),
    bell: vi.fn(),
    snap: vi.fn(),
    engine: vi.fn(() => ({ stop })),
  };
  const resume = vi.fn(() => Promise.resolve());
  const ctx = { state: 'suspended', resume } as unknown as AudioContext;
  const createContext = vi.fn(() => (over.context === false ? null : ctx));
  const audio = createAudio({
    createContext,
    readPref: () => over.pref ?? true,
    reducedMotion: () => over.reduced ?? false,
    synth,
  });
  return { audio, synth, stop, resume, createContext };
}

describe('preferência de som', () => {
  it('ligado por padrão, desligado só com "off"', () => {
    expect(parseSoundPref(null)).toBe(true);
    expect(parseSoundPref('on')).toBe(true);
    expect(parseSoundPref('off')).toBe(false);
    expect(readSoundPref()).toBe(true);
    writeSoundPref(false);
    expect(readSoundPref()).toBe(false);
    writeSoundPref(true);
    expect(readSoundPref()).toBe(true);
  });

  it('reduzir movimento silencia mesmo com a preferência ligada', () => {
    expect(soundsEnabled({ pref: true, reducedMotion: false })).toBe(true);
    expect(soundsEnabled({ pref: true, reducedMotion: true })).toBe(false);
    expect(soundsEnabled({ pref: false, reducedMotion: false })).toBe(false);
  });
});

describe('createAudio', () => {
  it('toca buzina e sino, criando o contexto uma vez e retomando-o', () => {
    const { audio, synth, resume, createContext } = fakeDeps();
    audio.horn();
    audio.bell();
    expect(synth.horn).toHaveBeenCalledTimes(1);
    expect(synth.bell).toHaveBeenCalledTimes(1);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(resume).toHaveBeenCalled();
  });

  it('o encaixe toca no contexto compartilhado e respeita o toggle', () => {
    const on = fakeDeps();
    on.audio.snap();
    on.audio.snap();
    expect(on.synth.snap).toHaveBeenCalledTimes(2);
    expect(on.createContext).toHaveBeenCalledTimes(1);
    const off = fakeDeps({ pref: false });
    off.audio.snap();
    expect(off.synth.snap).not.toHaveBeenCalled();
    const reduced = fakeDeps({ reduced: true });
    reduced.audio.snap();
    expect(reduced.synth.snap).not.toHaveBeenCalled();
  });

  it('não faz nada desligado, com reduzir movimento ou sem Web Audio', () => {
    const off = fakeDeps({ pref: false });
    const reduced = fakeDeps({ reduced: true });
    const silent = fakeDeps({ context: false });
    for (const deps of [off, reduced, silent]) {
      deps.audio.horn();
      deps.audio.engineStart();
      expect(deps.synth.horn).not.toHaveBeenCalled();
      expect(deps.synth.engine).not.toHaveBeenCalled();
    }
    expect(off.audio.enabled()).toBe(false);
    expect(reduced.audio.enabled()).toBe(false);
    // sem Web Audio a preferência continua "ligada", só não há como tocar
    expect(silent.audio.enabled()).toBe(true);
    expect(off.createContext).not.toHaveBeenCalled();
  });

  it('o ronco liga uma vez só e desliga pela função devolvida ou por engineStop', () => {
    const { audio, synth, stop } = fakeDeps();
    const off = audio.engineStart();
    audio.engineStart();
    expect(synth.engine).toHaveBeenCalledTimes(1);
    off();
    off();
    expect(stop).toHaveBeenCalledTimes(1);
    audio.engineStart();
    audio.engineStop();
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
