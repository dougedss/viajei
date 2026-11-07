import { describe, expect, it } from 'vitest';
import { importSse, seedAiJson } from '@/test/fixtures/import-recording.ts';
import {
  encodeEvent,
  importRequestSchema,
  SSE_KEEPALIVE,
  SseDecoder,
  type ImportEvent,
} from './import-protocol.ts';

/** Gerador de números com semente: os cortes "aleatórios" são os mesmos em toda volta da CI. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 2 ** 32;
  };
}

function cutAtRandom(text: string, seed: number, max = 40): string[] {
  const next = rng(seed);
  const out: string[] = [];
  let i = 0;
  while (i < text.length) {
    const size = 1 + Math.floor(next() * max);
    out.push(text.slice(i, i + size));
    i += size;
  }
  return out;
}

function decodeAll(pieces: readonly string[]): ImportEvent[] {
  const decoder = new SseDecoder();
  return [...pieces.flatMap((p) => decoder.push(p)), ...decoder.end()];
}

describe('SSE da importação', () => {
  const sse = importSse({ days: [] });
  const whole = decodeAll([sse]);

  it('codifica um evento por bloco, numa linha de dados', () => {
    expect(encodeEvent({ type: 'delta', text: 'a\nb "c"' })).toBe(
      'event: delta\ndata: {"type":"delta","text":"a\\nb \\"c\\""}\n\n',
    );
  });

  it('lê a gravação inteira: start, os pedaços do JSON e o done', () => {
    expect(whole[0]).toMatchObject({ type: 'start' });
    expect(whole.at(-1)).toMatchObject({ type: 'done', data: { days: [] } });
    const text = whole.flatMap((e) => (e.type === 'delta' ? [e.text] : [])).join('');
    expect(text).toBe(seedAiJson());
  });

  it.each([1, 2, 3, 42, 2026, 31_337])(
    'cortada em pontos aleatórios (semente %i), dá os mesmos eventos',
    (seed) => {
      expect(decodeAll(cutAtRandom(sse, seed))).toEqual(whole);
    },
  );

  it('aceita \\r\\n e \\r, inclusive com o \\r\\n partido entre dois pedaços', () => {
    const crlf = sse.replaceAll('\n', '\r\n');
    expect(decodeAll(cutAtRandom(crlf, 7, 3))).toEqual(whole);
    expect(decodeAll([sse.replaceAll('\n', '\r')])).toEqual(whole);
  });

  it('ignora comentários (o aviso de que a conexão está viva) e eventos fora do contrato', () => {
    const noisy = [
      SSE_KEEPALIVE,
      'event: outro\ndata: {"type":"outro"}\n\n',
      'data: não é json\n\n',
      encodeEvent({ type: 'delta', text: '{' }),
      SSE_KEEPALIVE,
    ].join('');
    expect(decodeAll([noisy])).toEqual([{ type: 'delta', text: '{' }]);
  });

  it('o último evento sem a linha em branco final ainda conta', () => {
    const cut = encodeEvent({ type: 'delta', text: 'x' }).trimEnd();
    expect(decodeAll([cut])).toEqual([{ type: 'delta', text: 'x' }]);
  });
});

describe('pedido de importação', () => {
  const ok = {
    trip_id: '0faf1ff2-99ca-482a-a110-44dbb03df182',
    text: 'roteiro',
    trip: { name: 'RS', start_date: '2026-12-11', end_date: '2026-12-14', origin: null },
  };

  it('aceita o pedido do app', () => {
    expect(importRequestSchema.safeParse(ok).success).toBe(true);
  });

  it('recusa sem o contexto da viagem, com data malformada ou variante desconhecida', () => {
    expect(importRequestSchema.safeParse({ ...ok, trip: undefined }).success).toBe(false);
    expect(
      importRequestSchema.safeParse({ ...ok, trip: { ...ok.trip, start_date: '11/12/2026' } })
        .success,
    ).toBe(false);
    expect(importRequestSchema.safeParse({ ...ok, variant: 'turbo' }).success).toBe(false);
  });
});
