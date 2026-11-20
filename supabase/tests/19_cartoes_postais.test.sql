-- A 0017 (fase 23): o objeto do OSM na parada, o kind `landmark`, o catálogo dos cartões-postais, os
-- lugares do app, a fila com o teto de 12 por viagem, o refazer, as RPCs (de quem está logado e do
-- servidor), o laboratório e o job do cron. E o que já existia continua valendo: as linhas de hoje
-- entram como entravam.
begin;
select plan(74);

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
-- o estado de uma chave na resposta da landmark_sync
create function pg_temp.state_of(r jsonb, k text) returns text language sql as $$
  select i ->> 'state' from jsonb_array_elements(r -> 'items') i where i ->> 'key' = k
$$;
create function pg_temp.item_of(r jsonb, k text) returns jsonb language sql as $$
  select i from jsonb_array_elements(r -> 'items') i where i ->> 'key' = k
$$;
create function pg_temp.place(k text, n text) returns jsonb language sql as $$
  select jsonb_build_object('key', k, 'kind', 'stop', 'name', n, 'lat', -25.4428, 'lng', -49.2392, 'stop_kind', 'nature')
$$;

-- p1 dona da viagem A; p2 membro de A; p3 dona da viagem B (outra viagem, outro time); p4 do laboratório
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'a9111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'p1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a9222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'p2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a9333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'p3@teste.local', 'x', now(), '{}', '{"name":"Outro"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a9444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'p4@teste.local', 'x', now(), '{}', '{"name":"Lab"}', now(), now(), '', '', '', '');
insert into private.lab_access (user_id, role) values ('a9444444-4444-4444-8444-444444444444', 'runner');

insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('e9111111-1111-4111-8111-111111111111', 'a9111111-1111-4111-8111-111111111111', 'Curitiba', '2026-12-11', '2026-12-14', now()),
       ('e9222222-2222-4222-8222-222222222222', 'a9333333-3333-4333-8333-333333333333', 'Outra', '2026-12-11', '2026-12-14', now()),
       ('e9444444-4444-4444-8444-444444444444', 'a9444444-4444-4444-8444-444444444444', 'Laboratório', '2026-12-11', '2026-12-14', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('e9111111-1111-4111-8111-111111111111', 'invite:p2@teste.local'), 'e9111111-1111-4111-8111-111111111111',
        'a9222222-2222-4222-8222-222222222222', 'p2@teste.local', 'member', 'accepted', 'a9111111-1111-4111-8111-111111111111', now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('e9111111-1111-4111-8111-111111111111', '2026-12-12'), 'e9111111-1111-4111-8111-111111111111', '2026-12-12', now());

-- ---------------------------------------------------------------- 1. o objeto do OSM na parada
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
  values ('e9500000-0000-4000-8000-000000000001', 'e9111111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e9111111-1111-4111-8111-111111111111', '2026-12-12'), 'a0', 'nature', 'Parque de hoje', now())$$,
  'uma parada como as de hoje, sem o objeto do OSM, entra');
select lives_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, osm_type, osm_id, updated_at)
  values ('e9500000-0000-4000-8000-000000000002', 'e9111111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e9111111-1111-4111-8111-111111111111', '2026-12-12'), 'a1', 'nature', 'Jardim Botânico', 'way', 607776738, now())$$,
  'a parada com o objeto do OSM entra');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, osm_type, updated_at)
  values ('e9500000-0000-4000-8000-000000000003', 'e9111111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e9111111-1111-4111-8111-111111111111', '2026-12-12'), 'a2', 'nature', 'Meio', 'way', now())$$,
  '23514', null, 'o tipo sem o id não entra (o par anda junto)');
select throws_ok($$insert into public.stops (id, trip_id, trip_day_id, position, kind, name, osm_type, osm_id, updated_at)
  values ('e9500000-0000-4000-8000-000000000004', 'e9111111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('e9111111-1111-4111-8111-111111111111', '2026-12-12'), 'a3', 'nature', 'Errado', 'area', 1, now())$$,
  '23514', null, 'nem um tipo fora de node, way e relation');

-- o sync leva as colunas novas, e um push sem elas (o app de antes) as deixa como estão
select pg_temp.login('a9111111-1111-4111-8111-111111111111');
select is((select (r ->> 'status') from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
  'seq', 1, 'table', 'stops', 'id', 'e9500000-0000-4000-8000-000000000002', 'op', 'patch',
  'values', jsonb_build_object('name', 'Jardim Botânico de Curitiba'), 'updated_at', now(),
  'versions', jsonb_build_object('name', now()))))) r), 'applied', 'um patch do app de antes aplica');
