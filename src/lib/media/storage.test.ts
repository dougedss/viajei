import { describe, expect, it } from 'vitest';
import { classifyStorageError, ruleMessage } from './storage.ts';

/** Como o storage-js entrega os erros: StorageApiError (status HTTP + statusCode do corpo) ou StorageUnknownError. */
const api = (message: string, status: number, statusCode: string) => ({
  __isStorageError: true,
  name: 'StorageApiError',
  message,
  status,
  statusCode,
});

describe('o destino de cada erro do Storage', () => {
  it('"já existe" conta como enviado (o caminho é do anexo e o arquivo é imutável)', () => {
    expect(classifyStorageError(api('The resource already exists', 400, '409'))).toBe('exists');
    expect(classifyStorageError(api('Duplicate', 409, 'Duplicate'))).toBe('exists');
  });

  it('sem rede não é culpa do arquivo', () => {
    const unknown = {
      __isStorageError: true,
      name: 'StorageUnknownError',
      message: 'Failed to fetch',
      originalError: new TypeError('Failed to fetch'),
    };
    expect(classifyStorageError(unknown)).toBe('network');
    expect(classifyStorageError(new TypeError('Load failed'))).toBe('network');
  });

  it('erro do servidor e token vencido esperam e tentam de novo', () => {
    expect(classifyStorageError(api('Internal', 500, '500'))).toBe('retry');
    expect(classifyStorageError(api('Too many', 429, '429'))).toBe('retry');
    expect(classifyStorageError(api('jwt expired', 400, '401'))).toBe('retry');
  });

  it('regra (RLS, tamanho, tipo) vai para Pendentes com uma frase', () => {
    const rls = api('new row violates row-level security policy', 400, '403');
    expect(classifyStorageError(rls)).toBe('rule');
    expect(ruleMessage(rls)).toBe('Sem permissão para enviar nesta viagem.');
    const big = api('Payload too large', 413, '413');
    expect(classifyStorageError(big)).toBe('rule');
    expect(ruleMessage(big)).toBe('O arquivo passa do limite de 10 MB.');
    expect(ruleMessage(api('mime type not supported', 400, '415'))).toBe(
      'Tipo de arquivo não aceito.',
    );
  });

  it('objeto que não existe', () => {
    expect(classifyStorageError(api('Object not found', 400, '404'))).toBe('missing');
  });
});
