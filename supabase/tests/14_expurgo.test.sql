-- O expurgo (0012): o que sai, o que fica, o horizonte e o resync, os registros, a lista do Storage,
-- o dry_run igual ao de verdade e quem pode chamar. As datas antigas são gravadas com os triggers
-- desligados (o sync_guard carimba synced_at com o relógio); o expurgo roda com os cortes da regra.
begin;
select plan(46);

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
-- a regra: 30 dias para viagens, 90 para lápides e registros, 7 para objetos sem linha
create function pg_temp.purge(p_dry boolean) returns jsonb language sql as $$
  select public.purge(p_dry, now() - interval '30 days', now() - interval '90 days',
                      now() - interval '90 days', now() - interval '7 days');
$$;
create function pg_temp.ago(p_days int) returns timestamptz language sql as $$
  select now() - make_interval(days => p_days);
$$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'f1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'ex-a@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'ex-b@teste.local', 'x', now(), '{}', '{"name":"Bia"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'ex-lab@teste.invalid', 'x', now(), '{}', '{"name":"Lab"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'ex-r@teste.local', 'x', now(), '{}', '{"name":"Rui"}', now(), now(), '', '', '', '');
insert into private.lab_access (user_id, role) values ('f3333333-3333-4333-8333-333333333333', 'runner');

-- T1 viva (Ana, com Bia; Rui saiu há 100 dias), T2 excluída há 40 dias, T3 excluída há 20, TL do laboratório
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at) values
 ('a1000000-0000-4000-8000-000000000001', 'f1111111-1111-4111-8111-111111111111', 'Viva', '2026-12-11', '2026-12-14', now()),
 ('a2000000-0000-4000-8000-000000000002', 'f1111111-1111-4111-8111-111111111111', 'Excluída há 40', '2026-12-11', '2026-12-12', now()),
 ('a3000000-0000-4000-8000-000000000003', 'f1111111-1111-4111-8111-111111111111', 'Excluída há 20', '2026-12-11', '2026-12-12', now()),
 ('a4000000-0000-4000-8000-000000000004', 'f3333333-3333-4333-8333-333333333333', 'Laboratório', '2026-12-11', '2026-12-11', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at) values
 (extensions.uuid_generate_v5('a1000000-0000-4000-8000-000000000001', 'invite:ex-b@teste.local'), 'a1000000-0000-4000-8000-000000000001',
  'f2222222-2222-4222-8222-222222222222', 'ex-b@teste.local', 'member', 'accepted', 'f1111111-1111-4111-8111-111111111111', now()),
 (extensions.uuid_generate_v5('a1000000-0000-4000-8000-000000000001', 'invite:ex-r@teste.local'), 'a1000000-0000-4000-8000-000000000001',
  'f4444444-4444-4444-8444-444444444444', 'ex-r@teste.local', 'member', 'accepted', 'f1111111-1111-4111-8111-111111111111', now());
insert into public.trip_days (id, trip_id, date, updated_at) values
 (extensions.uuid_generate_v5('a1000000-0000-4000-8000-000000000001', '2026-12-11'), 'a1000000-0000-4000-8000-000000000001', '2026-12-11', now()),
 (extensions.uuid_generate_v5('a1000000-0000-4000-8000-000000000001', '2026-12-12'), 'a1000000-0000-4000-8000-000000000001', '2026-12-12', now()),
 (extensions.uuid_generate_v5('a2000000-0000-4000-8000-000000000002', '2026-12-11'), 'a2000000-0000-4000-8000-000000000002', '2026-12-11', now());
