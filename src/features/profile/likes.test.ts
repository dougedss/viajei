import { describe, expect, it } from 'vitest';
import { interestsOf, learnedLikes, learnedPhrase, toggleInterest } from './likes.ts';

const ME = 'me';
const stop = (id: string, kind: string, deleted_at: string | null = null) => ({
  id,
  kind,
  deleted_at,
});
const memo = (
  stop_id: string,
  rating: number | null,
  user_id = ME,
  deleted_at: string | null = null,
) => ({
  stop_id,
  rating,
  user_id,
  deleted_at,
});

describe('O que você gosta', () => {
  it('os gostos guardados: só os conhecidos, na ordem dos chips, sem repetir', () => {
    expect(interestsOf(['beach', 'nature', 'karaoke', 'nature'])).toEqual(['nature', 'beach']);
    expect(interestsOf(null)).toEqual([]);
  });

  it('ligar e desligar um chip', () => {
    expect(toggleInterest(['beach'], 'nature')).toEqual(['nature', 'beach']);
    expect(toggleInterest(['nature', 'beach'], 'nature')).toEqual(['beach']);
  });

  it('o aprendido: as notas 4 e 5 da pessoa, pelo tipo da parada, sem os tipos que não dizem gosto', () => {
    const stops = [
      stop('a', 'nature'),
      stop('b', 'nature'),
      stop('c', 'winery'),
      stop('d', 'hotel'),
      stop('e', 'food', '2026-11-01T00:00:00Z'),
      stop('f', 'city'),
    ];
    const memories = [
      memo('a', 5),
      memo('b', 4),
      memo('c', 5),
      // nota baixa, de outra pessoa, apagada, sem nota, hotel e parada apagada: não contam
      memo('f', 3),
      memo('c', 5, 'outra'),
      memo('a', 5, ME, '2026-11-02T00:00:00Z'),
      memo('f', null),
      memo('d', 5),
      memo('e', 5),
    ];
    const learned = learnedLikes(memories, stops, ME);
    expect(learned).toEqual([
      { kind: 'nature', label: 'natureza', count: 2 },
      { kind: 'winery', label: 'vinícolas', count: 1 },
    ]);
    expect(learnedPhrase(learned)).toBe(
      'Pelas suas notas 4 e 5 no "Como foi?": natureza (2) e vinícolas (1).',
    );
    expect(learnedPhrase([])).toBeNull();
  });
});
