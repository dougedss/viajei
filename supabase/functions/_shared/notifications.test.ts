import { describe, expect, it } from 'vitest';
import {
  buildPushPayload,
  notificationText,
  dayMonth,
  pushPayloadSchema,
  weekdayName,
} from './notifications.ts';

const TRIP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STOP = 'e2222222-2222-4222-8222-222222222222';

describe('texto dos avisos', () => {
  it('sair em N min para uma parada comum, com estrada e chegada prevista', () => {
    const t = notificationText(
      'departure_soon',
      {
        stop_name: 'Park Salto Ventoso',
        stop_kind: 'nature',
        stop_time: '13:30',
        travel_minutes: 390,
        lead_minutes: 15,
      },
      STOP,
    );
    expect(t.title).toBe('Sair em 15 min para Park Salto Ventoso');
    expect(t.body).toBe('6h30 de estrada · chegada prevista 13:30');
    expect(t.tag).toBe(`stop:${STOP}`);
    expect(t.actions).toEqual([{ action: 'departed', title: 'Partiu!' }]);
    expect(t.appBadge).toBe('1');
    expect(t.topic).toBe('e2222222222242228222222222222222');
    expect(t.topic).toHaveLength(32);
  });

  it('nó de saída: o nome já é a frase', () => {
    const data = { stop_name: 'Saída de Papanduva', stop_kind: 'origin', stop_time: '07:00' };
    expect(notificationText('departure_soon', { ...data, lead_minutes: 30 }, STOP)).toMatchObject({
      title: 'Sair em 30 min',
      body: 'Saída de Papanduva · 07:00',
    });
    expect(notificationText('departure_now', data, STOP)).toMatchObject({
      title: 'Hora de sair',
      body: 'Saída de Papanduva · 07:00',
    });
  });

  it('hora de sair substitui o "sair em 15 min" da mesma parada (mesma tag e tópico)', () => {
    const data = {
      stop_name: 'Hotel Steffen',
      stop_kind: 'hotel',
      stop_time: '16:30',
      travel_minutes: 45,
    };
    const soon = notificationText('departure_soon', data, STOP);
    const now = notificationText('departure_now', data, STOP);
    expect(now.title).toBe('Hora de sair para Hotel Steffen');
    expect(now.body).toBe('45 min de estrada · chegada prevista 16:30');
    expect(now.tag).toBe(soon.tag);
    expect(now.topic).toBe(soon.topic);
  });

  it('parada fechando: Chegamos! só quando é a próxima', () => {
    const data = { stop_name: 'Park Salto Ventoso', closes_time: '17:00', is_next: true };
    const t = notificationText('closes_soon', data, STOP);
    expect(t.title).toBe('Park Salto Ventoso fecha às 17:00');
    expect(t.body).toBe('faltam 60 min');
    expect(t.actions).toEqual([{ action: 'arrived', title: 'Chegamos!' }]);
    expect(notificationText('closes_soon', { ...data, is_next: false }, STOP).actions).toEqual([]);
    expect(t.appBadge).toBeNull();
  });

  it('briefing da manhã: dia, semana, paradas e primeira saída', () => {
    const t = notificationText(
      'morning_briefing',
      {
        date: '2026-12-11',
        day_index: 1,
        day_count: 4,
        stops_count: 4,
        first_time: '07:00',
        first_kind: 'origin',
      },
      'day',
    );
    expect(t.title).toBe('Dia 1 de 4 · sexta');
    expect(t.body).toBe('4 paradas · primeira saída às 07:00');
    expect(
      notificationText(
        'morning_briefing',
        {
          date: '2026-12-13',
          day_index: 3,
          day_count: 4,
          stops_count: 1,
          first_time: '09:00',
          first_kind: 'nature',
        },
        'day',
      ).body,
    ).toBe('1 parada · primeira parada às 09:00');
  });

  it('véspera e time', () => {
    expect(
      notificationText(
        'eve_checklist',
        { trip_name: 'RS — concurso em Montenegro', first_time: '07:00', first_kind: 'origin' },
        TRIP,
      ),
    ).toMatchObject({
      title: 'Amanhã começa RS — concurso em Montenegro',
      body: 'Primeira saída às 07:00',
    });
    expect(
      notificationText(
        'team_arrived',
        {
          actor_name: 'Ana',
          stop_name: 'Park Salto Ventoso',
          stop_kind: 'nature',
          done_time: '14:02',
        },
        STOP,
      ),
    ).toMatchObject({
      title: 'Ana chegou',
      body: 'Park Salto Ventoso · 14:02',
      tag: `team:${STOP}`,
    });
    expect(
      notificationText(
        'team_arrived',
        {
          actor_name: 'Ana',
          stop_name: 'Saída de Papanduva',
          stop_kind: 'origin',
          done_time: '07:03',
        },
        STOP,
      ).title,
    ).toBe('Ana partiu');
  });

  it('prazo de cancelamento: chega na véspera, então amanhã é o último dia', () => {
    const t = notificationText(
      'cancel_deadline',
      {
        trip_name: 'RS — concurso em Montenegro',
        reservation_name: 'Vila Suzana Parque Hotel',
        reservation_type: 'hotel',
        cancel_until: '2026-12-08',
      },
      'cd111111-1111-4111-8111-111111111111',
    );
    expect(t).toMatchObject({
      title: 'Amanhã é o último dia para cancelar sem custo',
      body: 'Vila Suzana Parque Hotel · até 08/12',
      tag: 'cancel:cd111111-1111-4111-8111-111111111111',
      actions: [],
      appBadge: null,
      topic: null,
    });
    expect(dayMonth('2026-12-08')).toBe('08/12');
    expect(dayMonth('x')).toBe('');
  });

  it('véspera com itens faltando: as contagens das duas listas, no singular e no plural', () => {
    const eve = (before_left: number, pack_left: number) =>
      notificationText(
        'eve_checklist',
        {
          trip_name: 'RS — concurso em Montenegro',
          first_time: '07:00',
          first_kind: 'origin',
          before_left,
          pack_left,
        },
        TRIP,
      );
    expect(eve(3, 2)).toMatchObject({
      title: 'Amanhã é dia de viajar',
      body: '3 itens de antes e 2 da mala faltando',
      tag: `trip:${TRIP}`,
    });
    expect(eve(1, 1).body).toBe('1 item de antes e 1 da mala faltando');
    expect(eve(2, 0).body).toBe('2 itens de antes faltando');
    expect(eve(0, 1).body).toBe('1 item da mala faltando');
    // nada faltando (ou listas vazias): o texto da fase 4
    expect(eve(0, 0)).toMatchObject({
      title: 'Amanhã começa RS — concurso em Montenegro',
      body: 'Primeira saída às 07:00',
    });
  });

  it('retrospectiva pronta: dias e paradas concluídas, no singular e no plural', () => {
    const retro = (days: number, stops_done: number) =>
      notificationText(
        'retro_ready',
        { trip_name: 'RS — concurso em Montenegro', days, stops_done },
        TRIP,
      );
    expect(retro(4, 17)).toMatchObject({
      title: 'A retrospectiva da viagem está pronta',
      body: '4 dias, 17 paradas',
      tag: `retro:${TRIP}`,
      actions: [],
      appBadge: null,
      topic: null,
    });
    expect(retro(1, 1).body).toBe('1 dia, 1 parada');
  });

  it('dia da semana sem fuso', () => {
    expect(weekdayName('2026-12-11')).toBe('sexta');
    expect(weekdayName('2026-12-13')).toBe('domingo');
    expect(weekdayName('x')).toBe('');
  });
});

