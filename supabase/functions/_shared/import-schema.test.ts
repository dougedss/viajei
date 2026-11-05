import { describe, expect, it } from 'vitest';
import seed from '../../seed/viagem-rs.json';
import { importSchema, validateImport } from './import-schema.ts';

describe('import-schema', () => {
  it('o seed da viagem do RS passa inteiro', () => {
    const data = validateImport(seed);
    expect(data.days).toHaveLength(4);
    expect(data.days.map((d) => d.date)).toEqual([
      '2026-12-11',
      '2026-12-12',
      '2026-12-13',
      '2026-12-14',
    ]);
    expect(data.days.flatMap((d) => d.stops)).toHaveLength(18);
    expect(data.days.flatMap((d) => d.stops).every((s) => s.lat !== null && s.lng !== null)).toBe(
      true,
    );
    expect(data.reservations).toHaveLength(2);
    expect(data.contacts).toHaveLength(6);
    expect(data.checklist_before).toHaveLength(5);
    expect(data.checklist_pack).toHaveLength(6);
    expect(data.quests).toHaveLength(4);
  });

  it('opcional ausente não vale: tem de ser null', () => {
    const stop = { time: '07:00', kind: 'origin', name: 'Saída' };
    expect(
      importSchema.safeParse({
        ...seed,
        days: [{ date: '2026-12-11', title: null, stops: [stop] }],
      }).success,
    ).toBe(false);
  });

  it('recusa tipo de parada fora dos nove, horário e data malformados', () => {
    const base = seed.days[0]!.stops[0]!;
    const day = (stop: object) => ({
      ...seed,
      days: [{ date: '2026-12-11', title: null, stops: [{ ...base, ...stop }] }],
    });
    expect(importSchema.safeParse(day({ kind: 'beach' })).success).toBe(false);
    expect(importSchema.safeParse(day({ time: '7h' })).success).toBe(false);
    expect(
      importSchema.safeParse({ ...seed, days: [{ date: '11/12/2026', title: null, stops: [] }] })
        .success,
    ).toBe(false);
  });

  it('recusa mais de 8 missões', () => {
    const quests = Array.from({ length: 9 }, (_, i) => ({ text: `m${i}`, stop_ref: null }));
    expect(importSchema.safeParse({ ...seed, quests }).success).toBe(false);
  });

  it('validateImport pega dia repetido, parada sem nome e coordenada pela metade', () => {
    const d = seed.days[0]!;
    expect(() => validateImport({ ...seed, days: [d, d] })).toThrow('Dia repetido');
    expect(() =>
      validateImport({ ...seed, days: [{ ...d, stops: [{ ...d.stops[0]!, name: ' ' }] }] }),
    ).toThrow('sem nome');
    expect(() =>
      validateImport({ ...seed, days: [{ ...d, stops: [{ ...d.stops[0]!, lng: null }] }] }),
    ).toThrow('andam juntas');
  });
});