-- S1 viva; S2 lápide sozinha; S3 lápide com reserva viva; S4 lápide com missão e gasto vivos; S5 lápide
-- recente; S6 lápide com uma memória também em lápide; S7 da viagem excluída
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
select ('b0000000-0000-4000-8000-00000000000' || n)::uuid, 'a1000000-0000-4000-8000-000000000001',
       extensions.uuid_generate_v5('a1000000-0000-4000-8000-000000000001', '2026-12-11'), 'a' || n, 'other', 'Parada ' || n, now()
  from generate_series(1, 6) n;
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at) values
 ('b0000000-0000-4000-8000-000000000007', 'a2000000-0000-4000-8000-000000000002',
  extensions.uuid_generate_v5('a2000000-0000-4000-8000-000000000002', '2026-12-11'), 'a0', 'nature', 'Cascata', now());
insert into public.reservations (id, trip_id, stop_id, type, name, created_by, updated_at) values
 ('c0000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003',
  'hotel', 'Hotel', 'f1111111-1111-4111-8111-111111111111', now());
insert into public.checklist_items (id, trip_id, kind, text, position, points, stop_id, created_by, updated_at) values
 ('c1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'quest', 'Foto', 'a0', 20,
  'b0000000-0000-4000-8000-000000000004', 'f1111111-1111-4111-8111-111111111111', now());
insert into public.expenses (id, trip_id, stop_id, amount, category, date, paid_by, created_by, updated_at) values
 ('c2000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000004',
  50, 'food', '2026-12-11', 'f1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', now()),
 ('c2000000-0000-4000-8000-000000000002', 'a2000000-0000-4000-8000-000000000002', null,
  80, 'fuel', '2026-12-11', 'f1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', now());
insert into public.stop_memories (id, trip_id, stop_id, user_id, rating, updated_at) values
 (extensions.uuid_generate_v5('b0000000-0000-4000-8000-000000000006', 'f1111111-1111-4111-8111-111111111111'),
  'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000006', 'f1111111-1111-4111-8111-111111111111', 4, now());
-- o anexo vivo e o que está em lápide há 10 dias, ambos na S1
insert into public.attachments (id, trip_id, stop_id, kind, storage_path, filename, mime, size_bytes, width, height, created_by, updated_at) values
 ('c3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'photo',
  'a1000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg', 'a.jpg', 'image/jpeg', 1000, 10, 10,
  'f1111111-1111-4111-8111-111111111111', now()),
 ('c3000000-0000-4000-8000-000000000002', 'a1000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'photo',
  'a1000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000002.jpg', 'b.jpg', 'image/jpeg', 1000, 10, 10,
  'f1111111-1111-4111-8111-111111111111', now());
-- XP, conquista e importação da viagem excluída: ficam, sem a viagem
insert into public.xp_events (id, user_id, trip_id, kind, ref_id, points) values
 (extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'stop_done:b0000000-0000-4000-8000-000000000007'),
  'f1111111-1111-4111-8111-111111111111', 'a2000000-0000-4000-8000-000000000002', 'stop_done', 'b0000000-0000-4000-8000-000000000007', 10);
insert into public.achievements (id, user_id, trip_id, key, unlocked_at) values
 (extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'achievement:first_stop'),
  'f1111111-1111-4111-8111-111111111111', 'a2000000-0000-4000-8000-000000000002', 'first_stop', now() - interval '41 days');
insert into public.ai_imports (user_id, trip_id, input_chars, model, status, finished_at, created_at) values
 ('f1111111-1111-4111-8111-111111111111', 'a2000000-0000-4000-8000-000000000002', 100, 'claude-sonnet-5-5', 'succeeded', now() - interval '41 days', now() - interval '41 days'),
 -- uma que ainda está aberta (o cron que fecha as abandonadas não roda aqui): não trava o expurgo
 ('f1111111-1111-4111-8111-111111111111', 'a2000000-0000-4000-8000-000000000002', 100, 'claude-sonnet-5-5', 'started', null, now() - interval '41 days'),
 ('f1111111-1111-4111-8111-111111111111', null, 100, 'claude-sonnet-5-5', 'succeeded', now() - interval '100 days', now() - interval '100 days'),
 ('f1111111-1111-4111-8111-111111111111', null, 100, 'claude-sonnet-5-5', 'started', null, now() - interval '100 days');

