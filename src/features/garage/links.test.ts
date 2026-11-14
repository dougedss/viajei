import { describe, expect, it } from 'vitest';
import { GARAGE_PATH, garageBack } from './links.ts';

describe('a garagem do perfil e o "voltar" (fase 16)', () => {
  it('mora no perfil', () => {
    expect(GARAGE_PATH).toBe('/perfil/garagem');
  });

  it('volta para onde a pessoa estava', () => {
    expect(garageBack({ back: '/viagens/abc/detalhes' })).toBe('/viagens/abc/detalhes');
    expect(garageBack({ back: '/viagens/abc?render=list' })).toBe('/viagens/abc?render=list');
  });

  it('sem de onde, ou com um destino de fora do app, volta ao perfil', () => {
    expect(garageBack(null)).toBe('/perfil');
    expect(garageBack(undefined)).toBe('/perfil');
    expect(garageBack({})).toBe('/perfil');
    expect(garageBack({ back: 'https://exemplo.com' })).toBe('/perfil');
    expect(garageBack({ back: '//exemplo.com/x' })).toBe('/perfil');
    expect(garageBack({ back: 42 })).toBe('/perfil');
  });
});
