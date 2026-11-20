import { describe, expect, it } from 'vitest';
import { bareEmail, findInboxCode, INBOX_CODE, inboxAddress, inboxCodeOf } from './inbox-code.ts';

describe('o código do endereço', () => {
  it('a forma: r- e seis símbolos sem 0/o/1/l/i', () => {
    expect(INBOX_CODE.test('r-7f3k9m')).toBe(true);
    expect(INBOX_CODE.test('r-7f3k9')).toBe(false);
    expect(INBOX_CODE.test('r-7f3k0m')).toBe(false);
    expect(INBOX_CODE.test('r-7f3kom')).toBe(false);
    expect(INBOX_CODE.test('x-7f3k9m')).toBe(false);
    expect(inboxAddress('r-7f3k9m')).toBe('r-7f3k9m@reservas.reitechia.com.br');
    expect(inboxAddress('r-7f3k9m', 'outro.exemplo.com')).toBe('r-7f3k9m@outro.exemplo.com');
  });

  it('acha o código em qualquer domínio, com nome na frente, em maiúsculas e com espaços', () => {
    expect(inboxCodeOf('r-7f3k9m@reservas.reitechia.com.br')).toBe('r-7f3k9m');
    expect(inboxCodeOf('  R-7F3K9M@Reservas.Outro.com ')).toBe('r-7f3k9m');
    expect(inboxCodeOf('Viajei <r-7f3k9m@reservas.reitechia.com.br>')).toBe('r-7f3k9m');
    expect(inboxCodeOf('reservas@hotel.com')).toBeNull();
    expect(inboxCodeOf('r-7f3k9m')).toBeNull();
    expect(inboxCodeOf('')).toBeNull();
  });

  it('o primeiro código entre os destinatários; nenhum, null', () => {
    expect(
      findInboxCode(['alguem@x.com', 'r-7f3k9m@reservas.reitechia.com.br', 'r-aaaaaa@x']),
    ).toBe('r-7f3k9m');
    expect(findInboxCode(['alguem@x.com'])).toBeNull();
    expect(findInboxCode([])).toBeNull();
  });

  it('o remetente puro, em minúsculas', () => {
    expect(bareEmail('Hotel Vila <Reservas@Hotel.com.br>')).toBe('reservas@hotel.com.br');
    expect(bareEmail('douglas@exemplo.com')).toBe('douglas@exemplo.com');
    expect(bareEmail('sem arroba')).toBeNull();
  });
});
