begin;
select plan(59);

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
-- só o aviso de retrospectiva das viagens deste teste: outros dados do banco não interferem
create function pg_temp.retro_count(p_user uuid, p_now timestamptz) returns bigint language sql as $$
  select count(*) from public.due_notifications(p_now) d
   where d.user_id = p_user and d.kind = 'retro_ready'
     and d.trip_id in ('f9111111-1111-4111-8111-111111111111', 'f9222222-2222-4222-8222-222222222222')
$$;
-- um evento de XP como o client monta: id v5(user_id, kind:ref_id)
create function pg_temp.xp(p_user uuid, p_trip uuid, p_kind text, p_ref text, p_points int) returns void
language sql as $$
  insert into public.xp_events (id, user_id, trip_id, kind, ref_id, points)
  values (extensions.uuid_generate_v5(p_user, p_kind || ':' || p_ref), p_user, p_trip, p_kind, p_ref, p_points)
$$;
create function pg_temp.ach(p_user uuid, p_trip uuid, p_key text, p_at timestamptz default now()) returns void
language sql as $$
  insert into public.achievements (id, user_id, trip_id, key, unlocked_at)
  values (extensions.uuid_generate_v5(p_user, 'achievement:' || p_key), p_user, p_trip, p_key, p_at)
$$;

-- f1 dona da viagem T; f2 membro aceito de T; f3 intruso (dono de U, sem parada concluída);
-- f5 executor do laboratório (e-mail .invalid, dono de L); f6 conta real que só vê o painel;
-- f7 executor com e-mail comum (configuração errada: também não passa)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'f1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'p1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'p2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'p3@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f5555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'lab-x@teste.invalid', 'x', now(), '{}', '{"name":"Lab"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f6666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'real@teste.local', 'x', now(), '{}', '{"name":"Real"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f7777777-7777-4777-8777-777777777777', 'authenticated', 'authenticated', 'runner@teste.local', 'x', now(), '{}', '{"name":"Comum"}', now(), now(), '', '', '', '');
insert into private.lab_access (user_id, role)
values ('f5555555-5555-4555-8555-555555555555', 'runner'),
       ('f6666666-6666-4666-8666-666666666666', 'viewer'),
       ('f7777777-7777-4777-8777-777777777777', 'runner');

insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('f9111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'RS — concurso em Montenegro', '2026-12-11', '2026-12-14', now()),
       ('f9222222-2222-4222-8222-222222222222', 'f3333333-3333-4333-8333-333333333333', 'Viagem do intruso', '2026-12-11', '2026-12-14', now()),
       ('f9555555-5555-4555-8555-555555555555', 'f5555555-5555-4555-8555-555555555555', 'Viagem do laboratório', '2026-12-11', '2026-12-11', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('f9111111-1111-4111-8111-111111111111', 'invite:p2@teste.local'), 'f9111111-1111-4111-8111-111111111111',
        'f2222222-2222-4222-8222-222222222222', 'p2@teste.local', 'member', 'accepted', 'f1111111-1111-4111-8111-111111111111', now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('f9111111-1111-4111-8111-111111111111', '2026-12-11'), 'f9111111-1111-4111-8111-111111111111', '2026-12-11', now()),
       (extensions.uuid_generate_v5('f9222222-2222-4222-8222-222222222222', '2026-12-11'), 'f9222222-2222-4222-8222-222222222222', '2026-12-11', now());
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, time, done_at, done_by, updated_at)
values ('fa111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
        extensions.uuid_generate_v5('f9111111-1111-4111-8111-111111111111', '2026-12-11'), 'a0', 'nature', 'Cascata do Caracol', '09:00',
        '2026-12-11 12:05+00', 'f1111111-1111-4111-8111-111111111111', now()),
       ('fa222222-2222-4222-8222-222222222222', 'f9111111-1111-4111-8111-111111111111',
        extensions.uuid_generate_v5('f9111111-1111-4111-8111-111111111111', '2026-12-11'), 'a1', 'city', 'Gramado', '11:00',
        null, null, now()),
       ('fb111111-1111-4111-8111-111111111111', 'f9222222-2222-4222-8222-222222222222',
        extensions.uuid_generate_v5('f9222222-2222-4222-8222-222222222222', '2026-12-11'), 'a0', 'nature', 'Parque do intruso', '10:00',
        null, null, now());

-- ---------------------------------------------------------------- whitelist
select is((select string_agg(name || ':' || scope || ':' || mode || ':' || rank, ',' order by name) from private.sync_tables
            where name in ('achievements', 'xp_events')),
          'achievements:user:append:90,xp_events:user:append:90',
          'as duas tabelas entram na whitelist como somente-anexar, escopo user, rank 90');

-- ---------------------------------------------------------------- XP: só o próprio, só de viagem minha
select pg_temp.login('f1111111-1111-4111-8111-111111111111');
select lives_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                    'stop_done', 'fa111111-1111-4111-8111-111111111111', 10)$$,
  'a dona grava o próprio XP da parada concluída');
