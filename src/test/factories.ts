import type { Stop, Trip, TripDay, TripMember } from '@/lib/db/schema.ts';

export const UID = '11111111-1111-4111-8111-111111111111';
export const TRIP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
/** v5(TRIP_ID, '2026-12-11'), o mesmo que o banco calcula */
export const DAY_ID = '4d867601-02ad-51d3-a432-984fc03eddb4';

/** A linha como vai para `mutate.insert`: sem `synced_at` (o servidor carimba). */
export function insertable<T extends { synced_at: unknown }>(row: T): Omit<T, 'synced_at'> {
  return Object.fromEntries(Object.entries(row).filter(([k]) => k !== 'synced_at')) as Omit<
    T,
    'synced_at'
  >;
}

export function makeTrip(over: Partial<Trip> = {}): Trip {
  return {
    id: TRIP_ID,
    owner_id: UID,
    name: 'RS — concurso em Montenegro',
    start_date: '2026-12-11',
    end_date: '2026-12-14',
    origin: 'Papanduva/SC',
    budget: 3000,
    notes: null,
    car_model: 'hatch',
    car_color: 'sunset',
    car_accessories: [],
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: null,
    deleted_at: null,
    ...over,
  };
}

export function makeMember(over: Partial<TripMember> = {}): TripMember {
  return {
    id: '3b160377-5f3b-5e06-9754-b90075f95687',
    trip_id: TRIP_ID,
    user_id: UID,
    invited_email: null,
    role: 'owner',
    status: 'accepted',
    invited_by: UID,
    share_position: true,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: null,
    deleted_at: null,
    ...over,
  };
}

export function makeDay(over: Partial<TripDay> = {}): TripDay {
  return {
    id: DAY_ID,
    trip_id: TRIP_ID,
    date: '2026-12-11',
    title: null,
    notes: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: null,
    deleted_at: null,
    ...over,
  };
}

let stopSeq = 0;
export function makeStop(over: Partial<Stop> = {}): Stop {
  stopSeq += 1;
  return {
    id: `0000000${stopSeq}-0000-4000-8000-000000000000`.slice(-36),
    trip_id: TRIP_ID,
    trip_day_id: DAY_ID,
    position: `a${stopSeq}`,
    kind: 'other',
    name: `Parada ${stopSeq}`,
    time: null,
    closes_at: null,
    address: null,
    lat: null,
    lng: null,
    travel_minutes_to_next: null,
    notes: null,
    url: null,
    departed_at: null,
    done_at: null,
    done_by: null,
    skipped: false,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: null,
    deleted_at: null,
    ...over,
  };
}
