import { z } from 'zod';
import { RESERVATION_TYPE_KEYS } from '@shared/constants.ts';
import { formatPhone, toE164 } from '@shared/phone.ts';
import { formatMoney, parseMoney } from '@/features/trips/rules.ts';
import type { Reservation } from '@/lib/db/schema.ts';
import { isoToWall, wallToISO } from '@/lib/time/index.ts';

/**
 * O formulário da reserva. Datas e horas chegam separadas, em hora de parede de São Paulo, e viram
 * `timestamptz` pelo helper de `lib/time` (nunca `Date` em UTC). Telefone digitado à brasileira vai
 * para E.164; valor em reais pelo `parseMoney`. O vínculo é uma parada, um dia ou nada.
 */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Até ${max} caracteres.` })
    .transform((s) => (s === '' ? null : s));

const optionalDate = z
  .string()
  .trim()
  .refine((s) => s === '' || /^\d{4}-\d{2}-\d{2}$/.test(s), { error: 'Data inválida.' });
const optionalTime = z
  .string()
  .trim()
  .refine((s) => s === '' || /^\d{2}:\d{2}$/.test(s), { error: 'Horário como 14:00.' });

export const reservationFormSchema = z
  .object({
    type: z.enum(RESERVATION_TYPE_KEYS, { error: 'Escolha o tipo.' }),
    name: z
      .string()
      .trim()
      .min(1, { error: 'Dê um nome para a reserva.' })
      .max(120, { error: 'Até 120 caracteres.' }),
    start_date: optionalDate,
    start_time: optionalTime,
    end_date: optionalDate,
    end_time: optionalTime,
    /** '' (nenhum), 'stop:<id>' ou 'day:<id>' */
    link: z.string(),
    confirmation_code: optionalText(80),
    amount: z.string().transform((s, ctx) => {
      const n = parseMoney(s);
      if (n !== null && (Number.isNaN(n) || n < 0 || n > 99_999_999)) {
        ctx.addIssue({ code: 'custom', message: 'Valor como 463 ou 463,00.' });
        return z.NEVER;
      }
      return n;
    }),
    cancel_policy: optionalText(500),
    cancel_until: optionalDate.transform((s) => (s === '' ? null : s)),
    phone: z.string().transform((s, ctx) => {
      if (s.trim() === '') return null;
      const r = toE164(s);
      if (!r.ok) {
        ctx.addIssue({ code: 'custom', message: r.message });
        return z.NEVER;
      }
      return r.e164;
    }),
    address: optionalText(300),
    booked_via: optionalText(80),
    notes: optionalText(2000),
  })
  .superRefine((v, ctx) => {
    // data e hora andam juntas: hora sem data não existe, e data sem hora seria inventar horário
    // (um ingresso só com o dia se liga ao dia, sem início)
    const pair = (date: string, time: string, which: 'start' | 'end') => {
      if (date !== '' && time === '') {
        ctx.addIssue({ code: 'custom', path: [`${which}_time`], message: 'Falta o horário.' });
      }
      if (time !== '' && date === '') {
        ctx.addIssue({ code: 'custom', path: [`${which}_date`], message: 'Falta a data.' });
      }
    };
    pair(v.start_date, v.start_time, 'start');
    pair(v.end_date, v.end_time, 'end');
    if (v.end_date !== '' && v.start_date === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['start_date'],
        message: 'Com fim, precisa do início.',
      });
    }
    if (v.start_date !== '' && v.start_time !== '' && v.end_date !== '' && v.end_time !== '') {
      if (`${v.end_date}T${v.end_time}` < `${v.start_date}T${v.start_time}`) {
        ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'O fim é antes do início.' });
      }
    }
  });

export type ReservationFormInput = z.input<typeof reservationFormSchema>;
export type ReservationFormValues = z.output<typeof reservationFormSchema>;

export const EMPTY_RESERVATION: ReservationFormInput = {
  type: 'hotel',
  name: '',
  start_date: '',
  start_time: '',
  end_date: '',
  end_time: '',
  link: '',
  confirmation_code: '',
  amount: '',
  cancel_policy: '',
  cancel_until: '',
  phone: '',
  address: '',
  booked_via: '',
  notes: '',
};

export type ReservationColumns = Pick<
  Reservation,
  | 'type'
  | 'name'
  | 'start_at'
  | 'end_at'
  | 'stop_id'
  | 'trip_day_id'
  | 'confirmation_code'
  | 'amount'
  | 'cancel_policy'
  | 'cancel_until'
  | 'phone'
  | 'address'
  | 'booked_via'
  | 'notes'
>;

/** Do formulário às colunas (o schema já garantiu que data e hora andam juntas). */
export function toColumns(v: ReservationFormValues): ReservationColumns {
  const at = (date: string, time: string) =>
    date === '' || time === '' ? null : wallToISO(date, time);
  return {
    type: v.type,
    name: v.name,
    start_at: at(v.start_date, v.start_time),
    end_at: at(v.end_date, v.end_time),
    stop_id: v.link.startsWith('stop:') ? v.link.slice(5) : null,
    trip_day_id: v.link.startsWith('day:') ? v.link.slice(4) : null,
    confirmation_code: v.confirmation_code,
    amount: v.amount,
    cancel_policy: v.cancel_policy,
    cancel_until: v.cancel_until,
    phone: v.phone,
    address: v.address,
    booked_via: v.booked_via,
    notes: v.notes,
  };
}

/** Da reserva gravada ao formulário, para editar. */
export function fromReservation(r: Reservation): ReservationFormInput {
  const start = r.start_at ? isoToWall(r.start_at) : null;
  const end = r.end_at ? isoToWall(r.end_at) : null;
  return {
    type: r.type as ReservationFormInput['type'],
    name: r.name,
    start_date: start?.date ?? '',
    start_time: start?.time ?? '',
    end_date: end?.date ?? '',
    end_time: end?.time ?? '',
    link: r.stop_id ? `stop:${r.stop_id}` : r.trip_day_id ? `day:${r.trip_day_id}` : '',
    confirmation_code: r.confirmation_code ?? '',
    amount: r.amount === null ? '' : formatMoney(r.amount).replace(/^R\$\s?/, ''),
    cancel_policy: r.cancel_policy ?? '',
    cancel_until: r.cancel_until ?? '',
    phone: r.phone ? formatPhone(r.phone) : '',
    address: r.address ?? '',
    booked_via: r.booked_via ?? '',
    notes: r.notes ?? '',
  };
}