select throws_ok($$select pg_temp.xp('f2222222-2222-4222-8222-222222222222', 'f9111111-1111-4111-8111-111111111111',
                                     'stop_done', 'fa111111-1111-4111-8111-111111111111', 10)$$,
  '42501', null, 'não grava o XP de outra pessoa');
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9222222-2222-4222-8222-222222222222',
                                     'stop_done', 'fb111111-1111-4111-8111-111111111111', 10)$$,
  '42501', null, 'nem XP de viagem de que não é membro');
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', null,
                                     'stop_done', 'fa222222-2222-4222-8222-222222222222', 10)$$,
  '42501', null, 'nem XP sem viagem');

-- ---------------------------------------------------------------- pontos amarrados ao tipo
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'stop_done', 'fa222222-2222-4222-8222-222222222222', 11)$$,
  '23514', null, 'parada concluída vale 10, nem mais nem menos');
select lives_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                    'quest_done', 'fd111111-1111-4111-8111-111111111111', 30)$$,
  'missão vale os pontos dela, até 30');
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'quest_done', 'fd222222-2222-4222-8222-222222222222', 40)$$,
  '23514', null, 'missão acima de 30 é recusada');
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'quest_done', 'fd333333-3333-4333-8333-333333333333', 5)$$,
  '23514', null, 'missão abaixo de 10 é recusada');
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'trip_completed', 'f9111111-1111-4111-8111-111111111111', 50)$$,
  '23514', null, 'viagem concluída vale 100');

-- ---------------------------------------------------------------- o formato do ref_id
select lives_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                    'checklist_complete', 'f9111111-1111-4111-8111-111111111111:before', 20)$$,
  'lista completa: <viagem>:before');
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'checklist_complete', 'f9222222-2222-4222-8222-222222222222:pack', 20)$$,
  '23514', null, 'a lista completa de outra viagem é recusada');
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'checklist_complete', 'f9111111-1111-4111-8111-111111111111:quest', 20)$$,
  '23514', null, 'só Antes e Mala têm lista completa');
select lives_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                    'trip_completed', 'f9111111-1111-4111-8111-111111111111', 100)$$,
  'viagem concluída: o ref é a própria viagem');
