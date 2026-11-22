-- A 0020 (fase 27): `stops.google_place_id` ao lado do objeto do OSM (a decisão 4 do Douglas: o roteiro
-- guarda o lugar inteiro mais o `place_id`), e os `kind` novos de `ai_imports` (o planejador e a bateria
-- do laboratório). Só acrescenta: as paradas e as leituras de hoje continuam válidas, e um app antigo
-- que não mande a coluna nova não a toca.
begin;
select plan(14);

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
values ('00000000-0000-0000-0000-000000000000', 'f2711111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'f27@teste.local', 'x', now(), '{}', '{"name":"Quem planeja"}', now(), now(), '', '', '', '');
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('e2711111-1111-4111-8111-111111111111', 'f2711111-1111-4111-8111-111111111111', 'Canoinhas', '2026-12-05', '2026-12-05', now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('e2711111-1111-4111-8111-111111111111', '2026-12-05'), 'e2711111-1111-4111-8111-111111111111', '2026-12-05', now());

-- ------------------------------------------------------------- 1. stops.google_place_id
select has_column('public', 'stops', 'google_place_id', 'a parada ganhou o place_id do Google');
select col_is_null('public', 'stops', 'google_place_id', 'nulo por padrão: as paradas de hoje não mudam');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
  values ('e2750000-0000-4000-8000-000000000001', 'e2711111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e2711111-1111-4111-8111-111111111111', '2026-12-05'), 'a0', 'food', 'Café de hoje', now())$$,
  'uma parada como as de hoje, sem o Google, entra');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, osm_type, osm_id, updated_at)
  values ('e2750000-0000-4000-8000-000000000002', 'e2711111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e2711111-1111-4111-8111-111111111111', '2026-12-05'), 'a1', 'nature', 'Parque do OSM', 'way', 607776738, now())$$,
  'a parada com o objeto do OSM continua entrando');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, google_place_id, updated_at)
  values ('e2750000-0000-4000-8000-000000000003', 'e2711111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e2711111-1111-4111-8111-111111111111', '2026-12-05'), 'a2', 'food', 'Café da Praça', 'ChIJN1t_tDeuEmsRUsoyG83frY4', now())$$,
  'a parada escolhida no Google entra com o place_id');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, google_place_id, updated_at)
  values ('e2750000-0000-4000-8000-000000000004', 'e2711111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e2711111-1111-4111-8111-111111111111', '2026-12-05'), 'a3', 'food', 'Errado', '', now())$$,
  '23514', null, 'o place_id vazio não entra (é nulo ou tem valor)');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, google_place_id, updated_at)
  values ('e2750000-0000-4000-8000-000000000005', 'e2711111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e2711111-1111-4111-8111-111111111111', '2026-12-05'), 'a4', 'food', 'Errado', 'com espaço e <tag>', now())$$,
  '23514', null, 'nem um texto fora do alfabeto dos ids do Google');

-- o sync leva a coluna nova, e um push sem ela (o app de antes) a deixa como está
select pg_temp.login('f2711111-1111-4111-8111-111111111111');
select is((select (r ->> 'status') from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
  'seq', 1, 'table', 'stops', 'id', 'e2750000-0000-4000-8000-000000000003', 'op', 'patch',
  'values', jsonb_build_object('name', 'Café da Praça Central'), 'updated_at', now(),
  'versions', jsonb_build_object('name', now()))))) r), 'applied', 'um patch do app de antes aplica');
select is((select google_place_id from public.stops where id = 'e2750000-0000-4000-8000-000000000003'),
          'ChIJN1t_tDeuEmsRUsoyG83frY4', 'e o place_id continua');
select is((select (r ->> 'status') from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
  'seq', 2, 'table', 'stops', 'id', 'e2750000-0000-4000-8000-000000000001', 'op', 'patch',
  'values', jsonb_build_object('google_place_id', 'ChIJ-outro-lugar'), 'updated_at', now(),
  'versions', jsonb_build_object('google_place_id', now()))))) r), 'applied', 'o app novo grava o place_id pela outbox');
select is((select google_place_id from public.stops where id = 'e2750000-0000-4000-8000-000000000001'),
          'ChIJ-outro-lugar', 'e ele chega à parada');
select pg_temp.logout();

-- ------------------------------------------------------------- 2. ai_imports.kind
select pg_temp.login('f2711111-1111-4111-8111-111111111111');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind) values (null, 120, 'claude-sonnet-5-5', 'plan_search')$$,
                'o planejador abre a linha dele (uma por rodada)');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind) values (null, 400, 'claude-sonnet-5-5', 'bateria_pedidos'),
                                                                                           (null, 900, 'claude-sonnet-5-5', 'bateria_juiz')$$,
                'a bateria também: os pedidos gerados e o juiz');
select throws_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind) values (null, 40, 'claude-sonnet-5-5', 'chat')$$,
                 '23514', null, 'finalidade fora da lista continua recusada');
select pg_temp.logout();

select * from finish();
rollback;