-- os registros: um velho e um novo de cada
insert into public.notifications_sent (id, user_id, kind, ref, scheduled_at, status) values
 (gen_random_uuid(), 'f1111111-1111-4111-8111-111111111111', 'morning_briefing', 'velho', now() - interval '100 days', 'sent'),
 (gen_random_uuid(), 'f1111111-1111-4111-8111-111111111111', 'morning_briefing', 'novo', now() - interval '10 days', 'sent');
insert into public.edge_calls (user_id, fn, created_at) values
 ('f1111111-1111-4111-8111-111111111111', 'route-day', now() - interval '100 days'),
 ('f1111111-1111-4111-8111-111111111111', 'route-day', now() - interval '1 hour');
insert into public.lab_runs (id, target, source, status, started_at, finished_at, runner_id) values
 ('c4000000-0000-4000-8000-000000000001', 'production', 'teste', 'pass', now() - interval '100 days', now() - interval '100 days', 'f3333333-3333-4333-8333-333333333333'),
 ('c4000000-0000-4000-8000-000000000002', 'production', 'teste', 'pass', now() - interval '1 day', now() - interval '1 day', 'f3333333-3333-4333-8333-333333333333');
insert into public.lab_checks (run_id, scenario, status) values
 ('c4000000-0000-4000-8000-000000000001', 'preparo', 'pass'),
 ('c4000000-0000-4000-8000-000000000002', 'preparo', 'pass');
insert into public.lab_inbox (user_id, inbox, status_code, vapid_ok, size_bytes, received_at) values
 ('f3333333-3333-4333-8333-333333333333', gen_random_uuid(), 201, true, 300, now() - interval '100 days');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, platform, origin, failed_at) values
 ('f1111111-1111-4111-8111-111111111111', 'https://push.teste/morta-velha', 'k', 'a', 'ios', 'https://viajei.teste', now() - interval '100 days'),
 ('f1111111-1111-4111-8111-111111111111', 'https://push.teste/morta-nova', 'k', 'a', 'ios', 'https://viajei.teste', now() - interval '10 days'),
 ('f1111111-1111-4111-8111-111111111111', 'https://push.teste/viva', 'k', 'a', 'ios', 'https://viajei.teste', null);

-- os arquivos: o da viagem excluída, um órfão velho, um órfão novo, o do anexo vivo e o do anexo em lápide
insert into storage.objects (bucket_id, name, owner_id, created_at) values
 ('attachments', 'a2000000-0000-4000-8000-000000000002/c3000000-0000-4000-8000-000000000009.jpg', 'f1111111-1111-4111-8111-111111111111', now() - interval '40 days'),
 ('attachments', 'a1000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-00000000000a.jpg', 'f1111111-1111-4111-8111-111111111111', now() - interval '10 days'),
 ('attachments', 'a1000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-00000000000b.jpg', 'f1111111-1111-4111-8111-111111111111', now() - interval '2 days'),
 ('attachments', 'a1000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000001.jpg', 'f1111111-1111-4111-8111-111111111111', now() - interval '10 days'),
 ('attachments', 'a1000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000002.jpg', 'f1111111-1111-4111-8111-111111111111', now() - interval '10 days');

-- o passado, gravado sem os triggers (o sync_guard carimbaria agora; o a_guard e o guard da exclusão
-- pediriam o dono)
alter table public.trips disable trigger user;
alter table public.trip_members disable trigger user;
alter table public.trip_days disable trigger user;
alter table public.stops disable trigger user;
alter table public.stop_memories disable trigger user;
alter table public.attachments disable trigger user;
update public.trips set deleted_at = pg_temp.ago(40), synced_at = pg_temp.ago(40) where id = 'a2000000-0000-4000-8000-000000000002';
update public.trips set deleted_at = pg_temp.ago(20), synced_at = pg_temp.ago(20) where id = 'a3000000-0000-4000-8000-000000000003';
update public.trip_members set deleted_at = pg_temp.ago(100), synced_at = pg_temp.ago(100)
 where user_id = 'f4444444-4444-4444-8444-444444444444';
