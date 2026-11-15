import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns';
import { LIMITS } from '@shared/constants.ts';
import type { ImportData } from '@shared/import-schema.ts';
import type { Trip } from '@/lib/db/schema.ts';
import { filled } from '@/lib/text/filled.ts';
import type { TripHeader } from './format.ts';
import type { Review } from './plan.ts';

/**
 * A viagem que nasce do campo (fase 17): o cabeçalho que a revisão mostra antes de criar. Nome, datas
 * e origem saem do texto; o que faltar vira uma pergunta com uma proposta, na própria revisão (a regra
 * do não-preencher): as datas, pelos dias que o texto deu (sem dia nenhum, amanhã); a origem, pela
 * parada de saída do texto ou pela última origem da pessoa; o nome, pelo título do primeiro dia ou
 * pela data. `asked` guarda o que foi proposta, para a tela perguntar (e não só mostrar). Puro.
 */
export type NewTripHeader = {
  name: string;
  start_date: string;
  end_date: string;
  origin: string | null;
  budget: number | null;
};
export type Asked = { name: boolean; dates: boolean; origin: boolean };
/**
 * `originProposal`: a origem que a revisão propõe quando o texto não diz (a última da pessoa); fica
 * guardada para a pergunta continuar oferecendo "como da última vez" depois de outra escolha.
 */
export type NewTripDraft = { header: NewTripHeader; asked: Asked; originProposal: string | null };

const iso = (d: Date) => format(d, 'yyyy-MM-dd');
const plusDays = (date: string, n: number) => iso(addDays(parseISO(date), n));
const br = (date: string) => date.split('-').reverse().slice(0, 2).join('/');

/** A origem mais recente da pessoa: a da viagem dela que começou por último e tem origem. */
export function lastOrigin(
  trips: readonly Pick<Trip, 'origin' | 'start_date' | 'deleted_at' | 'owner_id'>[],
  uid: string,
): string | null {
  const withOrigin = trips
    .filter((t) => t.deleted_at === null && t.owner_id === uid && t.origin?.trim())
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return withOrigin[0]?.origin?.trim() ?? null;
}

/**
 * `daysFromText`: as datas dos dias estão escritas no texto (o formato do Viajei, sempre). Na leitura
 * com a IA de um texto sem data nenhuma, os dias contam a partir de amanhã e o bloco da viagem volta
 * sem datas: aí as datas são proposta, e a revisão pergunta.
 */
export function proposeHeader(
  read: TripHeader,
  data: ImportData,
  ctx: { today: string; lastOrigin: string | null; daysFromText: boolean },
): NewTripDraft {
  const dates = data.days.map((d) => d.date).sort();
  const fromText = read.start_date !== null && read.end_date !== null;
  const start = read.start_date ?? dates[0] ?? plusDays(ctx.today, 1);
  const end = read.end_date ?? dates.at(-1) ?? start;
  // sem origem escrita, a da parada de saída do primeiro dia ("Saída de Papanduva · Papanduva, SC")
  const firstStop = data.days[0]?.stops[0];
  const stopOrigin = firstStop?.kind === 'origin' ? filled(firstStop.address) : null;
  const textOrigin = filled(read.origin) ?? stopOrigin;
  const name = filled(read.name);
  return {
    header: {
      name: name ?? filled(data.days[0]?.title) ?? `Viagem de ${br(start)}`,
      start_date: start,
      end_date: end < start ? start : end,
      origin: textOrigin ?? ctx.lastOrigin,
      budget: read.budget,
    },
    asked: {
      name: name === null,
      dates: !fromText && !(ctx.daysFromText && dates.length > 0),
      origin: !textOrigin,
    },
    originProposal: textOrigin ? null : ctx.lastOrigin,
  };
}

/** Quantos dias tem a viagem do cabeçalho. */
export function spanOf(header: Pick<NewTripHeader, 'start_date' | 'end_date'>): number {
  return differenceInCalendarDays(parseISO(header.end_date), parseISO(header.start_date)) + 1;
}

/**
 * A viagem começa noutro dia: tudo anda junto (os dias, as reservas, o prazo de cancelamento), e o fim
 * acompanha. É o que a pessoa quer quando o texto não tinha datas, ou quando muda a viagem de semana.
 */
export function moveStart(
  draft: NewTripDraft,
  review: Review,
  start: string,
): { draft: NewTripDraft; review: Review } {
  const delta = differenceInCalendarDays(parseISO(start), parseISO(draft.header.start_date));
  if (delta === 0) return { draft, review };
  const shift = (date: string) => plusDays(date, delta);
  const shiftStamp = (stamp: string) => {
    const [date = '', time = ''] = stamp.split('T');
    return `${shift(date)}T${time}`;
  };
  return {
    draft: {
      ...draft,
      header: {
        ...draft.header,
        start_date: start,
        end_date: shift(draft.header.end_date),
        name:
          draft.asked.name && draft.header.name === `Viagem de ${br(draft.header.start_date)}`
            ? `Viagem de ${br(start)}`
            : draft.header.name,
      },
    },
    review: {
      ...review,
      days: review.days.map((d) => ({ ...d, date: shift(d.date) })),
      reservations: review.reservations.map((r) => ({
        ...r,
        day_ref: r.day_ref ? shift(r.day_ref) : null,
        start_at: r.start_at ? shiftStamp(r.start_at) : null,
        end_at: r.end_at ? shiftStamp(r.end_at) : null,
        cancel_until: r.cancel_until ? shift(r.cancel_until) : null,
      })),
      unclassified: review.unclassified.map((u) =>
        u.to.kind === 'day_note' ? { ...u, to: { ...u.to, date: shift(u.to.date) } } : u,
      ),
    },
  };
}

/** O que impede criar a viagem, em palavras de gente; vazio quando dá. */
export function headerProblems(header: NewTripHeader): string[] {
  const out: string[] = [];
  const name = header.name.trim();
  if (name === '') out.push('Dê um nome para a viagem.');
  else if (name.length > LIMITS.tripNameMax)
    out.push(`O nome passa de ${String(LIMITS.tripNameMax)} caracteres.`);
  if (header.end_date < header.start_date) out.push('O fim precisa ser depois do começo.');
  else if (spanOf(header) > LIMITS.tripMaxDays + 1)
    out.push(`Uma viagem tem no máximo ${String(LIMITS.tripMaxDays)} dias.`);
  return out;
}