select throws_ok($$select pg_temp.xp('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'stop_done', 'Cascata do Caracol', 10)$$,
  '23514', null, 'nos tipos por linha, o ref é um id');

-- ---------------------------------------------------------------- os ids contra o v5
select throws_ok($$insert into public.xp_events (id, user_id, trip_id, kind, ref_id, points)
  values (gen_random_uuid(), 'f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
          'memory_rating', 'fa111111-1111-4111-8111-111111111111', 5)$$,
  '23514', null, 'XP com id que não é o v5(user_id, kind:ref_id) é recusado');
select throws_ok($$insert into public.achievements (id, user_id, trip_id, key, unlocked_at)
  values (gen_random_uuid(), 'f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
          'first_stop', now())$$,
  '23514', null, 'conquista com id que não é o v5(user_id, achievement:key) é recusada');

-- ---------------------------------------------------------------- conquistas
select lives_ok($$select pg_temp.ach('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'first_stop', '2026-10-11 12:05+00')$$,
  'a dona grava a própria conquista, com a hora do fato');
select is((select unlocked_at from public.achievements
            where id = extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'achievement:first_stop')),
          '2026-10-11 12:05+00'::timestamptz, 'unlocked_at é a hora do fato, não a do envio');
select lives_ok($$select pg_temp.ach('f1111111-1111-4111-8111-111111111111', null, 'photographer')$$,
  'conquista sem viagem (de várias viagens, ou de viagem expurgada) passa');
select throws_ok($$select pg_temp.ach('f1111111-1111-4111-8111-111111111111', 'f9222222-2222-4222-8222-222222222222', 'coast')$$,
  '42501', null, 'conquista de viagem de que não é membro é recusada');
select throws_ok($$select pg_temp.ach('f2222222-2222-4222-8222-222222222222', 'f9111111-1111-4111-8111-111111111111', 'first_stop')$$,
  '42501', null, 'não grava a conquista de outra pessoa');
select throws_ok($$select pg_temp.ach('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111', 'speedster')$$,
  '23514', null, 'chave fora das 15 é recusada');
select lives_ok($$select pg_temp.ach('f1111111-1111-4111-8111-111111111111', 'f9111111-1111-4111-8111-111111111111',
                                     'early_bird', now() + interval '1 day')$$,
  'relógio adiantado: a conquista entra');
select ok((select unlocked_at <= clock_timestamp() + interval '2 minutes' from public.achievements
            where id = extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'achievement:early_bird')),
          'mas o unlocked_at fica no máximo 2 min à frente do servidor');

