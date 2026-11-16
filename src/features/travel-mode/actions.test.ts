import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wallTime } from '@/lib/time/index.ts';
import { makeStop } from '@/test/factories.ts';
import { depart } from './actions.ts';
import { dayState } from './rules.ts';

// o Partiu! pela `mutate`: aqui só se confere o que ele grava, e em quem
const patches: { id: string; changes: Record<string, unknown> }[] = [];
vi.mock('@/lib/db/mutate.ts', () => ({
  mutate: {
    patch: (_table: string, id: string, changes: Record<string, unknown>) => {
      patches.push({ id, changes });
      return Promise.resolve();
    },
  },
}));

const day = { date: '2026-12-11' };
const now = wallTime('2026-12-11', '17:00');
const saida = () =>
  makeStop({ id: 's', position: 'a0', kind: 'origin', name: 'Saída de casa', time: '08:00' });
const cafe = () => makeStop({ id: 'k', position: 'a1', kind: 'food', name: 'Café', time: '15:00' });
const transito = () =>
  makeStop({
    id: 't',
    position: 'a2',
    kind: 'transit',
    name: 'Saída para Pomerode',
    time: '16:30',
  });
const chegada = () =>
  makeStop({ id: 'c', position: 'a3', kind: 'origin', name: 'Chegada em casa', time: '19:00' });

describe('Partiu!', () => {
  beforeEach(() => {
    patches.length = 0;
  });

  it('do último lugar: grava só a saída dele e não toca a chegada em casa (fase 24)', async () => {
    const stops = [
      { ...saida(), done_at: 'x', departed_at: 'x' },
      { ...cafe(), done_at: 'y' },
      chegada(),
    ];
    await depart(dayState(day, stops, now), 'u1');
    expect(patches.map((p) => p.id)).toEqual(['k']);
    expect(Object.keys(patches[0]?.changes ?? {})).toEqual(['departed_at']);
  });

  it('antes de um deslocamento: conclui e deixa o nó de saída no mesmo toque, como sempre', async () => {
    const stops = [
      { ...saida(), done_at: 'x', departed_at: 'x' },
      { ...cafe(), done_at: 'y' },
      transito(),
      chegada(),
    ];
    await depart(dayState(day, stops, now), 'u1');
    expect(patches.map((p) => p.id)).toEqual(['k', 't']);
    expect(patches[1]?.changes).toMatchObject({ done_by: 'u1' });
  });
});
