import { dateInSaoPaulo } from './dates.ts';
import { inserir } from './db.ts';
import { uuidV4, uuidV5 } from './ids.ts';

export type Montada = {
  tripId: string;
  dayIds: string[];
  stopIds: string[];
  reservationId: string;
};

const at = (date: string, hhmm: string) => new Date(`${date}T${hhmm}:00-03:00`).toISOString();

/**
 * O texto que vem das pessoas e não quebra sozinho (fase 13): um link de 88 caracteres sem espaço, um
 * endereço colado sem espaços e um código de reserva comprido. A guarda da rolagem lateral tem de
 * passar com eles em toda tela, a 393 e a 360 px.
 */
export const LINK_LONGO =
  'https://reservas.exemplo.com.br/confirmacao/2026/12/11/STF-2026-4471/hospedes/2/detalhes';
export const ENDERECO_COLADO = 'Rua Coronel Pedro Benetti,1300,Centro,Gramado,RS,95670-000';
export const CODIGO_COMPRIDO = 'STF-2026-4471-GRAMADO-STEFFEN-HOSPEDES-2-XYZ';

/**
 * Uma viagem com tudo o que as telas mostram (dias, paradas, reserva, contato, gasto, as três listas
 * e uma memória), gravada direto no banco local dos testes com a chave secreta. Serve aos testes que
 * olham as telas (acessibilidade) e não à criação, que tem os próprios testes pela tela.
 * `inicio` e `fim` em dias a partir de hoje; `concluida` marca as paradas como feitas.
 */
export async function montarViagem(
  userId: string,
  opts: { nome: string; inicio: number; fim: number; concluida?: boolean },
): Promise<Montada> {
  const tripId = uuidV4();
  const now = new Date().toISOString();
  const start = dateInSaoPaulo(opts.inicio);
  const end = dateInSaoPaulo(opts.fim);
  await inserir('trips', [
    {
      id: tripId,
      owner_id: userId,
      name: opts.nome,
      start_date: start,
      end_date: end,
      origin: 'Papanduva/SC',
      budget: 3000,
      updated_at: now,
    },
  ]);

  const dates = Array.from({ length: opts.fim - opts.inicio + 1 }, (_, i) =>
    dateInSaoPaulo(opts.inicio + i),
  );
  const dayIds = dates.map((d) => uuidV5(tripId, d));
  await inserir(
    'trip_days',
    dates.map((date, i) => ({ id: dayIds[i], trip_id: tripId, date, updated_at: now })),
  );

  const first = dates[0] ?? start;
  const day = dayIds[0] ?? '';
  // o PostgREST pede as mesmas chaves em todas as linhas de um insert em lote
  const done = (hhmm: string) =>
    opts.concluida
      ? { done_at: at(first, hhmm), done_by: userId }
      : { done_at: null, done_by: null };
  const stops = [
    {
      kind: 'origin',
      name: 'Saída de Papanduva',
      time: '07:00',
      travel_minutes_to_next: 390,
      lat: -26.371,
      lng: -50.144,
      notes: null,
      ...done('07:00'),
    },
    {
      kind: 'nature',
      name: 'Cascata do Caracol',
      time: '13:30',
      travel_minutes_to_next: 40,
      lat: -29.31,
      lng: -50.853,
      notes: 'Elevador panorâmico até as 17h',
      ...done('13:30'),
    },
    {
      kind: 'hotel',
      name: 'Hotel Steffen',
      time: '17:30',
      travel_minutes_to_next: null,
      lat: -29.37,
      lng: -51.37,
      // a observação com o link e o endereço colados: a tela tem de quebrar as duas palavras
      notes: `Check-in a partir das 14h.\n${LINK_LONGO}\n${ENDERECO_COLADO}`,
      done_at: null,
      done_by: null,
    },
  ].map((s, i) => ({
    id: uuidV4(),
    trip_id: tripId,
    trip_day_id: day,
    position: `a${i}`,
    updated_at: now,
    ...s,
  }));
  await inserir('stops', stops);
  const stopIds = stops.map((s) => s.id);
  const nature = stopIds[1] ?? '';
  const hotel = stopIds[2] ?? '';

  const reservationId = uuidV4();
  await inserir('reservations', [
    {
      id: reservationId,
      trip_id: tripId,
      stop_id: hotel,
      type: 'hotel',
      name: 'Hotel Steffen',
      start_at: at(first, '14:00'),
      confirmation_code: CODIGO_COMPRIDO,
      address: ENDERECO_COLADO,
      amount: 560,
      phone: '+5551997527596',
      cancel_until: first,
      created_by: userId,
      updated_at: now,
    },
  ]);
  await inserir('contacts', [
    {
      id: uuidV4(),
      trip_id: tripId,
      name: 'Parque do Caracol',
      phone: '+555432780000',
      type: 'attraction',
      updated_at: now,
    },
  ]);
  await inserir('expenses', [
    {
      id: uuidV4(),
      trip_id: tripId,
      amount: 120,
      category: 'food',
      date: first,
      paid_by: userId,
      created_by: userId,
      updated_at: now,
    },
  ]);
  const item = (kind: string, text: string, i: number, extra: Record<string, unknown> = {}) => ({
    id: uuidV4(),
    trip_id: tripId,
    kind,
    text,
    position: `a${i}`,
    created_by: userId,
    updated_at: now,
    points: 0,
    stop_id: null,
    done_at: null,
    done_by: null,
    ...extra,
  });
  await inserir('checklist_items', [
    item('before', 'Revisar pneus e estepe', 0, { done_at: now, done_by: userId }),
    item('before', 'Comprar ingressos', 1),
    item('pack', 'Blusa', 0),
    item('quest', 'Foto do time com a paisagem', 0, { points: 20, stop_id: nature }),
  ]);
  if (opts.concluida) {
    await inserir('stop_memories', [
      {
        id: uuidV5(nature, userId),
        trip_id: tripId,
        stop_id: nature,
        user_id: userId,
        rating: 5,
        memo: 'A cascata mais alta que já vi',
        updated_at: now,
      },
    ]);
  }
  return { tripId, dayIds, stopIds, reservationId };
}