-- ---------------------------------------------------------------- somente-anexar: sem update nem delete
select throws_ok($$update public.xp_events set points = 15 where user_id = 'f1111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'XP não se edita');
select throws_ok($$delete from public.xp_events where user_id = 'f1111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'XP não se apaga');
select throws_ok($$update public.achievements set unlocked_at = now() where user_id = 'f1111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'conquista não se edita');
select throws_ok($$delete from public.achievements where user_id = 'f1111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'conquista não se apaga');

-- ---------------------------------------------------------------- o sync_push: colisão é idempotência
select is((select string_agg(r ->> 'status', ',' order by (r ->> 'seq')::int)
             from jsonb_array_elements(public.sync_push(jsonb_build_array(
               jsonb_build_object('seq', 1, 'table', 'xp_events', 'op', 'upsert',
                 'id', extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'stop_done:fa111111-1111-4111-8111-111111111111'),
                 'values', jsonb_build_object('user_id', 'f1111111-1111-4111-8111-111111111111',
                             'trip_id', 'f9111111-1111-4111-8111-111111111111', 'kind', 'stop_done',
                             'ref_id', 'fa111111-1111-4111-8111-111111111111', 'points', 10),
                 'versions', '{}'::jsonb, 'updated_at', now()),
               jsonb_build_object('seq', 2, 'table', 'xp_events', 'op', 'upsert',
                 'id', extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'memory_rating:fa111111-1111-4111-8111-111111111111'),
                 'values', jsonb_build_object('user_id', 'f1111111-1111-4111-8111-111111111111',
                             'trip_id', 'f9111111-1111-4111-8111-111111111111', 'kind', 'memory_rating',
                             'ref_id', 'fa111111-1111-4111-8111-111111111111', 'points', 5),
                 'versions', '{}'::jsonb, 'updated_at', now()),
               jsonb_build_object('seq', 3, 'table', 'achievements', 'op', 'upsert',
                 'id', extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'achievement:first_stop'),
                 'values', jsonb_build_object('user_id', 'f1111111-1111-4111-8111-111111111111',
                             'trip_id', 'f9111111-1111-4111-8111-111111111111', 'key', 'first_stop',
                             'unlocked_at', '2026-12-11T12:05:00Z'),
                 'versions', '{}'::jsonb, 'updated_at', now())))) r),
          'ignored,applied,ignored',
          'pelo sync_push, o mesmo fato derivado de novo (outra aba, outro aparelho) volta ignored; o novo, applied');
select is((select (r ->> 'status') || '|' || (r ->> 'code')
             from jsonb_array_elements(public.sync_push(jsonb_build_array(
               jsonb_build_object('seq', 1, 'table', 'xp_events', 'op', 'upsert',
                 'id', extensions.uuid_generate_v5('f1111111-1111-4111-8111-111111111111', 'stop_done:fb111111-1111-4111-8111-111111111111'),
                 'values', jsonb_build_object('user_id', 'f1111111-1111-4111-8111-111111111111',
                             'trip_id', 'f9222222-2222-4222-8222-222222222222', 'kind', 'stop_done',
                             'ref_id', 'fb111111-1111-4111-8111-111111111111', 'points', 10),
                 'versions', '{}'::jsonb, 'updated_at', now())))) r),
          'error|42501', 'pelo sync_push, XP de viagem alheia volta como erro de permissão');

-- ---------------------------------------------------------------- o resumo público no perfil
select is((select xp_total || '|' || array_to_string(achievement_keys, ',') from public.profiles
            where id = 'f1111111-1111-4111-8111-111111111111'),
          '165|early_bird,first_stop,photographer',
          'o perfil resume o XP (10 + 30 + 20 + 100 + 5) e as chaves das conquistas, recalculados da fonte');
select throws_ok($$update public.profiles set xp_total = 9999, updated_at = now() where id = 'f1111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'o client não edita o próprio XP no perfil');
select throws_ok($$update public.profiles set achievement_keys = '{coast}', updated_at = now() where id = 'f1111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'nem as conquistas do perfil');
select lives_ok($$update public.profiles set name = 'Douglas', updated_at = now() where id = 'f1111111-1111-4111-8111-111111111111'$$,
  'nome e cor continuam editáveis');

-- ---------------------------------------------------------------- o time lê, o estranho não
select pg_temp.login('f2222222-2222-4222-8222-222222222222');
select is((select count(*) from public.xp_events where user_id = 'f1111111-1111-4111-8111-111111111111'), 5::bigint,
          'o membro do time lê o XP da dona');
select is((select count(*) from public.achievements where user_id = 'f1111111-1111-4111-8111-111111111111'), 3::bigint,
          'e as conquistas dela');
select is((select xp_total from public.profiles where id = 'f1111111-1111-4111-8111-111111111111'), 165,
          'e o resumo no perfil, que é a fonte do nível do time');
select is((select jsonb_array_length(v -> 'xp_events') || '|' || jsonb_array_length(v -> 'achievements')
             from public.sync_pull('f9111111-1111-4111-8111-111111111111', '-infinity') v),
          '5|2', 'o pull da viagem traz o XP e as conquistas da viagem (C6); a sem viagem fica de fora');
select lives_ok($$select pg_temp.xp('f2222222-2222-4222-8222-222222222222', 'f9111111-1111-4111-8111-111111111111',
                                    'stop_done', 'fa111111-1111-4111-8111-111111111111', 10)$$,
  'o membro grava o próprio XP do mesmo fato do time: o id é dele');
select pg_temp.login('f3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.xp_events where user_id in ('f1111111-1111-4111-8111-111111111111', 'f2222222-2222-4222-8222-222222222222')),
          0::bigint, 'o intruso não lê o XP de quem não viaja com ele');
select is((select count(*) from public.achievements where user_id = 'f1111111-1111-4111-8111-111111111111'), 0::bigint,
          'nem as conquistas');
select is((select jsonb_array_length(v -> 'xp_events') || '|' || jsonb_array_length(v -> 'achievements')
             from public.sync_pull_user('-infinity') v),
          '0|0', 'o pull do usuário só traz o que é dele');

-- ---------------------------------------------------------------- a limpeza do laboratório
select pg_temp.login('f5555555-5555-4555-8555-555555555555');
select lives_ok($$select pg_temp.xp('f5555555-5555-4555-8555-555555555555', 'f9555555-5555-4555-8555-555555555555',
                                    'trip_completed', 'f9555555-5555-4555-8555-555555555555', 100)$$,
  'o executor do laboratório ganha XP como qualquer um');
select pg_temp.login('f6666666-6666-4666-8666-666666666666');
select throws_ok($$select public.lab_reset_progress()$$, '42501', null,
  'a conta real que vê o painel não alcança a limpeza');
select pg_temp.login('f7777777-7777-4777-8777-777777777777');
select throws_ok($$select public.lab_reset_progress()$$, '42501', null,
  'nem um executor com e-mail de verdade');
select pg_temp.login('f1111111-1111-4111-8111-111111111111');
select throws_ok($$select public.lab_reset_progress()$$, '42501', null,
  'nem quem não é do laboratório');
select is((select xp_total from public.profiles where id = 'f1111111-1111-4111-8111-111111111111'), 165,
          'e a progressão dela continua intacta');
select pg_temp.login('f5555555-5555-4555-8555-555555555555');
select is(public.lab_reset_progress(), 1, 'o executor do laboratório apaga a própria progressão');
select is((select count(*) from public.xp_events where user_id = 'f5555555-5555-4555-8555-555555555555'),
          0::bigint, 'sem XP');
select is((select xp_total || '|' || cardinality(achievement_keys) from public.profiles
            where id = 'f5555555-5555-4555-8555-555555555555'),
          '0|0', 'e o resumo zerado');
select pg_temp.logout();

-- ---------------------------------------------------------------- retro_ready (end_date + 1, 9h de São Paulo)
select is(pg_temp.retro_count('f1111111-1111-4111-8111-111111111111', '2026-12-15 12:00+00'), 1::bigint,
          'retro_ready vence no dia seguinte ao fim, às 9h de São Paulo (12:00 UTC), para a dona');
select is(pg_temp.retro_count('f2222222-2222-4222-8222-222222222222', '2026-12-15 12:00+00'), 1::bigint, 'e para o membro');
select is((select (d.data ->> 'days') || '|' || (d.data ->> 'stops_done') || '|' || (d.data ->> 'trip_name')
             from public.due_notifications('2026-12-15 12:00+00') d
            where d.user_id = 'f1111111-1111-4111-8111-111111111111' and d.kind = 'retro_ready'
              and d.trip_id = 'f9111111-1111-4111-8111-111111111111'),
          '4|1|RS — concurso em Montenegro', 'os fatos: 4 dias e as paradas concluídas (só a concluída conta)');
select is(pg_temp.retro_count('f1111111-1111-4111-8111-111111111111', '2026-12-15 11:00+00'), 0::bigint,
          'fuso: 11:00 UTC são 8:00 em São Paulo, ainda não');
select is(pg_temp.retro_count('f3333333-3333-4333-8333-333333333333', '2026-12-15 12:00+00'), 0::bigint,
          'viagem sem parada concluída não ganha filme');
insert into public.notification_prefs (id, user_id, trip_id, kinds, updated_at)
values (extensions.uuid_generate_v5('f2222222-2222-4222-8222-222222222222', 'f9111111-1111-4111-8111-111111111111'),
        'f2222222-2222-4222-8222-222222222222', 'f9111111-1111-4111-8111-111111111111', '{"retro_ready": false}', now());
select is(pg_temp.retro_count('f2222222-2222-4222-8222-222222222222', '2026-12-15 12:00+00'), 0::bigint, 'nada com o tipo desligado');
select is((select count(*) from public.claim_due_notifications('2026-12-15 12:00+00') c
            where c.kind = 'retro_ready' and c.trip_id = 'f9111111-1111-4111-8111-111111111111'), 1::bigint,
          'o envio reserva o aviso da dona');
select is(pg_temp.retro_count('f1111111-1111-4111-8111-111111111111', '2026-12-15 12:05+00'), 0::bigint,
          'e ele não vence de novo (dedupe)');

select * from finish();
