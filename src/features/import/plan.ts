import { differenceInCalendarDays, parseISO } from 'date-fns';
import { LIMITS, type ChecklistKind } from '@shared/constants.ts';
import type {
  ImportContact,
  ImportData,
  ImportQuest,
  ImportReservation,
  ImportStop,
} from '@shared/import-schema.ts';
import { toE164 } from '@shared/phone.ts';
import { contactsFromImport, listItemsFromImport } from '@/features/itinerary/import-rows.ts';
import { datesBetween, planDays, sortStops } from '@/features/itinerary/rules.ts';
import { reservationFromImport } from '@/features/reservations/import.ts';
import type { BatchWrite } from '@/lib/db/mutate.ts';
import type { ChecklistItem, Contact, Reservation, Stop, Trip, TripDay } from '@/lib/db/schema.ts';
import { comparePosition, positionsBetween } from '@/lib/ids/position.ts';

/**
 * Da importação revisada às linhas da viagem. Puro: a tela de importar e o carregador do exemplo
 * passam por aqui, e a gravação é uma transação só da `mutate`. A importação **acrescenta e nunca
 * apaga**: nada que já existe sai nem muda (o título de um dia só entra onde estava vazio), e o que
 * já existe com o mesmo nome (parada no mesmo dia, reserva), o mesmo telefone (contato) ou o mesmo
 * texto (item) começa desmarcado, para importar duas vezes não duplicar.
 */
export type Keyed<T> = T & { key: string; include: boolean };
/**
 * O lugar de uma parada, quando já se sabe: veio do arquivo, do link do Maps, da busca, da escolha
 * entre opções ou da edição; `none` é a pessoa dizendo "nenhum destes" (fica sem local, como uma
 * parada manual pode ficar). `null` na parada: a fila ainda vai procurar.
 */
export type GeoDecision =
  | { status: 'found'; label: string; via: 'file' | 'link' | 'search' | 'choice' | 'edit' }
  | { status: 'none' };
export type ReviewStop = Keyed<ImportStop> & {
  /** o mesmo nome no mesmo dia: no próprio texto, ou já no roteiro */
  repeated: 'text' | 'trip' | null;
  geo: GeoDecision | null;
};
export type ReviewDay = {
  date: string;
  title: string | null;
  stops: ReviewStop[];
  /** fora das datas da viagem: entra só se a pessoa ampliar a viagem (`include`) */
  outside: boolean;
  include: boolean;
};
export type LooseDestination =
  | { kind: 'undecided' }
  | { kind: 'discard' }
  /** a chave de uma parada da revisão */
  | { kind: 'stop_note'; stop: string }
  | { kind: 'day_note'; date: string }
  | { kind: 'before' }
  | { kind: 'pack' };
export type ReviewLoose = { key: string; text: string; to: LooseDestination };
export type ReviewText = Keyed<{ text: string }> & { exists: boolean };
export type Review = {
  days: ReviewDay[];
  reservations: (Keyed<ImportReservation> & { exists: boolean })[];
  contacts: (Keyed<ImportContact> & { exists: boolean })[];
  before: ReviewText[];
  pack: ReviewText[];
  quests: (Keyed<ImportQuest> & { exists: boolean })[];
  unclassified: ReviewLoose[];
};

export type Existing = {
  trip: Pick<Trip, 'id' | 'start_date' | 'end_date'>;
  days: readonly TripDay[];
  stops: readonly Stop[];
  reservations: readonly Reservation[];
  contacts: readonly Contact[];
  items: readonly ChecklistItem[];
};

/** Nome comparável: sem acento, sem caixa, sem espaço sobrando ("Cascata  do Caracol" = "cascata do caracol"). */
export const sameName = (s: string) =>
  s
    .trim()
    .toLocaleLowerCase('pt-BR')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/\s+/g, ' ');
const live = <T extends { deleted_at: string | null }>(rows: readonly T[]) =>
  rows.filter((r) => r.deleted_at === null);

