begin;
select plan(27);

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

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'h1@teste.local', 'x', now(), '{}', '{"name":"Dono"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'h2@teste.local', 'x', now(), '{}', '{"name":"Membro"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'h3@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', '');

-- lote
select throws_ok($$select public.sync_push((select jsonb_agg(jsonb_build_object('seq', g)) from generate_series(1, 201) g))$$,
                 '22023', 'lote inválido', 'lote acima de 200 operações é recusado');
select throws_ok($$select public.sync_push('{"seq":1}'::jsonb)$$, '22023', 'lote inválido', 'lote tem de ser um array');

-- whitelist
select pg_temp.login('a1111111-1111-4111-8111-111111111111');
select is(pg_temp.push1('{"seq":1,"table":"profiles","id":"a1111111-1111-4111-8111-111111111111","op":"patch","values":{"name":"x"},"versions":{"name":"2026-11-01T10:00:00-03:00"},"updated_at":"2026-11-01T10:00:00-03:00"}'),
          'error|42501|[]', 'tabela fora da whitelist devolve error 42501');

-- upsert cria a viagem como o usuário (RLS vale) e o dono entra em trip_members pelo trigger
select is(pg_temp.push1(jsonb_build_object('seq', 2, 'table', 'trips', 'id', 'b1111111-1111-4111-8111-111111111111', 'op', 'upsert',
            'values', jsonb_build_object('owner_id', 'a1111111-1111-4111-8111-111111111111', 'name', 'Serra', 'start_date', '2026-12-11', 'end_date', '2026-12-14', 'notes', 'inicial'),
            'versions', jsonb_build_object('name', '2026-11-01T10:00:00-03:00', 'notes', '2026-11-01T10:00:00-03:00'),
            'updated_at', '2026-11-01T10:00:00-03:00')),
          'applied||[]', 'upsert cria a viagem');
select is((select role || '|' || status from public.trip_members where trip_id = 'b1111111-1111-4111-8111-111111111111' and user_id = 'a1111111-1111-4111-8111-111111111111'),
          'owner|accepted', 'o dono entra em trip_members pelo trigger');
select is(pg_temp.push1(jsonb_build_object('seq', 3, 'table', 'trips', 'id', 'b2222222-2222-4222-8222-222222222222', 'op', 'upsert',
            'values', jsonb_build_object('owner_id', 'a2222222-2222-4222-8222-222222222222', 'name', 'Alheia', 'start_date', '2026-12-11', 'end_date', '2026-12-14'),
            'versions', '{}'::jsonb, 'updated_at', '2026-11-01T10:00:00-03:00')),
          'error|42501|[]', 'upsert em nome de outra pessoa cai na RLS e vira error 42501');

-- upsert repetido da mesma linha vira patch: aplica o que mudou
select is(pg_temp.push1(jsonb_build_object('seq', 4, 'table', 'trips', 'id', 'b1111111-1111-4111-8111-111111111111', 'op', 'upsert',
            'values', jsonb_build_object('owner_id', 'a1111111-1111-4111-8111-111111111111', 'name', 'Serra Gaúcha', 'start_date', '2026-12-11', 'end_date', '2026-12-14', 'notes', 'inicial'),
            'versions', jsonb_build_object('name', '2026-11-01T11:00:00-03:00'),
            'updated_at', '2026-11-01T11:00:00-03:00')),
          'applied||[]', 'upsert de linha existente vira patch');
select is((select name from public.trips where id = 'b1111111-1111-4111-8111-111111111111'), 'Serra Gaúcha', 'e o nome mudou');

-- patch: versão nova vence
select is(pg_temp.push1('{"seq":5,"table":"trips","id":"b1111111-1111-4111-8111-111111111111","op":"patch","values":{"notes":"nova"},"versions":{"notes":"2026-11-02T10:00:00-03:00"},"updated_at":"2026-11-02T10:00:00-03:00"}'),
          'applied||[]', 'patch com versão mais nova é aplicado');
-- patch: versão antiga em tudo → stale
select is(pg_temp.push1('{"seq":6,"table":"trips","id":"b1111111-1111-4111-8111-111111111111","op":"patch","values":{"notes":"velha"},"versions":{"notes":"2026-10-01T10:00:00-03:00"},"updated_at":"2026-10-01T10:00:00-03:00"}'),
          'stale||[]', 'patch só com versões antigas é stale');
select is((select notes from public.trips where id = 'b1111111-1111-4111-8111-111111111111'), 'nova', 'e a linha não mudou');
-- conflito por coluna: notes antigo e origin novo na mesma operação
select is(pg_temp.push1('{"seq":7,"table":"trips","id":"b1111111-1111-4111-8111-111111111111","op":"patch","values":{"notes":"antiga de novo","origin":"Papanduva"},"versions":{"notes":"2026-10-15T10:00:00-03:00","origin":"2026-11-03T10:00:00-03:00"},"updated_at":"2026-11-03T10:00:00-03:00"}'),
          'applied||["notes"]', 'coluna superada é devolvida em superseded e a outra é aplicada');
select is((select notes || '|' || origin from public.trips where id = 'b1111111-1111-4111-8111-111111111111'), 'nova|Papanduva', 'notes ficou e origin entrou');
-- C4: operação sem versions usa a hora do servidor e não mexe nas versões das outras colunas
select is(pg_temp.push1('{"seq":8,"table":"trips","id":"b1111111-1111-4111-8111-111111111111","op":"patch","values":{"budget":1500},"updated_at":"2026-11-03T12:00:00-03:00"}'),
          'applied||[]', 'patch sem versions é aplicado');
