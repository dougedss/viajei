import { readLocal, useLocalValue, writeLocal } from '@/lib/storage/local.ts';
import {
  parseQualityPrefs,
  QUALITY_STORAGE_KEY,
  serializeQualityPrefs,
  type QualityPrefs,
} from './quality.ts';

/**
 * Preferências da maquete por aparelho: "Ver como lista" (desliga a maquete para quem preferir) e
 * o nível de qualidade. `?render=list` força a lista sem gravar nada (serve ao e2e); `?diag=1`
 * mostra o chip de diagnóstico em produção.
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

export function readQualityPrefs(): QualityPrefs {
  return parseQualityPrefs(readLocal(QUALITY_STORAGE_KEY));
}
export function writeQualityPrefs(prefs: QualityPrefs): void {
  writeLocal(QUALITY_STORAGE_KEY, serializeQualityPrefs(prefs));
}
export function useQualityPrefs(): QualityPrefs {
  return useLocalValue(QUALITY_STORAGE_KEY, parseQualityPrefs);
}

/** As chaves da URL que mudam a maquete: `render=list` e `diag=1`. */
export function readUrlFlags(search: string): { forceList: boolean; diag: boolean } {
  const params = new URLSearchParams(search);
  return { forceList: params.get('render') === 'list', diag: params.get('diag') === '1' };
}
