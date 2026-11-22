import { describe, expect, it, vi } from 'vitest';
import { comRetentativa } from './retentativa.ts';

const semEspera = () => vi.fn<(ms: number) => Promise<void>>(() => Promise.resolve());

describe('comRetentativa', () => {
  it('tenta de novo depois de falhar, espera o que a regra mandar e devolve o primeiro acerto', async () => {
    const sleep = semEspera();
    let chamadas = 0;
    const out = await comRetentativa(
      (n) => {
        chamadas += 1;
        return n < 3 ? Promise.reject(new Error(`falhou ${String(n)}`)) : Promise.resolve('ok');
      },
      { tentativas: 3, esperaMs: (n) => n * 1000, sleep },
    );
    expect(out).toBe('ok');
    expect(chamadas).toBe(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
  });

  it('desiste depois das tentativas, com o último erro, e não espera depois da última', async () => {
    const sleep = semEspera();
    const falhas: number[] = [];
    await expect(
      comRetentativa((n) => Promise.reject(new Error(`erro ${String(n)}`)), {
        tentativas: 2,
        esperaMs: () => 500,
        sleep,
        onFalha: (n) => falhas.push(n),
      }),
    ).rejects.toThrow('erro 2');
    expect(falhas).toEqual([1, 2]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('acertando de primeira, nem espera nem repete', async () => {
    const sleep = semEspera();
    expect(
      await comRetentativa(() => Promise.resolve(7), { tentativas: 3, esperaMs: () => 1, sleep }),
    ).toBe(7);
    expect(sleep).not.toHaveBeenCalled();
  });
});
