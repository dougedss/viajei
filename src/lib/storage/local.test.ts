import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { readLocal, useLocalValue, writeLocal } from './local.ts';

const KEY = 'viajei:test:pref';

afterEach(() => {
  writeLocal(KEY, null);
});

describe('preferências locais', () => {
  it('lê, grava e apaga', () => {
    expect(readLocal(KEY)).toBeNull();
    writeLocal(KEY, 'a');
    expect(readLocal(KEY)).toBe('a');
    writeLocal(KEY, null);
    expect(readLocal(KEY)).toBeNull();
  });

  it('o hook redesenha quando a mesma aba grava', () => {
    const { result } = renderHook(() => useLocalValue(KEY, (raw) => raw ?? 'padrão'));
    expect(result.current).toBe('padrão');
    act(() => writeLocal(KEY, 'novo'));
    expect(result.current).toBe('novo');
    act(() => writeLocal(KEY, null));
    expect(result.current).toBe('padrão');
  });
});