select pg_temp.logout();
select is((select osm_type || ':' || osm_id from public.stops where id = 'e9500000-0000-4000-8000-000000000002'),
          'way:607776738', 'e o objeto do OSM continua');

-- ---------------------------------------------------------------- 2. ai_imports
select lives_ok($$insert into public.ai_imports (user_id, kind, input_chars, model)
  values ('a9111111-1111-4111-8111-111111111111', 'landmark', 0, 'claude-sonnet-5-5')$$,
  'ai_imports aceita o kind landmark');
select lives_ok($$insert into public.ai_imports (user_id, kind, input_chars, model)
  values ('a9111111-1111-4111-8111-111111111111', 'receipt', 0, 'claude-sonnet-5-5')$$,
  'e os de antes continuam');
select throws_ok($$insert into public.ai_imports (user_id, kind, input_chars, model)
  values ('a9111111-1111-4111-8111-111111111111', 'chat', 0, 'claude-sonnet-5-5')$$,
  '23514', null, 'e um kind fora da lista não entra');

-- ---------------------------------------------------------------- 3. a fila pela landmark_sync
select pg_temp.login('a9333333-3333-4333-8333-333333333333');
select throws_ok($$select public.landmark_sync('e9111111-1111-4111-8111-111111111111', '[]')$$,
  '42501', null, 'quem não é da viagem não pede');
select pg_temp.logout();

select pg_temp.login('a9222222-2222-4222-8222-222222222222');
create temp table r1 as select public.landmark_sync('e9111111-1111-4111-8111-111111111111', jsonb_build_array(
  pg_temp.place('osm:w607776738', 'Jardim Botânico de Curitiba') || '{"osm_type": "way", "osm_id": 607776738}',
  pg_temp.place('geo:hotel-da-serra@-25.443,-49.239', 'Hotel da Serra'),
  pg_temp.place('nao-e-chave', 'Lixo'),
  jsonb_build_object('key', 'city:PR:ponta-grossa', 'kind', 'city', 'name', 'Ponta Grossa', 'uf', 'PR', 'lat', -25.09, 'lng', -50.16))) as r;
grant select on r1 to authenticated;
select is(pg_temp.state_of((select r from r1), 'osm:w607776738'), 'pending', 'um membro pede: o lugar novo entra na fila');
select is(((select r from r1) ->> 'new')::int, 3, 'três lugares novos (a chave inválida fica de fora)');
select is(pg_temp.state_of((select r from r1), 'nao-e-chave'), null, 'a chave inválida não aparece');
select pg_temp.logout();
select is((select count(*)::int from public.landmark_jobs where trip_id = 'e9111111-1111-4111-8111-111111111111'), 3,
          'três jobs de construção, da viagem A');
select is((select input ->> 'osm_type' || ':' || (input ->> 'osm_id') from public.landmark_jobs where place_key = 'osm:w607776738'),
          'way:607776738', 'o job leva o objeto do OSM que o app mandou');
select is((select requested_by from public.landmark_jobs where place_key = 'osm:w607776738'),
          'a9222222-2222-4222-8222-222222222222'::uuid, 'e quem pediu');

select pg_temp.login('a9111111-1111-4111-8111-111111111111');
select is(pg_temp.state_of(public.landmark_sync('e9111111-1111-4111-8111-111111111111',
            jsonb_build_array(pg_temp.place('osm:w607776738', 'Jardim Botânico de Curitiba'))), 'osm:w607776738'),
          'pending', 'pedir de novo não cria outro job');
select pg_temp.logout();
select is((select count(*)::int from public.landmark_jobs where place_key = 'osm:w607776738'), 1, 'um job por lugar');

-- o teto de 12 lugares novos por viagem
select pg_temp.login('a9111111-1111-4111-8111-111111111111');
create temp table r2 as select public.landmark_sync('e9111111-1111-4111-8111-111111111111',
  (select jsonb_agg(pg_temp.place(format('geo:lugar-%s@-25.%s,-49.239', i, lpad(i::text, 3, '0')), format('Lugar %s', i)))
     from generate_series(1, 11) i)) as r;
grant select on r2 to authenticated;
select is(((select r from r2) ->> 'new')::int, 9, 'só cabem mais nove: 3 + 9 = 12');
select is((select count(*)::int from jsonb_array_elements((select r from r2) -> 'items') i where i ->> 'state' = 'capped'), 2,
          'os dois que passam do teto ficam com a miniatura do tipo (capped)');
