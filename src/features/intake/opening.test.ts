import { describe, expect, it } from 'vitest';
import { openingText } from './opening.ts';

describe('o horário do mapa em português (fase 24)', () => {
  it.each([
    ['Tu-Su 13:00-19:00', 'ter a dom, 13:00–19:00'],
    ['Mo-Fr 08:00-18:00; Sa 08:00-12:00', 'seg a sex, 08:00–18:00 · sáb, 08:00–12:00'],
    ['Mo off', 'seg fechado'],
    ['24/7', 'todos os dias, 24 h'],
    ['sunrise-sunset', 'sunrise-sunset'],
  ])('%s', (raw, text) => {
    expect(openingText(raw)).toBe(text);
  });
});
