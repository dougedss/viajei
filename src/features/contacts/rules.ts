import { CONTACT_TYPE_KEYS, type ContactType, type ReservationType } from '@shared/constants.ts';
import type { Contact, Reservation } from '@/lib/db/schema.ts';

/**
 * A lista de contatos, pura: os contatos da viagem por tipo, mais os telefones das reservas,
 * derivados (não gravados) e marcados "da reserva". O mesmo E.164 nunca aparece duas vezes: quando
 * a reserva tem o telefone de um contato, o contato diz "também na reserva".
 */
export type ContactEntry =
  | {
      source: 'contact';
      key: string;
      contact: Contact;
      name: string;
      phone: string;
      notes: string | null;
      /** a reserva com o mesmo telefone, se houver */
      reservationId: string | null;
    }
  | {
      source: 'reservation';
      key: string;
      reservationId: string;
      name: string;
      phone: string;
      notes: null;
    };

export type ContactGroup = { type: ContactType; entries: ContactEntry[] };

const BY_RESERVATION_TYPE: Record<ReservationType, ContactType> = {
  hotel: 'hotel',
  ticket: 'attraction',
  restaurant: 'restaurant',
  other: 'other',
};

export function contactTypeForReservation(type: string): ContactType {
  return Object.hasOwn(BY_RESERVATION_TYPE, type)
    ? BY_RESERVATION_TYPE[type as ReservationType]
    : 'other';
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });

export function contactGroups(
  contacts: readonly Contact[],
  reservations: readonly Pick<Reservation, 'id' | 'name' | 'phone' | 'type' | 'deleted_at'>[],
): ContactGroup[] {
  const live = contacts.filter((c) => c.deleted_at === null);
  const known = new Set(live.map((c) => c.phone));
  const reservationByPhone = new Map<string, string>();
  for (const r of reservations) {
    if (r.deleted_at === null && r.phone && !reservationByPhone.has(r.phone)) {
      reservationByPhone.set(r.phone, r.id);
    }
  }
  const entries: { type: ContactType; entry: ContactEntry }[] = live.map((c) => ({
    type: (CONTACT_TYPE_KEYS as readonly string[]).includes(c.type)
      ? (c.type as ContactType)
      : 'other',
    entry: {
      source: 'contact',
      key: c.id,
      contact: c,
      name: c.name,
      phone: c.phone,
      notes: c.notes,
      reservationId: reservationByPhone.get(c.phone) ?? null,
    },
  }));
  const seen = new Set(known);
  for (const r of reservations) {
    if (r.deleted_at !== null || !r.phone || seen.has(r.phone)) continue;
    seen.add(r.phone);
    entries.push({
      type: contactTypeForReservation(r.type),
      entry: {
        source: 'reservation',
        key: `reservation:${r.id}`,
        reservationId: r.id,
        name: r.name,
        phone: r.phone,
        notes: null,
      },
    });
  }
  return CONTACT_TYPE_KEYS.map((type) => ({
    type,
    entries: entries
      .filter((e) => e.type === type)
      .map((e) => e.entry)
      .sort(byName),
  })).filter((g) => g.entries.length > 0);
}

/** Quantos números a lista mostra (sem a emergência fixa): o número do atalho da visão geral. */
export function contactCount(groups: readonly ContactGroup[]): number {
  return groups.reduce((n, g) => n + g.entries.length, 0);
}

/**
 * WhatsApp só para celular: no Brasil, DDD + 9 dígitos começando com 9. Número fixo só liga (o
 * `wa.me` de um fixo abre uma conversa que não existe). Número de fora: não há como saber; mostra.
 */
export function canWhatsApp(e164: string): boolean {
  const br = /^\+55(\d{2})(\d{8,9})$/.exec(e164);
  if (!br) return e164.startsWith('+');
  const local = br[2] ?? '';
  return local.length === 9 && local.startsWith('9');
}
