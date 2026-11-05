import { z } from 'zod';
import { STOP_KIND_KEYS } from '@shared/constants.ts';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Até ${max} caracteres.` })
    .transform((s) => (s === '' ? null : s));

const optionalTime = z
  .string()
  .trim()
  .transform((s) => (s === '' ? null : s))
  .refine((s) => s === null || /^\d{2}:\d{2}$/.test(s), { error: 'Horário como 13:30.' });

const optionalMinutes = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === '') return null;
    const n = Number(s.replace(',', '.'));
    if (!Number.isInteger(n) || n < 0 || n > 1440) {
      ctx.addIssue({ code: 'custom', message: 'Minutos inteiros, de 0 a 1440.' });
      return z.NEVER;
    }
    return n;
  });

const optionalUrl = optionalText(500).refine((s) => s === null || /^https?:\/\/\S+$/i.test(s), {
  error: 'Um link começando com http:// ou https://.',
});

/** O formulário de parada. Coordenadas vêm da busca ou do link colado, nunca digitadas. */
export const stopFormSchema = z.object({
  kind: z.enum(STOP_KIND_KEYS, { error: 'Escolha o tipo.' }),
  name: z
    .string()
    .trim()
    .min(1, { error: 'Dê um nome para a parada.' })
    .max(120, { error: 'Até 120 caracteres.' }),
  time: optionalTime,
  closes_at: optionalTime,
  address: optionalText(240),
  lat: z.number().min(-90).max(90).nullable(),
  lng: z.number().min(-180).max(180).nullable(),
  travel_minutes_to_next: optionalMinutes,
  notes: optionalText(2000),
  url: optionalUrl,
});

export type StopFormInput = z.input<typeof stopFormSchema>;
export type StopFormValues = z.output<typeof stopFormSchema>;
