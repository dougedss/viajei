begin;
select plan(47);

-- O dia construído à mão aqui é o mesmo da fixture gêmea do Vitest (src/test/fixtures/dia-gemeo.ts):
-- origem 07:00 (390 min) → Park Salto Ventoso 13:30, fecha 17:00 (45 min) → Hotel Steffen 16:30 (10 min)
-- → Restaurante dos Bifes 19:00, fecha 22:00. Horários esperados nos dois lados: sair às 07:00 no
-- início do dia; sair às 15:45 depois do parque; o parque fecha em 1 h às 16:00.

create function pg_temp.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.logout() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
-- quantas linhas de um tipo um usuário recebe em p_now
create function pg_temp.due_count(p_user uuid, p_kind text, p_now timestamptz) returns bigint language sql as $$
  select count(*) from public.due_notifications(p_now) d where d.user_id = p_user and d.kind = p_kind
$$;

-- n1 dona, n2 membro aceito, n3 intruso
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'n1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'n2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'n3@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', '');

insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('b9111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'RS — concurso em Montenegro', '2026-12-11', '2026-12-14', now()),
       ('b9222222-2222-4222-8222-222222222222', 'a3333333-3333-4333-8333-333333333333', 'Viagem do intruso', '2026-12-11', '2026-12-14', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('b9111111-1111-4111-8111-111111111111', 'invite:n2@teste.local'), 'b9111111-1111-4111-8111-111111111111',
        'a2222222-2222-4222-8222-222222222222', 'n2@teste.local', 'member', 'accepted', 'a1111111-1111-4111-8111-111111111111', now());

insert into public.trip_days (id, trip_id, date, updated_at)
select extensions.uuid_generate_v5('b9111111-1111-4111-8111-111111111111', to_char(d, 'YYYY-MM-DD')), 'b9111111-1111-4111-8111-111111111111', d, now()
  from generate_series(date '2026-12-11', date '2026-12-14', interval '1 day') d;

-- o dia 1, igual à fixture do Vitest
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, time, closes_at, lat, lng, travel_minutes_to_next, updated_at)
values
 ('e1111111-1111-4111-8111-111111111111', 'b9111111-1111-4111-8111-111111111111', extensions.uuid_generate_v5('b9111111-1111-4111-8111-111111111111', '2026-12-11'),
  'a0', 'origin', 'Saída de Papanduva', '07:00', null, -26.40854, -50.14241, 390, now()),
 ('e2222222-2222-4222-8222-222222222222', 'b9111111-1111-4111-8111-111111111111', extensions.uuid_generate_v5('b9111111-1111-4111-8111-111111111111', '2026-12-11'),
  'a1', 'nature', 'Park Salto Ventoso', '13:30', '17:00', -29.28522, -51.41185, 45, now()),
 ('e3333333-3333-4333-8333-333333333333', 'b9111111-1111-4111-8111-111111111111', extensions.uuid_generate_v5('b9111111-1111-4111-8111-111111111111', '2026-12-11'),
  'a2', 'hotel', 'Hotel Steffen', '16:30', null, -29.49224, -51.35916, 10, now()),
 ('e4444444-4444-4444-8444-444444444444', 'b9111111-1111-4111-8111-111111111111', extensions.uuid_generate_v5('b9111111-1111-4111-8111-111111111111', '2026-12-11'),
  'a3', 'food', 'Restaurante dos Bifes', '19:00', '22:00', -29.48979, -51.35668, null, now());

