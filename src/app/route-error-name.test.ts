import { describe, expect, it } from 'vitest';
import { routeErrorName } from './route-error-name.ts';

/**
 * Fase 23, 3.0: a tela de erro diz o nome do erro (`data-route-error`) para o laboratório saber o que
 * derrubou a tela, sem a mensagem (que pode carregar dado da pessoa).
 */
describe('o nome do erro na tela de erro', () => {
  it('a classe do erro, sem a mensagem', () => {
    expect(routeErrorName(new TypeError('Cannot read properties of undefined (x)'))).toBe(
      'TypeError',
    );
    class DatabaseClosedError extends Error {
      override name = 'DatabaseClosedError';
    }
    expect(routeErrorName(new DatabaseClosedError('closed'))).toBe('DatabaseClosedError');
  });

  it('um nome estranho vira "Error"; o que não é erro diz o tipo', () => {
    const odd = new Error('x');
    odd.name = 'nome com espaço e <tag>';
    expect(routeErrorName(odd)).toBe('Error');
    expect(routeErrorName('texto')).toBe('string');
    expect(routeErrorName(undefined)).toBe('undefined');
  });
});
