begin;
select plan(26);

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
-- uma operação só, devolvendo status|code|superseded
create function pg_temp.push1(p jsonb) returns text language sql as $$
  select r ->> 'status' || '|' || coalesce(r ->> 'code', '') || '|' || (r -> 'superseded')::text
    from jsonb_array_elements(public.sync_push(jsonb_build_array(p))) r;
$$;
-- o carro de um perfil, numa linha: modelo|cor|acessórios|acabamento|roda
create function pg_temp.car(p uuid) returns text language sql as $$
  select car_model || '|' || car_color || '|' || array_to_string(car_accessories, ',') || '|' || car_finish || '|' || car_wheels
    from public.profiles where id = p
$$;
-- as mensagens do Realtime no tópico de uma viagem (lidas como o banco, sem a RLS do tópico)
create function pg_temp.messages(p_trip uuid) returns bigint language sql as $$
  select count(*) from realtime.messages where topic = 'trip:' || p_trip and extension = 'broadcast'
$$;

-- c1 dona de três viagens (a excluída é a mais recente); c2 viaja com c1 e não é dona de nada;
-- c3 dona de uma viagem com o Dourado; c4 intruso
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'c1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'k1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'k2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'k3@teste.local', 'x', now(), '{}', '{"name":"Bia"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'k4@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', '');

-- ------------------------------------------------------------------ as colunas e os check
select is(pg_temp.car('c4444444-4444-4444-8444-444444444444') || '|' || (select notify_lead_minutes || '|' || notify_morning_time
            from public.profiles where id = 'c4444444-4444-4444-8444-444444444444'),
          'hatch|sunset||solid|classic|15|07:00:00',
          'o perfil nasce com o carro padrão (hatch Pôr do sol, liso, roda clássica) e os avisos de 15 min e 7h');
select throws_ok($$update public.profiles set car_model = 'tanque' where id = 'c4444444-4444-4444-8444-444444444444'$$,
                 '23514', null, 'modelo fora da lista é recusado');
select throws_ok($$update public.profiles set car_finish = 'cromado' where id = 'c4444444-4444-4444-8444-444444444444'$$,
                 '23514', null, 'acabamento fora da lista é recusado');
select throws_ok($$update public.profiles set car_wheels = 'aro 22' where id = 'c4444444-4444-4444-8444-444444444444'$$,
                 '23514', null, 'roda fora da lista é recusada');
select throws_ok($$update public.profiles set notify_lead_minutes = 3 where id = 'c4444444-4444-4444-8444-444444444444'$$,
                 '23514', null, 'antecedência abaixo de 5 min é recusada, como em notification_prefs');

-- ------------------------------------------------------------------ a cópia (0014, uma vez)
insert into public.trips (id, owner_id, name, start_date, end_date, car_model, car_color, car_accessories, updated_at, deleted_at)
values
 ('c9111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'Antiga', '2026-10-01', '2026-10-03', 'suv', 'sky', '{}', now(), null),
 ('c9222222-2222-4222-8222-222222222222', 'c1111111-1111-4111-8111-111111111111', 'Serra', '2026-12-11', '2026-12-14', 'pickup', 'mist', '{rack,bike}', now(), null),
 ('c9333333-3333-4333-8333-333333333333', 'c1111111-1111-4111-8111-111111111111', 'Excluída', '2027-01-10', '2027-01-12', 'kombi', 'night', '{}', now(), now()),
 ('c9444444-4444-4444-8444-444444444444', 'c3333333-3333-4333-8333-333333333333', 'Dourada', '2026-11-20', '2026-11-21', 'sedan', 'gold', '{hubcaps}', now(), null);
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('c9222222-2222-4222-8222-222222222222', 'invite:k2@teste.local'), 'c9222222-2222-4222-8222-222222222222',
        'c2222222-2222-4222-8222-222222222222', 'k2@teste.local', 'member', 'accepted', 'c1111111-1111-4111-8111-111111111111', now());

select is(private.copy_trip_cars(), 2, 'a cópia muda o perfil de quem é dono de viagem (duas pessoas)');
select is(pg_temp.car('c1111111-1111-4111-8111-111111111111'), 'pickup|mist|rack,bike|metallic|classic',
          'a viagem mais recente que não foi excluída; a Névoa continua metálica');
select is(pg_temp.car('c3333333-3333-4333-8333-333333333333'), 'sedan|gold|hubcaps|metallic|classic',
          'o Dourado continua metálico');
select is(pg_temp.car('c2222222-2222-4222-8222-222222222222'), 'hatch|sunset||solid|classic',
          'quem não é dono de viagem fica com o padrão');
