import { describe, expect, it } from 'vitest';
import { expectedConfirmation, expectedReceipt, score } from './read-score.ts';

/**
 * A nota da medição da leitura (fase 18). A primeira medição (run 44749475872) saiu vermelha por dois
 * defeitos da própria nota, não da leitura: o telefone comparado dígito a dígito (a IA devolve em E.164,
 * com o +55) e `notes` cobrado como vazio (é texto livre: o quarto e o café do voucher cabem lá).
 */
const hotel = {
  name: 'Pousada Medição da Serra',
  code: 'MED-73KP',
  checkin: '2027-01-04',
  checkout: '2027-01-06',
  amount: 1240,
  phone: '(54) 99988-1234',
  cancelUntil: '2026-12-28',
};

describe('a nota de uma confirmação', () => {
  it('o esperado contra ele mesmo: tudo certo, nada faltando, nada inventado', () => {
    const expected = expectedConfirmation(hotel) as unknown as Record<string, unknown>;
    const s = score(expected, expected);
    expect(s.ok).toBe(s.total);
    expect(s.missing).toEqual([]);
    expect(s.wrong).toEqual([]);
    expect(s.invented).toEqual([]);
  });

  it('o telefone em E.164 é o mesmo telefone; o nome e o "reservado por" valem por conter; o horário com segundos vale', () => {
    const expected = expectedConfirmation(hotel) as unknown as Record<string, unknown>;
    const s = score(expected, {
      ...expected,
      phone: '+5554999881234',
      name: 'Pousada Medição da Serra - Gramado',
      booked_via: 'Booking.com',
      start_at: '2027-01-04T15:00:00',
      cancel_policy: 'Cancelamento gratuito até 28/12; depois, a primeira noite',
    });
    expect(s.wrong).toEqual([]);
    expect(s.ok).toBe(s.total);
  });

  it('notes é texto livre: preenchido não é invenção; o endereço preenchido é', () => {
    const expected = expectedConfirmation(hotel) as unknown as Record<string, unknown>;
    const s = score(expected, {
      ...expected,
      notes: '2 adultos · suíte com vista para o vale · café da manhã incluído',
      address: 'Rua inventada, 123',
    });
    expect(s.invented).toEqual(['address']);
    expect(s.total).toBe(Object.keys(expected).length - 1);
  });

  it('separa o que faltou do que veio errado', () => {
    const expected = expectedConfirmation(hotel) as unknown as Record<string, unknown>;
    const s = score(expected, {
      ...expected,
      confirmation_code: null,
      amount: 1204,
      cancel_until: '2026-12-29',
    });
    expect(s.missing).toEqual(['confirmation_code']);
    expect(s.wrong).toEqual(['amount', 'cancel_until']);
  });
});

describe('a nota de uma nota fiscal', () => {
  it('a chave que a IA não leu é "faltou", não "errado"; o CNPJ com pontos vale; a hora com segundos vale', () => {
    const expected = expectedReceipt as unknown as Record<string, unknown>;
    const s = score(expected, {
      ...expected,
      access_key: null,
      cnpj: '00.156.225/0001-31',
      time: '14:32:10',
      merchant: 'Posto Medicao Ltda',
    });
    expect(s.missing).toEqual(['access_key']);
    expect(s.wrong).toEqual([]);
    expect(s.invented).toEqual([]);
    expect(s.ok).toBe(6);
  });

  it('o total com um centavo de diferença é errado', () => {
    const expected = expectedReceipt as unknown as Record<string, unknown>;
    expect(score(expected, { ...expected, total: 201.19 }).wrong).toEqual(['total']);
  });
});
