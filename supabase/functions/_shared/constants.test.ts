import { describe, expect, it } from 'vitest';
import { CAR_COLORS, LEVELS, PERSON_COLORS, STOP_KINDS } from './constants.ts';

const HEX = /^#[0-9A-F]{6}$/;

describe('constantes compartilhadas', () => {
  it('cores de pessoa: 8 chaves, hex válido e rótulo', () => {
    const entries = Object.entries(PERSON_COLORS);
    expect(entries).toHaveLength(8);
    for (const [, c] of entries) {
      expect(c.hex).toMatch(HEX);
      expect(c.label.length).toBeGreaterThan(0);
    }
  });

  it('tipos de parada: os 9 do banco, com ícone', () => {
    expect(Object.keys(STOP_KINDS)).toEqual([
      'origin',
      'transit',
      'nature',
      'winery',
      'hotel',
      'food',
      'event',
      'city',
      'other',
    ]);
    for (const k of Object.values(STOP_KINDS)) expect(k.icon).toMatch(/^[a-z0-9-]+$/);
  });

  it('cores do carro: só o dourado exige nível 5', () => {
    const locked = Object.entries(CAR_COLORS).filter(([, c]) => c.level > 1);
    expect(locked.map(([k]) => k)).toEqual(['gold']);
  });

  it('níveis em ordem crescente de XP, começando em 0', () => {
    expect(LEVELS[0].xp).toBe(0);
    for (let i = 1; i < LEVELS.length; i++)
      expect(LEVELS[i]!.xp).toBeGreaterThan(LEVELS[i - 1]!.xp);
  });
});
