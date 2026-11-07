import { describe, expect, it } from 'vitest';
import { validateImport } from '@shared/import-schema.ts';
import raw from '../../../supabase/seed/viagem-rs.json';
import { contactsFromImport } from '@/features/itinerary/import-rows.ts';
import { makeContact, makeReservation } from '@/test/factories.ts';
import { canWhatsApp, contactCount, contactGroups } from './rules.ts';
import { toVCard, vcardFilename } from './vcard.ts';

describe('a lista de contatos', () => {
  it('por tipo, com os telefones das reservas sem duplicar o mesmo E.164', () => {
    const steffen = makeContact({ name: 'Hotel Steffen', phone: '+5551997527596', type: 'hotel' });
    const caracol = makeContact({
      name: 'Parque do Caracol',
      phone: '+5554999769063',
      type: 'attraction',
    });
    const groups = contactGroups(
      [steffen, caracol, makeContact({ deleted_at: '2026-12-01T10:00:00.000Z' })],
      [
        // a mesma do contato: não repete, e o contato diz "também na reserva"
        makeReservation({
          id: 'r1',
          name: 'Hotel Steffen',
          phone: '+5551997527596',
          type: 'hotel',
        }),
        makeReservation({
          id: 'r2',
          name: 'Restaurante dos Bifes',
          phone: '+5551988887777',
          type: 'restaurant',
        }),
        makeReservation({ id: 'r3', name: 'Sem telefone', phone: null }),
        makeReservation({
          id: 'r4',
          name: 'Apagada',
          phone: '+5551911112222',
          deleted_at: '2026-12-01T10:00:00.000Z',
        }),
      ],
    );
    expect(groups.map((g) => [g.type, g.entries.map((e) => [e.name, e.source])])).toEqual([
      ['hotel', [['Hotel Steffen', 'contact']]],
      ['attraction', [['Parque do Caracol', 'contact']]],
      ['restaurant', [['Restaurante dos Bifes', 'reservation']]],
    ]);
    const first = groups[0]?.entries[0];
    expect(first?.source === 'contact' ? first.reservationId : null).toBe('r1');
    expect(contactCount(groups)).toBe(3);
  });

  it('os contatos do exemplo: 6, e o telefone do Steffen na reserva não vira um sétimo', () => {
    const data = validateImport(raw);
    const contacts = contactsFromImport(data.contacts).map((c) => makeContact(c));
    const reservations = data.reservations.map((r, i) =>
      makeReservation({ id: `r${i}`, name: r.name, phone: r.phone, type: r.type }),
    );
    expect(contactCount(contactGroups(contacts, reservations))).toBe(6);
  });

  it('WhatsApp só para celular brasileiro (9 na frente); fixo só liga; de fora, mostra', () => {
    expect(canWhatsApp('+5551997527596')).toBe(true);
    expect(canWhatsApp('+555421315007')).toBe(false);
    expect(canWhatsApp('+351912345678')).toBe(true);
  });
});

describe('o .vcf', () => {
  it('vCard 3.0, um por contato, com a viagem em ORG, escapes e CRLF', () => {
    const text = toVCard(
      [
        { name: 'Hotel Steffen', phone: '+5551997527596', notes: null },
        {
          name: 'Hotel Niro (plano B)',
          phone: '+5551998552808',
          notes: 'Montenegro; perto da prova, 5 min',
        },
      ],
      'RS — concurso em Montenegro',
    );
    expect(text).toBe(
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Hotel Steffen',
        'N:;Hotel Steffen;;;',
        'TEL;TYPE=VOICE:+5551997527596',
        'ORG:RS — concurso em Montenegro',
        'END:VCARD',
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:Hotel Niro (plano B)',
        'N:;Hotel Niro (plano B);;;',
        'TEL;TYPE=VOICE:+5551998552808',
        'ORG:RS — concurso em Montenegro',
        'NOTE:Montenegro\\; perto da prova\\, 5 min',
        'END:VCARD',
        '',
      ].join('\r\n'),
    );
  });

  it('nome do arquivo sem acento nem espaço', () => {
    expect(vcardFilename('viajei-contatos-RS — concurso em Montenegro')).toBe(
      'viajei-contatos-rs-concurso-em-montenegro.vcf',
    );
    expect(vcardFilename('???')).toBe('contatos.vcf');
  });
});
