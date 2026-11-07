import { describe, expect, it } from 'vitest';
import {
  addDays,
  anchorOf,
  armExpected,
  armLabel,
  deriveArmKeyMaterial,
  deriveArmKeys,
  eventDateOf,
  eventMoment,
  formatMoment,
  nextEventDate,
} from './arm.ts';
import { makePdf } from './files.ts';
import { generateSubscriptionKeys } from './webpush-decrypt.ts';

const SECRET = 'segredo-de-teste';

describe('os horários dos avisos armados', () => {
  it('véspera às 19:00 e prazo às 10:00 de São Paulo (22:00 e 13:00 UTC)', () => {
    expect(eventMoment('vespera', '2026-12-10').toISOString()).toBe('2026-12-10T22:00:00.000Z');
    expect(eventMoment('prazo', '2026-12-07').toISOString()).toBe('2026-12-07T13:00:00.000Z');
  });

  it('a data guardada é o dia seguinte ao do aviso, nos dois sentidos, virando mês e ano', () => {
    expect(anchorOf('2026-12-10')).toBe('2026-12-11');
    expect(eventDateOf('2026-12-11')).toBe('2026-12-10');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28');
  });

  it('arma hoje se o aviso ainda está a 15 min ou mais; senão, amanhã', () => {
    // 03:07 de São Paulo: a véspera e o prazo de hoje ainda vêm
    const madrugada = new Date('2026-11-07T06:07:00Z');
    expect(nextEventDate('vespera', madrugada)).toBe('2026-11-07');
    expect(nextEventDate('prazo', madrugada)).toBe('2026-11-07');
    // 11:10 (o agendamento atrasou 8 h): o prazo das 10h já foi, a véspera das 19h não
    const atrasada = new Date('2026-11-07T14:10:00Z');
    expect(nextEventDate('prazo', atrasada)).toBe('2026-11-08');
    expect(nextEventDate('vespera', atrasada)).toBe('2026-11-07');
    // 18:50: faltam 10 min, menos que a margem
    expect(nextEventDate('vespera', new Date('2026-11-07T21:50:00Z'))).toBe('2026-11-08');
    // 23:30 de São Paulo (02:30 UTC do dia seguinte): os dois de hoje já passaram
    expect(nextEventDate('prazo', new Date('2026-11-08T02:30:00Z'))).toBe('2026-11-08');
    expect(nextEventDate('vespera', new Date('2026-11-08T02:30:00Z'))).toBe('2026-11-08');
  });

  it('retrospectiva: 9:00 do dia seguinte ao fim; arma para o próximo 9h que ainda está à frente', () => {
    expect(eventMoment('retro', '2026-12-15').toISOString()).toBe('2026-12-15T12:00:00.000Z');
    // a data guardada (o fim da viagem) é o dia anterior ao do aviso
    expect(anchorOf('2026-12-15', 'retro')).toBe('2026-12-14');
    expect(eventDateOf('2026-12-14', 'retro')).toBe('2026-12-15');
    // 03:07: o aviso de hoje às 9h ainda vem, então a viagem armada terminou ontem
    expect(nextEventDate('retro', new Date('2026-11-07T06:07:00Z'))).toBe('2026-11-07');
    // 11:10: o de hoje já foi; arma o de amanhã (a viagem termina hoje)
    expect(nextEventDate('retro', new Date('2026-11-07T14:10:00Z'))).toBe('2026-11-08');
    expect(armExpected('retro', { tripId: 't', anchor: '2026-11-06' })).toEqual({
      title: 'A retrospectiva da viagem está pronta',
      body: '1 dia, 1 parada',
      navigate: '/viagens/t/retrospectiva',
    });
  });

  it('rótulo e momento legíveis', () => {
    expect(armLabel('vespera', '2026-11-07')).toBe('vespera:2026-11-07');
    expect(formatMoment(new Date('2026-11-07T22:00:00Z'))).toBe('07/11 às 19:00');
  });
});

describe('as chaves da assinatura armada', () => {
  it('são as mesmas a cada execução e mudam com o rótulo e com o segredo', () => {
    const a = deriveArmKeyMaterial(SECRET, 'vespera:2026-11-07');
    const again = deriveArmKeyMaterial(SECRET, 'vespera:2026-11-07');
    const other = deriveArmKeyMaterial(SECRET, 'vespera:2026-11-08');
    const otherSecret = deriveArmKeyMaterial('outro', 'vespera:2026-11-07');
    expect(again).toEqual(a);
    expect(other.publicRaw).not.toEqual(a.publicRaw);
    expect(otherSecret.publicRaw).not.toEqual(a.publicRaw);
    expect(a.publicRaw).toHaveLength(65);
    expect(a.publicRaw[0]).toBe(4);
    expect(a.auth).toHaveLength(16);
  });

  it('a chave privada derivada casa com o ponto público (o ECDH dos dois lados dá o mesmo)', async () => {
    const keys = await deriveArmKeys(SECRET, 'prazo:2026-11-07');
    const peer = await generateSubscriptionKeys();
    const ecdh = { name: 'ECDH', namedCurve: 'P-256' } as const;
    const theirPublic = await crypto.subtle.importKey('raw', peer.publicRaw, ecdh, false, []);
    const ourPublic = await crypto.subtle.importKey('raw', keys.publicRaw, ecdh, false, []);
    const mine = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: theirPublic },
      keys.privateKey,
      256,
    );
    const theirs = await crypto.subtle.deriveBits(
      { name: 'ECDH', public: ourPublic },
      peer.privateKey,
      256,
    );
    expect(new Uint8Array(mine)).toEqual(new Uint8Array(theirs));
  });
});

describe('o que os avisos armados têm de dizer', () => {
  it('véspera com 2 de antes e 1 da mala, abrindo a lista de antes', () => {
    expect(armExpected('vespera', { tripId: 't', anchor: '2026-12-11' })).toEqual({
      title: 'Amanhã é dia de viajar',
      body: '2 itens de antes e 1 da mala faltando',
      navigate: '/viagens/t/checklists?aba=antes',
    });
  });

  it('prazo com o nome da reserva e a data, abrindo a reserva', () => {
    expect(
      armExpected('prazo', {
        tripId: 't',
        anchor: '2026-12-08',
        reservationId: 'r',
        reservationName: 'Pousada do prazo',
      }),
    ).toEqual({
      title: 'Amanhã é o último dia para cancelar sem custo',
      body: 'Pousada do prazo · até 08/12',
      navigate: '/viagens/t/reservas?abrir=r',
    });
  });
});

describe('o PDF de teste', () => {
  it('começa como PDF e a tabela xref aponta para cada objeto', () => {
    const pdf = makePdf();
    const text = pdf.toString('latin1');
    expect(text.startsWith('%PDF-1.4\n')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n/.exec(text)?.[1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(4);
    offsets.forEach((o, i) => expect(text.slice(o, o + 8)).toBe(`${i + 1} 0 obj\n`));
  });
});
