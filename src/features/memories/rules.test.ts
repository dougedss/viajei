import { describe, expect, it } from 'vitest';
import type { MediaItem } from '@/lib/media/hooks.ts';
import {
  makeAttachment,
  makeDay,
  makeMemory,
  makeStop,
  OTHER_UID,
  TRIP_ID,
  UID,
} from '@/test/factories.ts';
import { answeredStops, buildDiary, isEmptyMemory, memoryPrompt, pendingPrompts } from './rules.ts';

const nature = { kind: 'nature' };

describe('quando a folha "Como foi?" abre sozinha', () => {
  it('só no Chegamos! tocado na tela', () => {
    expect(memoryPrompt({ source: 'tap', stop: nature, answered: false })).toBe('sheet');
  });

  it('nunca por cima de quem dirige: a posição, a notificação, o catch-up, a pergunta e outro membro viram card', () => {
    for (const source of ['live', 'notification', 'catchup', 'question', 'remote'] as const) {
      expect(memoryPrompt({ source, stop: nature, answered: false })).toBe('card');
    }
  });

  it('nó de saída e parada já respondida não pedem nada', () => {
    expect(memoryPrompt({ source: 'tap', stop: { kind: 'origin' }, answered: false })).toBe('none');
    expect(memoryPrompt({ source: 'tap', stop: nature, answered: true })).toBe('none');
  });
});

describe('os cards "Como foi?"', () => {
  const origem = makeStop({ kind: 'origin', done_at: '2026-12-11T10:00:00Z' });
  const cascata = makeStop({ kind: 'nature', name: 'Cascata', done_at: '2026-12-11T13:00:00Z' });
  const hotel = makeStop({ kind: 'hotel', name: 'Hotel', done_at: '2026-12-11T19:00:00Z' });
  const pulada = makeStop({ kind: 'nature', skipped: true, done_at: null });
  const pendente = makeStop({ kind: 'food', done_at: null });
  const stops = [origem, cascata, hotel, pulada, pendente];

  it('concluídas, sem saída nem pulada, a mais recente primeiro', () => {
    expect(pendingPrompts(stops, new Set(), new Set()).map((s) => s.name)).toEqual([
      'Hotel',
      'Cascata',
    ]);
  });

  it('some com a memória da pessoa, com o "Agora não" e enquanto a folha está aberta', () => {
    expect(pendingPrompts(stops, new Set([hotel.id]), new Set()).map((s) => s.name)).toEqual([
      'Cascata',
    ]);
    expect(pendingPrompts(stops, new Set(), new Set([cascata.id])).map((s) => s.name)).toEqual([
      'Hotel',
    ]);
    expect(pendingPrompts(stops, new Set(), new Set(), hotel.id).map((s) => s.name)).toEqual([
      'Cascata',
    ]);
  });

  it('respondida é a linha viva da própria pessoa', () => {
    const memories = [
      makeMemory({ stop_id: 'a', user_id: UID }),
      makeMemory({ id: 'x', stop_id: 'b', user_id: OTHER_UID }),
      makeMemory({ id: 'y', stop_id: 'c', user_id: UID, deleted_at: '2026-12-11T00:00:00Z' }),
    ];
    expect([...answeredStops(memories, UID)]).toEqual(['a']);
  });

  it('vazia: sem nota, texto nem foto', () => {
    expect(isEmptyMemory({ rating: null, memo: '  ', photos: 0 })).toBe(true);
    expect(isEmptyMemory({ rating: null, memo: '', photos: 1 })).toBe(false);
    expect(isEmptyMemory({ rating: 3, memo: '', photos: 0 })).toBe(false);
  });
});

describe('o diário', () => {
  const day1 = makeDay();
  const day2 = makeDay({ id: 'dia-2', date: '2026-12-12' });
  const saida = makeStop({ kind: 'origin', name: 'Saída', done_at: '2026-12-11T10:02:00Z' });
  const parque = makeStop({
    kind: 'nature',
    name: 'Parque',
    done_at: '2026-12-11T16:42:00Z',
    done_by: OTHER_UID,
  });
  const hotel = makeStop({ kind: 'hotel', name: 'Hotel', done_at: '2026-12-11T19:51:00Z' });
  const futuro = makeStop({ kind: 'food', name: 'Jantar', done_at: null });
  const item = (over: Parameters<typeof makeAttachment>[0]): MediaItem => ({
    row: makeAttachment(over),
    pending: false,
    failed: false,
    error: null,
  });

  it('por dia, só os dias com paradas concluídas, na ordem da hora real', () => {
    const diary = buildDiary([day2, day1], [hotel, futuro, parque, saida], [], [], UID);
    expect(diary).toHaveLength(1);
    expect(diary[0]?.index).toBe(1);
    expect(diary[0]?.entries.map((e) => [e.stop.name, e.departure])).toEqual([
      ['Saída', true],
      ['Parque', false],
      ['Hotel', false],
    ]);
  });

  it('as memórias do time inteiro: a própria pessoa primeiro, fotos de quem tirou', () => {
    const memories = [
      makeMemory({ id: 'm1', stop_id: parque.id, user_id: OTHER_UID, rating: 5, memo: 'Lindo' }),
      makeMemory({ id: 'm2', stop_id: parque.id, user_id: UID, rating: 4, memo: null }),
    ];
    const photos = [
      item({
        id: 'p1',
        stop_id: parque.id,
        created_by: OTHER_UID,
        created_at: '2026-12-11T16:50:00Z',
      }),
      item({ id: 'p2', stop_id: parque.id, created_by: UID, created_at: '2026-12-11T16:45:00Z' }),
      item({ id: 'p3', stop_id: hotel.id, created_by: OTHER_UID }),
    ];
    const [d] = buildDiary([day1], [saida, parque, hotel], memories, photos, UID);
    const entry = d?.entries.find((e) => e.stop.id === parque.id);
    expect(
      entry?.memories.map((m) => [m.user_id, m.rating, m.memo, m.photos.map((p) => p.row.id)]),
    ).toEqual([
      [UID, 4, null, ['p2']],
      [OTHER_UID, 5, 'Lindo', ['p1']],
    ]);
    // só com foto também aparece
    expect(d?.entries.find((e) => e.stop.id === hotel.id)?.memories[0]?.user_id).toBe(OTHER_UID);
    // o visualizador desliza pelas fotos do dia, na ordem das entradas
    expect(d?.photos.map((p) => p.row.id)).toEqual(['p2', 'p1', 'p3']);
    expect(d?.entries.find((e) => e.stop.id === parque.id)?.by).toBe(OTHER_UID);
    expect(TRIP_ID).toBeDefined();
  });
});
