import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthWeakPasswordError,
} from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { authErrorMessage } from './errors.ts';

describe('mensagens de erro de autenticação', () => {
  it('traduz os códigos conhecidos', () => {
    expect(authErrorMessage(new AuthApiError('Invalid login', 400, 'invalid_credentials'))).toBe(
      'E-mail ou senha incorretos.',
    );
    expect(authErrorMessage(new AuthApiError('x', 400, 'email_not_confirmed'))).toMatch(
      /Confirme seu e-mail/,
    );
  });
  it('a senha vazada diz o que fazer; a curta segue pedindo 8 caracteres', () => {
    expect(authErrorMessage(new AuthWeakPasswordError('weak', 422, ['pwned']))).toMatch(
      /vazamentos conhecidos/,
    );
    expect(authErrorMessage(new AuthWeakPasswordError('weak', 422, ['length']))).toMatch(
      /pelo menos 8 caracteres/,
    );
  });
  it('rede fora vira "sem conexão"', () => {
    expect(authErrorMessage(new AuthRetryableFetchError('Failed to fetch', 0))).toMatch(
      /Sem conexão/,
    );
    expect(authErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Sem conexão/);
  });
  it('o resto vira uma mensagem genérica, nunca o texto cru do servidor', () => {
    expect(
      authErrorMessage(
        new AuthApiError('Database error saving new user', 500, 'unexpected_failure'),
      ),
    ).toBe('Não deu certo. Tente de novo em instantes.');
    expect(authErrorMessage('qualquer coisa')).toBe('Não deu certo. Tente de novo em instantes.');
  });
});
