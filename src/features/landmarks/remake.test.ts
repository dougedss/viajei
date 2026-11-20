import { describe, expect, it } from 'vitest';
import { ESTUFA_CURITIBA } from '@/art/landmarks/samples/estufa-curitiba.ts';
import type { LandmarkEntry } from '@/lib/db/schema.ts';
import { remakeState, validChoice } from './remake.ts';

const entry = (over: Partial<LandmarkEntry> = {}): LandmarkEntry => ({
  place_key: 'osm:w607776738',
  kind: 'stop',
  landmark_id: 'lm-1',
  name: 'Jardim Botânico',
  version: 1,
  status: 'published',
  recipe: ESTUFA_CURITIBA,
  can_remake: true,
  remake: null,
  fetched_at: '2026-11-20T20:00:00.000Z',
  ...over,
});

describe('refazer, com limite', () => {
  it('só quem planejou, só com a peça publicada e com gerações sobrando', () => {
    expect(remakeState(entry(), true)).toEqual({ kind: 'available' });
    expect(remakeState(entry(), false)).toEqual({ kind: 'unavailable' });
    expect(remakeState(entry({ can_remake: false }), true)).toEqual({ kind: 'unavailable' });
    expect(remakeState(entry({ status: 'pending' }), true)).toEqual({ kind: 'unavailable' });
    expect(remakeState(undefined, true)).toEqual({ kind: 'unavailable' });
  });

  it('uma vez por lugar: com o pedido feito, gerando, escolhendo ou feito, nunca de novo', () => {
    expect(
      remakeState(
        entry({ remake: { id: 'r', status: 'generating', options: [null, null] } }),
        true,
      ),
    ).toEqual({ kind: 'generating', id: 'r' });
    const choosing = remakeState(
      entry({
        remake: {
          id: 'r',
          status: 'choosing',
          options: [ESTUFA_CURITIBA, { v: 1, shapes: [] }],
        },
      }),
      true,
    );
    expect(choosing.kind).toBe('choosing');
    if (choosing.kind === 'choosing') {
      expect(choosing.options[0]).not.toBeNull();
      // a segunda opção não passou no schema: não dá para escolhê-la
      expect(choosing.options[1]).toBeNull();
      expect(validChoice(choosing, 0)).toBe(true);
      expect(validChoice(choosing, 1)).toBe(true);
      expect(validChoice(choosing, 2)).toBe(false);
      expect(validChoice(choosing, null)).toBe(false);
    }
    expect(
      remakeState(entry({ remake: { id: 'r', status: 'chosen', options: [null, null] } }), true),
    ).toEqual({ kind: 'done' });
  });

  it('a escolha é obrigatória: sem escolher nada, nada vale', () => {
    expect(validChoice({ kind: 'available' }, 1)).toBe(false);
    expect(validChoice({ kind: 'choosing', id: 'r', options: [null, null] }, null)).toBe(false);
  });
});
