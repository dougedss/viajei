begin;
select plan(32);

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
-- o DETAIL da recusa da edge_call, que o PostgREST entrega como `details`
create function pg_temp.limit_detail(p_fn text, p_limit integer) returns text language plpgsql as $$
declare v_detail text;
begin
  perform public.edge_call(p_fn, p_limit);
  return null;
exception when sqlstate '54000' then
  get stacked diagnostics v_detail = pg_exception_detail;
  return v_detail;
end $$;

-- i1 dono da viagem A; i2 dono da viagem B (intruso para A)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'i1@teste.local', 'x', now(), '{}', '{"name":"Quem importa"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'i2@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', '');
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('ea111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'Viagem A', '2026-12-11', '2026-12-14', now()),
       ('ea222222-2222-4222-8222-222222222222', 'a2222222-2222-4222-8222-222222222222', 'Viagem B', '2026-12-11', '2026-12-14', now());

-- uma importação de B, para a RLS ter o que esconder
insert into public.ai_imports (user_id, trip_id, input_chars, model)
values ('a2222222-2222-4222-8222-222222222222', 'ea222222-2222-4222-8222-222222222222', 500, 'claude-sonnet-5-5');

-- ---------------------------------------------------------------- abrir
select pg_temp.login('a1111111-1111-4111-8111-111111111111');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model)
                  values ('ea111111-1111-4111-8111-111111111111', 2714, 'claude-sonnet-5-5')$$,
                'a pessoa abre uma importação na própria viagem');
select is((select count(*) from public.ai_imports), 1::bigint, 'e vê só as próprias linhas');
select is((select status from public.ai_imports), 'started', 'a linha nasce em started');
select is((select user_id from public.ai_imports), 'a1111111-1111-4111-8111-111111111111'::uuid, 'com o dono pelo banco');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model) values (null, 10, 'claude-sonnet-5-5')$$,
                'sem viagem também abre (viagem que ainda não chegou ao servidor)');
select throws_ok($$insert into public.ai_imports (trip_id, input_chars, model)
                   values ('ea222222-2222-4222-8222-222222222222', 10, 'claude-sonnet-5-5')$$,
                 '42501', null, 'não abre numa viagem de que não é membro');
select throws_ok($$insert into public.ai_imports (input_chars, model, created_at)
                   values (10, 'claude-sonnet-5-5', now() - interval '2 days')$$,
                 '42501', null, 'não escolhe o created_at');
select throws_ok($$insert into public.ai_imports (input_chars, model, status)
                   values (10, 'claude-sonnet-5-5', 'succeeded')$$,
                 '42501', null, 'não nasce terminada');
select throws_ok($$insert into public.ai_imports (input_chars, model, user_id)
                   values (10, 'claude-sonnet-5-5', 'a2222222-2222-4222-8222-222222222222')$$,
                 '42501', null, 'não abre em nome de outra pessoa');
select throws_ok($$insert into public.ai_imports (input_chars, model) values (30001, 'claude-sonnet-5-5')$$,
                 '23514', null, 'acima de 30.000 caracteres não entra');

-- ---------------------------------------------------------------- fechar
select throws_ok($$update public.ai_imports set created_at = now() - interval '2 days'$$,
                 '42501', null, 'o client não muda o created_at');
select throws_ok($$update public.ai_imports set input_chars = 1$$,
                 '42501', null, 'nem o input_chars');
select throws_ok($$update public.ai_imports set trip_id = null$$,
                 '42501', null, 'nem a viagem');
select throws_ok($$update public.ai_imports set model = 'claude-opus-5-5' where trip_id is not null$$,
                 '22023', null, 'o registro só muda para encerrar');
select throws_ok($$update public.ai_imports set status = 'failed', error = 'texto livre com espaço' where trip_id is not null$$,
                 '23514', null, 'o erro é um código curto, nunca texto livre');
select lives_ok($$update public.ai_imports
                    set status = 'succeeded', model = 'claude-sonnet-5', input_tokens = 4100, output_tokens = 2300
                  where trip_id is not null$$,
                'fecha com o estado, os tokens e o modelo que respondeu');