-- viagem C, de hoje: team_arrived usa synced_at (relógio real), então a parada tem de ser de hoje
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('b9333333-3333-4333-8333-333333333333', 'a1111111-1111-4111-8111-111111111111', 'Bate-volta de hoje', current_date, current_date, now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('b9333333-3333-4333-8333-333333333333', 'invite:n2@teste.local'), 'b9333333-3333-4333-8333-333333333333',
        'a2222222-2222-4222-8222-222222222222', 'n2@teste.local', 'member', 'accepted', 'a1111111-1111-4111-8111-111111111111', now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('b9333333-3333-4333-8333-333333333333', to_char(current_date, 'YYYY-MM-DD')), 'b9333333-3333-4333-8333-333333333333', current_date, now());
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, time, updated_at)
values ('e5555555-5555-4555-8555-555555555555', 'b9333333-3333-4333-8333-333333333333',
        extensions.uuid_generate_v5('b9333333-3333-4333-8333-333333333333', to_char(current_date, 'YYYY-MM-DD')), 'a0', 'winery', 'Casa Valduga', '10:00', now());

-- ---------------------------------------------------------------- whitelist e sync do usuário
select is((select scope || '|' || rank from private.sync_tables where name = 'notification_prefs'), 'user|25',
          'notification_prefs entra na whitelist com escopo user');

-- ---------------------------------------------------------------- departure_soon / departure_now, início do dia
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'departure_soon', '2026-12-11 06:45-03'), 1::bigint,
          'departure_soon vence em leave_at - 15 (06:45) para a dona');
select is(pg_temp.due_count('a2222222-2222-4222-8222-222222222222', 'departure_soon', '2026-12-11 06:45-03'), 1::bigint,
          'e para o membro aceito');
select is(pg_temp.due_count('a3333333-3333-4333-8333-333333333333', 'departure_soon', '2026-12-11 06:45-03'), 0::bigint,
          'não para quem não é da viagem');
select is((select d.ref || '|' || (d.data ->> 'stop_name') || '|' || (d.data ->> 'leave_time') || '|' || (d.data ->> 'stop_kind')
             from public.due_notifications('2026-12-11 06:45-03') d
            where d.user_id = 'a1111111-1111-4111-8111-111111111111' and d.kind = 'departure_soon'),
          'e1111111-1111-4111-8111-111111111111|Saída de Papanduva|07:00|origin',
          'sem at e next nó de saída: "sair às" é o horário do próprio nó, com os fatos para o texto');
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'departure_soon', '2026-12-11 06:44-03'), 0::bigint,
          'um minuto antes de vencer, nada');
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'departure_now', '2026-12-11 07:00-03'), 1::bigint,
          'departure_now vence em leave_at (07:00)');
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'departure_soon', '2026-12-11 06:52-03'), 1::bigint,
          'janela de 10 min: 7 min depois ainda sai (cron atrasado)');
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'departure_soon', '2026-12-11 06:56-03'), 0::bigint,
          'acima de 10 min o aviso é velho e não sai');

-- fuso: 01:00 UTC ainda é 22:00 do dia 10 em São Paulo; não há dia de viagem
select is((select count(*) from public.due_notifications('2026-12-11 01:00+00') d
            where d.kind in ('departure_soon', 'departure_now', 'morning_briefing')), 0::bigint,
          'p_now em UTC que ainda é ontem em São Paulo não acha o dia');

-- ---------------------------------------------------------------- depois do parque: sair às 15:45
update public.stops set done_at = '2026-12-11 07:02-03', done_by = 'a1111111-1111-4111-8111-111111111111', departed_at = '2026-12-11 07:02-03', updated_at = now()
 where id = 'e1111111-1111-4111-8111-111111111111';
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'departure_now', '2026-12-11 07:00-03'), 0::bigint,
          'departed_at preenchido: nenhum aviso de saída');
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'departure_soon', '2026-12-11 13:00-03'), 0::bigint,
          'na estrada (at com departed_at) não há "sair às"');
update public.stops set done_at = '2026-12-11 13:40-03', done_by = 'a2222222-2222-4222-8222-222222222222', updated_at = now()
 where id = 'e2222222-2222-4222-8222-222222222222';
