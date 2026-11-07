import { describe, expect, it } from 'vitest';
import seed from '../../seed/viagem-rs.json';
import { seedAiJson } from '@/test/fixtures/import-recording.ts';
import { fromAi, importSchema, validateImport } from './import-schema.ts';

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

describe('a volta da IA', () => {
  it('o seed como a IA escreve (texto ausente vazio, sem coordenadas) volta igual ao seed', () => {
    const data = fromAi(JSON.parse(seedAiJson()));
    const expected = validateImport({
      ...seed,
      days: seed.days.map((d) => ({
        ...d,
        stops: d.stops.map((s) => ({ ...s, lat: null, lng: null })),
      })),
    });
    expect(data).toEqual(expected);
    // a resposta gravada é a ida do mesmo codec: texto ausente vazio, número ausente null
    const json = seedAiJson();
    expect(json).toMatch(/"url":""/);
    expect(json).toMatch(/"travel_minutes_to_next":null/);
    expect(json).not.toMatch(/"(closes_at|url|notes|address|confirmation_code|stop_ref)":null/);
  });

  it('texto vazio ou só de espaços vira null; o formato volta a ser conferido', () => {
    const ai = JSON.parse(seedAiJson()) as { days: { stops: Record<string, unknown>[] }[] };
    const [day] = ai.days;
    const first = { ...day?.stops[0], time: '  ', notes: '' };
    const data = fromAi({ ...ai, days: [{ ...day, title: ' ', stops: [first] }] });
    expect(data.days[0]).toMatchObject({ title: null });
    expect(data.days[0]?.stops[0]).toMatchObject({ time: null, notes: null });
    // um horário fora do formato não passa pelo texto livre da IA
    const late = { ...first, time: '7h' };
    expect(() => fromAi({ ...ai, days: [{ ...day, stops: [late] }] })).toThrow();
  });

  it('recusa o que o schema não aceita e o que só as checagens finas pegam', () => {
    const ai = JSON.parse(seedAiJson()) as { days: { date: string; stops: unknown[] }[] };
    expect(() => fromAi({ ...ai, days: [{ date: '11/12', title: '', stops: [] }] })).toThrow();
    const repeated = [ai.days[0], ai.days[0]];
    expect(() => fromAi({ ...ai, days: repeated })).toThrow(/Dia repetido/);
    expect(() => fromAi({ ...ai, quests: Array(9).fill({ text: 'x', stop_ref: '' }) })).toThrow();
    // uma coordenada inventada não passa: o schema da IA não tem o campo
    const withCoords = {
      ...ai,
      days: ai.days.map((d) => ({
        ...d,
        stops: d.stops.map((s) => ({ ...(s as object), lat: -29.3, lng: -50.8 })),
      })),
    };
    expect(fromAi(withCoords).days[0]?.stops[0]).toMatchObject({ lat: null, lng: null });
  });
});