describe('payload único', () => {
  const row = {
    kind: 'departure_soon' as const,
    ref: STOP,
    trip_id: TRIP,
    stop_id: STOP,
    data: {
      stop_name: 'Park Salto Ventoso',
      stop_kind: 'nature',
      stop_time: '13:30',
      travel_minutes: 390,
      lead_minutes: 15,
    },
  };

  it('tem a parte declarativa (web_push, navigate absoluto na origem da assinatura, app_badge string) e as ações', () => {
    const p = buildPushPayload(row, 'https://viajei-mauve.vercel.app/');
    expect(pushPayloadSchema.parse(p)).toEqual(p);
    expect(p.web_push).toBe(8030);
    expect(p.notification.navigate).toBe(`https://viajei-mauve.vercel.app/viagens/${TRIP}`);
    expect(p.notification.app_badge).toBe('1');
    expect(p.notification.data).toEqual({
      kind: 'departure_soon',
      tripId: TRIP,
      stopId: STOP,
      navigate: `/viagens/${TRIP}`,
    });
    expect(p.actions).toEqual([{ action: 'departed', title: 'Partiu!' }]);
  });

  it('sem selo quando o tipo não pede', () => {
    const p = buildPushPayload(
      {
        ...row,
        kind: 'team_arrived',
        data: { actor_name: 'Ana', stop_name: 'X', done_time: '14:02' },
      },
      'http://localhost:4173',
    );
    expect(p.notification).not.toHaveProperty('app_badge');
    expect(p.notification.navigate).toBe(`http://localhost:4173/viagens/${TRIP}`);
  });

  it('o prazo de cancelamento abre a própria reserva', () => {
    const ref = 'cd111111-1111-4111-8111-111111111111';
    const p = buildPushPayload(
      {
        kind: 'cancel_deadline',
        ref,
        trip_id: TRIP,
        stop_id: null,
        data: { reservation_name: 'Vila Suzana Parque Hotel', cancel_until: '2026-12-08' },
      },
      'https://viajei-mauve.vercel.app',
    );
    expect(pushPayloadSchema.parse(p)).toEqual(p);
    expect(p.notification.data.navigate).toBe(`/viagens/${TRIP}/reservas?abrir=${ref}`);
    expect(p.notification.navigate).toBe(
      `https://viajei-mauve.vercel.app/viagens/${TRIP}/reservas?abrir=${ref}`,
    );
    expect(p.actions).toEqual([]);
  });

  it('a véspera com itens faltando abre a lista que falta; sem nada faltando, o "Agora"', () => {
    const payload = (before_left: number, pack_left: number) =>
      buildPushPayload(
        {
          kind: 'eve_checklist',
          ref: TRIP,
          trip_id: TRIP,
          stop_id: null,
          data: { trip_name: 'RS', before_left, pack_left },
        },
        'https://viajei-mauve.vercel.app',
      ).notification.data.navigate;
    expect(payload(3, 2)).toBe(`/viagens/${TRIP}/checklists?aba=antes`);
    expect(payload(0, 2)).toBe(`/viagens/${TRIP}/checklists?aba=mala`);
    expect(payload(0, 0)).toBe(`/viagens/${TRIP}`);
  });

  it('a retrospectiva pronta abre o filme da viagem', () => {
    const p = buildPushPayload(
      {
        kind: 'retro_ready',
        ref: TRIP,
        trip_id: TRIP,
        stop_id: null,
        data: { trip_name: 'RS', days: 4, stops_done: 17 },
      },
      'https://viajei-mauve.vercel.app',
    );
    expect(pushPayloadSchema.parse(p)).toEqual(p);
    expect(p.notification.data.navigate).toBe(`/viagens/${TRIP}/retrospectiva`);
    expect(p.notification.navigate).toBe(
      `https://viajei-mauve.vercel.app/viagens/${TRIP}/retrospectiva`,
    );
  });
});
