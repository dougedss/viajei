import { describe, expect, it } from 'vitest';
import { fromAi } from '@shared/import-schema.ts';
import { seedAiJson } from '@/test/fixtures/import-recording.ts';
import {
  IDLE,
  partialImport,
  previewOf,
  reduceImport,
  type ImportSession,
  type PreviewStop,
} from './preview.ts';

const JSON_TEXT = seedAiJson();
const DATA = fromAi(JSON.parse(JSON_TEXT));
const IMPORT_ID = 'c0ffee00-0000-4000-8000-000000000001';

/** Cortes reprodutíveis: um gerador linear com semente, como no teste do protocolo. */
function cuts(text: string, seed: number): string[] {
  let state = seed;
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
    return state / 2 ** 31;
  };
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const size = 1 + Math.floor(next() * 40);
    out.push(text.slice(i, i + size));
    i += size;
  }
  return out;
}

const signature = (s: PreviewStop) =>
  `${s.name}|${s.kind ?? ''}|${s.time ?? ''}|${s.closes_at ?? ''}`;

describe('o preview enquanto o JSON chega', () => {
  for (const seed of [1, 7, 42, 2026, 31337]) {
    it(`semente ${seed}: o estado final é o JSON inteiro, e o que fechou nunca muda`, () => {
      let session: ImportSession = reduceImport(IDLE, {
        type: 'start',
        id: IMPORT_ID,
        model: 'claude-sonnet-5-5',
      });
      expect(session.phase).toEqual({ kind: 'reading', id: IMPORT_ID });
      const closed = new Map<string, string>();
      let lastStops = 0;
      for (const piece of cuts(JSON_TEXT, seed)) {
        session = reduceImport(session, { type: 'delta', text: piece });
        expect(session.phase).toEqual({ kind: 'arriving', id: IMPORT_ID });
        const preview = previewOf(session.raw);
        if (!preview) continue;
        preview.days.forEach((day, di) =>
          day.stops.forEach((s, si) => {
            const key = `d${di}s${si}`;
            const seen = closed.get(key);
            if (seen !== undefined) expect(signature(s)).toBe(seen);
            if (s.complete) closed.set(key, signature(s));
            // horário só aparece inteiro
            if (s.time !== null) expect(s.time).toMatch(/^\d{2}:\d{2}$/);
          }),
        );
        // as paradas só aumentam
        expect(preview.counts.stops).toBeGreaterThanOrEqual(lastStops);
        lastStops = preview.counts.stops;
      }
      expect(session.raw).toBe(JSON_TEXT);
      const whole = previewOf(session.raw, true);
      expect(whole?.counts).toEqual({
        days: 4,
        stops: 18,
        reservations: 2,
        contacts: 6,
        items: 15,
      });
      expect(whole?.days.every((d) => d.complete && d.stops.every((s) => s.complete))).toBe(true);

      session = reduceImport(session, {
        type: 'done',
        data: DATA,
        model: 'claude-sonnet-5-5',
        usage: { input_tokens: 4100, output_tokens: 2300 },
      });
      expect(session.phase).toEqual({ kind: 'review', data: DATA, id: IMPORT_ID });
    });
  }

  it('um pedaço que ainda não é JSON nenhum não quebra nada', () => {
    expect(previewOf('')).toBeNull();
    expect(previewOf('{"days":[{"date":"2026-12-1')?.days[0]?.date).toBeNull();
  });

  it('o `done` que não passa no schema vira inválido, e o que chegou fica', () => {
    const arriving = reduceImport(IDLE, { type: 'delta', text: '{"days":' });
    const session = reduceImport(arriving, {
      type: 'done',
      data: { days: 'quebrado' },
      model: 'claude-sonnet-5-5',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    expect(session.phase).toMatchObject({ kind: 'error', code: 'invalid', reason: 'schema' });
    expect(session.raw).toBe('{"days":');
  });

  it('o erro do stream guarda o código, a categoria e o que chegou', () => {
    const arriving = reduceImport(IDLE, { type: 'delta', text: JSON_TEXT.slice(0, 500) });
    const session = reduceImport(arriving, {
      type: 'error',
      code: 'refused',
      reason: null,
      category: 'general_harms',
    });
    expect(session.phase).toEqual({
      kind: 'error',
      code: 'refused',
      reason: null,
      category: 'general_harms',
      retryAt: null,
    });
    expect(session.raw).toBe(JSON_TEXT.slice(0, 500));
  });
});

describe('o que chegou antes de um corte', () => {
  it('só os itens que chegaram inteiros, prontos para revisar', () => {
    // cortado no meio do terceiro dia: a parada que estava chegando fica de fora
    const cut = JSON_TEXT.indexOf('"Prova"') + 3;
    const data = partialImport(JSON_TEXT.slice(0, cut));
    expect(data?.days.map((d) => d.date)).toEqual(['2026-12-11', '2026-12-12', '2026-12-13']);
    expect(data?.days[2]?.stops.map((s) => s.name)).toEqual([
      'Café no hotel',
      'Saída para Montenegro',
    ]);
    expect(data?.reservations).toEqual([]);
    expect(data?.days.flatMap((d) => d.stops).every((s) => s.lat === null)).toBe(true);
  });

  it('numa lista que já começou, o último item (que pode estar pela metade) fica de fora', () => {
    const start = JSON_TEXT.indexOf('"checklist_pack"');
    const cut = JSON_TEXT.indexOf('Blusa', start) + 2;
    const data = partialImport(JSON_TEXT.slice(0, cut));
    expect(data?.days).toHaveLength(4);
    expect(data?.checklist_before).toHaveLength(5);
    expect(data?.checklist_pack).toEqual([
      'Protetor solar',
      'Roupa de banho',
      'Calçado com aderência',
    ]);
  });

  it('sem nada inteiro, não há o que revisar', () => {
    expect(
      partialImport('{"days":[{"date":"2026-12-11","title":null,"stops":[{"time":"07:'),
    ).toEqual(expect.objectContaining({ days: [] }));
    expect(partialImport('não é json')).toBeNull();
  });
});
