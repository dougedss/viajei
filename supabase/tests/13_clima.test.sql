begin;
select plan(9);

-- Os lugares do clima no briefing da manhã (0011): `first_point` e `last_point` são a primeira e a
-- última parada viva, não pulada, com coordenada. A regra dos 50 km e o arredondamento ficam no
-- TypeScript (_shared/weather.ts), iguais no app e na send-notifications. E o lab_diagnostics devolve
-- o clima que a função gravou, para o laboratório conferir o texto.

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
-- os fatos do clima do briefing de um dia, às 07:00 (o horário padrão da manhã)
create function pg_temp.points(p_day date) returns text language sql as $$
  select coalesce(d.data ->> 'first_point', '-') || ' → ' || coalesce(d.data ->> 'last_point', '-')
    from public.due_notifications((p_day + time '07:00') at time zone 'America/Sao_Paulo') d
   where d.user_id = 'c1111111-1111-4111-8111-111111111111' and d.kind = 'morning_briefing'
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'c1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'clima@teste.local', 'x', now(), '{}', '{"name":"Clima"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'lab-clima@viajei.invalid', 'x', now(), '{}', '{"name":"Lab"}', now(), now(), '', '', '', '');

insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('d1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'Clima no RS', '2026-12-11', '2026-12-14', now());
insert into public.trip_days (id, trip_id, date, updated_at)
select extensions.uuid_generate_v5('d1111111-1111-4111-8111-111111111111', to_char(d, 'YYYY-MM-DD')), 'd1111111-1111-4111-8111-111111111111', d, now()
  from generate_series(date '2026-12-11', date '2026-12-14', interval '1 day') d;

create function pg_temp.day(p date) returns uuid language sql as $$
  select extensions.uuid_generate_v5('d1111111-1111-4111-8111-111111111111', to_char(p, 'YYYY-MM-DD'))
$$;

insert into public.stops (id, trip_id, trip_day_id, position, kind, name, time, lat, lng, skipped, deleted_at, updated_at)
values
 -- dia 1: de Papanduva ao restaurante em Nova Petrópolis; uma parada excluída depois dele não conta
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-11'), 'a0', 'origin', 'Saída de Papanduva', '07:00', -26.40854, -50.14241, false, null, now()),
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-11'), 'a1', 'nature', 'Park Salto Ventoso', '13:30', -29.28522, -51.41185, false, null, now()),
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-11'), 'a2', 'food', 'Restaurante dos Bifes', '19:00', -29.48979, -51.35668, false, null, now()),
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-11'), 'a3', 'other', 'Excluída', '21:00', -29.1, -51.1, false, now(), now()),
 -- dia 2: uma parada só
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-12'), 'a0', 'nature', 'Cascata Vale do Mel', '09:30', -29.35814, -51.30991, false, null, now()),
 -- dia 3: as puladas das pontas não contam, e a sem coordenada também não
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-13'), 'a0', 'hotel', 'Café no hotel', '06:00', -29.49224, -51.35916, true, null, now()),
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-13'), 'a1', 'other', 'Sem lugar', '07:30', null, null, false, null, now()),
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-13'), 'a2', 'winery', 'Casa Valduga', '13:30', -29.17924, -51.55581, false, null, now()),
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-13'), 'a3', 'hotel', 'Vila Suzana', '18:30', -29.35381, -50.82739, true, null, now()),
 -- dia 4: nenhuma parada com coordenada
 (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', pg_temp.day('2026-12-14'), 'a0', 'city', 'Gramado', '11:00', null, null, false, null, now());

-- ---------------------------------------------------------------- first_point e last_point
select is(pg_temp.points('2026-12-11'),
          '{"lat": -26.40854, "lng": -50.14241} → {"lat": -29.48979, "lng": -51.35668}',
          'o dia começa na primeira parada com coordenada e termina na última (a excluída não conta)');
select is(pg_temp.points('2026-12-12'),
          '{"lat": -29.35814, "lng": -51.30991} → {"lat": -29.35814, "lng": -51.30991}',
          'um dia de uma parada só: começo e fim são o mesmo ponto');
select is(pg_temp.points('2026-12-13'),
          '{"lat": -29.17924, "lng": -51.55581} → {"lat": -29.17924, "lng": -51.55581}',
          'as paradas puladas das pontas e a sem coordenada ficam de fora');
select is(pg_temp.points('2026-12-14'), '- → -', 'dia sem coordenada: nenhum lugar, e o briefing sai mesmo assim');
select is((select (d.data ->> 'stops_count') || '|' || (d.data ->> 'first_time')
             from public.due_notifications('2026-12-11 07:00-03') d
            where d.user_id = 'c1111111-1111-4111-8111-111111111111' and d.kind = 'morning_briefing'),
          '3|07:00', 'os outros fatos do briefing continuam os mesmos');

-- ---------------------------------------------------------------- lab_diagnostics com o clima
insert into private.lab_access (user_id, role) values ('c2222222-2222-4222-8222-222222222222', 'runner');
insert into public.notifications_sent (id, user_id, kind, ref, scheduled_at, data, status)
values (gen_random_uuid(), 'c2222222-2222-4222-8222-222222222222', 'morning_briefing', 'dia', now(),
        '{"date": "2026-12-11", "weather": {"status": "none", "reason": "timeout"}}', 'sent'),
       (gen_random_uuid(), 'c1111111-1111-4111-8111-111111111111', 'morning_briefing', 'outro', now(),
        '{"weather": {"status": "ok", "places": []}}', 'sent');

select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select is((select jsonb_path_query_array(public.lab_diagnostics(now() - interval '1 minute'), '$.sent[*].weather')),
          '[{"reason": "timeout", "status": "none"}]'::jsonb,
          'o diagnóstico traz o clima gravado, só das linhas do laboratório');
select is((select jsonb_path_query_array(public.lab_diagnostics(now() - interval '1 minute'), '$.sent[*].kind')),
          '["morning_briefing"]'::jsonb, 'e o resto do diagnóstico continua igual');
select pg_temp.logout();

select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select throws_ok($$ select public.lab_diagnostics(now()) $$, '42501', 'só para o laboratório',
                 'quem não é do laboratório continua sem diagnóstico');
select pg_temp.logout();

select ok(not has_function_privilege('authenticated', 'public.due_notifications(timestamptz)', 'execute'),
          'o due_notifications recriado continua só para o service_role');

select * from finish();
rollback;