update public.trip_days set deleted_at = pg_temp.ago(100), synced_at = pg_temp.ago(100)
 where id = extensions.uuid_generate_v5('a1000000-0000-4000-8000-000000000001', '2026-12-12');
update public.stops set deleted_at = pg_temp.ago(100), synced_at = pg_temp.ago(100)
 where id in ('b0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003',
              'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000006');
-- a S5 foi apagada há 100 dias num aparelho sem sinal e só chegou ao servidor há 10: conta de 10
update public.stops set deleted_at = pg_temp.ago(100), synced_at = pg_temp.ago(10) where id = 'b0000000-0000-4000-8000-000000000005';
update public.stop_memories set deleted_at = pg_temp.ago(100), synced_at = pg_temp.ago(100)
 where stop_id = 'b0000000-0000-4000-8000-000000000006';
update public.attachments set deleted_at = pg_temp.ago(10), synced_at = pg_temp.ago(10)
 where id = 'c3000000-0000-4000-8000-000000000002';
alter table public.trips enable trigger user;
alter table public.trip_members enable trigger user;
alter table public.trip_days enable trigger user;
alter table public.stops enable trigger user;
alter table public.stop_memories enable trigger user;
alter table public.attachments enable trigger user;

-- quem chama
select throws_ok($$select public.purge(true, now() + interval '1 day', now(), now(), now())$$,
                 '22023', 'corte no futuro', 'um corte no futuro é recusado');
select pg_temp.login('f1111111-1111-4111-8111-111111111111');
select throws_ok($$select public.purge(true, now(), now(), now(), now())$$, '42501', null,
                 'quem entra pelo app não chama o expurgo');
select throws_ok($$select public.lab_purge_preview(now(), now(), now(), now())$$, '42501', null,
                 'quem não é do laboratório não pede o dry_run');
select throws_ok($$select public.lab_mark_horizon('a1000000-0000-4000-8000-000000000001')$$, '42501', null,
                 'quem não é do laboratório não marca horizonte');
select pg_temp.logout();
select pg_temp.login('f3333333-3333-4333-8333-333333333333');
select is((select public.lab_purge_preview(now() - interval '30 days', now() - interval '90 days',
                                           now() - interval '90 days', now() - interval '7 days') -> 'storage' ? 'paths'),
          false, 'o dry_run do laboratório vem sem os caminhos dos arquivos');
select throws_ok($$select public.lab_mark_horizon('a1000000-0000-4000-8000-000000000001')$$, '42501', null,
                 'o laboratório não marca horizonte numa viagem que não é dele');
select lives_ok($$select public.lab_mark_horizon('a4000000-0000-4000-8000-000000000004')$$,
                'o laboratório marca o horizonte na viagem dele');
select pg_temp.logout();

-- o dry_run conta exatamente o que a passada de verdade apaga, e não apaga nada
create temp table ensaio as select pg_temp.purge(true) as r;
select is((select count(*) from public.stops where id = 'b0000000-0000-4000-8000-000000000002'), 1::bigint,
          'o dry_run não apaga nada');
create temp table feito as select pg_temp.purge(false) as r;
select is((select r - 'dry_run' from ensaio), (select r - 'dry_run' from feito), 'o dry_run conta o mesmo que a passada de verdade');

