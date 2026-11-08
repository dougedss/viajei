begin;
select plan(12);

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
-- o status e se o nome e quem marcou ficaram com a outra edição (a ordem das chaves do jsonb não importa)
create function pg_temp.push_lost(p jsonb) returns text language sql as $$
  select r ->> 'status' || '|' || (r -> 'superseded' @> '["name", "done_by"]'::jsonb)::text
    from jsonb_array_elements(public.sync_push(jsonb_build_array(p))) r;
$$;
-- a parada automática como um aparelho a manda: a mesma linha, com as versões de quem detectou
create function pg_temp.auto_op(p_seq int, p_name text, p_by uuid, p_at text) returns jsonb language sql as $$
  select jsonb_build_object(
    'seq', p_seq, 'table', 'stops', 'id', 'f5aaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa', 'op', 'upsert',
    'values', jsonb_build_object(
      'trip_id', 'f1111111-1111-4111-8111-111111111111',
      'trip_day_id', extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', '2026-12-11'),
      'position', 'a0V', 'kind', 'fuel', 'name', p_name, 'lat', -29.1, 'lng', -51.1,
      'done_at', '2026-12-11T14:20:00-03:00', 'done_by', p_by, 'departed_at', null,
      'skipped', false, 'source', 'auto', 'deleted_at', null),
    'versions', (select jsonb_object_agg(k, p_at) from unnest(array[
      'trip_id', 'trip_day_id', 'position', 'kind', 'name', 'lat', 'lng', 'done_at', 'done_by',
      'departed_at', 'skipped', 'source', 'deleted_at']) k),
    'updated_at', p_at);
$$;

-- q1 dono da viagem; q2 membro aceito (o segundo celular no mesmo carro)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'f0111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'q1@teste.local', 'x', now(), '{}', '{"name":"Quem dirige"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f0222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'q2@teste.local', 'x', now(), '{}', '{"name":"Quem vai junto"}', now(), now(), '', '', '', '');
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('f1111111-1111-4111-8111-111111111111', 'f0111111-1111-4111-8111-111111111111', 'Viagem do posto', '2026-12-11', '2026-12-14', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'invite:q2@teste.local'), 'f1111111-1111-4111-8111-111111111111',
        'f0222222-2222-4222-8222-222222222222', 'q2@teste.local', 'member', 'accepted', 'f0111111-1111-4111-8111-111111111111', now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', '2026-12-11'), 'f1111111-1111-4111-8111-111111111111', '2026-12-11', now());

-- ---------------------------------------------------------------- o tipo Posto
select pg_temp.login('f0111111-1111-4111-8111-111111111111');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
                  values ('f2111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111',
                          extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', '2026-12-11'), 'a1', 'fuel', 'Posto da serra', now())$$,
                'o tipo Posto (fuel) entra');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
                   values ('f2222222-2222-4222-8222-222222222222', 'f1111111-1111-4111-8111-111111111111',
                           extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', '2026-12-11'), 'a2', 'shop', 'Loja', now())$$,
                 '23514', null, 'Compras (shop) não é tipo de parada');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
                  values ('f2333333-3333-4333-8333-333333333333', 'f1111111-1111-4111-8111-111111111111',
                          extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', '2026-12-11'), 'a3', 'winery', 'Vinícola', now())$$,
                'os nove tipos de antes continuam valendo');

-- ---------------------------------------------------------------- a fonte automática
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, source, done_at, done_by, updated_at)
                  values ('f2444444-4444-4444-8444-444444444444', 'f1111111-1111-4111-8111-111111111111',
                          extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', '2026-12-11'), 'a4', 'other', 'Parada às 14h20',
                          'auto', now(), 'f0111111-1111-4111-8111-111111111111', now())$$,
                'a parada registrada sozinha pelo GPS entra com a origem auto');
select throws_ok($$update public.stops set source = 'user' where id = 'f2444444-4444-4444-8444-444444444444'$$,
                 '42501', 'a coluna source não pode mudar', 'a origem auto não muda depois');
select throws_ok($$update public.stops set source = 'auto' where id = 'f2111111-1111-4111-8111-111111111111'$$,
                 '42501', 'a coluna source não pode mudar', 'nem uma parada feita à mão vira automática');
select lives_ok($$update public.stops set name = 'Posto Ipiranga', kind = 'fuel' where id = 'f2444444-4444-4444-8444-444444444444'$$,
                'o nome do OSM chega depois, numa atualização normal');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, source, updated_at)
                   values ('f2555555-5555-4555-8555-555555555555', 'f1111111-1111-4111-8111-111111111111',
                           extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', '2026-12-11'), 'a5', 'other', 'Outra', 'gps', now())$$,
                 '23514', null, 'outra origem não entra');

-- ---------------------------------------------------------------- dois celulares, a mesma linha
-- o id determinístico: os dois aparelhos detectam a mesma parada e mandam a mesma linha; o segundo
-- vira atualização coluna a coluna, e a parada continua uma só
select is(pg_temp.push1(pg_temp.auto_op(1, 'Posto Ipiranga', 'f0111111-1111-4111-8111-111111111111', '2026-11-01T14:28:00-03:00')),
          'applied||[]', 'o primeiro celular registra a parada');
select pg_temp.login('f0222222-2222-4222-8222-222222222222');
select is(pg_temp.push_lost(pg_temp.auto_op(2, 'Parada às 14h20', 'f0222222-2222-4222-8222-222222222222', '2026-11-01T14:27:00-03:00')),
          'applied|true', 'o segundo, sem sinal e com a detecção mais velha, perde coluna a coluna');
select is((select count(*) from public.stops where id = 'f5aaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa'), 1::bigint,
          'e a parada continua uma só');
select is((select name || '|' || kind || '|' || source || '|' || done_by::text from public.stops where id = 'f5aaaaaa-aaaa-5aaa-8aaa-aaaaaaaaaaaa'),
          'Posto Ipiranga|fuel|auto|f0111111-1111-4111-8111-111111111111',
          'com o nome do OSM e quem detectou primeiro');
select pg_temp.logout();

select * from finish();
rollback;
