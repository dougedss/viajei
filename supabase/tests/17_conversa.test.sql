begin;
select plan(22);

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

-- v1 pessoa comum; v2 viaja com v1; v3 o executor do laboratório (e-mail .invalid)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'd1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'v1@teste.local', 'x', now(), '{}', '{"name":"Quem conversa"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'd2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'v2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'd3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'lab-17@teste.invalid', 'x', now(), '{}', '{"name":"Lab"}', now(), now(), '', '', '', '');
insert into private.lab_access (user_id, role) values ('d3333333-3333-4333-8333-333333333333', 'runner');

-- ------------------------------------------------------------------ ai_imports.kind
select pg_temp.login('d1111111-1111-4111-8111-111111111111');
insert into public.ai_imports (trip_id, input_chars, model) values (null, 120, 'claude-sonnet-5-5');
select is((select kind from public.ai_imports), 'import',
          'a leitura sem finalidade dita é a importação (as linhas de antes continuam o que eram)');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind) values (null, 80, 'claude-sonnet-5-5', 'plan')$$,
                'a conversa abre a linha dela, sem viagem (a viagem nasce depois)');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind) values (null, 40, 'claude-sonnet-5-5', 'today')$$,
                'a saída de hoje também');
select throws_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind) values (null, 40, 'claude-sonnet-5-5', 'chat')$$,
                 '23514', null, 'finalidade fora da lista é recusada');
select throws_ok($$update public.ai_imports set kind = 'today' where kind = 'plan'$$,
                 '42501', null, 'fechar a linha não muda a finalidade (sem grant de update)');
select is((select string_agg(kind, ',' order by kind) from public.ai_imports), 'import,plan,today',
          'a pessoa vê as próprias leituras, cada uma com a finalidade');
select pg_temp.logout();

-- ------------------------------------------------------------------ profiles.interests
select is((select interests from public.profiles where id = 'd1111111-1111-4111-8111-111111111111'), '{}'::text[],
          'o perfil nasce sem gostos: os chips vazios são a própria pergunta');
-- a viagem viva de v1 (com v2 no time) e uma excluída (a guarda só deixa o dono excluir: já nasce assim)
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at, deleted_at)
values ('e1711111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'Serra', '2026-12-11', '2026-12-14', now(), null),
       ('e1722222-2222-4222-8222-222222222222', 'd1111111-1111-4111-8111-111111111111', 'Excluída', '2026-10-01', '2026-10-02', now(), now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('e1711111-1111-4111-8111-111111111111', 'invite:v2@teste.local'), 'e1711111-1111-4111-8111-111111111111',
        'd2222222-2222-4222-8222-222222222222', 'v2@teste.local', 'member', 'accepted', 'd1111111-1111-4111-8111-111111111111', now());

select pg_temp.login('d1111111-1111-4111-8111-111111111111');
update public.profiles set interests = '{nature,wineries,no_dirt_road}', updated_at = now()
 where id = 'd1111111-1111-4111-8111-111111111111';
select is((select interests from public.profiles where id = 'd1111111-1111-4111-8111-111111111111'),
          '{nature,wineries,no_dirt_road}'::text[], 'a pessoa escolhe os próprios gostos');
select throws_ok($$update public.profiles set interests = '{nature,karaoke}', updated_at = now() where id = 'd1111111-1111-4111-8111-111111111111'$$,
                 '23514', null, 'um gosto fora da lista é recusado');
update public.profiles set interests = '{beach}', updated_at = now() where id = 'd2222222-2222-4222-8222-222222222222';
select is((select interests from public.profiles where id = 'd2222222-2222-4222-8222-222222222222'), '{}'::text[],
          'ninguém muda os gostos de outra pessoa, nem de quem viaja junto');
select is(pg_temp.push1('{"seq":1,"table":"profiles","id":"d1111111-1111-4111-8111-111111111111","op":"patch","values":{"interests":["food","museums"]},"versions":{"interests":"2030-01-01T00:00:00Z"},"updated_at":"2030-01-01T00:00:00Z"}'),
          'applied||[]', 'os gostos sobem pela outbox, offline, como o carro');
select ok((select interests = '{food,museums}' and field_versions ? 'interests'
             from public.profiles where id = 'd1111111-1111-4111-8111-111111111111'),
          'e mudam, com a versão da coluna carimbada pelo sync_guard');
select is((select v -> 'profiles' -> 0 -> 'interests' from public.sync_pull_user('-infinity') v),
          '["food", "museums"]'::jsonb, 'o pull do usuário traz os gostos para o outro aparelho da pessoa');
select pg_temp.logout();

-- ------------------------------------------------------------------ lab_drop_trip
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at, deleted_at)
values ('e1733333-3333-4333-8333-333333333333', 'd3333333-3333-4333-8333-333333333333', 'Laboratório · conversa', '2026-11-20', '2026-11-20', now(), now()),
       ('e1744444-4444-4444-8444-444444444444', 'd3333333-3333-4333-8333-333333333333', 'Laboratório · viva', '2026-11-20', '2026-11-20', now(), null),
       ('e1755555-5555-4555-8555-555555555555', 'd3333333-3333-4333-8333-333333333333', 'Laboratório · com foto', '2026-11-20', '2026-11-20', now(), now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('e1733333-3333-4333-8333-333333333333', '2026-11-20'), 'e1733333-3333-4333-8333-333333333333', '2026-11-20', now()),
       (extensions.uuid_generate_v5('e1755555-5555-4555-8555-555555555555', '2026-11-20'), 'e1755555-5555-4555-8555-555555555555', '2026-11-20', now());
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
values ('e1700000-0000-4000-8000-000000000001', 'e1733333-3333-4333-8333-333333333333',
        extensions.uuid_generate_v5('e1733333-3333-4333-8333-333333333333', '2026-11-20'), 'a0', 'nature', 'Cascata', now()),
       ('e1700000-0000-4000-8000-000000000002', 'e1755555-5555-4555-8555-555555555555',
        extensions.uuid_generate_v5('e1755555-5555-4555-8555-555555555555', '2026-11-20'), 'a0', 'nature', 'Cascata', now());
