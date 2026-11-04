import { differenceInCalendarDays, isValid, parseISO } from 'date-fns';
import { z } from 'zod';
import { LIMITS } from '@shared/constants.ts';
import { emailSchema } from '@/lib/auth/schemas.ts';
import { parseMoney } from './rules.ts';

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Informe a data.' })
  .refine((d) => isValid(parseISO(d)), { error: 'Data inválida.' });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Até ${max} caracteres.` })
    .transform((s) => (s === '' ? null : s));

/** O formulário de viagem. Os campos de texto vazios viram null, como no banco. */
export const tripFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, { error: 'Dê um nome para a viagem.' })
      .max(LIMITS.tripNameMax, { error: `Até ${LIMITS.tripNameMax} caracteres.` }),
    start_date: dateSchema,
    end_date: dateSchema,
    origin: optionalText(120),
    budget: z.string().transform((s, ctx) => {
      const n = parseMoney(s);
      if (n !== null && (Number.isNaN(n) || n < 0)) {
        ctx.addIssue({ code: 'custom', message: 'Informe um valor como 3.000,00.' });
        return z.NEVER;
      }
      return n;
    }),
    notes: optionalText(2000),
  })
  .refine((v) => v.end_date >= v.start_date, {
    error: 'O fim precisa ser depois do início.',
    path: ['end_date'],
  })
  .refine(
    (v) =>
      differenceInCalendarDays(parseISO(v.end_date), parseISO(v.start_date)) <= LIMITS.tripMaxDays,
    { error: `Uma viagem tem no máximo ${LIMITS.tripMaxDays} dias.`, path: ['end_date'] },
  );

export type TripFormInput = z.input<typeof tripFormSchema>;
export type TripFormValues = z.output<typeof tripFormSchema>;

export const inviteSchema = z.object({ email: emailSchema });
export type InviteInput = z.infer<typeof inviteSchema>;
