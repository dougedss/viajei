-- A 0021 (fase 28): `stops.objective`, o objetivo do trecho guardado na parada. Só acrescenta: as
-- paradas de hoje continuam válidas e nascem sem objetivo, o sync leva a coluna nova, um app antigo
-- que não a mande não a toca, e a RLS da parada continua a mesma (quem não é da viagem não marca).
begin;
select plan(11);

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

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', 'f2811111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'f28@teste.local', 'x', now(), '{}', '{"name":"Quem planeja"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f2822222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'f28-fora@teste.local', 'x', now(), '{}', '{"name":"De fora"}', now(), now(), '', '', '', '');
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('e2811111-1111-4111-8111-111111111111', 'f2811111-1111-4111-8111-111111111111', 'Ida e volta', '2026-12-05', '2026-12-05', now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('e2811111-1111-4111-8111-111111111111', '2026-12-05'), 'e2811111-1111-4111-8111-111111111111', '2026-12-05', now());

-- ------------------------------------------------------------- 1. a coluna
select has_column('public', 'stops', 'objective', 'a parada ganhou o objetivo do trecho');
select col_not_null('public', 'stops', 'objective', 'nunca nulo: é sim ou não');
select col_default_is('public', 'stops', 'objective', 'false', 'nasce sem objetivo: as paradas de hoje não mudam');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
  values ('e2850000-0000-4000-8000-000000000001', 'e2811111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e2811111-1111-4111-8111-111111111111', '2026-12-05'), 'a0', 'origin', 'Saída de casa', now())$$,
  'uma parada como as de hoje, sem a coluna, entra');
select is((select objective from public.stops where id = 'e2850000-0000-4000-8000-000000000001'), false,
  'e entra sem objetivo');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, objective, updated_at)
  values ('e2850000-0000-4000-8000-000000000002', 'e2811111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e2811111-1111-4111-8111-111111111111', '2026-12-05'), 'a1', 'city', 'Curitiba', true, now())$$,
  'o destino dito entra marcado como objetivo');

-- ------------------------------------------------------------- 2. o sync
select pg_temp.login('f2811111-1111-4111-8111-111111111111');
select is((select (r ->> 'status') from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
  'seq', 1, 'table', 'stops', 'id', 'e2850000-0000-4000-8000-000000000002', 'op', 'patch',
  'values', jsonb_build_object('name', 'Curitiba, PR'), 'updated_at', now(),
  'versions', jsonb_build_object('name', now()))))) r), 'applied', 'um patch do app de antes, sem a coluna, aplica');
select is((select objective from public.stops where id = 'e2850000-0000-4000-8000-000000000002'), true,
  'e o objetivo continua');
select is((select (r ->> 'status') from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
  'seq', 2, 'table', 'stops', 'id', 'e2850000-0000-4000-8000-000000000003', 'op', 'upsert',
  'values', jsonb_build_object('trip_id', 'e2811111-1111-4111-8111-111111111111',
    'trip_day_id', extensions.uuid_generate_v5('e2811111-1111-4111-8111-111111111111', '2026-12-05'),
    'position', 'a2', 'kind', 'origin', 'name', 'Chegada em casa', 'objective', false),
  'updated_at', now(), 'versions', jsonb_build_object('objective', now()))))) r), 'applied',
  'o app novo sobe a parada com a coluna');
select pg_temp.logout();

-- ------------------------------------------------------------- 3. a RLS de sempre
select pg_temp.login('f2822222-2222-4222-8222-222222222222');
select is((select (r ->> 'status') from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
  'seq', 3, 'table', 'stops', 'id', 'e2850000-0000-4000-8000-000000000001', 'op', 'patch',
  'values', jsonb_build_object('objective', true), 'updated_at', now(),
  'versions', jsonb_build_object('objective', now()))))) r), 'error', 'quem não é da viagem não marca o objetivo');
select pg_temp.logout();
select is((select objective from public.stops where id = 'e2850000-0000-4000-8000-000000000001'), false,
  'e a parada continua sem objetivo');

select * from finish();
rollback;
