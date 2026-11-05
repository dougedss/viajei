import { z } from 'zod';
import { STOP_KIND_KEYS } from './constants.ts';

/**
 * Schema de importação de roteiro: o formato do seed (`supabase/seed/viagem-rs.json`), do botão
 * "carregar viagem de exemplo" e, na fase 10, da saída estruturada da IA. Por isso as regras de
 * forma: opcionais como união com `null` (nunca `undefined`), sem `min`/`max` no JSON Schema e
 * sem recursão. As checagens finas ficam em `refine`, que não entram no JSON Schema.
 */
const nullable = <T extends z.ZodType>(schema: T) => z.union([schema, z.null()]);
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data no formato AAAA-MM-DD');
const timeString = z.string().regex(/^\d{2}:\d{2}$/, 'horário no formato HH:MM');
const isoString = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, 'instante ISO 8601');

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

export const RESERVATION_TYPES = ['hotel', 'ticket', 'restaurant', 'other'] as const;
export const importReservationSchema = z.object({
  type: z.enum(RESERVATION_TYPES),
  name: z.string(),
  /** nome da parada ou data do dia a que se liga; o importador resolve */
  stop_ref: nullable(z.string()),
  day_ref: nullable(dateString),
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

export const CONTACT_TYPES = ['hotel', 'attraction', 'restaurant', 'emergency', 'other'] as const;
export const importContactSchema = z.object({
  name: z.string(),
  phone: nullable(z.string()),
  type: z.enum(CONTACT_TYPES),
  notes: nullable(z.string()),
});

export const importQuestSchema = z.object({
  text: z.string(),
  /** nome da parada a que a missão se liga */
  stop_ref: nullable(z.string()),
});

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
