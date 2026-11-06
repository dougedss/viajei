import { readLocal, useLocalValue, writeLocal } from '@/lib/storage/local.ts';
import {
  parseQualityPrefs,
  QUALITY_STORAGE_KEY,
  serializeQualityPrefs,
  type QualityPrefs,
} from './quality.ts';

/**
 * Preferências das cenas 3D por aparelho e as chaves de URL que valem para as duas: o nível de
 * qualidade (um só, a maquete e a garagem leem o mesmo), `?render=list` (força a versão sem 3D sem
 * gravar nada; serve ao e2e) e `?diag=1` (o chip de diagnóstico em produção).
 */
export function readQualityPrefs(): QualityPrefs {
  return parseQualityPrefs(readLocal(QUALITY_STORAGE_KEY));
}
export function writeQualityPrefs(prefs: QualityPrefs): void {
  writeLocal(QUALITY_STORAGE_KEY, serializeQualityPrefs(prefs));
}
export function useQualityPrefs(): QualityPrefs {
  return useLocalValue(QUALITY_STORAGE_KEY, parseQualityPrefs);
}

/** As chaves da URL que mudam as cenas: `render=list` e `diag=1`. */
export function readUrlFlags(search: string): { forceList: boolean; diag: boolean } {
  const params = new URLSearchParams(search);
  return { forceList: params.get('render') === 'list', diag: params.get('diag') === '1' };
}