insert into public.attachments (id, trip_id, stop_id, kind, storage_path, filename, mime, size_bytes, width, height, created_by, updated_at, synced_at)
values ('e1700000-0000-4000-8000-0000000000a1', 'e1755555-5555-4555-8555-555555555555', 'e1700000-0000-4000-8000-000000000002',
        'photo', 'e1755555-5555-4555-8555-555555555555/e1700000-0000-4000-8000-0000000000a1.jpg', 'foto.jpg', 'image/jpeg', 100,
        10, 10, 'd3333333-3333-4333-8333-333333333333', now(), now());

select pg_temp.login('d1111111-1111-4111-8111-111111111111');
select throws_ok($$select public.lab_drop_trip('e1722222-2222-4222-8222-222222222222')$$, '42501', null,
                 'quem não é do laboratório não expurga nada, nem a própria viagem excluída');
select pg_temp.logout();

select pg_temp.login('d3333333-3333-4333-8333-333333333333');
select throws_ok($$select public.lab_drop_trip('e1744444-4444-4444-8444-444444444444')$$, '42501', null,
                 'a viagem viva do laboratório não sai: primeiro a exclusão de sempre');
select throws_ok($$select public.lab_drop_trip('e1722222-2222-4222-8222-222222222222')$$, '42501', null,
                 'a viagem de outra pessoa, nunca');
select throws_ok($$select public.lab_drop_trip('e1755555-5555-4555-8555-555555555555')$$, '55000', null,
                 'com anexo, fica para o expurgo de sempre (o arquivo no Storage não sai pela cascata)');
select lives_ok($$select public.lab_drop_trip('e1733333-3333-4333-8333-333333333333')$$,
                'a viagem excluída do executor sai');
select pg_temp.logout();
select is((select count(*) from public.trips where id = 'e1733333-3333-4333-8333-333333333333'), 0::bigint,
          'a viagem saiu');
select is((select count(*) from public.trip_days where trip_id = 'e1733333-3333-4333-8333-333333333333')
          + (select count(*) from public.stops where trip_id = 'e1733333-3333-4333-8333-333333333333')
          + (select count(*) from public.trip_members where trip_id = 'e1733333-3333-4333-8333-333333333333'),
          0::bigint, 'e a cascata levou os dias, as paradas e o dono');
select ok((select horizon > now() - interval '1 minute' from private.user_horizons
            where user_id = 'd3333333-3333-4333-8333-333333333333'),
          'o horizonte do executor subiu: um aparelho com o cursor de antes recomeça do zero');
select is((select count(*) from public.trips where id in ('e1744444-4444-4444-8444-444444444444', 'e1755555-5555-4555-8555-555555555555',
                                                           'e1722222-2222-4222-8222-222222222222')),
          3::bigint, 'as outras continuam');

select * from finish();
rollback;
