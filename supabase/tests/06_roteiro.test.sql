begin;
select plan(31);

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

-- r1 dono da viagem A; r2 membro aceito; r3 intruso (dono da viagem B); r4 convidado pendente
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', '91111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'r1@teste.local', 'x', now(), '{}', '{"name":"Dono"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', '92222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'r2@teste.local', 'x', now(), '{}', '{"name":"Membro"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', '93333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'r3@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', '94444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'r4@teste.local', 'x', now(), '{}', '{"name":"Pendente"}', now(), now(), '', '', '', '');

-- viagem A (dono r1, membro r2 aceito, r4 pendente, um convite só por e-mail) e viagem B (do intruso)
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('d9111111-1111-4111-8111-111111111111', '91111111-1111-4111-8111-111111111111', 'Viagem A', '2026-12-11', '2026-12-14', now()),
       ('d9222222-2222-4222-8222-222222222222', '93333333-3333-4333-8333-333333333333', 'Viagem B', '2026-12-11', '2026-12-14', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values
 (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'invite:r2@teste.local'), 'd9111111-1111-4111-8111-111111111111',
  '92222222-2222-4222-8222-222222222222', 'r2@teste.local', 'member', 'accepted', '91111111-1111-4111-8111-111111111111', now()),
 (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'invite:r4@teste.local'), 'd9111111-1111-4111-8111-111111111111',
  '94444444-4444-4444-8444-444444444444', 'r4@teste.local', 'member', 'pending', '91111111-1111-4111-8111-111111111111', now()),
 (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'invite:r5@teste.local'), 'd9111111-1111-4111-8111-111111111111',
  null, 'r5@teste.local', 'member', 'pending', '91111111-1111-4111-8111-111111111111', now());
-- um dia da viagem B, alvo do teste da FK composta
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('d9222222-2222-4222-8222-222222222222', '2026-12-11'), 'd9222222-2222-4222-8222-222222222222', '2026-12-11', now());

-- ---------------------------------------------------------------- trip_days
select pg_temp.login('91111111-1111-4111-8111-111111111111');
insert into public.trip_days (id, trip_id, date, title, updated_at)
values (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), 'd9111111-1111-4111-8111-111111111111', '2026-12-11', 'Serra', now());
select is((select title from public.trip_days where trip_id = 'd9111111-1111-4111-8111-111111111111'), 'Serra', 'o dono cria o dia com id v5(trip_id, data ISO)');
select throws_ok($$insert into public.trip_days (id, trip_id, date, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', '2026-12-12', now())$$,
  '23514', null, 'id fora de v5(trip_id, data) cai no check');
select throws_ok($$insert into public.trip_days (id, trip_id, date, updated_at)
  values (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), 'd9111111-1111-4111-8111-111111111111', '2026-12-11', now())$$,
  '23505', null, 'o mesmo dia não entra duas vezes');

select pg_temp.login('92222222-2222-4222-8222-222222222222');
select is((select count(*) from public.trip_days where trip_id = 'd9111111-1111-4111-8111-111111111111'), 1::bigint, 'membro vê o dia');
select pg_temp.login('93333333-3333-4333-8333-333333333333');
select is((select count(*) from public.trip_days where trip_id = 'd9111111-1111-4111-8111-111111111111'), 0::bigint, 'intruso não vê o dia');

-- ---------------------------------------------------------------- stops
select pg_temp.login('92222222-2222-4222-8222-222222222222');
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, time, lat, lng, updated_at)
values ('e9111111-1111-4111-8111-111111111111', 'd9111111-1111-4111-8111-111111111111',
        extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), 'a0', 'origin', 'Papanduva', '07:00', -26.3786, -50.1433, now());
select is((select count(*) from public.stops where trip_id = 'd9111111-1111-4111-8111-111111111111'), 1::bigint, 'membro cria a parada');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('d9222222-2222-4222-8222-222222222222', '2026-12-11'), 'a1', 'nature', 'Dia alheio', now())$$,
  '23503', null, 'FK composta recusa um dia de outra viagem');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, lat, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), 'a1', 'nature', 'Só lat', -26.0, now())$$,
  '23514', null, 'lat e lng andam juntos');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), 'a1', 'beach', 'Tipo inválido', now())$$,
  '23514', null, 'tipo de parada fora dos nove códigos cai no check');
update public.stops set name = 'Saída de Papanduva', travel_minutes_to_next = 390, updated_at = now()
 where id = 'e9111111-1111-4111-8111-111111111111';
select is((select name || '|' || travel_minutes_to_next from public.stops where id = 'e9111111-1111-4111-8111-111111111111'),
          'Saída de Papanduva|390', 'membro edita a parada');

select pg_temp.login('93333333-3333-4333-8333-333333333333');
select is((select count(*) from public.stops where trip_id = 'd9111111-1111-4111-8111-111111111111'), 0::bigint, 'intruso não vê as paradas');

