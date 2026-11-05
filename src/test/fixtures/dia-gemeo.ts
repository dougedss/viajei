import type { Stop } from '@/lib/db/schema.ts';
import { DAY_ID, makeStop, TRIP_ID } from '@/test/factories.ts';

/**
 * A fixture gêmea do pgTAP (supabase/tests/07_notificacoes.test.sql): o mesmo dia 1 do seed, com os
 * mesmos ids, para TS e SQL conferirem os mesmos horários. Mudou aqui, mude lá.
 *
 *   origem 07:00 (390 min) → Park Salto Ventoso 13:30, fecha 17:00 (45 min)
 *   → Hotel Steffen 16:30 (10 min) → Restaurante dos Bifes 19:00, fecha 22:00
 */
export const GEMEO_DATE = '2026-12-11';

export const GEMEO_IDS = {
  origin: 'e1111111-1111-4111-8111-111111111111',
  park: 'e2222222-2222-4222-8222-222222222222',
  hotel: 'e3333333-3333-4333-8333-333333333333',
  restaurant: 'e4444444-4444-4444-8444-444444444444',
} as const;

/** Horários que os dois lados esperam, em hora de parede de São Paulo. */
export const GEMEO_EXPECTED = {
  /** sem at e next é a origem: "sair às" é o horário do próprio nó */
  startLeaveAt: '07:00',
  /** parado no parque: 16:30 − 45 */
  afterParkLeaveAt: '15:45',
  /** o parque fecha às 17:00: aviso 60 min antes */
  parkClosesSoonAt: '16:00',
  defaultLeadMinutes: 15,
  closesSoonMinutes: 60,
} as const;

export function gemeoStops(): Stop[] {
  const common = { trip_id: TRIP_ID, trip_day_id: DAY_ID };
  return [
    makeStop({
      ...common,
      id: GEMEO_IDS.origin,
      position: 'a0',
      kind: 'origin',
      name: 'Saída de Papanduva',
      address: 'Papanduva, SC',
      time: '07:00',
      lat: -26.40854,
      lng: -50.14241,
      travel_minutes_to_next: 390,
      notes: 'Pneus, óleo e estepe revisados. Documentos na bolsa.',
    }),
    makeStop({
      ...common,
      id: GEMEO_IDS.park,
      position: 'a1',
      kind: 'nature',
      name: 'Park Salto Ventoso',
      address: 'Nova Sardenha, Farroupilha, RS',
      time: '13:30',
      closes_at: '17:00',
      lat: -29.28522,
      lng: -51.41185,
      travel_minutes_to_next: 45,
    }),
    makeStop({
      ...common,
      id: GEMEO_IDS.hotel,
      position: 'a2',
      kind: 'hotel',
      name: 'Hotel Steffen',
      address: 'Rua Augusto Vicente Steffen, Bom Princípio, RS',
      time: '16:30',
      lat: -29.49224,
      lng: -51.35916,
      travel_minutes_to_next: 10,
      notes: 'Check-in. Noites 11 e 12, quarto luxo, café incluso.',
    }),
    makeStop({
      ...common,
      id: GEMEO_IDS.restaurant,
      position: 'a3',
      kind: 'food',
      name: 'Restaurante dos Bifes',
      address: 'RS-122, Bom Princípio, RS',
      time: '19:00',
      closes_at: '22:00',
      lat: -29.48979,
      lng: -51.35668,
      travel_minutes_to_next: null,
      notes: 'Até 22h.',
    }),
  ];
}
