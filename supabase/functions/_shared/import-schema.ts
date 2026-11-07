import { z } from 'zod';
import { CONTACT_TYPE_KEYS, RESERVATION_TYPE_KEYS, STOP_KIND_KEYS } from './constants.ts';

/**
 * Schema de importação de roteiro: o formato do seed (`supabase/seed/viagem-rs.json`), do botão
 * "carregar viagem de exemplo" e da saída estruturada da IA (`aiImportSchema`, no fim: sem as
 * coordenadas e com o texto ausente vazio). Por isso as regras de forma: opcionais como união com
 * `null` (nunca `undefined`), sem `min`/`max` no JSON Schema e sem recursão. As checagens finas
 * ficam em `refine`, que não entram no JSON Schema.
 */
const nullable = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);
// a descrição vai para o JSON Schema da IA (a saída estruturada não aceita `pattern`): é ela que
// diz o formato; o regex continua conferindo do lado de cá
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD')
  .describe('AAAA-MM-DD');
const timeString = z
  .string()
  .regex(/^\d{2}:\d{2}$/, 'horário no formato HH:MM')
  .describe('HH:MM, 24 h');
const isoString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'instante ISO 8601')
  .describe('AAAA-MM-DDTHH:MM, hora de parede');

export const importStopSchema = z.object({
  time: nullable(timeString),
  kind: z.enum(STOP_KIND_KEYS),
  name: z.string(),
  address: nullable(z.string()),
  closes_at: nullable(timeString),
  travel_minutes_to_next: nullable(z.number().int()),
  notes: nullable(z.string()),
  url: nullable(z.string()),
  /** coordenada nunca vem de IA; vem de geocodificação (Nominatim), gravada uma vez no arquivo */
  lat: nullable(z.number()),
  lng: nullable(z.number()),
});
export type ImportStop = z.infer<typeof importStopSchema>;

export const importDaySchema = z.object({
  date: dateString,
  title: nullable(z.string()),
  stops: z.array(importStopSchema),
});
export type ImportDay = z.infer<typeof importDaySchema>;

export const importReservationSchema = z.object({
  type: z.enum(RESERVATION_TYPE_KEYS),
  name: z.string(),
  /** nome da parada ou data do dia a que se liga; o importador resolve (a parada vence) */
  stop_ref: nullable(z.string()),
  day_ref: nullable(dateString),
  /** hora de parede de São Paulo ('2026-12-11T16:30'), sem fuso: o importador converte */
  start_at: nullable(isoString),
  end_at: nullable(isoString),
  confirmation_code: nullable(z.string()),
  amount: nullable(z.number()),
  cancel_policy: nullable(z.string()),
  cancel_until: nullable(dateString),
  phone: nullable(z.string()),
  address: nullable(z.string()),
  booked_via: nullable(z.string()),
  notes: nullable(z.string()),
});
export type ImportReservation = z.infer<typeof importReservationSchema>;

export const importContactSchema = z.object({
  name: z.string(),
  phone: nullable(z.string()),
  type: z.enum(CONTACT_TYPE_KEYS),
  notes: nullable(z.string()),
});
export type ImportContact = z.infer<typeof importContactSchema>;

export const importQuestSchema = z.object({
  text: z.string(),
  /** nome da parada a que a missão se liga */
  stop_ref: nullable(z.string()),
});
export type ImportQuest = z.infer<typeof importQuestSchema>;

export const MAX_QUESTS = 8;

export const importSchema = z.object({
  days: z.array(importDaySchema),
  reservations: z.array(importReservationSchema),
  contacts: z.array(importContactSchema),
  checklist_before: z.array(z.string()),
  checklist_pack: z.array(z.string()),
  quests: z
    .array(importQuestSchema)
    .refine((q) => q.length <= MAX_QUESTS, { message: `No máximo ${MAX_QUESTS} missões.` }),
  /** o que a IA não soube classificar; a pessoa decide */
  unclassified: z.array(z.string()),
});
export type ImportData = z.infer<typeof importSchema>;

/** Validação com checagens que não cabem no JSON Schema: datas em ordem e paradas com nome. */
export function validateImport(input: unknown): ImportData {
  const data = importSchema.parse(input);
  const seen = new Set<string>();
  for (const day of data.days) {
    if (seen.has(day.date)) throw new Error(`Dia repetido: ${day.date}`);
    seen.add(day.date);
    for (const stop of day.stops) {
      if (stop.name.trim() === '') throw new Error(`Parada sem nome no dia ${day.date}`);
      if ((stop.lat === null) !== (stop.lng === null))
        throw new Error(`${stop.name}: latitude e longitude andam juntas`);
    }
  }
  return data;
}

// ------------------------------------------------- como a IA escreve (a saída estruturada)
/**
 * O texto opcional, como a IA escreve: `""` quando o roteiro não diz, `null` do lado de cá. A saída
 * estruturada aceita no máximo 16 campos com união por schema, e no arquivo todo opcional é união
 * com `null` (22). Na IA, só os dois números continuam com `null` (D129). O formato que o arquivo
 * exige (data, horário) volta a ser conferido no `validateImport`.
 */
const blank = (description: string | undefined) =>
  z.codec(description ? z.string().describe(description) : z.string(), z.string().nullable(), {
    decode: (text) => (text.trim() === '' ? null : text),
    encode: (value) => value ?? '',
  });

type NullableText = z.ZodUnion<[z.ZodString, z.ZodNull]>;
type WithBlanks<S extends z.ZodRawShape> = {
  [K in keyof S]: S[K] extends NullableText ? ReturnType<typeof blank> : S[K];
};
const isNullableText = (field: unknown): field is NullableText =>
  field instanceof z.ZodUnion &&
  field.options.length === 2 &&
  field.options[0] instanceof z.ZodString &&
  field.options[1] instanceof z.ZodNull;

/** O objeto do arquivo com cada texto opcional trocado pelo `blank`; o resto fica igual. */
function withBlanks<S extends z.ZodRawShape>(schema: z.ZodObject<S>): z.ZodObject<WithBlanks<S>> {
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [
      key,
      isNullableText(field) ? blank(field.options[0].description) : field,
    ]),
  );
  return z.object(shape as WithBlanks<S>);
}

/** Coordenada nunca vem da IA: a parada da IA é a do arquivo sem `lat` e `lng`. */
export const aiStopSchema = withBlanks(importStopSchema.omit({ lat: true, lng: true }));
export const aiDaySchema = withBlanks(importDaySchema).extend({ stops: z.array(aiStopSchema) });
export const aiImportSchema = importSchema.extend({
  days: z.array(aiDaySchema),
  reservations: z.array(withBlanks(importReservationSchema)),
  contacts: z.array(withBlanks(importContactSchema)),
  quests: z.array(withBlanks(importQuestSchema)),
});
export type AiImport = z.infer<typeof aiImportSchema>;

/** A ida, para a resposta gravada dos testes: os dados do arquivo como a IA os escreveria. */
export function toAi(data: ImportData): unknown {
  return z.encode(aiImportSchema, data);
}

/** A volta: o JSON da IA no formato do seed (paradas sem coordenada), pelas checagens finas. */
export function fromAi(raw: unknown): ImportData {
  const ai = aiImportSchema.parse(raw);
  return validateImport({
    ...ai,
    days: ai.days.map((day) => ({
      ...day,
      stops: day.stops.map((stop) => ({ ...stop, lat: null, lng: null })),
    })),
  });
}