select isnt((select finished_at from public.ai_imports where trip_id is not null), null, 'e o banco carimba o fim');
update public.ai_imports set status = 'failed', error = 'internal' where trip_id is not null;
select is((select status from public.ai_imports where trip_id is not null), 'succeeded',
          'uma linha terminada não muda mais pelo client');
select pg_temp.logout();
select throws_ok($$update public.ai_imports set status = 'failed'
                    where user_id = 'a1111111-1111-4111-8111-111111111111' and status = 'succeeded'$$,
                 '42501', null, 'nem pelo dono do banco: encerrada é encerrada');

-- ---------------------------------------------------------------- job dos abandonados
insert into public.ai_imports (user_id, input_chars, model, created_at)
values ('a1111111-1111-4111-8111-111111111111', 10, 'claude-sonnet-5-5', now() - interval '11 minutes');
select is(private.close_abandoned_imports(), 1, 'o job fecha só o que está aberto há mais de 10 minutos');
select is((select error from public.ai_imports where created_at < now() - interval '10 minutes'), 'abandoned',
          'como failed, com o código abandoned');
select is((select count(*) from public.ai_imports
            where user_id = 'a1111111-1111-4111-8111-111111111111' and status = 'started'), 1::bigint,
          'a importação recente continua aberta');

-- ---------------------------------------------------------------- limite pela edge_call
-- 19 chamadas antigas, a mais velha há 23 h: a 20ª passa, a 21ª é recusada e diz quando volta
insert into public.edge_calls (user_id, fn, created_at)
select 'a1111111-1111-4111-8111-111111111111', 'import-itinerary', now() - interval '23 hours' + make_interval(mins => g)
  from generate_series(0, 18) g;
select pg_temp.login('a1111111-1111-4111-8111-111111111111');
select is(public.edge_call('import-itinerary', 20), 20, 'a 20ª chamada em 24 h passa');
select ok(exists (select 1 from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()),
          'a edge_call segura a trava da pessoa até o fim da transação');
select throws_ok($$select public.edge_call('import-itinerary', 20)$$, '54000',
                 'limite de 20 chamadas por dia atingido', 'a 21ª é recusada');
select is(pg_temp.limit_detail('import-itinerary', 20),
          to_char((now() + interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'e a recusa diz a hora em que a cota volta: a mais antiga mais 24 h');
select pg_temp.logout();

-- ---------------------------------------------------------------- stops.source (o fato da planner)
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('ea111111-1111-4111-8111-111111111111', '2026-12-11'), 'ea111111-1111-4111-8111-111111111111', '2026-12-11', now());
select pg_temp.login('a1111111-1111-4111-8111-111111111111');
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
values ('eb111111-1111-4111-8111-111111111111', 'ea111111-1111-4111-8111-111111111111',
        extensions.uuid_generate_v5('ea111111-1111-4111-8111-111111111111', '2026-12-11'), 'a0', 'city', 'Feita à mão', now());
select is((select source from public.stops where id = 'eb111111-1111-4111-8111-111111111111'), 'user',
          'a parada nasce com a origem user');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, source, updated_at)
                  values ('eb222222-2222-4222-8222-222222222222', 'ea111111-1111-4111-8111-111111111111',
                          extensions.uuid_generate_v5('ea111111-1111-4111-8111-111111111111', '2026-12-11'), 'a1', 'nature', 'Da importação', 'ai', now())$$,
                'a importação grava a origem ai');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, source, updated_at)
                   values ('eb333333-3333-4333-8333-333333333333', 'ea111111-1111-4111-8111-111111111111',
                           extensions.uuid_generate_v5('ea111111-1111-4111-8111-111111111111', '2026-12-11'), 'a2', 'city', 'Outra', 'robo', now())$$,
                 '23514', null, 'outra origem não entra');
select throws_ok($$update public.stops set source = 'ai' where id = 'eb111111-1111-4111-8111-111111111111'$$,
                 '42501', 'a coluna source não pode mudar', 'a origem não muda depois');
select lives_ok($$update public.stops set name = 'Renomeada' where id = 'eb222222-2222-4222-8222-222222222222'$$,
                'editar a parada importada continua livre');
select pg_temp.logout();

-- ---------------------------------------------------------------- anon
set local role anon;
select throws_ok($$select count(*) from public.ai_imports$$, '42501', null, 'anon não vê nada');
reset role;

select * from finish();
rollback;
