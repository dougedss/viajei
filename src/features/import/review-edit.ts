import type { GeocodeResult } from '@/lib/db/schema.ts';
import type { StopFormValues } from '@/features/itinerary/schemas.ts';
import type { LooseDestination, Review, ReviewDay, ReviewStop } from './plan.ts';

/**
 * As edições da revisão, puras: cada uma devolve uma revisão nova (a tela guarda no aparelho a cada
 * mudança). Nada aqui grava na viagem; quem grava é o `planImport` no "Salvar".
 */
type ListSection = 'reservations' | 'contacts' | 'before' | 'pack' | 'quests';

function mapStop(review: Review, key: string, change: (s: ReviewStop) => ReviewStop): Review {
  return {
    ...review,
    days: review.days.map((day) =>
      day.stops.some((s) => s.key === key)
        ? { ...day, stops: day.stops.map((s) => (s.key === key ? change(s) : s)) }
        : day,
    ),
  };
}

export function setStopIncluded(review: Review, key: string, include: boolean): Review {
  return mapStop(review, key, (s) => ({ ...s, include }));
}

/** A parada editada no formulário: o lugar passa a ser o do formulário (ou nenhum). */
export function updateStop(review: Review, key: string, values: StopFormValues): Review {
  return mapStop(review, key, (s) => ({
    ...s,
    ...values,
    geo:
      values.lat !== null && values.lng !== null
        ? s.lat === values.lat && s.lng === values.lng && s.geo
          ? s.geo
          : { status: 'found', label: values.address ?? 'Local marcado', via: 'edit' }
        : { status: 'none' },
  }));
}

/** A escolha entre as opções da busca, ou "nenhum destes" (null). */
export function chooseGeo(review: Review, key: string, option: GeocodeResult | null): Review {
  return mapStop(review, key, (s) =>
    option
      ? {
          ...s,
          lat: option.lat,
          lng: option.lng,
          geo: { status: 'found', label: option.address, via: 'choice' },
        }
      : { ...s, lat: null, lng: null, geo: { status: 'none' } },
  );
}

/** Um dia fora das datas: ampliar a viagem para ele, ou deixar de fora. */
export function setDayIncluded(review: Review, date: string, include: boolean): Review {
  return {
    ...review,
    days: review.days.map((d): ReviewDay => (d.date === date ? { ...d, include } : d)),
  };
}

export function setItemIncluded(
  review: Review,
  section: ListSection,
  key: string,
  include: boolean,
): Review {
  const toggle = <T extends { key: string; include: boolean }>(rows: T[]): T[] =>
    rows.map((r) => (r.key === key ? { ...r, include } : r));
  switch (section) {
    case 'reservations':
      return { ...review, reservations: toggle(review.reservations) };
    case 'contacts':
      return { ...review, contacts: toggle(review.contacts) };
    case 'before':
      return { ...review, before: toggle(review.before) };
    case 'pack':
      return { ...review, pack: toggle(review.pack) };
    case 'quests':
      return { ...review, quests: toggle(review.quests) };
  }
}

export function setLooseDestination(review: Review, key: string, to: LooseDestination): Review {
  return {
    ...review,
    unclassified: review.unclassified.map((u) => (u.key === key ? { ...u, to } : u)),
  };
}

/** O destino de um não classificado como valor do `<select>`, e de volta. */
export function looseValue(to: LooseDestination): string {
  switch (to.kind) {
    case 'stop_note':
      return `stop:${to.stop}`;
    case 'day_note':
      return `day:${to.date}`;
    default:
      return to.kind;
  }
}

export function parseLooseValue(value: string): LooseDestination {
  if (value.startsWith('stop:')) return { kind: 'stop_note', stop: value.slice(5) };
  if (value.startsWith('day:')) return { kind: 'day_note', date: value.slice(4) };
  if (value === 'discard' || value === 'before' || value === 'pack') return { kind: value };
  return { kind: 'undecided' };
}

/** O que vai entrar, contado como na tela: só o que está marcado (e de dia mantido). */
export function reviewCounts(review: Review) {
  const days = review.days.filter((d) => d.include);
  const stops = days.flatMap((d) => d.stops.filter((s) => s.include));
  return {
    days: days.filter((d) => d.stops.some((s) => s.include)).length,
    stops: stops.length,
    reservations: review.reservations.filter((r) => r.include).length,
    contacts: review.contacts.filter((c) => c.include).length,
    before: review.before.filter((i) => i.include).length,
    pack: review.pack.filter((i) => i.include).length,
    quests: review.quests.filter((q) => q.include).length,
  };
}

/** Os avisos do topo da revisão. */
export function reviewWarnings(review: Review) {
  return {
    outsideDays: review.days.filter((d) => d.outside && !d.include).length,
    repeatedStops: review.days.reduce(
      (n, d) => n + d.stops.filter((s) => s.repeated !== null).length,
      0,
    ),
    undecided: review.unclassified.filter((u) => u.to.kind === 'undecided').length,
  };
}

/** Só salva quando cada não classificado tem destino: nada some sem a pessoa decidir. */
export function canSave(review: Review): boolean {
  const c = reviewCounts(review);
  const somethingToSave =
    c.stops + c.reservations + c.contacts + c.before + c.pack + c.quests > 0 ||
    review.unclassified.some((u) => u.to.kind !== 'undecided' && u.to.kind !== 'discard');
  return somethingToSave && reviewWarnings(review).undecided === 0;
}
