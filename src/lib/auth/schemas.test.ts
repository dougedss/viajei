import { describe, expect, it } from 'vitest';
import { emailSchema, newPasswordSchema, signUpSchema } from './schemas.ts';

describe('schemas de autenticação', () => {
  it('normaliza o e-mail: tira espaços e baixa a caixa', () => {
    expect(emailSchema.parse('  Ana@Viajei.LOCAL ')).toBe('ana@viajei.local');
  });

  it('rejeita e-mail inválido com mensagem em português', () => {
    const r = emailSchema.safeParse('nao-e-email');
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe('Informe um e-mail válido.');
  });

  it('cadastro exige nome, e-mail e senha de 8', () => {
    const r = signUpSchema.safeParse({ name: '  ', email: 'a@b.co', password: '1234567' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join('.'));
      expect(paths).toEqual(expect.arrayContaining(['name', 'password']));
    }
    expect(
      signUpSchema.safeParse({ name: 'Ana', email: 'a@b.co', password: '12345678' }).success,
    ).toBe(true);
  });

  it('nova senha: as duas têm de conferir', () => {
    const r = newPasswordSchema.safeParse({ password: 'abcdefgh', confirm: 'abcdefgX' });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['confirm']);
  });
});