/** A revisão inicial: o que a IA leu, com as marcas e o que já começa desmarcado. */
export function reviewOf(data: ImportData, existing: Existing): Review {
  const dayByDate = new Map(live(existing.days).map((d) => [d.date, d]));
  const tripStops = live(existing.stops);
  const days = data.days.map((day, di): ReviewDay => {
    const known = dayByDate.get(day.date);
    const already = new Set(
      known ? tripStops.filter((s) => s.trip_day_id === known.id).map((s) => sameName(s.name)) : [],
    );
    const seen = new Set<string>();
    const outside = day.date < existing.trip.start_date || day.date > existing.trip.end_date;
    return {
      date: day.date,
      title: day.title,
      outside,
      include: !outside,
      stops: day.stops.map((stop, si): ReviewStop => {
        const name = sameName(stop.name);
        const repeated = already.has(name) ? 'trip' : seen.has(name) ? 'text' : null;
        seen.add(name);
        const geo: GeoDecision | null =
          stop.lat !== null
            ? { status: 'found', label: stop.address ?? 'Local marcado no arquivo', via: 'file' }
            : null;
        return { ...stop, key: `d${di}s${si}`, include: repeated !== 'trip', repeated, geo };
      }),
    };
  });
  const reservationNames = new Set(live(existing.reservations).map((r) => sameName(r.name)));
  const phones = new Set(live(existing.contacts).map((c) => c.phone));
  const texts = new Set(live(existing.items).map((i) => `${i.kind}:${sameName(i.text)}`));
  const textRow =
    (kind: ChecklistKind, prefix: string) =>
    (text: string, i: number): ReviewText => {
      const exists = texts.has(`${kind}:${sameName(text)}`);
      return { key: `${prefix}${i}`, text, include: !exists, exists };
    };
  return {
    days,
    reservations: data.reservations.map((r, i) => {
      const exists = reservationNames.has(sameName(r.name));
      return { ...r, key: `r${i}`, include: !exists, exists };
    }),
    contacts: data.contacts.map((c, i) => {
      const phone = c.phone ? toE164(c.phone) : null;
      const exists = phone?.ok === true && phones.has(phone.e164);
      return { ...c, key: `c${i}`, include: !exists, exists };
    }),
    before: data.checklist_before.map(textRow('before', 'b')),
    pack: data.checklist_pack.map(textRow('pack', 'p')),
    quests: data.quests.map((q, i) => {
      const exists = texts.has(`quest:${sameName(q.text)}`);
      return { ...q, key: `q${i}`, include: !exists, exists };
    }),
    unclassified: data.unclassified.map((text, i) => ({
      key: `u${i}`,
      text,
      to: { kind: 'undecided' },
    })),
  };
}

/** As datas da viagem depois da importação: as de hoje, ampliadas para caber os dias mantidos. */
export function rangeFor(
  trip: Pick<Trip, 'start_date' | 'end_date'>,
  review: Pick<Review, 'days'>,
): { start_date: string; end_date: string } {
  const all = [
    trip.start_date,
    trip.end_date,
    ...review.days.filter((d) => d.include).map((d) => d.date),
  ].sort();
  return { start_date: all[0] ?? trip.start_date, end_date: all.at(-1) ?? trip.end_date };
}

/** Ampliar a viagem até esta data cabe no limite de dias de uma viagem? */
export function canExtendTo(
  trip: Pick<Trip, 'start_date' | 'end_date'>,
  review: Pick<Review, 'days'>,
  date: string,
): boolean {
  const days = review.days.map((d) => (d.date === date ? { ...d, include: true } : d));
  const range = rangeFor(trip, { days });
  return (
    differenceInCalendarDays(parseISO(range.end_date), parseISO(range.start_date)) <=
    LIMITS.tripMaxDays
  );
}

type NewRow<T> = Omit<T, 'synced_at'>;
export type ImportPlan = {
  /** as datas novas da viagem, quando a pessoa ampliou */
  trip: { start_date: string; end_date: string } | null;
  newDays: NewRow<TripDay>[];
  restoreDays: string[];
  dayPatches: { id: string; changes: Partial<Pick<TripDay, 'title' | 'notes'>> }[];
  stops: NewRow<Stop>[];
  reservations: NewRow<Reservation>[];
  contacts: NewRow<Contact>[];
  items: NewRow<ChecklistItem>[];
};

export type PlanContext = {
  uid: string;
  now: string;
  /** o id de cada data de `datesNeeded` (v5(viagem, data), calculado antes, porque é assíncrono) */
  dayIds: Readonly<Record<string, string>>;
  newId: () => string;
  /** 'ai' na importação com IA; 'user' no carregador do exemplo */
  source: 'ai' | 'user';
};

const NOTES_MAX = 1_000;
const appendNote = (current: string | null, text: string) =>
  (current && current.trim() !== '' ? `${current}\n${text}` : text).slice(0, NOTES_MAX);

/**
 * Onde entra cada parada nova num dia que já tem paradas, na ordem do texto: com horário, logo
 * depois da última que já existia com horário menor ou igual (antes de todas, se for a mais cedo);
 * sem horário, junto da nova anterior, ou no fim. Se nenhuma das que existem tem horário, tudo vai
 * para o fim. A ordem do texto nunca se inverte: cada nova entra no mesmo lugar ou depois da anterior.
 */