select pg_temp.logout();
-- (na viagem B, sem fila: na A o gatilho do teto dispara antes da chave estrangeira)
select throws_ok($$insert into public.landmark_jobs (place_key, trip_id, kind, input)
  values ('geo:lugar-11@-25.011,-49.239', 'e9222222-2222-4222-8222-222222222222', 'build', '{}')$$,
  '23503', null, 'sem o lugar não há job');
insert into public.landmark_places (place_key, kind) values ('geo:treze@-25.013,-49.239', 'stop');
select throws_ok($$insert into public.landmark_jobs (place_key, trip_id, kind, input)
  values ('geo:treze@-25.013,-49.239', 'e9111111-1111-4111-8111-111111111111', 'build', '{"name":"Treze"}')$$,
  '54000', 'landmark_trip_cap', 'o gatilho recusa o 13º lugar novo da viagem');

-- o laboratório lê, mas não enfileira lugar de verdade (só a medição)
select pg_temp.login('a9444444-4444-4444-8444-444444444444');
select is(pg_temp.state_of(public.landmark_sync('e9444444-4444-4444-8444-444444444444',
            jsonb_build_array(pg_temp.place('osm:n1', 'Catedral'))), 'osm:n1'),
          'none', 'o laboratório não cria fila para um lugar de verdade');
select is(pg_temp.state_of(public.landmark_sync('e9444444-4444-4444-8444-444444444444',
            jsonb_build_array(pg_temp.place('osm:n2', 'Catedral') || '{"measure": true}')), 'osm:n2'),
          'pending', 'a medição enfileira');
select pg_temp.logout();
select is((select count(*)::int from public.landmark_places where place_key = 'osm:n1'), 0, 'e nada ficou gravado do lugar recusado');
delete from public.landmark_jobs where place_key = 'osm:n2';
delete from public.landmark_places where place_key = 'osm:n2';

-- ---------------------------------------------------------------- 4. o trabalhador: um job por vez
select throws_ok($$select public.landmark_sync(null, '[]')$$, '42501', null, 'sem sessão, nada');
select pg_temp.login('a9111111-1111-4111-8111-111111111111');
select throws_ok($$select public.landmark_claim()$$, '42501', null, 'authenticated não pega job');
select throws_ok($$select public.landmark_verdict(gen_random_uuid(), 1, 'ok', null)$$, '42501', null, 'nem dá veredito');
select throws_ok($$select public.landmark_retire(gen_random_uuid(), 'x')$$, '42501', null, 'nem tira do ar');
select pg_temp.logout();

select ok(private.has_landmark_jobs(now()), 'há fila: o cron chama o trabalhador');
update public.landmark_jobs set run_after = now() - interval '1 hour' where place_key = 'osm:w607776738';
create temp table j1 as select public.landmark_claim() as j;
select is((select j ->> 'place_key' from j1), 'osm:w607776738', 'o job mais antigo primeiro');
select is((select (j ->> 'attempt')::int from j1), 1, 'primeira tentativa');
select is(public.landmark_claim(), null, 'com um job rodando, nenhum outro');
select ok(not private.has_landmark_jobs(now()), 'e o cron não chama');

-- o lugar identificado: o parque é o lugar, a estufa é a peça
select is((public.landmark_identified((select (j ->> 'id')::uuid from j1), 'wikidata:Q94923', 'Jardim Botânico de Curitiba', 'Q94923',
           '{"name": "Estufa", "osm": "way/261127581"}') ->> 'linked')::boolean, false, 'a peça nasce pendente');
select is((select status from public.landmark_places where place_key = 'osm:w607776738'), 'linked', 'o lugar aponta para ela');
select lives_ok($$select public.landmark_store((select (j ->> 'id')::uuid from j1), '{"v": 1, "shapes": []}',
  null, '{"photos": [{"title": "File:X.jpg", "license": "CC BY-SA 4.0"}]}')$$, 'a receita escrita entra');
select is((select status || '/' || version || '/' || generations from public.landmarks where key = 'wikidata:Q94923'),
          'generated/1/1', 'gerada, versão 1, uma geração');
select is((select status from public.landmark_jobs where place_key = 'osm:w607776738'), 'done', 'o job termina');

