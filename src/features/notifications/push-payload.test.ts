import { describe, expect, it } from 'vitest';
import { appBadgeOf, notificationOptions, parsePush, parsePushData } from './push-payload.ts';

const TRIP = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const STOP = 'e2222222-2222-4222-8222-222222222222';
const payload = {
  web_push: 8030,
  notification: {
    title: 'Hora de sair para Park Salto Ventoso',
    body: '6h30 de estrada · chegada prevista 13:30',
    navigate: `https://viajei-mauve.vercel.app/viagens/${TRIP}/viagem`,
    tag: `stop:${STOP}`,
    lang: 'pt-BR',
    dir: 'ltr',
    app_badge: '1',
    data: {
      kind: 'departure_now',
      tripId: TRIP,
      stopId: STOP,
      navigate: `/viagens/${TRIP}/viagem`,
    },
  },
  actions: [{ action: 'departed', title: 'Partiu!' }],
};

describe('parsePush', () => {
  it('lê o payload único e monta as opções da notificação', () => {
    const p = parsePush(payload);
    expect(p).not.toBeNull();
    const opts = notificationOptions(p!);
    expect(opts).toMatchObject({
      body: payload.notification.body,
      tag: `stop:${STOP}`,
      renotify: true,
      actions: [{ action: 'departed', title: 'Partiu!' }],
    });
    expect(opts.data.navigate).toBe(`/viagens/${TRIP}/viagem`);
    expect(appBadgeOf(p!)).toBe(1);
  });

  it('sem selo, sem renotify, sem ações', () => {
    const p = parsePush({
      ...payload,
      notification: {
        ...payload.notification,
        app_badge: undefined,
        data: { ...payload.notification.data, kind: 'team_arrived' },
      },
      actions: [],
    });
    expect(appBadgeOf(p!)).toBeNull();
    expect(notificationOptions(p!).renotify).toBe(false);
  });

  it('recusa o que não é do Viajei', () => {
    expect(parsePush(null)).toBeNull();
    expect(parsePush({ title: 'x' })).toBeNull();
    expect(parsePush({ ...payload, web_push: 1 })).toBeNull();
    expect(
      appBadgeOf(
        parsePush({ ...payload, notification: { ...payload.notification, app_badge: 'x' } })!,
      ),
    ).toBeNull();
  });

  it('lê o data de volta de um clique', () => {
    expect(parsePushData(payload.notification.data)).toEqual(payload.notification.data);
    expect(parsePushData({ kind: 'nope' })).toBeNull();
  });
});
