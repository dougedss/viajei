import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isNetworkError } from '../network-error.ts';
import { SyncDeadlineError, withDeadline } from './deadline.ts';

describe('o prazo das chamadas do sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('a resposta dentro do prazo passa como veio, e o sinal não é cancelado', async () => {
    const box: { signal: AbortSignal | null } = { signal: null };
    const out = withDeadline((signal) => {
      box.signal = signal;
      return Promise.resolve({ data: 1 });
    }, 1_000);
    await expect(out).resolves.toEqual({ data: 1 });
    expect(box.signal?.aborted).toBe(false);
  });

  it('o erro da chamada sobe como está', async () => {
    const boom = new Error('42501');
    await expect(withDeadline(() => Promise.reject(boom), 1_000)).rejects.toBe(boom);
  });

  it('sem resposta, cancela o fetch e acaba como erro de rede', async () => {
    const box: { signal: AbortSignal | null } = { signal: null };
    // a chamada que nunca responde (nem quando o sinal é cancelado: a sessão presa antes do fetch)
    const out = withDeadline((signal) => {
      box.signal = signal;
      return new Promise<never>(() => undefined);
    }, 1_000);
    const caught = out.catch((err: unknown) => err);
    await vi.advanceTimersByTimeAsync(1_000);
    const err = await caught;
    expect(err).toBeInstanceOf(SyncDeadlineError);
    expect(isNetworkError(err)).toBe(true);
    expect(box.signal?.aborted).toBe(true);
  });

  it('o prazo que não venceu não deixa timer para trás', async () => {
    await withDeadline(() => Promise.resolve('ok'), 1_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
