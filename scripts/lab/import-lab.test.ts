import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_CHARS } from '../../supabase/functions/_shared/import-protocol.ts';
import { validateImport } from '../../supabase/functions/_shared/import-schema.ts';
import { closedStops, costUsd, LAB_IMPORT_TEXT, longTripText, scoreImport } from './import-lab.ts';

const seed = validateImport(JSON.parse(readFileSync('supabase/seed/viagem-rs.json', 'utf8')));
const expected = {
  ...seed,
  days: seed.days.map((d) => ({
    ...d,
    stops: d.stops.map((s) => ({ ...s, lat: null, lng: null })),
  })),
};

describe('a nota da extração', () => {
  it('o seed contra ele mesmo: tudo achado, nada inventado', () => {
    const score = scoreImport(expected, expected);
    expect(score.stops).toEqual({ expected: 18, matched: 18, extra: 0 });
    expect(score.fields.ok).toBe(score.fields.total);
    expect(score.invented).toEqual([]);
    expect(score.wrong).toEqual([]);
  });

  it('separa o inventado (o texto não tem) do errado (o texto tem outro valor)', () => {
    const got = structuredClone(expected);
    const first = got.days[0]?.stops[1];
    if (first) first.closes_at = '18:00'; // o texto diz 17h
    const hotel = got.days[0]?.stops[2];
    if (hotel) hotel.travel_minutes_to_next = 99;
    const reservation = got.reservations[0];
    if (reservation) reservation.confirmation_code = 'INVENTADO';
    const origin = got.days[0]?.stops[0];
    if (origin) got.days[0]?.stops.push({ ...origin, name: 'Posto extra' });
    const score = scoreImport(expected, got);
    expect(score.wrong).toContain('Park Salto Ventoso.closes_at');
    expect(score.stops.extra).toBe(1);
    expect(score.invented.length + score.wrong.length).toBeGreaterThanOrEqual(2);
  });
});

describe('a medição', () => {
  it('conta só as paradas que chegaram inteiras', () => {
    expect(closedStops('{"days":[{"date":"2026-12-11","title":null,"stops":[{"name":"A"')).toBe(0);
    expect(
      closedStops('{"days":[{"date":"2026-12-11","title":null,"stops":[{"name":"A"},{"na'),
    ).toBe(1);
    expect(closedStops('{"days":[{"stops":[{},{}]},{"stops":[{}')).toBe(2);
    expect(closedStops('{"days":[{"stops":[{},{}]}],"reservations":[')).toBe(2);
    expect(closedStops('não é json')).toBe(0);
  });

  it('o custo pelo preço do modelo que respondeu', () => {
    expect(costUsd('claude-sonnet-5-5', { input_tokens: 4_000, output_tokens: 3_000 })).toBeCloseTo(
      0.038,
    );
    expect(costUsd('claude-opus-5-5', { input_tokens: 1_000_000, output_tokens: 0 })).toBe(4);
    expect(costUsd('outro-modelo', { input_tokens: 1, output_tokens: 1 })).toBeNull();
  });

  it('os textos cabem no limite da função, e o do laboratório não tem nada do seed real', () => {
    const long = longTripText();
    expect(long.length).toBeGreaterThan(29_000);
    expect(long.length).toBeLessThanOrEqual(IMPORT_MAX_CHARS);
    expect(LAB_IMPORT_TEXT).not.toMatch(/Steffen|99752|Valduga|Montenegro/);
  });
});