select ok((select synced_at > now() - interval '1 minute' and field_versions ? 'car_model'
             from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'),
          'a cópia passa pelo sync_guard: versão da coluna e synced_at novos, para o time puxar');

-- ------------------------------------------------------------------ os grants e a RLS
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
update public.profiles
   set car_model = 'suv', car_color = 'leaf', car_finish = 'pearl', car_wheels = 'wire', car_accessories = '{rack}',
       notify_lead_minutes = 30, notify_morning_time = '06:30', updated_at = now()
 where id = 'c1111111-1111-4111-8111-111111111111';
select is(pg_temp.car('c1111111-1111-4111-8111-111111111111') || '|' || (select notify_lead_minutes || '|' || notify_morning_time
            from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'),
          'suv|leaf|rack|pearl|wire|30|06:30:00', 'a pessoa muda o próprio carro e os padrões dos avisos');
update public.profiles set car_model = 'kombi', updated_at = now() where id = 'c2222222-2222-4222-8222-222222222222';
select is((select car_model from public.profiles where id = 'c2222222-2222-4222-8222-222222222222'), 'hatch',
          'ninguém muda o carro de outra pessoa, nem de quem viaja junto');
select throws_ok($$update public.profiles set xp_total = 9999, updated_at = now() where id = 'c1111111-1111-4111-8111-111111111111'$$,
                 '42501', null, 'o client continua sem mudar o resumo da progressão');

-- ------------------------------------------------------------------ pela outbox (sync_push)
select is(pg_temp.push1('{"seq":1,"table":"profiles","id":"c1111111-1111-4111-8111-111111111111","op":"patch","values":{"car_color":"grape","car_finish":"matte"},"versions":{"car_color":"2030-01-01T00:00:00Z","car_finish":"2030-01-01T00:00:00Z"},"updated_at":"2030-01-01T00:00:00Z"}'),
          'applied||[]', 'o patch do carro pela outbox é aplicado na própria linha');
select is((select car_color || '|' || car_finish from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'),
          'grape|matte', 'e o carro muda (a versão do futuro é limitada a agora + 2 min pelo sync_guard)');
select is(pg_temp.push1('{"seq":2,"table":"profiles","id":"c1111111-1111-4111-8111-111111111111","op":"patch","values":{"car_color":"night"},"versions":{"car_color":"2020-01-01T00:00:00Z"},"updated_at":"2020-01-01T00:00:00Z"}'),
          'stale||[]', 'uma escolha mais velha que a do servidor volta stale (versão por coluna)');
select is(pg_temp.push1('{"seq":3,"table":"profiles","id":"c2222222-2222-4222-8222-222222222222","op":"patch","values":{"car_model":"kombi"},"versions":{"car_model":"2030-01-01T00:00:00Z"},"updated_at":"2030-01-01T00:00:00Z"}'),
          'error|P0002|[]', 'o patch no perfil de outra pessoa não acha a linha (RLS)');
select is(pg_temp.push1('{"seq":4,"table":"profiles","id":"c1111111-1111-4111-8111-111111111111","op":"patch","values":{"xp_total":9999},"versions":{"xp_total":"2030-01-01T00:00:00Z"},"updated_at":"2030-01-01T00:00:00Z"}'),
          'error|42501|[]', 'nem pela outbox o client muda o resumo da progressão');
select is((select scope || '|' || mode || '|' || rank from private.sync_tables where name = 'profiles'), 'self|lww|5',
          'o perfil entra na whitelist com o escopo self, antes de todas as tabelas');

-- ------------------------------------------------------------------ os pulls
select is((select (v -> 'profiles' -> 0 ->> 'car_model') || '|' || jsonb_array_length(v -> 'profiles')
             from public.sync_pull_user('-infinity') v),
          'suv|1', 'o pull do usuário traz o próprio perfil, com o carro, e só ele');
select ok((select not (v -> 'profiles' -> 0) ? 'field_versions' from public.sync_pull_user('-infinity') v),
          'sem field_versions, como no pull da viagem');
select is((select jsonb_array_length(v -> 'profiles') from public.sync_pull_user(now() + interval '5 minutes') v), 0,
          'com o cursor adiante, o perfil não volta');
select pg_temp.logout();
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select is((select p ->> 'car_model' || '|' || (p ->> 'car_finish') || '|' || (p ->> 'car_wheels')
             from public.sync_pull('c9222222-2222-4222-8222-222222222222', '-infinity') v,
                  jsonb_array_elements(v -> 'profiles') p
            where p ->> 'id' = 'c1111111-1111-4111-8111-111111111111'),
          'suv|matte|wire', 'o pull da viagem traz o carro de quem viaja junto (o comboio sem sinal)');
select pg_temp.logout();
select pg_temp.login('c4444444-4444-4444-8444-444444444444');
select is((select count(*) from public.profiles where id = 'c1111111-1111-4111-8111-111111111111'), 0::bigint,
          'o intruso não vê o carro de ninguém');
select pg_temp.logout();

-- ------------------------------------------------------------------ o aviso do Realtime
-- o aviso é um por viagem por transação: zera a marca do teste antes de cada conferência
select set_config('viajei.notified', '', true);
create temp table antes as select pg_temp.messages('c9222222-2222-4222-8222-222222222222') n;
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
update public.profiles set car_wheels = 'steel', updated_at = now() where id = 'c1111111-1111-4111-8111-111111111111';
select pg_temp.logout();
select is(pg_temp.messages('c9222222-2222-4222-8222-222222222222') - (select n from antes), 1::bigint,
          'o carro novo avisa a viagem em que a pessoa está (o time puxa na hora)');
select set_config('viajei.notified', '', true);
update antes set n = pg_temp.messages('c9222222-2222-4222-8222-222222222222');
update public.profiles set xp_total = 50 where id = 'c1111111-1111-4111-8111-111111111111';
select is(pg_temp.messages('c9222222-2222-4222-8222-222222222222') - (select n from antes), 0::bigint,
          'o resumo da progressão não avisa por aqui (o XP já avisa, D114)');

select * from finish();
rollback;