export function positionsFor(
  existing: readonly Pick<Stop, 'position' | 'time'>[],
  incoming: readonly { time: string | null }[],
): string[] {
  const sorted = sortStops(existing);
  const timed = sorted.some((s) => s.time !== null);
  const anchors: number[] = [];
  let previous: number | null = null;
  for (const { time } of incoming) {
    let anchor: number =
      time === null || !timed
        ? (previous ?? sorted.length)
        : // o banco guarda '07:00:00' e o texto chega como '07:00': compara só HH:MM
          sorted.reduce(
            (at, s, j) => (s.time !== null && s.time.slice(0, 5) <= time ? j + 1 : at),
            0,
          );
    if (previous !== null) anchor = Math.max(anchor, previous);
    previous = anchor;
    anchors.push(anchor);
  }
  const out: string[] = [];
  let i = 0;
  while (i < incoming.length) {
    const anchor = anchors[i] ?? sorted.length;
    let j = i;
    while (j < incoming.length && anchors[j] === anchor) j += 1;
    const before = sorted[anchor - 1]?.position ?? null;
    const after = sorted[anchor]?.position ?? null;
    out.push(...positionsBetween(before, after, j - i));
    i = j;
  }
  return out;
}

/** As datas cujo id o plano precisa: as da revisão e as que a ampliação cria. */
export function datesNeeded(review: Review, trip: Pick<Trip, 'start_date' | 'end_date'>): string[] {
  const range = rangeFor(trip, review);
  return [
    ...new Set([
      ...review.days.map((d) => d.date),
      ...datesBetween(range.start_date, range.end_date),
    ]),
  ];
}