select is((select to_char(d.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI') || '|' || (d.data ->> 'travel_minutes') || '|' || (d.data ->> 'from_name')
             from public.due_notifications('2026-12-11 15:30-03') d
            where d.user_id = 'a1111111-1111-4111-8111-111111111111' and d.kind = 'departure_soon'),
          '15:30|45|Park Salto Ventoso',
          'parado no parque: sair às 15:45 = 16:30 - 45; o aviso de 15 min cai às 15:30 (igual ao Vitest)');
select is((select to_char(d.scheduled_at at time zone 'America/Sao_Paulo', 'HH24:MI')
             from public.due_notifications('2026-12-11 15:45-03') d
            where d.user_id = 'a1111111-1111-4111-8111-111111111111' and d.kind = 'departure_now'), '15:45',
          'departure_now às 15:45');

-- ---------------------------------------------------------------- preferências
insert into public.notification_prefs (id, user_id, trip_id, enabled, updated_at)
values (extensions.uuid_generate_v5('a2222222-2222-4222-8222-222222222222', 'b9111111-1111-4111-8111-111111111111'),
        'a2222222-2222-4222-8222-222222222222', 'b9111111-1111-4111-8111-111111111111', false, now());
select is(pg_temp.due_count('a2222222-2222-4222-8222-222222222222', 'departure_soon', '2026-12-11 15:30-03'), 0::bigint,
          'enabled = false: nada para a pessoa');
update public.notification_prefs set enabled = true, kinds = kinds || '{"departure_soon": false}', updated_at = now()
 where user_id = 'a2222222-2222-4222-8222-222222222222';
select is(pg_temp.due_count('a2222222-2222-4222-8222-222222222222', 'departure_soon', '2026-12-11 15:30-03'), 0::bigint,
          'tipo desligado em kinds: nada desse tipo');
select is(pg_temp.due_count('a2222222-2222-4222-8222-222222222222', 'departure_now', '2026-12-11 15:45-03'), 1::bigint,
          'os outros tipos continuam');
update public.notification_prefs set kinds = kinds || '{"departure_soon": true}', lead_minutes = 30, updated_at = now()
 where user_id = 'a2222222-2222-4222-8222-222222222222';
select is(pg_temp.due_count('a2222222-2222-4222-8222-222222222222', 'departure_soon', '2026-12-11 15:15-03'), 1::bigint,
          'lead_minutes da pessoa (30) respeitado: 15:15');
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'departure_soon', '2026-12-11 15:15-03'), 0::bigint,
          'quem ficou no padrão (15) não recebe às 15:15');

-- ---------------------------------------------------------------- closes_soon
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'closes_soon', '2026-12-11 16:00-03'), 0::bigint,
          'parque concluído: não avisa que fecha');
select is((select (d.data ->> 'stop_name') || '|' || (d.data ->> 'closes_time') || '|' || (d.data ->> 'is_next')
             from public.due_notifications('2026-12-11 21:00-03') d
            where d.user_id = 'a1111111-1111-4111-8111-111111111111' and d.kind = 'closes_soon'),
          'Restaurante dos Bifes|22:00|false',
          'closes_soon 60 min antes, só sem done_at, dizendo se é a próxima');
update public.stops set done_at = null, done_by = null, updated_at = now() where id = 'e2222222-2222-4222-8222-222222222222';
select is((select (d.data ->> 'is_next') from public.due_notifications('2026-12-11 16:00-03') d
            where d.user_id = 'a1111111-1111-4111-8111-111111111111' and d.kind = 'closes_soon'), 'true',
          'parque pendente e próximo: fecha às 17:00, aviso às 16:00 com is_next');

-- ---------------------------------------------------------------- morning_briefing e eve_checklist
select is((select (d.data ->> 'day_index') || '/' || (d.data ->> 'day_count') || '|' || (d.data ->> 'stops_count') || '|' || (d.data ->> 'first_time') || '|' || (d.data ->> 'first_kind')
             from public.due_notifications('2026-12-11 07:00-03') d
            where d.user_id = 'a1111111-1111-4111-8111-111111111111' and d.kind = 'morning_briefing'),
          '1/4|4|07:00|origin', 'morning_briefing às 07:00 (padrão) com dia, total, paradas e primeira saída');