-- as viagens
select is((select r -> 'trips' ->> 'count' from feito), '1', 'só a viagem excluída há mais de 30 dias se qualifica');
select is((select count(*) from public.trips where id = 'a2000000-0000-4000-8000-000000000002'), 0::bigint, 'a viagem excluída há 40 dias saiu');
select is((select count(*) from public.trips where id = 'a3000000-0000-4000-8000-000000000003'), 1::bigint, 'a excluída há 20 dias fica');
select is((select count(*) from public.trip_days where trip_id = 'a2000000-0000-4000-8000-000000000002')
        + (select count(*) from public.stops where trip_id = 'a2000000-0000-4000-8000-000000000002')
        + (select count(*) from public.expenses where trip_id = 'a2000000-0000-4000-8000-000000000002')
        + (select count(*) from public.trip_members where trip_id = 'a2000000-0000-4000-8000-000000000002'),
          0::bigint, 'dias, paradas, gastos e participações foram junto');
select is((select (r -> 'trip_rows' ->> 'stops')::int + (r -> 'trip_rows' ->> 'expenses')::int from feito), 2,
          'o relatório conta o que saiu junto');
select is((select count(*) from public.xp_events
            where ref_id = 'b0000000-0000-4000-8000-000000000007' and trip_id is null), 1::bigint,
          'o XP fica, sem a viagem');
select is((select count(*) from public.achievements where user_id = 'f1111111-1111-4111-8111-111111111111' and trip_id is null),
          1::bigint, 'a conquista fica, sem a viagem');
select is((select status || '|' || coalesce(trip_id::text, 'sem viagem') from public.ai_imports
            where created_at < now() - interval '40 days' and created_at > now() - interval '50 days'
              and finished_at is not null),
          'succeeded|sem viagem', 'a importação encerrada solta a viagem e continua encerrada');
select is((select status || '|' || coalesce(trip_id::text, 'sem viagem') from public.ai_imports
            where created_at < now() - interval '40 days' and created_at > now() - interval '50 days'
              and finished_at is null),
          'started|sem viagem', 'a importação que ficou aberta solta a viagem sem ser encerrada');
select is((select (r -> 'trip_kept' ->> 'xp_events')::int + (r -> 'trip_kept' ->> 'achievements')::int
                + (r -> 'trip_kept' ->> 'ai_imports')::int from feito), 4, 'o relatório conta o que ficou sem a viagem');
select throws_ok($$update public.ai_imports set error = 'x' where status = 'succeeded'$$, '42501', null,
                 'fora o set null do expurgo, a importação encerrada continua sem mudar');
select pg_temp.login('f1111111-1111-4111-8111-111111111111');
select is((select (public.sync_pull('a2000000-0000-4000-8000-000000000002', '-infinity') ->> 'revoked')::boolean), true,
          'o aparelho que ainda tem a viagem expurgada recebe revoked');
select pg_temp.logout();

-- as lápides da viagem viva
select is((select count(*) from public.stops where id in ('b0000000-0000-4000-8000-000000000002',
             'b0000000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000006')), 0::bigint,
          'as lápides de 90 dias saíram');
select is((select count(*) from public.stops where id = 'b0000000-0000-4000-8000-000000000003'), 1::bigint,
          'a lápide com uma reserva viva fica (o expurgo nunca leva nada em cascata)');
select is((select count(*) from public.reservations where id = 'c0000000-0000-4000-8000-000000000001' and deleted_at is null),
          1::bigint, 'e a reserva continua viva');
select is((select r ->> 'held' from feito), '1', 'o relatório conta a lápide segura');
select is((select count(*) from public.stops where id = 'b0000000-0000-4000-8000-000000000005'), 1::bigint,
          'a lápide que chegou ao servidor há 10 dias fica, mesmo apagada há 100');
select is((select count(*) from public.stops where id = 'b0000000-0000-4000-8000-000000000001'), 1::bigint, 'a parada viva fica');
select is((select count(*) from public.checklist_items
            where id = 'c1000000-0000-4000-8000-000000000001' and stop_id is null and deleted_at is null), 1::bigint,
          'a missão da parada expurgada fica viva, sem a parada');
select ok((select deleted_at is null and synced_at > now() - interval '1 minute' from public.expenses
            where id = 'c2000000-0000-4000-8000-000000000001' and stop_id is null),
          'o gasto fica vivo, sem a parada, e carimbado para chegar aos aparelhos');