export function planImport(review: Review, existing: Existing, ctx: PlanContext): ImportPlan {
  const { now } = ctx;
  const stamp = { created_at: now, updated_at: now, deleted_at: null };
  const keptDays = review.days.filter((d) => d.include);
  const range = rangeFor(existing.trip, review);
  const extended =
    range.start_date !== existing.trip.start_date || range.end_date !== existing.trip.end_date;
  // só cria e restaura: a importação nunca aposenta dia (o que está fora das datas já saiu antes)
  const days = planDays(range, existing.days, existing.stops, existing.reservations);
  const idOf = (date: string) => {
    const id = ctx.dayIds[date];
    if (!id) throw new Error(`sem o id do dia ${date}`);
    return id;
  };

  // dias: os que faltam no intervalo nascem, os aposentados voltam; título só onde estava vazio
  const newDays = days.create.map((date): NewRow<TripDay> => ({
    id: idOf(date),
    trip_id: existing.trip.id,
    date,
    title: null,
    notes: null,
    ...stamp,
  }));
  const dayByDate = new Map(existing.days.map((d) => [d.date, d]));
  const dayPatches: ImportPlan['dayPatches'] = [];
  for (const day of keptDays) {
    const title = day.title?.trim().slice(0, 80) ?? '';
    if (title === '') continue;
    const current = dayByDate.get(day.date);
    const fresh = newDays.find((d) => d.date === day.date);
    if (fresh) fresh.title = title;
    else if (current && !current.title) dayPatches.push({ id: current.id, changes: { title } });
  }

  // paradas: depois das que já existem, pela hora
  const liveStops = live(existing.stops);
  const stops: NewRow<Stop>[] = [];
  const stopIdByKey = new Map<string, string>();
  for (const day of keptDays) {
    const tripDayId = idOf(day.date);
    const incoming = day.stops.filter((s) => s.include && s.name.trim() !== '');
    const positions = positionsFor(
      liveStops.filter((s) => s.trip_day_id === tripDayId),
      incoming,
    );
    incoming.forEach((s, i) => {
      const id = ctx.newId();
      stopIdByKey.set(s.key, id);
      stops.push({
        id,
        trip_id: existing.trip.id,
        trip_day_id: tripDayId,
        position: positions[i] ?? '',
        kind: s.kind,
        name: s.name.trim().slice(0, 120),
        time: s.time,
        closes_at: s.closes_at,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        travel_minutes_to_next: s.travel_minutes_to_next,
        notes: s.notes,
        url: s.url,
        departed_at: null,
        done_at: null,
        done_by: null,
        skipped: false,
        source: ctx.source,
        ...stamp,
      });
    });
  }

  // não classificados: observação de uma parada nova, de um dia, ou item de uma lista
  const extraBefore: string[] = [];
  const extraPack: string[] = [];
  for (const loose of review.unclassified) {
    const to = loose.to;
    if (to.kind === 'stop_note') {
      const id = stopIdByKey.get(to.stop);
      const row = stops.find((s) => s.id === id);
      if (row) row.notes = appendNote(row.notes, loose.text);
    } else if (to.kind === 'day_note') {
      const fresh = newDays.find((d) => d.date === to.date);
      const current = dayByDate.get(to.date);
      if (fresh) fresh.notes = appendNote(fresh.notes, loose.text);
      else if (current) {
        const patch = dayPatches.find((p) => p.id === current.id);
        const notes = appendNote(patch?.changes.notes ?? current.notes, loose.text);
        if (patch) patch.changes.notes = notes;
        else dayPatches.push({ id: current.id, changes: { notes } });
      }
    } else if (to.kind === 'before') extraBefore.push(loose.text);
    else if (to.kind === 'pack') extraPack.push(loose.text);
  }

  // reservas e missões se ligam às paradas pelo nome, as novas e as que já existiam
  const allStops = [...liveStops, ...stops.map((s) => ({ ...s, synced_at: null }))];
  const allDays = [...live(existing.days), ...newDays.map((d) => ({ ...d, synced_at: null }))];
  const reservations = review.reservations
    .filter((r) => r.include)
    .map((r): NewRow<Reservation> => ({
      id: ctx.newId(),
      trip_id: existing.trip.id,
      ...reservationFromImport(r, allStops, allDays),
      created_by: ctx.uid,
      ...stamp,
    }));
  const contacts = contactsFromImport(review.contacts.filter((c) => c.include)).map(
    (c): NewRow<Contact> => ({ id: ctx.newId(), trip_id: existing.trip.id, ...c, ...stamp }),
  );

  const liveItems = live(existing.items);
  const lastOf = (kind: ChecklistKind) =>
    liveItems
      .filter((i) => i.kind === kind)
      .map((i) => i.position)
      .sort(comparePosition)
      .at(-1) ?? null;
  const pick = (rows: readonly { text: string; include: boolean }[]) =>
    rows.filter((r) => r.include).map((r) => r.text);
  const items = listItemsFromImport(
    {
      checklist_before: [...pick(review.before), ...extraBefore],
      checklist_pack: [...pick(review.pack), ...extraPack],
      quests: review.quests.filter((q) => q.include),
    },
    allStops,
    { before: lastOf('before'), pack: lastOf('pack'), quest: lastOf('quest') },
    ctx.source,
  ).map((row): NewRow<ChecklistItem> => ({
    id: ctx.newId(),
    trip_id: existing.trip.id,
    ...row,
    done_by: null,
    done_at: null,
    created_by: ctx.uid,
    ...stamp,
  }));

  return {
    trip: extended ? range : null,
    newDays,
    restoreDays: days.restore.map((d) => d.id),
    dayPatches,
    stops,
    reservations,
    contacts,
    items,
  };
}

/** O tamanho do que a importação acrescenta, para o botão e para o aviso depois de salvar. */
export function planCounts(plan: ImportPlan) {
  return {
    days: new Set(plan.stops.map((s) => s.trip_day_id)).size,
    stops: plan.stops.length,
    reservations: plan.reservations.length,
    contacts: plan.contacts.length,
    items: plan.items.length,
  };
}

/**
 * O plano como as escritas de um lote da `mutate`, na ordem do push (viagem, dias, paradas, o
 * resto): uma transação no aparelho, um `sync_push` para o servidor.
 */
export function planWrites(plan: ImportPlan, tripId: string): BatchWrite[] {
  return [
    ...(plan.trip
      ? [{ kind: 'patch', table: 'trips', id: tripId, changes: plan.trip } as const]
      : []),
    ...plan.newDays.map((row) => ({ kind: 'insert', table: 'trip_days', row }) as const),
    ...plan.restoreDays.map(
      (id) => ({ kind: 'patch', table: 'trip_days', id, changes: { deleted_at: null } }) as const,
    ),
    ...plan.dayPatches.map(
      ({ id, changes }) => ({ kind: 'patch', table: 'trip_days', id, changes }) as const,
    ),
    ...plan.stops.map((row) => ({ kind: 'insert', table: 'stops', row }) as const),
    ...plan.reservations.map((row) => ({ kind: 'insert', table: 'reservations', row }) as const),
    ...plan.contacts.map((row) => ({ kind: 'insert', table: 'contacts', row }) as const),
    ...plan.items.map((row) => ({ kind: 'insert', table: 'checklist_items', row }) as const),
  ];
}