select is((select (field_versions ->> 'origin')::timestamptz from public.trips where id = 'b1111111-1111-4111-8111-111111111111'),
          '2026-11-03T10:00:00-03:00'::timestamptz, 'e as versões das outras colunas ficam como estavam');
-- coluna imutável
select is(pg_temp.push1('{"seq":9,"table":"trips","id":"b1111111-1111-4111-8111-111111111111","op":"patch","values":{"owner_id":"a2222222-2222-4222-8222-222222222222"},"versions":{"owner_id":"2026-11-04T10:00:00-03:00"},"updated_at":"2026-11-04T10:00:00-03:00"}'),
          'error|42501|[]', 'coluna imutável devolve error 42501');
-- C5: linha inexistente
select is(pg_temp.push1('{"seq":10,"table":"trips","id":"b9999999-9999-4999-8999-999999999999","op":"patch","values":{"notes":"x"},"versions":{"notes":"2026-11-04T10:00:00-03:00"},"updated_at":"2026-11-04T10:00:00-03:00"}'),
          'error|P0002|[]', 'linha inexistente devolve error P0002');

-- C3: reconvite de quem recusou. O upsert cai na linha existente; só deleted_at, updated_at e field_versions
-- são atualizáveis pelo dono, então o grant de coluna não derruba a operação e o convite reativa.
select is(pg_temp.push1(jsonb_build_object('seq', 11, 'table', 'trip_members', 'id', extensions.uuid_generate_v5('b1111111-1111-4111-8111-111111111111', 'invite:h2@teste.local'), 'op', 'upsert',
            'values', jsonb_build_object('trip_id', 'b1111111-1111-4111-8111-111111111111', 'invited_email', 'h2@teste.local', 'role', 'member', 'status', 'pending', 'invited_by', 'a1111111-1111-4111-8111-111111111111', 'deleted_at', null),
            'versions', jsonb_build_object('deleted_at', '2026-11-04T10:00:00-03:00'), 'updated_at', '2026-11-04T10:00:00-03:00')),
          'applied||[]', 'o dono convida pelo push');
select pg_temp.logout();
update public.trip_members set deleted_at = '2026-11-04T11:00:00-03:00', field_versions = '{"deleted_at":"2026-11-04T11:00:00-03:00"}'
 where invited_email = 'h2@teste.local';   -- recusou
select pg_temp.login('a1111111-1111-4111-8111-111111111111');
select is(pg_temp.push1(jsonb_build_object('seq', 12, 'table', 'trip_members', 'id', extensions.uuid_generate_v5('b1111111-1111-4111-8111-111111111111', 'invite:h2@teste.local'), 'op', 'upsert',
            'values', jsonb_build_object('trip_id', 'b1111111-1111-4111-8111-111111111111', 'invited_email', 'h2@teste.local', 'role', 'member', 'status', 'pending', 'invited_by', 'a1111111-1111-4111-8111-111111111111', 'deleted_at', null),
            'versions', jsonb_build_object('deleted_at', '2026-11-04T12:00:00-03:00'), 'updated_at', '2026-11-04T12:00:00-03:00')),
          'applied||[]', 'reconvite de quem recusou é aplicado (só deleted_at muda)');
select is((select deleted_at from public.trip_members where invited_email = 'h2@teste.local'), null, 'e o convite volta a valer');

-- pull do dono: viagem, membros, perfis e server_time
select ok((select v ? 'server_time' and jsonb_array_length(v -> 'trips') = 1 and jsonb_array_length(v -> 'trip_members') = 2
                  and (v -> 'profiles' -> 0 ->> 'name') = 'Dono' and not (v -> 'trips' -> 0) ? 'field_versions'
             from public.sync_pull('b1111111-1111-4111-8111-111111111111', '-infinity') v),
          'sync_pull devolve viagem, membros e perfis desde o início, sem field_versions');
select is((select jsonb_array_length(v -> 'trips') from public.sync_pull('b1111111-1111-4111-8111-111111111111', now() + interval '1 minute') v),
          0, 'cursor no futuro não traz nada');
select is((select jsonb_array_length(v -> 'memberships') from public.sync_pull_user('-infinity') v), 1, 'sync_pull_user devolve as próprias participações');

-- intruso: revoked no pull, P0002 no push (a linha é invisível)
select pg_temp.login('a3333333-3333-4333-8333-333333333333');
select is((select (v ->> 'revoked')::boolean from public.sync_pull('b1111111-1111-4111-8111-111111111111', '-infinity') v), true, 'quem não é membro recebe revoked');
select is(pg_temp.push1('{"seq":13,"table":"trips","id":"b1111111-1111-4111-8111-111111111111","op":"patch","values":{"notes":"invasão"},"versions":{"notes":"2026-11-05T10:00:00-03:00"},"updated_at":"2026-11-05T10:00:00-03:00"}'),
          'error|P0002|[]', 'patch de quem não é membro devolve P0002, igual a linha inexistente');

-- Realtime: o broadcast do insert da viagem está em realtime.messages; só o membro lê o tópico dela
select pg_temp.logout();
select pg_temp.login('a1111111-1111-4111-8111-111111111111');
select set_config('realtime.topic', 'trip:b1111111-1111-4111-8111-111111111111', true);
select ok((select count(*) >= 1 from realtime.messages where topic = 'trip:b1111111-1111-4111-8111-111111111111' and extension = 'broadcast'),
          'membro lê as mensagens do tópico da viagem');
select pg_temp.logout();
select pg_temp.login('a3333333-3333-4333-8333-333333333333');
select set_config('realtime.topic', 'trip:b1111111-1111-4111-8111-111111111111', true);
select is((select count(*) from realtime.messages where topic = 'trip:b1111111-1111-4111-8111-111111111111'), 0::bigint, 'intruso não lê o tópico');

select * from finish();
rollback;
