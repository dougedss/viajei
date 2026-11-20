import { describe, expect, it } from 'vitest';
import type { ReadConfirmation } from '@shared/read-protocol.ts';
import {
  formFromConfirmation,
  joinLabels,
  linkFor,
  missingLabels,
  partialName,
} from './to-form.ts';

const C: ReadConfirmation = {
  type: 'hotel',
  name: 'Vila Suzana Parque Hotel',
  start_at: '2026-12-13T14:00',
  end_at: '2026-12-14T12:00',
  confirmation_code: '4821-339',
  amount: 463,
  cancel_policy: 'Grátis até 08/12',
  cancel_until: '2026-12-08',
  phone: '+555432821234',
  address: 'R. Cel. Theobaldo Fleck, 15, Canela',
  booked_via: 'Booking',
  notes: 'Café incluído',
};
const DAYS = [
  { id: 'd12', date: '2026-12-12', deleted_at: null },
  { id: 'd13', date: '2026-12-13', deleted_at: null },
  { id: 'd14', date: '2026-12-14', deleted_at: '2026-11-01T00:00:00Z' },
];
const STOPS = [
  { id: 's1', name: 'Cascata do Caracol', trip_day_id: 'd13', deleted_at: null },
  { id: 's2', name: 'vila suzana parque hotel', trip_day_id: 'd13', deleted_at: null },
  {
    id: 's3',
    name: 'Vila Suzana Parque Hotel',
    trip_day_id: 'd13',
    deleted_at: '2026-11-01T00:00:00Z',
  },
];

describe('formFromConfirmation', () => {
  it('preenche o formulário com o que a leitura tirou, em data e hora de parede, e liga pela parada', () => {
    const form = formFromConfirmation(C, { days: DAYS, stops: STOPS });
    expect(form).toEqual({
      type: 'hotel',
      name: 'Vila Suzana Parque Hotel',
      start_date: '2026-12-13',
      start_time: '14:00',
      end_date: '2026-12-14',
      end_time: '12:00',
      link: 'stop:s2',
      confirmation_code: '4821-339',
      amount: '463,00',
      cancel_policy: 'Grátis até 08/12',
      cancel_until: '2026-12-08',
      phone: '(54) 3282-1234',
      address: 'R. Cel. Theobaldo Fleck, 15, Canela',
      booked_via: 'Booking',
      notes: 'Café incluído',
    });
  });

  it('sem parada pelo nome, o dia pela data do início; sem dia vivo, nada', () => {
    expect(
      linkFor({ name: 'Pousada Nova', start_at: '2026-12-12T16:00' }, { days: DAYS, stops: STOPS }),
    ).toBe('day:d12');
    expect(
      linkFor({ name: 'Pousada Nova', start_at: '2026-12-14T16:00' }, { days: DAYS, stops: STOPS }),
    ).toBe('');
    expect(linkFor({ name: '', start_at: null }, { days: DAYS, stops: STOPS })).toBe('');
  });

  it('o que a leitura não achou fica vazio no formulário, e um telefone estranho fica como veio', () => {
    const form = formFromConfirmation(
      {
        ...C,
        name: '',
        start_at: null,
        end_at: null,
        confirmation_code: null,
        amount: null,
        phone: '3282-1234',
        address: null,
        notes: null,
      },
      { days: [], stops: [] },
    );
    expect(form.name).toBe('');
    expect(form.start_date).toBe('');
    expect(form.amount).toBe('');
    expect(form.phone).toBe('3282-1234');
    expect(form.address).toBe('');
    expect(form.link).toBe('');
  });
});

describe('o que ficou vazio', () => {
  it('lista o que a confirmação não disse, no vocabulário do tipo', () => {
    expect(missingLabels(C)).toEqual([]);
    expect(missingLabels({ ...C, amount: null, phone: null, end_at: null })).toEqual([
      'a saída',
      'o valor',
      'o telefone',
    ]);
    expect(missingLabels({ ...C, type: 'ticket', start_at: null, end_at: null })).toEqual([
      'o início',
      'o fim',
    ]);
    expect(joinLabels(['o valor'])).toBe('o valor');
    expect(joinLabels(['o valor', 'o telefone'])).toBe('o valor e o telefone');
    expect(joinLabels(['a saída', 'o valor', 'o telefone'])).toBe('a saída, o valor e o telefone');
  });
});

describe('partialName', () => {
  it('o nome aparece quando a chave seguinte começa, não pela metade', () => {
    expect(partialName('{"type":"hotel","name":"Vila Su')).toBeNull();
    expect(partialName('{"type":"hotel","name":"Vila Suzana","start_at')).toBe('Vila Suzana');
    expect(partialName('')).toBeNull();
    expect(partialName('{"type":"hotel","name":"","start_at":"x"')).toBeNull();
  });
});
