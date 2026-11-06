import { describe, expect, it } from 'vitest';
import { formatPhone, toE164 } from './phone.ts';

const e164 = (input: string) => {
  const r = toE164(input);
  return r.ok ? r.e164 : r.reason;
};

describe('telefone para E.164', () => {
  it('celular e fixo digitados à brasileira', () => {
    expect(e164('(51) 99752-7596')).toBe('+5551997527596');
    expect(e164('51 99752 7596')).toBe('+5551997527596');
    expect(e164('51997527596')).toBe('+5551997527596');
    expect(e164('(54) 2131-5007')).toBe('+555421315007');
    expect(e164('54.2131.5007')).toBe('+555421315007');
  });

  it('com país, com zero de longa distância e com operadora', () => {
    expect(e164('+55 51 99752-7596')).toBe('+5551997527596');
    expect(e164('55 51 99752-7596')).toBe('+5551997527596');
    expect(e164('0055 51 99752-7596')).toBe('+5551997527596');
    expect(e164('0 51 99752-7596')).toBe('+5551997527596');
    expect(e164('0 15 51 99752-7596')).toBe('+5551997527596');
  });

  it('números de fora ficam como vieram, com o país', () => {
    expect(e164('+1 (415) 555-0100')).toBe('+14155550100');
    expect(e164('00 351 21 123 4567')).toBe('+351211234567');
  });

  it('o que não dá para guardar diz por quê', () => {
    expect(e164('')).toBe('empty');
    expect(e164('99752-7596')).toBe('no-area-code');
    expect(e164('3282-0000')).toBe('no-area-code');
    expect(e164('0800 123 4567')).toBe('toll-free');
    expect(e164('(51) 89752-7596')).toBe('invalid'); // 11 dígitos sem o 9 do celular
    expect(e164('(10) 2131-5007')).toBe('invalid'); // DDD não termina em 0
    expect(e164('liga pra mim')).toBe('invalid');
    expect(e164('+0 123')).toBe('invalid');
    const r = toE164('99752-7596');
    expect(r.ok ? '' : r.message).toBe('Inclua o DDD: (51) 99752-7596.');
  });

  it('o resultado sempre passa no check do banco', () => {
    for (const input of ['(51) 99752-7596', '+1 415 555 0100', '(54) 2131-5007']) {
      expect(e164(input)).toMatch(/^\+[1-9][0-9]{7,14}$/);
    }
  });

  it('formata para ler', () => {
    expect(formatPhone('+5551997527596')).toBe('(51) 99752-7596');
    expect(formatPhone('+555421315007')).toBe('(54) 2131-5007');
    expect(formatPhone('+14155550100')).toBe('+14155550100');
  });
});
