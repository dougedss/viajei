import { useLocalValue, writeLocal } from '@/lib/storage/local.ts';

/**
 * Os cartões de conquista, por aparelho: ligados por padrão. Desligados, nada abre sozinho: as
 * conquistas continuam chegando, o acessório fica liberado na garagem e o Perfil mostra tudo.
 */
export const CELEBRATIONS_KEY = 'viajei:celebrations';

export function parseCelebrationsPref(raw: string | null): boolean {
  return raw !== 'off';
}

export function writeCelebrationsPref(on: boolean): void {
  writeLocal(CELEBRATIONS_KEY, on ? 'on' : 'off');
}

export function useCelebrationsPref(): boolean {
  return useLocalValue(CELEBRATIONS_KEY, parseCelebrationsPref);
}
