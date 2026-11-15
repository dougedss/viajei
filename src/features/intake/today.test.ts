import { describe, expect, it } from 'vitest';
import {
  contextFor,
  historyOf,
  placeOfReverse,
  radiusFor,
  reachOf,
  REACH_QUESTION,
  roundPosition,
  todayQuestions,
} from './today.ts';

const NOW = new Date('2026-11-15T12:00:00Z');
const ME = 'me';
const stop = (
  id: string,
  name: string,
  kind: string,
  done_at: string | null,
  over: Partial<{ deleted_at: string | null; source: string }> = {},
) => ({ id, name, kind, done_at, deleted_at: null, source: 'user', ...over });
const memo = (stop_id: string, rating: number | null, user_id = ME) => ({
  stop_id,
  rating,
  user_id,
  deleted_at: null,
});

describe('a saída de hoje: o que entra na conta', () => {
  it('onde a pessoa já foi: a nota dela e há quanto tempo, os mais bem avaliados primeiro', () => {
    const stops = [
      stop('a', 'Cascata do Caracol', 'nature', '2026-10-06T15:00:00Z'),
      stop('b', 'Casa Valduga', 'winery', '2026-10-06T18:00:00Z'),
      stop('c', 'Cascata do Caracol', 'nature', '2026-11-08T15:00:00Z'),
      stop('d', 'Saída de casa', 'origin', '2026-11-08T08:00:00Z'),
      stop('e', 'Posto', 'fuel', '2026-11-08T10:00:00Z'),
      stop('f', 'Parada às 14h20', 'other', '2026-11-08T17:00:00Z', { source: 'auto' }),
      stop('g', 'Gramado', 'city', null),
      stop('h', 'Lago Negro', 'nature', '2026-11-14T10:00:00Z', {
        deleted_at: '2026-11-14T11:00:00Z',
      }),
      stop('i', 'Museu do Automóvel', 'city', '2026-11-01T10:00:00Z'),
    ];
    const memories = [memo('a', 5), memo('b', 4), memo('i', 2), memo('b', 1, 'outra')];
    expect(historyOf(stops, memories, ME, NOW)).toEqual([
      // a mesma cascata em duas viagens: a melhor nota e a vez mais recente
      { name: 'Cascata do Caracol', kind: 'nature', rating: 5, days_ago: 6 },
      { name: 'Casa Valduga', kind: 'winery', rating: 4, days_ago: 39 },
      { name: 'Museu do Automóvel', kind: 'city', rating: 2, days_ago: 14 },
    ]);
  });

  it('a pergunta de alcance sempre; a de origem só quando o app não sabe de onde', () => {
    expect(todayQuestions({ position: true, origin: false })).toEqual([REACH_QUESTION]);
    expect(todayQuestions({ position: false, origin: true })).toEqual([REACH_QUESTION]);
    expect(todayQuestions({ position: false, origin: false }).map((q) => q.text)).toEqual([
      'Quanto tempo vocês têm?',
      'De onde vocês saem?',
    ]);
    expect(REACH_QUESTION.options).toEqual(['A manhã', 'O dia', 'Até amanhã']);
  });

  it('o alcance pela opção ou pelas palavras da pessoa', () => {
    expect(['A manhã', 'O dia', 'Até amanhã'].map(reachOf)).toEqual([
      'morning',
      'day',
      'overnight',
    ]);
    expect(reachOf('só até o almoço')).toBe('morning');
    expect(reachOf('queremos dormir fora')).toBe('overnight');
    expect(reachOf('a tarde toda')).toBe('day');
  });

  it('o raio da busca: o alcance de hoje, ou a região de uma viagem', () => {
    expect([
      radiusFor('today', 'morning'),
      radiusFor('today', 'day'),
      radiusFor('today', 'overnight'),
    ]).toEqual([50, 120, 220]);
    expect(radiusFor('plan', null)).toBe(200);
  });

  it('a cidade da posição, com a sigla do estado; a posição a uns 1 km', () => {
    expect(
      placeOfReverse({ address: { town: 'Canela', 'ISO3166-2-lvl4': 'BR-RS', road: 'Rua X' } }),
    ).toBe('Canela, RS');
    expect(placeOfReverse({ address: { city: 'Lisboa' } })).toBe('Lisboa');
    expect(placeOfReverse(null)).toBeNull();
    expect(roundPosition({ lat: -29.371234, lng: -50.876543 })).toEqual({
      lat: -29.37,
      lng: -50.88,
    });
  });

  it('o contexto leva os gostos, o aprendido, o histórico, o tempo e a posição arredondada', () => {
    const c = contextFor({
      now: NOW,
      today: '2026-11-15',
      time: '09:00',
      origin: 'Papanduva/SC',
      position: { lat: -29.371234, lng: -50.876543 },
      place: 'Canela, RS',
      interests: ['nature', 'no_dirt_road'],
      learned: [{ kind: 'nature', count: 3 }],
      history: [{ name: 'Cascata do Caracol', kind: 'nature', rating: 5, days_ago: 6 }],
      weather: 'Céu limpo, 14° a 27°',
    });
    expect(c).toEqual({
      today: '2026-11-15',
      now: '09:00',
      origin: 'Papanduva/SC',
      position: { lat: -29.37, lng: -50.88 },
      place: 'Canela, RS',
      interests: ['nature', 'no_dirt_road'],
      learned: [{ kind: 'nature', count: 3 }],
      history: [{ name: 'Cascata do Caracol', kind: 'nature', rating: 5, days_ago: 6 }],
      weather: 'Céu limpo, 14° a 27°',
    });
  });
});
