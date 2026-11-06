import { describe, expect, it } from 'vitest';
import { QUALITY_STORAGE_KEY, SHADOW_MAP_SIZE, tierFor } from './quality.ts';

describe('o nível comum das cenas 3D', () => {
  it('Alta: dpr até 2 e sombra 2048; Leve: dpr 1 e sombra 1024', () => {
    expect(tierFor('alta', 3)).toEqual({ level: 'alta', dpr: 2, shadowMapSize: 2048 });
    expect(tierFor('alta', 1.5).dpr).toBe(1.5);
    expect(tierFor('leve', 3)).toEqual({ level: 'leve', dpr: 1, shadowMapSize: 1024 });
    expect(SHADOW_MAP_SIZE).toEqual({ leve: 1024, alta: 2048 });
  });

  it('uma preferência só por aparelho, a mesma chave da fase 5', () => {
    expect(QUALITY_STORAGE_KEY).toBe('viajei:world:quality');
  });
});
