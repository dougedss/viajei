import type {
  Attachment,
  ChecklistItem,
  Contact,
  Expense,
  Reservation,
  Stop,
  StopMemory,
  Trip,
  TripDay,
  TripMember,
} from '@/lib/db/schema.ts';

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

export const OTHER_UID = '22222222-2222-4222-8222-222222222222';

export function makeReservation(over: Partial<Reservation> = {}): Reservation {
  return {
    id: 'cd111111-1111-4111-8111-111111111111',
    trip_id: TRIP_ID,
    stop_id: null,
    trip_day_id: null,
    type: 'hotel',
    name: 'Vila Suzana Parque Hotel',
    start_at: '2026-12-13T14:00:00-03:00',
    end_at: '2026-12-14T12:00:00-03:00',
    confirmation_code: null,
    amount: null,
    cancel_policy: null,
    cancel_until: null,
    phone: null,
    address: null,
    booked_via: null,
    notes: null,
    created_by: UID,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: null,
    deleted_at: null,
    ...over,
  };
}

export function makeMemory(over: Partial<StopMemory> = {}): StopMemory {
  return {
    id: 'ee111111-1111-5111-8111-111111111111',
    trip_id: TRIP_ID,
    stop_id: '00000001-0000-4000-8000-000000000000',
    user_id: UID,
    rating: null,
    memo: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: null,
    deleted_at: null,
    ...over,
  };
}

let attSeq = 0;
export function makeAttachment(over: Partial<Attachment> = {}): Attachment {
  attSeq += 1;
  const id = over.id ?? `a${String(attSeq).padStart(7, '0')}-0000-4000-8000-000000000000`;
  const kind = over.kind ?? 'photo';
  const ext =
    kind === 'photo'
      ? 'jpg'
      : (over.mime ?? 'application/pdf') === 'application/pdf'
        ? 'pdf'
        : 'jpg';
  return {
    id,
    trip_id: TRIP_ID,
    reservation_id: null,
    stop_id: kind === 'photo' ? '00000001-0000-4000-8000-000000000000' : null,
    kind,
    storage_path: `${TRIP_ID}/${id}.${ext}`,
    filename: `arquivo.${ext}`,
    mime: kind === 'photo' ? 'image/jpeg' : 'application/pdf',
    size_bytes: 400_000,
    width: kind === 'photo' ? 1600 : null,
    height: kind === 'photo' ? 1200 : null,
    placeholder: null,
    created_by: UID,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: '2026-11-01T10:00:01.000Z',
    deleted_at: null,
    ...over,
  };
}

let itemSeq = 0;
export function makeItem(over: Partial<ChecklistItem> = {}): ChecklistItem {
  itemSeq += 1;
  return {
    id: `c${String(itemSeq).padStart(7, '0')}-0000-4000-8000-000000000000`,
    trip_id: TRIP_ID,
    kind: 'before',
    text: `Item ${itemSeq}`,
    position: `a${itemSeq}`,
    points: 0,
    stop_id: null,
    source: 'user',
    status: 'active',
    done_by: null,
    done_at: null,
    created_by: UID,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: '2026-11-01T10:00:01.000Z',
    deleted_at: null,
    ...over,
  };
}

let contactSeq = 0;
export function makeContact(over: Partial<Contact> = {}): Contact {
  contactSeq += 1;
  return {
    id: `d${String(contactSeq).padStart(7, '0')}-0000-4000-8000-000000000000`,
    trip_id: TRIP_ID,
    name: `Contato ${contactSeq}`,
    phone: '+5551997527596',
    type: 'other',
    notes: null,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: '2026-11-01T10:00:01.000Z',
    deleted_at: null,
    ...over,
  };
}

let expenseSeq = 0;
export function makeExpense(over: Partial<Expense> = {}): Expense {
  expenseSeq += 1;
  return {
    id: `e${String(expenseSeq).padStart(7, '0')}-0000-4000-8000-000000000000`,
    trip_id: TRIP_ID,
    stop_id: null,
    reservation_id: null,
    amount: 100,
    category: 'other',
    date: '2026-12-11',
    paid_by: UID,
    notes: null,
    created_by: UID,
    created_at: '2026-11-01T10:00:00.000Z',
    updated_at: '2026-11-01T10:00:00.000Z',
    synced_at: '2026-11-01T10:00:01.000Z',
    deleted_at: null,
    ...over,
  };
}