select is((select count(*) from public.stop_memories where stop_id = 'b0000000-0000-4000-8000-000000000006'), 0::bigint,
          'a memória em lápide sai antes da parada dela');
select is((select count(*) from public.trip_days where trip_id = 'a1000000-0000-4000-8000-000000000001'), 1::bigint,
          'o dia em lápide saiu; o vivo fica');
select is((select count(*) from public.trip_members where user_id = 'f4444444-4444-4444-8444-444444444444'), 0::bigint,
          'a participação de quem saiu há 100 dias saiu');

-- o horizonte e o resync
select is((select horizon from private.trip_horizons where trip_id = 'a1000000-0000-4000-8000-000000000001'),
          now() - interval '90 days', 'a viagem que perdeu lápides ganha o horizonte do corte');
select is((select horizon from private.user_horizons where user_id = 'f4444444-4444-4444-8444-444444444444'),
          now() - interval '90 days', 'e quem perdeu a participação também');
select pg_temp.login('f1111111-1111-4111-8111-111111111111');
select is((select (public.sync_pull('a1000000-0000-4000-8000-000000000001', now() - interval '100 days') ->> 'resync')::boolean),
          true, 'cursor anterior ao horizonte recebe resync');
select is((select jsonb_array_length(public.sync_pull('a1000000-0000-4000-8000-000000000001', now() - interval '100 days') -> 'stops')),
          3, 'com o retrato inteiro: a viva, a segura pela reserva e a lápide recente');
select is((select public.sync_pull('a1000000-0000-4000-8000-000000000001', now() - interval '1 day') ? 'resync'),
          false, 'cursor depois do horizonte: o pull de sempre');
select is((select jsonb_array_length(public.sync_pull('a1000000-0000-4000-8000-000000000001', now() - interval '1 day') -> 'stops')),
          1, 'que traz só o que mudou depois do cursor (a parada criada agora)');
select pg_temp.logout();
select pg_temp.login('f4444444-4444-4444-8444-444444444444');
select is((select (public.sync_pull_user(now() - interval '100 days') ->> 'resync')::boolean), true,
          'o pull do usuário com cursor antes do horizonte da pessoa recebe resync');
select pg_temp.logout();

-- os registros
select is((select count(*) from public.notifications_sent where user_id = 'f1111111-1111-4111-8111-111111111111'), 1::bigint,
          'o aviso de 100 dias saiu, o de 10 fica');
select is((select count(*) from public.edge_calls where user_id = 'f1111111-1111-4111-8111-111111111111'), 1::bigint,
          'a chamada de 100 dias saiu, a de agora fica');
select is((select count(*) from public.ai_imports where created_at < now() - interval '90 days'), 1::bigint,
          'a importação encerrada de 100 dias saiu; a que ainda está aberta fica');
select is((select count(*) from public.lab_checks where run_id = 'c4000000-0000-4000-8000-000000000001'), 0::bigint,
          'a execução do laboratório de 100 dias saiu com os cenários');
select is((select count(*) from public.push_subscriptions where user_id = 'f1111111-1111-4111-8111-111111111111'), 2::bigint,
          'a assinatura morta há 100 dias saiu; a morta há 10 e a viva ficam');

-- o Storage: a lista, que a Edge Function apaga pela API
select is((select array(select jsonb_array_elements_text(r -> 'storage' -> 'paths') order by 1) from feito),
          array['a1000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-000000000002.jpg',
                'a1000000-0000-4000-8000-000000000001/c3000000-0000-4000-8000-00000000000a.jpg',
                'a2000000-0000-4000-8000-000000000002/c3000000-0000-4000-8000-000000000009.jpg'],
          'a lista do Storage: o da viagem expurgada, o órfão velho e o do anexo em lápide há 10 dias');
select is((select r -> 'storage' ->> 'trip_objects' from feito), '1', 'um arquivo da viagem expurgada');

select * from finish();
rollback;
