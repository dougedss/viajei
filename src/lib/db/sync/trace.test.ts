import { describe, expect, it } from 'vitest';
import { formatTrace, SyncTrace } from './trace.ts';

describe('o rastro do motor de sync', () => {
  it('guarda a hora e a duração de cada passo, e devolve uma cópia', () => {
    const trace = new SyncTrace();
    trace.add('ciclo', undefined, 1_000);
    trace.add('push 1/0', 430.4, 1_500);
    const list = trace.list();
    expect(list).toEqual([
      { t: 1_000, e: 'ciclo' },
      { t: 1_500, e: 'push 1/0', ms: 430 },
    ]);
    list.pop();
    expect(trace.list()).toHaveLength(2);
  });

  it('é um anel: além do tamanho, o mais antigo sai', () => {
    const trace = new SyncTrace(3);
    for (let i = 1; i <= 5; i++) trace.add(`passo ${String(i)}`, undefined, i);
    expect(trace.list().map((x) => x.e)).toEqual(['passo 3', 'passo 4', 'passo 5']);
  });

  it('formata com a hora relativa ao instante de referência', () => {
    expect(
      formatTrace(
        [
          { t: 9_000, e: 'pedido' },
          { t: 12_340, e: 'push 1/0', ms: 430 },
        ],
        10_000,
      ),
    ).toEqual(['-1.0s pedido', '+2.3s push 1/0 (430 ms)']);
  });
});
