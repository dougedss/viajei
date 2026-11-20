-- A 0018 (fase 23): uma falha passageira esgotada não condena o lugar (ele continua pendente), a falha
-- sem referência condena (o lugar fica sem peça), e a landmark_sync devolve à fila o job que falhou por
-- causa passageira há mais de uma hora.
begin;
select plan(9);

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
create function pg_temp.state_of(r jsonb, k text) returns text language sql as $$
  select i ->> 'state' from jsonb_array_elements(r -> 'items') i where i ->> 'key' = k
$$;
create function pg_temp.place(k text, n text) returns jsonb language sql as $$
  select jsonb_build_object('key', k, 'kind', 'stop', 'name', n, 'lat', -25.4428, 'lng', -49.2392, 'stop_kind', 'nature')
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'aa111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'q1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', '');
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('ea111111-1111-4111-8111-111111111111', 'aa111111-1111-4111-8111-111111111111', 'Serra', '2026-12-11', '2026-12-14', now());

-- dois lugares na fila
select pg_temp.login('aa111111-1111-4111-8111-111111111111');
select pg_temp.state_of(public.landmark_sync('ea111111-1111-4111-8111-111111111111', jsonb_build_array(
  pg_temp.place('geo:passageiro@-25.443,-49.239', 'Passageiro'),
  pg_temp.place('geo:sem-referencia@-25.444,-49.239', 'Sem referência'))), 'geo:passageiro@-25.443,-49.239');
select pg_temp.logout();
update public.landmark_jobs set run_after = now() - interval '1 hour';

-- a causa passageira, três vezes: o job falha, o lugar continua pendente
create temp table j as select public.landmark_claim() as j;
select is((select j ->> 'place_key' from j), 'geo:passageiro@-25.443,-49.239', 'o primeiro job');
select public.landmark_fail((select (j ->> 'id')::uuid from j), 'source_failed', true);
update public.landmark_jobs set run_after = now() - interval '1 hour', attempts = 3 where place_key = 'geo:passageiro@-25.443,-49.239';
update public.landmark_jobs set status = 'running', started_at = now() where place_key = 'geo:passageiro@-25.443,-49.239';
select public.landmark_fail((select (j ->> 'id')::uuid from j), 'source_failed', true);
select is((select status || ':' || coalesce(code, '-') from public.landmark_jobs where place_key = 'geo:passageiro@-25.443,-49.239'),
          'failed:source_failed', 'as tentativas esgotadas: o job falha');
select is((select status || ':' || coalesce(code, '-') from public.landmark_places where place_key = 'geo:passageiro@-25.443,-49.239'),
          'pending:source_failed', 'mas o lugar continua pendente, com o código');

-- a causa sem referência: o lugar fica sem peça
create temp table j2 as select public.landmark_claim() as j;
select is((select j ->> 'place_key' from j2), 'geo:sem-referencia@-25.444,-49.239', 'o segundo job');
select public.landmark_fail((select (j ->> 'id')::uuid from j2), 'no_wikidata', false);
select is((select status || ':' || coalesce(code, '-') from public.landmark_places where place_key = 'geo:sem-referencia@-25.444,-49.239'),
          'none:no_wikidata', 'sem referência: o lugar fica sem peça');

-- a volta à fila: só depois de uma hora, e só a causa passageira
select pg_temp.login('aa111111-1111-4111-8111-111111111111');
select is(pg_temp.state_of(public.landmark_sync('ea111111-1111-4111-8111-111111111111',
            jsonb_build_array(pg_temp.place('geo:passageiro@-25.443,-49.239', 'Passageiro'))), 'geo:passageiro@-25.443,-49.239'),
          'pending', 'o lugar pendente continua pendente');
select pg_temp.logout();
select is((select status from public.landmark_jobs where place_key = 'geo:passageiro@-25.443,-49.239'), 'failed',
          'o job de menos de uma hora não volta ainda');
update public.landmark_jobs set updated_at = now() - interval '2 hours' where place_key = 'geo:passageiro@-25.443,-49.239';
select pg_temp.login('aa111111-1111-4111-8111-111111111111');
select pg_temp.state_of(public.landmark_sync('ea111111-1111-4111-8111-111111111111',
  jsonb_build_array(pg_temp.place('geo:passageiro@-25.443,-49.239', 'Passageiro'),
                    pg_temp.place('geo:sem-referencia@-25.444,-49.239', 'Sem referência'))), 'geo:passageiro@-25.443,-49.239');
select pg_temp.logout();
select is((select status || ':' || attempts::text from public.landmark_jobs where place_key = 'geo:passageiro@-25.443,-49.239'),
          'queued:0', 'passada uma hora, o job volta à fila com as tentativas zeradas');
select is((select status from public.landmark_places where place_key = 'geo:sem-referencia@-25.444,-49.239'), 'none',
          'e o sem referência não volta');

select * from finish();
rollback;
