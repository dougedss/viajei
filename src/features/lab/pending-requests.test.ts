import { describe, expect, it } from 'vitest';
import { PendingRequests, requestPath, STUCK_MS } from './pending-requests.ts';

describe('PendingRequests (o condutor do relógio, fase 17)', () => {
  it('um pedido que termina sai da conta; um aberto há 30 s conta como travado, com o caminho', () => {
    const p = new PendingRequests<string>();
    p.started('pull', 'POST x.supabase.co/rest/v1/rpc/sync_pull', 0);
    p.started('push', 'POST x.supabase.co/rest/v1/rpc/sync_push', 0);
    expect(p.recent(1_000)).toBe(2);
    p.ended('push');
    expect(p.inFlight()).toBe(1);
    expect(p.recent(STUCK_MS - 1)).toBe(1);
    expect(p.stuck(STUCK_MS - 1)).toEqual([]);
    // daí em diante não segura mais o relógio, e o laboratório diz qual é
    expect(p.recent(STUCK_MS)).toBe(0);
    expect(p.stuck(STUCK_MS + 4_400)).toEqual(['POST x.supabase.co/rest/v1/rpc/sync_pull (34 s)']);
  });

  it('os pedidos do documento que a página deixou saem quando o novo se firma (o goto depois de entrar)', () => {
    const p = new PendingRequests<string>();
    // o primeiro sync logo depois de entrar
    p.started('pull-user', 'POST x/rest/v1/rpc/sync_pull_user', 0);
    p.started('perfil', 'GET x/rest/v1/profiles', 10);
    // o `page.goto` da tela da viagem: o navegador corta os dois sem avisar o fim
    p.navigating();
    p.committed();
    expect(p.inFlight()).toBe(0);
    // os do documento novo contam
    p.started('token', 'POST x/auth/v1/token', 50);
    expect(p.recent(100)).toBe(1);
    p.ended('token');
    // 40 s depois nada está travado: os do documento anterior não envelhecem até "travados"
    expect(p.stuck(40_000)).toEqual([]);
    expect(p.recent(40_000)).toBe(0);
  });

  it('o que o documento de antes pede entre o pedido de navegação e o commit é dele (o laboratório do preview)', () => {
    const p = new PendingRequests<string>();
    // entrou: o `waitForURL` volta no `pushState`, e o `goto` sai logo
    p.navigating();
    // o documento de antes ainda roda: os três pedidos do "entrou", depois do pedido de navegação
    p.started('perfil', 'GET x/rest/v1/profiles', 5);
    p.started('convites', 'POST x/rest/v1/rpc/claim_invites', 5);
    p.started('pendentes', 'POST x/rest/v1/rpc/my_pending_invites', 5);
    // o documento novo se firma: os três morreram com o de antes, sem o Playwright avisar
    p.committed();
    expect(p.stuck(110_000)).toEqual([]);
    expect(p.inFlight()).toBe(0);
  });

  it('a navegação dentro do documento (o pushState) não esquece nada, antes nem depois do commit', () => {
    const p = new PendingRequests<string>();
    p.started('a', 'GET x/rest/v1/trips', 0);
    p.started('b', 'GET x/rest/v1/stops', 0);
    // o React Router troca a tela: `framenavigated` sem pedido de navegação
    p.committed();
    expect(p.inFlight()).toBe(2);
    p.navigating();
    p.ended('a');
    // enquanto o documento novo não se firma, o de agora continua contando
    expect(p.inFlight()).toBe(1);
    expect(p.recent(1_000)).toBe(1);
    p.committed();
    expect(p.inFlight()).toBe(0);
    // e a próxima troca de tela, de novo dentro do documento, não esquece o que saiu depois
    p.started('c', 'GET x/rest/v1/profiles', 2_000);
    p.committed();
    expect(p.inFlight()).toBe(1);
  });

  it('o caminho leva o método, o host e o caminho, sem a query', () => {
    expect(
      requestPath('GET', 'https://abc.supabase.co/rest/v1/stops?trip_id=eq.123&select=id'),
    ).toBe('GET abc.supabase.co/rest/v1/stops');
    expect(requestPath('POST', 'https://overpass-api.de/api/interpreter')).toBe(
      'POST overpass-api.de/api/interpreter',
    );
    expect(requestPath('GET', 'não é url')).toBe('GET ?');
  });
});
