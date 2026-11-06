import { readLocal, useLocalValue, writeLocal } from '@/lib/storage/local.ts';

/**
 * A preferência só da maquete, por aparelho: "Ver como lista" desliga a maquete para quem
 * preferir. O nível de qualidade e as chaves de URL (`?render=list`, `?diag=1`) valem para as duas
 * cenas e vivem em `lib/three/prefs.ts`.
 */
export const RENDER_KEY = 'viajei:world:render';
export type RenderPref = 'auto' | 'list';

export function parseRenderPref(raw: string | null): RenderPref {
  return raw === 'list' ? 'list' : 'auto';
}
export function readRenderPref(): RenderPref {
  return parseRenderPref(readLocal(RENDER_KEY));
}
export function writeRenderPref(pref: RenderPref): void {
  writeLocal(RENDER_KEY, pref === 'list' ? 'list' : null);
}
export function useRenderPref(): RenderPref {
  return useLocalValue(RENDER_KEY, parseRenderPref);
}