update public.notification_prefs set morning_time = '06:30', updated_at = now() where user_id = 'a2222222-2222-4222-8222-222222222222';
select is(pg_temp.due_count('a2222222-2222-4222-8222-222222222222', 'morning_briefing', '2026-12-11 06:30-03'), 1::bigint,
          'morning_time da pessoa (06:30)');
select is(pg_temp.due_count('a2222222-2222-4222-8222-222222222222', 'morning_briefing', '2026-12-11 07:00-03'), 0::bigint,
          'e não às 07:00');
select is((select (d.data ->> 'trip_name') || '|' || (d.data ->> 'first_time') from public.due_notifications('2026-12-10 19:00-03') d
            where d.user_id = 'a1111111-1111-4111-8111-111111111111' and d.kind = 'eve_checklist'),
          'RS — concurso em Montenegro|07:00', 'eve_checklist às 19:00 da véspera');
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'eve_checklist', '2026-12-11 19:00-03'), 0::bigint,
          'não no primeiro dia');

-- ---------------------------------------------------------------- team_arrived (viagem C, de hoje)
insert into public.notification_prefs (id, user_id, trip_id, kinds, updated_at)
values (extensions.uuid_generate_v5('a2222222-2222-4222-8222-222222222222', 'b9333333-3333-4333-8333-333333333333'),
        'a2222222-2222-4222-8222-222222222222', 'b9333333-3333-4333-8333-333333333333', '{"team_arrived": true}', now());
update public.stops set done_at = '2026-12-11 14:02-03', done_by = 'a1111111-1111-4111-8111-111111111111', updated_at = now()
 where id = 'e5555555-5555-4555-8555-555555555555';
-- synced_at é o relógio do servidor: a janela é (agora - 10 min, agora]; +1 min protege a virada de minuto
select is((select (d.data ->> 'actor_name') || '|' || (d.data ->> 'stop_name') || '|' || (d.data ->> 'done_time')
             from public.due_notifications(clock_timestamp() + interval '1 minute') d
            where d.user_id = 'a2222222-2222-4222-8222-222222222222' and d.kind = 'team_arrived'),
          'Dona|Casa Valduga|14:02', 'team_arrived vai a quem ligou o tipo, com quem marcou e a hora');
select is(pg_temp.due_count('a1111111-1111-4111-8111-111111111111', 'team_arrived', clock_timestamp() + interval '1 minute'), 0::bigint,
          'não vai a quem marcou (e o padrão do tipo é desligado)');
select is((select count(*) from public.claim_due_notifications(clock_timestamp() + interval '1 minute') c where c.kind = 'team_arrived'), 1::bigint,
          'claim reserva o team_arrived');
update public.stops set done_at = null, done_by = null, updated_at = now() where id = 'e5555555-5555-4555-8555-555555555555';
update public.stops set done_at = '2026-12-11 14:30-03', done_by = 'a1111111-1111-4111-8111-111111111111', updated_at = now()
 where id = 'e5555555-5555-4555-8555-555555555555';
select is(pg_temp.due_count('a2222222-2222-4222-8222-222222222222', 'team_arrived', clock_timestamp() + interval '1 minute'), 0::bigint,
          'desfazer e marcar de novo não repete: um aviso por parada e destinatário');
delete from public.notifications_sent where kind = 'team_arrived';
-- de volta ao parque da viagem principal, concluído, para os testes do claim
update public.stops set done_at = '2026-12-11 14:02-03', done_by = 'a1111111-1111-4111-8111-111111111111', updated_at = now()
 where id = 'e2222222-2222-4222-8222-222222222222';

