import type { ContactType, ReservationType, StopKind } from '@shared/constants.ts';
import type { ImportData } from '@shared/import-schema.ts';
import { sortStops } from '@/features/itinerary/rules.ts';
import type { ChecklistItem, Contact, Reservation, Stop, Trip, TripDay } from '@/lib/db/schema.ts';
import { comparePosition } from '@/lib/ids/position.ts';
import { isoToWall } from '@/lib/time/zone.ts';
import { writeViajei, type ViajeiDoc } from './format.ts';

/**
 * "Copiar roteiro como texto" (fase 17): a viagem do aparelho como o documento do formato do Viajei,
 * que `writeViajei` escreve. Puro. É o inverso do plano da importação: o que o `planImport` grava, isto
 * lê de volta, e uma viagem copiada e colada noutra conta (ou noutra IA) volta igual. Ficam de fora o
 * que o `importSchema` não guarda: as observações da viagem e do dia, os gastos, as memórias, o que
 * já foi feito, e as sugestões que ninguém aceitou.
 */
export type TripRows = {
  trip: Pick<Trip, 'name' | 'start_date' | 'end_date' | 'origin' | 'budget'>;
  days: readonly TripDay[];
  stops: readonly Stop[];
  reservations: readonly Reservation[];
  contacts: readonly Contact[];
  items: readonly ChecklistItem[];
};

const live = <T extends { deleted_at: string | null }>(rows: readonly T[]) =>
  rows.filter((r) => r.deleted_at === null);
/** O banco guarda "07:00:00"; o arquivo, "07:00". */
const hhmm = (t: string | null) => (t === null ? null : t.slice(0, 5));
const wall = (iso: string | null) => {
  if (iso === null) return null;
  const w = isoToWall(iso);
  return `${w.date}T${w.time}`;
};

export function docOfTrip(rows: TripRows): ViajeiDoc {
  const days = live(rows.days).sort((a, b) => a.date.localeCompare(b.date));
  const stops = live(rows.stops);
  const stopName = new Map(stops.map((s) => [s.id, s.name]));
  const dayOfStop = new Map(stops.map((s) => [s.id, s.trip_day_id]));
  const dateOfDay = new Map(days.map((d) => [d.id, d.date]));
  const items = live(rows.items)
    .filter((i) => i.status === 'active')
    .sort((a, b) => comparePosition(a.position, b.position));
  const texts = (kind: ChecklistItem['kind']) =>
    items.filter((i) => i.kind === kind).map((i) => i.text);

  const data: ImportData = {
    days: days
      .map((day) => ({
        date: day.date,
        title: day.title,
        stops: sortStops(stops.filter((s) => s.trip_day_id === day.id)).map((s) => ({
          time: hhmm(s.time),
          // o `check` do banco garante o tipo; a coluna chega como texto
          kind: s.kind as StopKind,
          name: s.name,
          address: s.address,
          closes_at: hhmm(s.closes_at),
          travel_minutes_to_next: s.travel_minutes_to_next,
          notes: s.notes,
          url: s.url,
          lat: s.lat,
          lng: s.lng,
        })),
      }))
      // um dia vazio e sem título não diz nada: o período do cabeçalho já o cria
      .filter((d) => d.stops.length > 0 || d.title !== null),
    reservations: live(rows.reservations).map((r) => {
      const dayId = r.trip_day_id ?? (r.stop_id ? dayOfStop.get(r.stop_id) : undefined);
      return {
        type: r.type as ReservationType,
        name: r.name,
        stop_ref: r.stop_id ? (stopName.get(r.stop_id) ?? null) : null,
        day_ref: dayId ? (dateOfDay.get(dayId) ?? null) : null,
        start_at: wall(r.start_at),
        end_at: wall(r.end_at),
        confirmation_code: r.confirmation_code,
        amount: r.amount,
        cancel_policy: r.cancel_policy,
        cancel_until: r.cancel_until,
        phone: r.phone,
        address: r.address,
        booked_via: r.booked_via,
        notes: r.notes,
      };
    }),
    contacts: live(rows.contacts).map((c) => ({
      name: c.name,
      phone: c.phone,
      type: c.type as ContactType,
      notes: c.notes,
    })),
    checklist_before: texts('before'),
    checklist_pack: texts('pack'),
    quests: items
      .filter((i) => i.kind === 'quest')
      .map((q) => ({
        text: q.text,
        stop_ref: q.stop_id ? (stopName.get(q.stop_id) ?? null) : null,
      })),
    unclassified: [],
  };
  return {
    trip: {
      name: rows.trip.name,
      start_date: rows.trip.start_date,
      end_date: rows.trip.end_date,
      origin: rows.trip.origin,
      budget: rows.trip.budget,
    },
    data,
  };
}

/** A viagem como o texto do formato do Viajei: o que "Copiar roteiro como texto" põe na área de transferência. */
export function tripText(rows: TripRows): string {
  return writeViajei(docOfTrip(rows));
}
