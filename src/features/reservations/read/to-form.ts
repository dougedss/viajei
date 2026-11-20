import { Allow, parse as parsePartial } from 'partial-json';
import { formatPhone, toE164 } from '@shared/phone.ts';
import type { ReadConfirmation } from '@shared/read-protocol.ts';
import { formatMoney } from '@/features/trips/rules.ts';
import type { Stop, TripDay } from '@/lib/db/schema.ts';
import { EMPTY_RESERVATION, type ReservationFormInput } from '../schemas.ts';

/**
 * Da confirmação lida ao formulário de reserva de hoje, puro: a reserva nasce preenchida com o que a
 * leitura tirou, e o que ficou vazio é dito à pessoa, nunca preenchido por dedução (regra 16, D130).
 * O vínculo segue a D87: o nome acha a parada quando bate; senão a data do início acha o dia; senão a
 * pessoa escolhe no formulário, como hoje.
 */
export type LinkContext = {
  days: readonly Pick<TripDay, 'id' | 'date' | 'deleted_at'>[];
  stops: readonly Pick<Stop, 'id' | 'name' | 'trip_day_id' | 'deleted_at'>[];
};

const norm = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

/** O vínculo da reserva lida: a parada pelo nome, o dia pela data do início, ou nada. */
export function linkFor(c: Pick<ReadConfirmation, 'name' | 'start_at'>, ctx: LinkContext): string {
  const name = norm(c.name);
  const stop =
    name === '' ? undefined : ctx.stops.find((s) => s.deleted_at === null && norm(s.name) === name);
  if (stop) return `stop:${stop.id}`;
  const date = c.start_at?.slice(0, 10);
  const day = date ? ctx.days.find((d) => d.deleted_at === null && d.date === date) : undefined;
  return day ? `day:${day.id}` : '';
}

/** "AAAA-MM-DDTHH:MM" em data e hora de parede, como o formulário as quer. */
function split(stamp: string | null): { date: string; time: string } {
  if (!stamp) return { date: '', time: '' };
  return { date: stamp.slice(0, 10), time: stamp.slice(11, 16) };
}

export function formFromConfirmation(c: ReadConfirmation, ctx: LinkContext): ReservationFormInput {
  const start = split(c.start_at);
  const end = split(c.end_at);
  const phone = c.phone ? toE164(c.phone) : null;
  return {
    ...EMPTY_RESERVATION,
    type: c.type,
    name: c.name,
    start_date: start.date,
    start_time: start.time,
    end_date: end.date,
    end_time: end.time,
    link: linkFor(c, ctx),
    confirmation_code: c.confirmation_code ?? '',
    amount: c.amount === null ? '' : formatMoney(c.amount).replace(/^R\$\s?/, ''),
    cancel_policy: c.cancel_policy ?? '',
    cancel_until: c.cancel_until ?? '',
    // o telefone à brasileira, como a pessoa o digitaria; um que não vira E.164 fica como veio, e o
    // formulário diz o que falta
    phone: phone?.ok ? formatPhone(phone.e164) : (c.phone ?? ''),
    address: c.address ?? '',
    booked_via: c.booked_via ?? '',
    notes: c.notes ?? '',
  };
}

type Field = { label: (c: ReadConfirmation) => string; empty: (c: ReadConfirmation) => boolean };
const FIELDS: readonly Field[] = [
  { label: () => 'o nome', empty: (c) => c.name.trim() === '' },
  {
    label: (c) => (c.type === 'hotel' ? 'o check-in' : 'o início'),
    empty: (c) => c.start_at === null,
  },
  { label: (c) => (c.type === 'hotel' ? 'a saída' : 'o fim'), empty: (c) => c.end_at === null },
  { label: () => 'o código', empty: (c) => c.confirmation_code === null },
  { label: () => 'o valor', empty: (c) => c.amount === null },
  { label: () => 'o prazo de cancelamento', empty: (c) => c.cancel_until === null },
  { label: () => 'o telefone', empty: (c) => c.phone === null },
  { label: () => 'o endereço', empty: (c) => c.address === null },
];

/** O que a confirmação não disse, para a tela dizer ("A confirmação não dizia: o valor e o telefone."). */
export function missingLabels(c: ReadConfirmation): string[] {
  return FIELDS.filter((f) => f.empty(c)).map((f) => f.label(c));
}

/** "o valor e o telefone", "o valor, o telefone e o endereço". */
export function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels[0] ?? '';
  return `${labels.slice(0, -1).join(', ')} e ${labels[labels.length - 1] ?? ''}`;
}

/** O nome da reserva enquanto o JSON chega (o preview da leitura): null até ele aparecer inteiro. */
export function partialName(raw: string): string | null {
  if (raw.trim() === '') return null;
  try {
    const v: unknown = parsePartial(raw, Allow.ALL);
    if (typeof v !== 'object' || v === null) return null;
    const name = (v as { name?: unknown }).name;
    // o nome só vale quando a chave seguinte já começou (senão pode estar pela metade)
    return typeof name === 'string' &&
      name.trim() !== '' &&
      /"name"\s*:\s*"(?:[^"\\]|\\.)*"\s*,/.test(raw)
      ? name.trim()
      : null;
  } catch {
    return null;
  }
}