-- ---------------------------------------------------------------- claim: reserva atômica
select ok(private.has_due_notifications('2026-12-11 15:45-03'), 'has_due_notifications: há algo vencido às 15:45');
select ok(not private.has_due_notifications('2026-12-11 12:00-03'), 'e nada ao meio-dia: o cron não chama a função');
select is((select count(*) from public.claim_due_notifications('2026-12-11 15:30-03')), 1::bigint,
          'claim reserva o que venceu (departure_soon da dona; o do membro com lead 30 venceu às 15:15, fora da janela)');
select is((select count(*) from public.claim_due_notifications('2026-12-11 15:30-03')), 0::bigint,
          'a segunda chamada no mesmo minuto devolve vazio');
select is((select count(*) from public.notifications_sent where status = 'queued' and attempts = 1), 1::bigint,
          'a linha fica queued com attempts = 1');
select is((select count(*) from public.claim_due_notifications('2026-12-11 15:45-03') c where c.kind = 'departure_now' and c.subscriptions = '[]'::jsonb), 2::bigint,
          'às 15:45 vence o departure_now dos dois; sem assinatura, subscriptions vem vazio');
update public.notifications_sent set claimed_at = claimed_at - interval '3 minutes';
-- a de 15:30 já tinha voltado na reserva de 15:45 (mais de 2 min): esta é a terceira tentativa dela
select is((select count(*) || '|' || max(c.attempts) from public.claim_due_notifications('2026-12-11 15:45-03') c), '3|3',
          'linha queued velha (claimed_at há mais de 2 min, sem sent_at) volta, com attempts incrementado');
update public.notifications_sent set attempts = 3, claimed_at = claimed_at - interval '3 minutes';
select is((select count(*) from public.claim_due_notifications('2026-12-11 15:45-03')), 0::bigint,
          'depois de 3 tentativas a linha não volta mais');
select is((select id from public.notifications_sent where kind = 'departure_soon' and user_id = 'a1111111-1111-4111-8111-111111111111'),
          extensions.uuid_generate_v5('a1111111-1111-4111-8111-111111111111', 'departure_soon:e3333333-3333-4333-8333-333333333333:2026-12-11T18:30:00Z'),
          'id determinístico v5(user_id, kind:ref:scheduled_at ISO UTC)');

-- ---------------------------------------------------------------- o que o client vê
select pg_temp.login('a1111111-1111-4111-8111-111111111111');
select is((select count(*) from public.notifications_sent), 0::bigint, 'notifications_sent é invisível ao authenticated');
select throws_ok($$select * from public.due_notifications()$$, '42501', null, 'authenticated não executa due_notifications');
select throws_ok($$select * from public.claim_due_notifications()$$, '42501', null, 'nem claim_due_notifications');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, platform, origin)
values ('a1111111-1111-4111-8111-111111111111', 'https://push.example/a1', 'p', 'a', 'ios', 'https://viajei-mauve.vercel.app');
select pg_temp.login('a2222222-2222-4222-8222-222222222222');
select is((select count(*) from public.push_subscriptions), 0::bigint, 'push_subscriptions: só as próprias');
select is((select count(*) from public.notification_prefs), 2::bigint, 'notification_prefs: só as próprias');
select throws_ok($$insert into public.notification_prefs (id, user_id, trip_id, updated_at)
  values (extensions.uuid_generate_v5('a2222222-2222-4222-8222-222222222222', 'b9222222-2222-4222-8222-222222222222'),
          'a2222222-2222-4222-8222-222222222222', 'b9222222-2222-4222-8222-222222222222', now())$$,
  '42501', null, 'preferência para viagem em que não estou é recusada');
select is((select jsonb_array_length(public.sync_pull_user('2000-01-01') -> 'notification_prefs')), 2,
          'sync_pull_user devolve as preferências da pessoa (duas viagens)');
select pg_temp.logout();

select * from finish();
rollback;
