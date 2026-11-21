import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeTrip, UID } from '@/test/factories.ts';
import { db } from '@/lib/db/schema.ts';
import { gatherContext, type GatherDeps } from './gather.ts';

const MAJOR_VIEIRA = { lat: -26.3712, lng: -50.3268 };
const PAPANDUVA = { lat: -26.37, lng: -50.144 };

beforeEach(async () => {
  await db.delete();
  await db.open();
});

function deps(over: Partial<GatherDeps> = {}) {
  const asked: { prompt: boolean }[] = [];
  const d: GatherDeps = {
    now: () => new Date('2026-11-21T12:30:00Z'),
    position: (opts) => {
      asked.push(opts);
      return Promise.resolve(MAJOR_VIEIRA);
    },
    reverse: () =>
      Promise.resolve({ address: { town: 'Major Vieira', 'ISO3166-2-lvl4': 'BR-SC' } }),
    geocode: (q) => Promise.resolve(/papanduva/i.test(q) ? PAPANDUVA : null),
    weather: () => Promise.resolve('Céu limpo, 14° a 27°'),
    ...over,
  };
  return { d, asked };
}

describe('o que o aparelho sabe (fase 25, D271): a posição na conversa que monta o roteiro', () => {
  it('com a posição permitida, a origem é onde a pessoa está, também numa viagem (não só na saída de hoje)', async () => {
    await db.trips.put(makeTrip({ origin: 'Papanduva/SC' }));
    const { d, asked } = deps();
    const g = await gatherContext('plan', UID, { prompt: false }, d);
    expect(g.context.position).toEqual({ lat: -26.37, lng: -50.33 });
    expect(g.context.place).toBe('Major Vieira, SC');
    expect(g.context.origin).toBe('Major Vieira, SC');
    expect(g.center).toEqual(MAJOR_VIEIRA);
    // a viagem não lê o tempo (só a saída de hoje)
    expect(g.context.weather).toBeNull();
    expect(asked).toEqual([{ prompt: false }]);
  });

  it('o toque em "Usar posição" é o momento de o navegador perguntar: prompt chega à leitura', async () => {
    const { d, asked } = deps();
    await gatherContext('plan', UID, { prompt: true }, d);
    expect(asked).toEqual([{ prompt: true }]);
  });

  it('sem posição, vale a origem de antes (a viagem mais recente), geocodificada como referência', async () => {
    await db.trips.put(makeTrip({ origin: 'Papanduva/SC' }));
    const { d } = deps({ position: () => Promise.resolve(null) });
    const g = await gatherContext('plan', UID, { prompt: false }, d);
    expect(g.context.position).toBeNull();
    expect(g.context.place).toBeNull();
    expect(g.context.origin).toBe('Papanduva/SC');
    expect(g.center).toEqual(PAPANDUVA);
  });

  it('com a posição mas sem a cidade do reverso, a origem de antes continua como nome, e o ponto é a posição', async () => {
    await db.trips.put(makeTrip({ origin: 'Papanduva/SC' }));
    const { d } = deps({ reverse: () => Promise.resolve(null) });
    const g = await gatherContext('plan', UID, { prompt: false }, d);
    expect(g.context.origin).toBe('Papanduva/SC');
    expect(g.context.place).toBeNull();
    expect(g.center).toEqual(MAJOR_VIEIRA);
  });

  it('sem posição e sem viagem, nada: a pergunta é da IA (ou do app, na saída de hoje)', async () => {
    const { d } = deps({ position: () => Promise.resolve(null) });
    const g = await gatherContext('today', UID, { prompt: false }, d);
    expect(g.context.origin).toBeNull();
    expect(g.center).toBeNull();
    expect(g.context.weather).toBeNull();
  });

  it('a saída de hoje lê o tempo onde a pessoa está, e a hora de agora em São Paulo', async () => {
    const weather = vi.fn(() => Promise.resolve('Céu limpo, 14° a 27°'));
    const { d } = deps({ weather });
    const g = await gatherContext('today', UID, { prompt: false }, d);
    expect(g.context.weather).toBe('Céu limpo, 14° a 27°');
    expect(weather).toHaveBeenCalledWith(MAJOR_VIEIRA, '2026-11-21');
    expect(g.context).toMatchObject({ today: '2026-11-21', now: '09:30' });
  });
});