-- quem é da viagem que pediu recebe para conferir; a outra viagem não; ninguém lê a gerada direto
select pg_temp.login('a9222222-2222-4222-8222-222222222222');
select is(pg_temp.state_of(public.landmark_sync('e9111111-1111-4111-8111-111111111111',
            jsonb_build_array(pg_temp.place('osm:w607776738', 'Jardim Botânico de Curitiba'))), 'osm:w607776738'),
          'check', 'o membro da viagem que pediu recebe a receita para conferir');
select is((select count(*)::int from public.landmarks), 0, 'a gerada não aparece na leitura direta');
select pg_temp.logout();
select pg_temp.login('a9333333-3333-4333-8333-333333333333');
select is(pg_temp.state_of(public.landmark_sync('e9222222-2222-4222-8222-222222222222',
            jsonb_build_array(pg_temp.place('osm:w607776738', 'Jardim Botânico de Curitiba'))), 'osm:w607776738'),
          'pending', 'outra viagem espera a publicação');
select pg_temp.logout();
select is(public.landmark_check_target((select id from public.landmarks where key = 'wikidata:Q94923'),
          'a9333333-3333-4333-8333-333333333333'), null, 'e não recebe o alvo da conferência');
select is(public.landmark_check_target((select id from public.landmarks where key = 'wikidata:Q94923'),
          'a9222222-2222-4222-8222-222222222222') ->> 'round', '0', 'o membro recebe, na rodada 0');

-- a conferência: um ajuste (uma rodada), depois ok
select is(public.landmark_verdict((select id from public.landmarks where key = 'wikidata:Q94923'), 9, 'ok', null), 'stale',
          'um veredito sobre outra versão não vale');
select is(public.landmark_verdict((select id from public.landmarks where key = 'wikidata:Q94923'), 1, 'adjust',
          '{"v": 1, "shapes": [1]}'), 'adjusted', 'adjust troca a receita');
select is((select version || '/' || check_round from public.landmarks where key = 'wikidata:Q94923'), '2/1',
          'versão nova, rodada 1');
select is(public.landmark_verdict((select id from public.landmarks where key = 'wikidata:Q94923'), 2, 'ok', null), 'published',
          'ok publica');

-- publicada: todo mundo lê, e a segunda viagem recebe na hora
select pg_temp.login('a9333333-3333-4333-8333-333333333333');
create temp table r3 as select public.landmark_sync('e9222222-2222-4222-8222-222222222222',
  jsonb_build_array(pg_temp.place('osm:w607776738', 'Jardim Botânico de Curitiba'))) as r;
grant select on r3 to authenticated;
select is(pg_temp.state_of((select r from r3), 'osm:w607776738'), 'published', 'a segunda viagem recebe na hora, sem IA');
select is(pg_temp.item_of((select r from r3), 'osm:w607776738') -> 'recipe', '{"v": 1, "shapes": [1]}'::jsonb, 'com a receita');
select is((select count(*)::int from public.landmarks where key = 'wikidata:Q94923'), 1, 'a leitura direta mostra a publicada');
select throws_ok($$select sources from public.landmarks$$, '42501', null, 'mas não as fontes (nunca na tela)');
select throws_ok($$update public.landmarks set name = 'x'$$, '42501', null, 'e ninguém do app escreve');
select is(pg_temp.item_of((select r from r3), 'osm:w607776738') ->> 'can_remake', 'true',
          'a dona de uma viagem com a peça pode refazer');
select pg_temp.logout();
select pg_temp.login('a9222222-2222-4222-8222-222222222222');
select is(pg_temp.item_of(public.landmark_sync('e9111111-1111-4111-8111-111111111111',
            jsonb_build_array(pg_temp.place('osm:w607776738', 'Jardim Botânico de Curitiba'))), 'osm:w607776738') ->> 'can_remake',
          null, 'quem só é membro não refaz');

-- ---------------------------------------------------------------- 5. refazer
select throws_ok($$select public.landmark_remake('e9111111-1111-4111-8111-111111111111',
  (select id from public.landmarks where key = 'wikidata:Q94923'))$$, '42501', null, 'o membro não pede');
select pg_temp.logout();
select pg_temp.login('a9111111-1111-4111-8111-111111111111');
create temp table rm as select public.landmark_remake('e9111111-1111-4111-8111-111111111111',
  (select id from public.landmarks where key = 'wikidata:Q94923')) as id;
grant select on rm to authenticated;
select throws_ok($$select public.landmark_remake('e9111111-1111-4111-8111-111111111111',
  (select id from public.landmarks where key = 'wikidata:Q94923'))$$, '23505', null, 'uma vez por lugar');
select pg_temp.logout();
select is((select count(*)::int from public.landmark_jobs where remake_id = (select id from rm)), 2, 'duas variantes na fila');

