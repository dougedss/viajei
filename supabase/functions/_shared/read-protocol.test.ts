import { describe, expect, it } from 'vitest';
import {
  aiConfirmationSchema,
  aiReceiptSchema,
  fromAiConfirmation,
  fromAiReceipt,
  readRequestSchema,
  toAiConfirmation,
  toAiReceipt,
  type ReadConfirmation,
  type ReadReceipt,
} from './read-protocol.ts';
import { structuredSchema, type JsonSchemaNode } from './structured-schema.ts';

/** Quantos campos com união (anyOf) o JSON Schema da saída estruturada tem: a API aceita até 16 (D129). */
function unions(node: JsonSchemaNode): number {
  let n = Array.isArray(node.anyOf) ? 1 : 0;
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) {
      for (const x of v) if (x && typeof x === 'object') n += unions(x as JsonSchemaNode);
    } else if (v && typeof v === 'object') {
      n += unions(v as JsonSchemaNode);
    }
  }
  return n;
}

const CONFIRMATION: ReadConfirmation = {
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

describe('o pedido', () => {
  it('aceita texto, anexo ou os dois, e recusa um caminho fora da pasta da viagem', () => {
    const ok = readRequestSchema.safeParse({
      kind: 'confirmation',
      trip_id: null,
      text: 'Reserva confirmada…',
      attachment: null,
    });
    expect(ok.success).toBe(true);
    expect(
      readRequestSchema.safeParse({
        kind: 'receipt',
        trip_id: '0faf1ff2-99ca-482a-a110-44dbb03df182',
        text: null,
        attachment: {
          path: '0faf1ff2-99ca-482a-a110-44dbb03df182/0b8f5f8e-2f2a-4d55-9f3b-6f0a1c2d3e4f.jpg',
        },
      }).success,
    ).toBe(true);
    expect(
      readRequestSchema.safeParse({
        kind: 'confirmation',
        trip_id: null,
        text: null,
        attachment: { path: 'inbox/x/y.pdf' },
      }).success,
    ).toBe(false);
    expect(
      readRequestSchema.safeParse({ kind: 'ocr', trip_id: null, text: 'x', attachment: null })
        .success,
    ).toBe(false);
  });
});

describe('os schemas da IA', () => {
  it('cabem no limite de 16 uniões da saída estruturada (uma cada: o valor e o total)', () => {
    expect(unions(structuredSchema(aiConfirmationSchema))).toBe(1);
    expect(unions(structuredSchema(aiReceiptSchema))).toBe(1);
  });

  it('o enum do tipo e da categoria chegam inteiros ao JSON Schema', () => {
    const c = structuredSchema(aiConfirmationSchema);
    expect((c.properties as Record<string, JsonSchemaNode>).type?.enum).toEqual([
      'hotel',
      'ticket',
      'restaurant',
      'other',
    ]);
    const r = structuredSchema(aiReceiptSchema);
    expect((r.properties as Record<string, JsonSchemaNode>).category?.enum).toEqual([
      'lodging',
      'fuel',
      'food',
      'attractions',
      'other',
    ]);
    expect(r.required).toEqual([
      'total',
      'merchant',
      'cnpj',
      'date',
      'time',
      'category',
      'access_key',
    ]);
  });
});

describe('a volta da confirmação', () => {
  it('ida e volta: o que a IA escreve volta igual', () => {
    expect(fromAiConfirmation(toAiConfirmation(CONFIRMATION))).toEqual(CONFIRMATION);
  });

  it('o texto vazio vira null, e o que veio fora do formato também (um campo vazio é melhor que um errado)', () => {
    const got = fromAiConfirmation({
      type: 'other',
      name: '  ',
      start_at: '13/12 às 14h',
      end_at: '2026-12-14T12:00',
      confirmation_code: '',
      amount: -5,
      cancel_policy: '',
      cancel_until: '08/12/2026',
      phone: '',
      address: '',
      booked_via: '',
      notes: '',
    });
    expect(got).toEqual({
      type: 'other',
      name: '',
      start_at: null,
      end_at: null,
      confirmation_code: null,
      amount: null,
      cancel_policy: null,
      cancel_until: null,
      phone: null,
      address: null,
      booked_via: null,
      notes: null,
    });
  });

  it('um fim antes do início não é um fim', () => {
    const got = fromAiConfirmation(
      toAiConfirmation({
        ...CONFIRMATION,
        start_at: '2026-12-14T12:00',
        end_at: '2026-12-13T14:00',
      }),
    );
    expect(got.start_at).toBe('2026-12-14T12:00');
    expect(got.end_at).toBeNull();
  });

  it('um tipo fora da lista é recusado (a gramática da IA não deixa, mas a volta confere)', () => {
    expect(() =>
      fromAiConfirmation({
        ...(toAiConfirmation(CONFIRMATION) as Record<string, unknown>),
        type: 'flight',
      }),
    ).toThrow();
  });
});

describe('a volta da nota', () => {
  const RECEIPT: ReadReceipt = {
    total: 187.4,
    merchant: 'Posto da Serra',
    cnpj: '12345678000195',
    date: '2026-12-12',
    time: '15:42',
    category: 'fuel',
    access_key: '28170800156225000131650110000151341562040824',
  };

  it('ida e volta', () => {
    expect(fromAiReceipt(toAiReceipt(RECEIPT))).toEqual(RECEIPT);
  });

  it('CNPJ e chave só com o número exato de dígitos; data e hora só no formato; o total nunca negativo', () => {
    expect(
      fromAiReceipt({
        total: null,
        merchant: '',
        cnpj: '12.345.678/0001-95',
        date: '12/12/2026',
        time: '15h42',
        category: 'other',
        access_key: '2817 0800 1562 2500 0131 6501 1000 0151 3415 6204 0824',
      }),
    ).toEqual({
      total: null,
      merchant: null,
      cnpj: '12345678000195',
      date: null,
      time: null,
      category: 'other',
      access_key: '28170800156225000131650110000151341562040824',
    });
    expect(
      fromAiReceipt({
        ...(toAiReceipt(RECEIPT) as Record<string, unknown>),
        cnpj: '123',
        access_key: '28',
      }),
    ).toMatchObject({
      cnpj: null,
      access_key: null,
    });
  });
});