-- ---------------------------------------------------------------- trip_tracks e share_position
select pg_temp.login('92222222-2222-4222-8222-222222222222');
insert into public.trip_tracks (id, trip_id, trip_day_id, user_id, points, updated_at)
values (extensions.uuid_generate_v5(extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), '92222222-2222-4222-8222-222222222222'),
        'd9111111-1111-4111-8111-111111111111', extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'),
        '92222222-2222-4222-8222-222222222222', '[[-50.1433,-26.3786,1765440000]]', now());
select is((select count(*) from public.trip_tracks), 1::bigint, 'a própria trilha entra');
select throws_ok($$insert into public.trip_tracks (id, trip_id, trip_day_id, user_id, updated_at)
  values (extensions.uuid_generate_v5(extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), '91111111-1111-4111-8111-111111111111'),
          'd9111111-1111-4111-8111-111111111111', extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'),
          '91111111-1111-4111-8111-111111111111', now())$$,
  '42501', null, 'trilha em nome de outra pessoa cai na RLS');

select pg_temp.login('91111111-1111-4111-8111-111111111111');
select is((select count(*) from public.trip_tracks), 1::bigint, 'o dono vê a trilha do membro enquanto ela é compartilhada');

select pg_temp.login('92222222-2222-4222-8222-222222222222');
update public.trip_members set share_position = false, updated_at = now() where user_id = '92222222-2222-4222-8222-222222222222';
select is((select share_position from public.trip_members where user_id = '92222222-2222-4222-8222-222222222222'), false, 'a própria pessoa desliga o compartilhamento');
select is((select count(*) from public.trip_tracks), 1::bigint, 'e segue vendo a própria trilha');

select pg_temp.login('91111111-1111-4111-8111-111111111111');
select is((select count(*) from public.trip_tracks), 0::bigint, 'com o compartilhamento desligado, a trilha some para os outros');
select throws_ok($$update public.trip_members set share_position = true, updated_at = now() where user_id = '92222222-2222-4222-8222-222222222222'$$,
  '42501', 'só a própria pessoa muda o compartilhamento de posição', 'o dono não muda o compartilhamento de um membro');

select pg_temp.login('92222222-2222-4222-8222-222222222222');
update public.trip_members set share_position = false, updated_at = now() where user_id = '91111111-1111-4111-8111-111111111111';
select is((select share_position from public.trip_members where user_id = '91111111-1111-4111-8111-111111111111'), true, 'membro não alcança a linha do dono');

-- deleted_at: dono não sai, membro aceito não sai, dono remove membro, convite pendente recusa e cancela
select pg_temp.login('91111111-1111-4111-8111-111111111111');
select throws_ok($$update public.trip_members set deleted_at = now(), updated_at = now() where user_id = '91111111-1111-4111-8111-111111111111'$$,
  '42501', 'só o dono remove membros', 'o dono não exclui a própria participação');
select pg_temp.login('92222222-2222-4222-8222-222222222222');
select throws_ok($$update public.trip_members set deleted_at = now(), updated_at = now() where user_id = '92222222-2222-4222-8222-222222222222'$$,
  '42501', 'só o dono remove membros', 'membro aceito não sai sozinho');

select pg_temp.login('94444444-4444-4444-8444-444444444444');
select lives_ok($$select public.decline_invite(extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'invite:r4@teste.local'))$$,
  'recusar um convite pendente continua funcionando');

select pg_temp.login('91111111-1111-4111-8111-111111111111');
update public.trip_members set deleted_at = now(), updated_at = now() where invited_email = 'r5@teste.local';
select isnt((select deleted_at from public.trip_members where invited_email = 'r5@teste.local'), null, 'o dono cancela um convite pendente');
update public.trip_members set deleted_at = now(), updated_at = now() where user_id = '92222222-2222-4222-8222-222222222222';
select isnt((select deleted_at from public.trip_members where user_id = '92222222-2222-4222-8222-222222222222'), null, 'o dono ainda remove um membro aceito');

-- ---------------------------------------------------------------- edge_calls
select is(public.edge_call('route-day', 2), 1, 'a primeira chamada conta 1');
select is(public.edge_call('route-day', 2), 2, 'a segunda conta 2');
select throws_ok($$select public.edge_call('route-day', 2)$$, '54000', 'limite de 2 chamadas por dia atingido', 'a terceira estoura o limite');
select is((select count(*) from public.edge_calls where fn = 'route-day'), 2::bigint, 'e a chamada recusada não é registrada');
select is(public.edge_call('import-itinerary', 2), 1, 'o contador é por função');
select pg_temp.login('93333333-3333-4333-8333-333333333333');
select is((select count(*) from public.edge_calls), 0::bigint, 'só as próprias chamadas aparecem');
select pg_temp.logout();
select is((select count(*) from public.edge_calls where user_id = '91111111-1111-4111-8111-111111111111'), 3::bigint, 'as três chamadas registradas existem');

select * from finish();
rollback;