-- as duas opções chegam; com as duas, o pedido espera a escolha (as variantes na frente da fila)
update public.landmark_jobs set run_after = now() - interval '30 minutes' where remake_id = (select id from rm);
create temp table j2 as select public.landmark_claim() as j;
select lives_ok($$select public.landmark_store((select (j ->> 'id')::uuid from j2), '{"v": 1, "shapes": [2]}', null, null)$$, 'a primeira opção');
create temp table j3 as select public.landmark_claim() as j;
select lives_ok($$select public.landmark_store((select (j ->> 'id')::uuid from j3), '{"v": 1, "shapes": [3]}', null, null)$$, 'a segunda');
select is((select status from public.landmark_remakes where id = (select id from rm)), 'choosing', 'espera a escolha');
select is((select generations from public.landmarks where key = 'wikidata:Q94923'), 3::smallint, 'três gerações: o teto da vida');

select pg_temp.login('a9333333-3333-4333-8333-333333333333');
select throws_ok($$select public.landmark_choose((select id from rm), 1)$$, '42501', null, 'só quem pediu escolhe');
select pg_temp.logout();
select pg_temp.login('a9111111-1111-4111-8111-111111111111');
select is(pg_temp.item_of(public.landmark_sync('e9111111-1111-4111-8111-111111111111',
            jsonb_build_array(pg_temp.place('osm:w607776738', 'Jardim Botânico de Curitiba'))), 'osm:w607776738') -> 'remake' -> 'options' -> 1,
          '{"v": 1, "shapes": [3]}'::jsonb, 'quem pediu vê as duas opções');
select is((public.landmark_choose((select id from rm), 2) ->> 'version')::int, 3, 'a escolhida vira a peça, numa versão nova');
select pg_temp.logout();
select is((select recipe from public.landmarks where key = 'wikidata:Q94923'), '{"v": 1, "shapes": [3]}'::jsonb,
          'para todos');

-- ---------------------------------------------------------------- 6. a falha e tirar do ar
create temp table j4 as select public.landmark_claim() as j;
select lives_ok($$select public.landmark_fail((select (j ->> 'id')::uuid from j4), 'no_wikidata', false)$$, 'sem referência');
select is((select status || ':' || code from public.landmark_places where place_key = (select j ->> 'place_key' from j4)),
          'none:no_wikidata', 'o lugar fica sem peça, com o código');
select public.landmark_retire((select id from public.landmarks where key = 'wikidata:Q94923'), 'pedido de tirar do ar');
select pg_temp.login('a9333333-3333-4333-8333-333333333333');
select is(pg_temp.state_of(public.landmark_sync('e9222222-2222-4222-8222-222222222222',
            jsonb_build_array(pg_temp.place('osm:w607776738', 'Jardim Botânico de Curitiba'))), 'osm:w607776738'),
          'none', 'tirada do ar: o app volta à miniatura do tipo');
select pg_temp.logout();

-- ---------------------------------------------------------------- 7. o laboratório semeia num lugar dele
select pg_temp.login('a9111111-1111-4111-8111-111111111111');
select throws_ok($$select public.lab_seed_landmark('geo:mirante-do-laboratorio@-29.285,-51.412', 'Estufa', '{"v": 1}')$$,
  '42501', null, 'quem não é do laboratório não semeia');
select pg_temp.logout();
select pg_temp.login('a9444444-4444-4444-8444-444444444444');
select throws_ok($$select public.lab_seed_landmark('osm:w607776738', 'Estufa', '{"v": 1}')$$,
  '22023', null, 'nem o laboratório num lugar de verdade');
select lives_ok($$select public.lab_seed_landmark('geo:mirante-do-laboratorio@-29.285,-51.412', 'Estufa', '{"v": 1}')$$,
  'o laboratório semeia no lugar dele');
select is(pg_temp.state_of(public.landmark_sync('e9444444-4444-4444-8444-444444444444',
            jsonb_build_array(pg_temp.place('geo:mirante-do-laboratorio@-29.285,-51.412', 'Mirante do laboratório'))),
            'geo:mirante-do-laboratorio@-29.285,-51.412'),
          'published', 'e a peça semeada aparece publicada');
select pg_temp.logout();

-- ---------------------------------------------------------------- 8. o cron
select is((select count(*)::int from cron.job where jobname = 'viajei-build-landmark' and schedule = '* * * * *'), 1,
          'o job do trabalhador, a cada minuto');

select * from finish();
rollback;
