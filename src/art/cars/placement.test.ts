import { describe, expect, it } from 'vitest';
import { describeCar, joinPt } from './describe.ts';
import { knownKeys, placeAccessories, placedKeys, STICKER_KEYS } from './placement.ts';
import { PROFILES } from './profiles/index.ts';
import type { CarSpec } from './types.ts';

const PLAIN: CarSpec = {
  model: 'hatch',
  color: 'sunset',
  finish: 'solid',
  wheels: 'classic',
  accessories: [],
  plate: null,
};

describe('onde cada acessório encaixa', () => {
  it('o primeiro item de teto vai para a faixa mais próxima; o rack aparece sozinho', () => {
    const p = placeAccessories(PROFILES.hatch, ['board', 'bike']);
    expect(p.rack).toBe(true);
    expect(p.lanes).toEqual(['board', 'bike']);
    expect(placedKeys(p, ['board', 'bike'])).toEqual(['rack', 'board', 'bike']);
  });

  it('o que não cabe sobra: faixas do teto e 3 adesivos', () => {
    const p = placeAccessories(PROFILES.sedan, ['bike', 'board', 'box', ...STICKER_KEYS]);
    expect(p.lanes).toEqual(['bike', 'board']);
    expect(p.stickers).toHaveLength(3);
    expect(p.overflow).toEqual(['box', ...STICKER_KEYS.slice(3)]);
    expect(placeAccessories(PROFILES.kombi, ['bike', 'board', 'box']).overflow).toEqual([]);
  });

  it('com o encaixe anterior, quem continua não muda de lugar', () => {
    const before = placeAccessories(PROFILES.kombi, ['bike', 'box', 'board']);
    const after = placeAccessories(PROFILES.kombi, ['box', 'board'], before);
    expect(after.lanes).toEqual([null, 'box', 'board']);
    const back = placeAccessories(PROFILES.kombi, ['box', 'board', 'sticker_star', 'bike'], after);
    expect(back.lanes).toEqual(['bike', 'box', 'board']);
    const s1 = placeAccessories(PROFILES.hatch, ['sticker_clock', 'sticker_star']);
    const s2 = placeAccessories(PROFILES.hatch, ['sticker_star', 'sticker_map'], s1);
    expect(s2.stickers).toEqual(['sticker_map', 'sticker_star', null]);
  });

  it('chaves desconhecidas e repetidas saem', () => {
    expect(knownKeys(['bike', 'turbo', 'bike', 'plate'])).toEqual(['bike', 'plate']);
  });
});

describe('o rótulo acessível do carro', () => {
  it('modelo, cor e os acessórios em português', () => {
    expect(
      describeCar({ ...PLAIN, model: 'hatch', color: 'sunset', accessories: ['rack', 'bike'] }),
    ).toBe('Hatch Pôr do sol com rack e bicicleta');
    expect(describeCar({ ...PLAIN, model: 'kombi', color: 'gold' })).toBe('Kombi Dourado');
    // o acabamento e as rodas, só quando não são os de sempre (fase 16)
    expect(
      describeCar({
        ...PLAIN,
        model: 'suv',
        color: 'sky',
        finish: 'pearl',
        wheels: 'wire',
        accessories: ['rack'],
      }),
    ).toBe('SUV Céu, tinta perolada, rodas raiadas, com rack');
    expect(describeCar({ ...PLAIN, finish: 'matte' })).toBe('Hatch Pôr do sol, tinta fosca');
    expect(
      describeCar({
        ...PLAIN,
        model: 'suv',
        color: 'leaf',
        accessories: ['bike', 'hubcaps', 'plate'],
        plate: 'x',
      }),
    ).toBe('SUV Folha com rack, bicicleta, calotas cromadas e placa da viagem');
    expect(joinPt([])).toBe('');
    expect(joinPt(['a'])).toBe('a');
  });
});
