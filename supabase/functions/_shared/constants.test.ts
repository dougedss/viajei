import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENTS,
  CAR_ACCESSORIES,
  CAR_COLORS,
  isValidXp,
  LEVELS,
  PERSON_COLORS,
  STOP_KINDS,
  XP_KINDS,
  XP_POINTS,
} from './constants.ts';

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

  it('tipos de parada: os 10 do banco (o Posto desde a 0013), com ícone', () => {
    expect(Object.keys(STOP_KINDS)).toEqual([
      'origin',
      'transit',
      'nature',
      'winery',
      'hotel',
      'food',
      'event',
      'city',
      'fuel',
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

  it('XP: os 10 tipos da tabela 10.1, com os pontos fixos e a missão de 10 a 30', () => {
    expect(XP_KINDS).toEqual([
      'stop_done',
      'departure_on_time',
      'memory_rating',
      'memory_photo',
      'checklist_item',
      'checklist_complete',
      'quest_done',
      'expense_logged',
      'reservation_added',
      'trip_completed',
    ]);
    expect(XP_POINTS.trip_completed).toBe(100);
    expect(isValidXp('stop_done', 10)).toBe(true);
    expect(isValidXp('stop_done', 11)).toBe(false);
    expect(isValidXp('quest_done', 10)).toBe(true);
    expect(isValidXp('quest_done', 30)).toBe(true);
    expect(isValidXp('quest_done', 31)).toBe(false);
    expect(isValidXp('quest_done', 9)).toBe(false);
  });

  it('conquistas: as 15, cada uma com frase, ícone, cor e um acessório que ela libera', () => {
    const keys = Object.keys(ACHIEVEMENTS);
    expect(keys).toHaveLength(15);
    for (const a of Object.values(ACHIEVEMENTS)) {
      expect(a.done.endsWith('.')).toBe(true);
      expect(a.icon).toMatch(/^[a-z0-9-]+$/);
      expect(a.color).toMatch(HEX);
    }
    const unlocked = new Set(Object.values(CAR_ACCESSORIES).map((c) => c.achievement));
    expect([...unlocked].sort()).toEqual([...keys].sort());
  });
});
