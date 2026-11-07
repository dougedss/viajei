begin;
select plan(65);

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
-- só o aviso de véspera desta viagem: outros dados do banco não interferem
create function pg_temp.eve_count(p_user uuid, p_now timestamptz) returns bigint language sql as $$
  select count(*) from public.due_notifications(p_now) d
   where d.user_id = p_user and d.kind = 'eve_checklist' and d.trip_id = 'd9111111-1111-4111-8111-111111111111'
$$;

-- d1 dona da viagem T; d2 e d4 membros aceitos (d4 sai no meio); d3 intruso (dono da viagem U);
-- d5 convite pendente; d6 membro já removido
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'd1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'l1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'd2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'l2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'd3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'l3@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'd4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'l4@teste.local', 'x', now(), '{}', '{"name":"Bia"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'd5555555-5555-4555-8555-555555555555', 'authenticated', 'authenticated', 'l5@teste.local', 'x', now(), '{}', '{"name":"Caio"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'd6666666-6666-4666-8666-666666666666', 'authenticated', 'authenticated', 'l6@teste.local', 'x', now(), '{}', '{"name":"Duda"}', now(), now(), '', '', '', '');

insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('d9111111-1111-4111-8111-111111111111', 'd1111111-1111-4111-8111-111111111111', 'RS — concurso em Montenegro', '2026-12-11', '2026-12-14', now()),
       ('d9222222-2222-4222-8222-222222222222', 'd3333333-3333-4333-8333-333333333333', 'Viagem do intruso', '2026-12-11', '2026-12-14', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at, deleted_at)
values
 (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'invite:l2@teste.local'), 'd9111111-1111-4111-8111-111111111111',
  'd2222222-2222-4222-8222-222222222222', 'l2@teste.local', 'member', 'accepted', 'd1111111-1111-4111-8111-111111111111', now(), null),
 (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'invite:l4@teste.local'), 'd9111111-1111-4111-8111-111111111111',
  'd4444444-4444-4444-8444-444444444444', 'l4@teste.local', 'member', 'accepted', 'd1111111-1111-4111-8111-111111111111', now(), null),
 (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'invite:l5@teste.local'), 'd9111111-1111-4111-8111-111111111111',
  'd5555555-5555-4555-8555-555555555555', 'l5@teste.local', 'member', 'pending', 'd1111111-1111-4111-8111-111111111111', now(), null),
 (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'invite:l6@teste.local'), 'd9111111-1111-4111-8111-111111111111',
  'd6666666-6666-4666-8666-666666666666', 'l6@teste.local', 'member', 'accepted', 'd1111111-1111-4111-8111-111111111111', now(), now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), 'd9111111-1111-4111-8111-111111111111', '2026-12-11', now()),
       (extensions.uuid_generate_v5('d9222222-2222-4222-8222-222222222222', '2026-12-11'), 'd9222222-2222-4222-8222-222222222222', '2026-12-11', now());
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, time, updated_at)
values ('da111111-1111-4111-8111-111111111111', 'd9111111-1111-4111-8111-111111111111',
        extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), 'a0', 'nature', 'Cascata do Caracol', '13:30', now()),
       ('da222222-2222-4222-8222-222222222222', 'd9111111-1111-4111-8111-111111111111',
        extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', '2026-12-11'), 'a1', 'food', 'Restaurante dos Bifes', '19:00', now()),
       ('db111111-1111-4111-8111-111111111111', 'd9222222-2222-4222-8222-222222222222',
        extensions.uuid_generate_v5('d9222222-2222-4222-8222-222222222222', '2026-12-11'), 'a0', 'nature', 'Parque do intruso', '10:00', now());
insert into public.reservations (id, trip_id, type, name, amount, created_by, updated_at)
values ('dc111111-1111-4111-8111-111111111111', 'd9111111-1111-4111-8111-111111111111', 'hotel', 'Hotel Steffen', 560,
        'd1111111-1111-4111-8111-111111111111', now()),
       ('dc222222-2222-4222-8222-222222222222', 'd9222222-2222-4222-8222-222222222222', 'hotel', 'Hotel do intruso', 300,
        'd3333333-3333-4333-8333-333333333333', now());

-- ---------------------------------------------------------------- whitelist
select is((select string_agg(name || ':' || rank, ',' order by name) from private.sync_tables
            where name in ('checklist_items', 'contacts', 'expenses')),
          'checklist_items:50,contacts:30,expenses:55',
          'as três tabelas entram na whitelist; o gasto depois da reserva (55)');

-- ---------------------------------------------------------------- checklist_items
select pg_temp.login('d2222222-2222-4222-8222-222222222222');
select lives_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, created_by, updated_at)
  values ('dd111111-1111-4111-8111-111111111111', 'd9111111-1111-4111-8111-111111111111', 'before',
          'Revisar pneus, óleo e estepe', 'a0', 'd2222222-2222-4222-8222-222222222222', now())$$,
  'membro cria um item de "antes"');
select lives_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, points, stop_id, source, created_by, updated_at)
  values (extensions.uuid_generate_v5('da111111-1111-4111-8111-111111111111', 'quest:nature'), 'd9111111-1111-4111-8111-111111111111',
          'quest', 'Foto do time com a paisagem', 'a0', 20, 'da111111-1111-4111-8111-111111111111', 'system',
          'd2222222-2222-4222-8222-222222222222', now())$$,
  'a sugestão adicionada vira missão de sistema com id v5(stop_id, quest:regra)');
select lives_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, points, stop_id, created_by, updated_at)
  values ('dd222222-2222-4222-8222-222222222222', 'd9111111-1111-4111-8111-111111111111', 'quest',
          'Provar o prato da casa', 'a1', 10, 'da222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', now())$$,
  'missão da pessoa ligada a uma parada');
select lives_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, source, status, created_by, updated_at)
  values (extensions.uuid_generate_v5('d9111111-1111-4111-8111-111111111111', 'pack:repellent'), 'd9111111-1111-4111-8111-111111111111',
          'pack', 'Repelente', 'a0', 'system', 'dismissed', 'd2222222-2222-4222-8222-222222222222', now())$$,
  'sugestão dispensada é uma linha viva com status dismissed');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, points, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'quest', 'x', 'a2', 40,
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'missão acima de 30 pontos cai no check');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, points, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'quest', 'x', 'a2', 5,
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'missão abaixo de 10 pontos cai no check');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, points, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'before', 'x', 'a1', 10,
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'item que não é missão não vale pontos');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, stop_id, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'before', 'x', 'a1', 'da111111-1111-4111-8111-111111111111',
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'só missão se liga a parada');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, points, stop_id, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'quest', 'x', 'a2', 10, 'db111111-1111-4111-8111-111111111111',
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23503', null, 'FK composta recusa parada de outra viagem');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, done_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'before', 'x', 'a1', 'd2222222-2222-4222-8222-222222222222',
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'done_by sem done_at cai no check');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, done_at, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'before', 'x', 'a1', now(),
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'done_at sem done_by também');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'before', 'x', 'a1',
          'd1111111-1111-4111-8111-111111111111', now())$$,
  '42501', null, 'item com created_by de outra pessoa é recusado');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, status, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'before', 'x', 'a1', 'archived',
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'status fora da lista cai no check');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'before', '', 'a1',
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'texto vazio cai no check');
select lives_ok($$update public.checklist_items set done_by = 'd2222222-2222-4222-8222-222222222222', done_at = now(), updated_at = now()
                   where id = 'dd111111-1111-4111-8111-111111111111'$$,
  'marcar grava quem e quando, juntos');
select throws_ok($$update public.checklist_items set kind = 'pack', updated_at = now()
                   where id = 'dd111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'kind é imutável');
select lives_ok($$update public.checklist_items set created_by = 'd1111111-1111-4111-8111-111111111111', updated_at = now()
                   where id = 'dd111111-1111-4111-8111-111111111111'$$,
  'um update que traz outro created_by não vira erro');
select is((select created_by from public.checklist_items where id = 'dd111111-1111-4111-8111-111111111111'),
          'd2222222-2222-4222-8222-222222222222'::uuid, 'created_by é preservado: quem criou fica');
-- a mesma sugestão respondida por outra pessoa, noutro aparelho: o mesmo id pelo sync_push, sem erro
select pg_temp.login('d4444444-4444-4444-8444-444444444444');
select is((select r ->> 'status' from jsonb_array_elements(public.sync_push(jsonb_build_array(jsonb_build_object(
            'seq', 1, 'table', 'checklist_items', 'op', 'upsert',
            'id', extensions.uuid_generate_v5('da111111-1111-4111-8111-111111111111', 'quest:nature'),
            'values', jsonb_build_object('trip_id', 'd9111111-1111-4111-8111-111111111111', 'kind', 'quest',
                        'text', 'Foto do time com a paisagem', 'position', 'a0', 'points', 20,
                        'stop_id', 'da111111-1111-4111-8111-111111111111', 'source', 'system', 'status', 'dismissed',
                        'done_by', null, 'done_at', null, 'deleted_at', null,
                        'created_by', 'd4444444-4444-4444-8444-444444444444'),
            'versions', jsonb_build_object('status', '2099-01-01T00:00:00Z', 'created_by', '2099-01-01T00:00:00Z'),
            'updated_at', '2099-01-01T00:00:00Z')))) r),
          'applied', 'a segunda pessoa que responde a mesma sugestão escreve a mesma linha, sem erro');
select is((select created_by::text || '|' || status from public.checklist_items
            where id = extensions.uuid_generate_v5('da111111-1111-4111-8111-111111111111', 'quest:nature')),
          'd2222222-2222-4222-8222-222222222222|dismissed', 'a última resposta vale e quem criou primeiro fica');
select pg_temp.login('d2222222-2222-4222-8222-222222222222');

select pg_temp.login('d3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.checklist_items where trip_id = 'd9111111-1111-4111-8111-111111111111'), 0::bigint,
          'intruso não vê as listas');
select throws_ok($$insert into public.checklist_items (id, trip_id, kind, text, position, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'before', 'x', 'a1',
          'd3333333-3333-4333-8333-333333333333', now())$$,
  '42501', null, 'nem escreve nelas');
select pg_temp.login('d1111111-1111-4111-8111-111111111111');
select is((select count(*) from public.checklist_items where trip_id = 'd9111111-1111-4111-8111-111111111111'), 4::bigint,
          'a dona vê os itens do membro, a dispensada inclusive');

-- ---------------------------------------------------------------- contacts
select pg_temp.login('d2222222-2222-4222-8222-222222222222');
select lives_ok($$insert into public.contacts (id, trip_id, name, phone, type, updated_at)
  values ('de111111-1111-4111-8111-111111111111', 'd9111111-1111-4111-8111-111111111111', 'Restaurante dos Bifes',
          '+5551997527596', 'restaurant', now())$$,
  'membro cadastra um contato do tipo restaurante');
select throws_ok($$insert into public.contacts (id, trip_id, name, phone, type, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'Hotel Steffen', '(51) 99752-7596', 'hotel', now())$$,
  '23514', null, 'telefone fora de E.164 cai no check');
select throws_ok($$insert into public.contacts (id, trip_id, name, phone, type, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'Delegacia', '+555132100000', 'police', now())$$,
  '23514', null, 'tipo fora da lista cai no check');
select pg_temp.login('d3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.contacts where trip_id = 'd9111111-1111-4111-8111-111111111111'), 0::bigint,
          'intruso não vê os contatos');
select pg_temp.login('d1111111-1111-4111-8111-111111111111');
select is((select count(*) from public.contacts where trip_id = 'd9111111-1111-4111-8111-111111111111'), 1::bigint,
          'a dona vê o contato do membro');

-- ---------------------------------------------------------------- expenses
select pg_temp.login('d2222222-2222-4222-8222-222222222222');
select lives_ok($$insert into public.expenses (id, trip_id, stop_id, amount, category, date, paid_by, created_by, updated_at)
  values ('df111111-1111-4111-8111-111111111111', 'd9111111-1111-4111-8111-111111111111', 'da222222-2222-4222-8222-222222222222',
          85.50, 'food', '2026-12-11', 'd2222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', now())$$,
  'membro lança um gasto que ele pagou, na parada');
select lives_ok($$insert into public.expenses (id, trip_id, amount, category, date, paid_by, created_by, updated_at)
  values ('df222222-2222-4222-8222-222222222222', 'd9111111-1111-4111-8111-111111111111', 120, 'fuel', '2026-12-11',
          'd4444444-4444-4444-8444-444444444444', 'd2222222-2222-4222-8222-222222222222', now())$$,
  'e um que outro membro aceito pagou');
select lives_ok($$insert into public.expenses (id, trip_id, reservation_id, amount, category, date, paid_by, created_by, updated_at)
  values (extensions.uuid_generate_v5('dc111111-1111-4111-8111-111111111111', 'expense'), 'd9111111-1111-4111-8111-111111111111',
          'dc111111-1111-4111-8111-111111111111', 560, 'lodging', '2026-12-11', 'd1111111-1111-4111-8111-111111111111',
          'd2222222-2222-4222-8222-222222222222', now())$$,
  'o gasto da reserva tem id v5(reservation_id, expense)');
select throws_ok($$insert into public.expenses (id, trip_id, reservation_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'dc111111-1111-4111-8111-111111111111', 560, 'lodging',
          '2026-12-11', 'd2222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'gasto de reserva com outro id cai no check: a reserva não conta duas vezes');
select throws_ok($$insert into public.expenses (id, trip_id, reservation_id, amount, category, date, paid_by, created_by, updated_at)
  values (extensions.uuid_generate_v5('dc222222-2222-4222-8222-222222222222', 'expense'), 'd9111111-1111-4111-8111-111111111111',
          'dc222222-2222-4222-8222-222222222222', 300, 'lodging', '2026-12-11', 'd2222222-2222-4222-8222-222222222222',
          'd2222222-2222-4222-8222-222222222222', now())$$,
  '23503', null, 'FK composta recusa reserva de outra viagem');
select throws_ok($$insert into public.expenses (id, trip_id, stop_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 'db111111-1111-4111-8111-111111111111', 10, 'food',
          '2026-12-11', 'd2222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', now())$$,
  '23503', null, 'FK composta recusa parada de outra viagem');
select throws_ok($$insert into public.expenses (id, trip_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 0, 'food', '2026-12-11',
          'd2222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'valor zero cai no check');
select throws_ok($$insert into public.expenses (id, trip_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', -10, 'food', '2026-12-11',
          'd2222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'valor negativo cai no check');
select throws_ok($$insert into public.expenses (id, trip_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 10, 'gifts', '2026-12-11',
          'd2222222-2222-4222-8222-222222222222', 'd2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'categoria fora da lista cai no check');
select throws_ok($$insert into public.expenses (id, trip_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 10, 'food', '2026-12-11',
          'd2222222-2222-4222-8222-222222222222', 'd1111111-1111-4111-8111-111111111111', now())$$,
  '42501', null, 'gasto com created_by de outra pessoa é recusado');
select throws_ok($$insert into public.expenses (id, trip_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 10, 'food', '2026-12-11',
          'd3333333-3333-4333-8333-333333333333', 'd2222222-2222-4222-8222-222222222222', now())$$,
  '42501', 'quem pagou não é do time', 'quem pagou tem de ser do time: quem não é membro é recusado');
select throws_ok($$insert into public.expenses (id, trip_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 10, 'food', '2026-12-11',
          'd5555555-5555-4555-8555-555555555555', 'd2222222-2222-4222-8222-222222222222', now())$$,
  '42501', 'quem pagou não é do time', 'convite pendente também');
select throws_ok($$insert into public.expenses (id, trip_id, amount, category, date, paid_by, created_by, updated_at)
  values (gen_random_uuid(), 'd9111111-1111-4111-8111-111111111111', 10, 'food', '2026-12-11',
          'd6666666-6666-4666-8666-666666666666', 'd2222222-2222-4222-8222-222222222222', now())$$,
  '42501', 'quem pagou não é do time', 'e membro removido também');
select throws_ok($$update public.expenses set reservation_id = 'dc111111-1111-4111-8111-111111111111', updated_at = now()
                   where id = 'df222222-2222-4222-8222-222222222222'$$,
  '23514', null, 'um gasto não passa a ser o de uma reserva (o id não bate)');
select lives_ok($$update public.expenses set created_by = 'd1111111-1111-4111-8111-111111111111', updated_at = now()
                   where id = 'df111111-1111-4111-8111-111111111111'$$,
  'um update do gasto que traz outro created_by não vira erro');
select is((select created_by from public.expenses where id = 'df111111-1111-4111-8111-111111111111'),
          'd2222222-2222-4222-8222-222222222222'::uuid, 'created_by do gasto é preservado: quem lançou fica');
select pg_temp.login('d3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.expenses where trip_id = 'd9111111-1111-4111-8111-111111111111'), 0::bigint,
          'intruso não vê os gastos');
select pg_temp.login('d1111111-1111-4111-8111-111111111111');
select is((select count(*) from public.expenses where trip_id = 'd9111111-1111-4111-8111-111111111111'), 3::bigint,
          'a dona vê os gastos do time');

-- quem pagou sai da viagem: o gasto continua editável; só não se troca o pagador para quem saiu
select lives_ok($$update public.trip_members set deleted_at = now(), updated_at = now()
                   where trip_id = 'd9111111-1111-4111-8111-111111111111' and user_id = 'd4444444-4444-4444-8444-444444444444'$$,
  'a dona remove Bia, que pagou um gasto');
select pg_temp.login('d2222222-2222-4222-8222-222222222222');
select lives_ok($$update public.expenses set notes = 'Posto em Lages', updated_at = now()
                   where id = 'df222222-2222-4222-8222-222222222222'$$,
  'o gasto de quem saiu ainda se edita');
select lives_ok($$update public.expenses set deleted_at = now(), updated_at = now()
                   where id = 'df222222-2222-4222-8222-222222222222'$$,
  'e se exclui');
select throws_ok($$update public.expenses set paid_by = 'd4444444-4444-4444-8444-444444444444', updated_at = now()
                   where id = 'df111111-1111-4111-8111-111111111111'$$,
  '42501', 'quem pagou não é do time', 'trocar quem pagou para quem saiu é recusado');
select lives_ok($$update public.expenses set paid_by = 'd1111111-1111-4111-8111-111111111111', updated_at = now()
                   where id = 'df111111-1111-4111-8111-111111111111'$$,
  'trocar para um membro aceito passa');

-- ---------------------------------------------------------------- sync_pull
select is((select jsonb_array_length(v -> 'checklist_items') || '|' || jsonb_array_length(v -> 'contacts') || '|' || jsonb_array_length(v -> 'expenses')
             from public.sync_pull('d9111111-1111-4111-8111-111111111111', '-infinity') v),
          '4|1|3', 'sync_pull devolve itens, contatos e gastos (lápides inclusive)');
select pg_temp.logout();

-- ---------------------------------------------------------------- expurgo de uma parada: o dinheiro e a missão ficam
delete from public.stops where id = 'da222222-2222-4222-8222-222222222222';
select is((select count(*) from public.expenses where id = 'df111111-1111-4111-8111-111111111111' and stop_id is null), 1::bigint,
          'apagar a parada de verdade deixa o gasto, sem a parada');
select is((select count(*) from public.checklist_items where id = 'dd222222-2222-4222-8222-222222222222' and stop_id is null), 1::bigint,
          'e a missão da pessoa, sem a parada');

-- ---------------------------------------------------------------- eve_checklist (véspera do start_date, 19:00 de São Paulo)
-- antes: o já marcado (dd111111) + dois faltando + um dispensado + um apagado; mala: o dispensado da
-- sugestão + um faltando + um marcado + um sugerido pela IA. Faltam 2 de antes e 1 da mala.
insert into public.checklist_items (id, trip_id, kind, text, position, status, done_by, done_at, created_by, updated_at, deleted_at)
values ('dd333333-3333-4333-8333-333333333333', 'd9111111-1111-4111-8111-111111111111', 'before', 'Comprar o ingresso do Caracol', 'a1',
        'active', null, null, 'd1111111-1111-4111-8111-111111111111', now(), null),
       ('dd444444-4444-4444-8444-444444444444', 'd9111111-1111-4111-8111-111111111111', 'before', 'Guardar as confirmações', 'a2',
        'active', null, null, 'd1111111-1111-4111-8111-111111111111', now(), null),
       ('dd555555-5555-4555-8555-555555555555', 'd9111111-1111-4111-8111-111111111111', 'before', 'Dispensado', 'a3',
        'dismissed', null, null, 'd1111111-1111-4111-8111-111111111111', now(), null),
       ('dd666666-6666-4666-8666-666666666666', 'd9111111-1111-4111-8111-111111111111', 'before', 'Apagado', 'a4',
        'active', null, null, 'd1111111-1111-4111-8111-111111111111', now(), now()),
       ('dd777777-7777-4777-8777-777777777777', 'd9111111-1111-4111-8111-111111111111', 'pack', 'Protetor solar', 'a1',
        'active', null, null, 'd1111111-1111-4111-8111-111111111111', now(), null),
       ('dd888888-8888-4888-8888-888888888888', 'd9111111-1111-4111-8111-111111111111', 'pack', 'Blusa fina', 'a2',
        'active', 'd1111111-1111-4111-8111-111111111111', now(), 'd1111111-1111-4111-8111-111111111111', now(), null),
       ('dd999999-9999-4999-8999-999999999999', 'd9111111-1111-4111-8111-111111111111', 'pack', 'Sugerido', 'a3',
        'suggested', null, null, 'd1111111-1111-4111-8111-111111111111', now(), null);

select is(pg_temp.eve_count('d1111111-1111-4111-8111-111111111111', '2026-12-10 22:00+00'), 1::bigint,
          'eve_checklist vence na véspera às 19:00 de São Paulo (22:00 UTC) para a dona');
select is(pg_temp.eve_count('d2222222-2222-4222-8222-222222222222', '2026-12-10 22:00+00'), 1::bigint, 'e para o membro');
select is(pg_temp.eve_count('d4444444-4444-4444-8444-444444444444', '2026-12-10 22:00+00'), 0::bigint, 'não para quem saiu da viagem');
select is((select (d.data ->> 'before_left') || '|' || (d.data ->> 'pack_left') || '|' || (d.data ->> 'first_time') || '|' || (d.data ->> 'start_date')
             from public.due_notifications('2026-12-10 22:00+00') d
            where d.user_id = 'd1111111-1111-4111-8111-111111111111' and d.kind = 'eve_checklist'
              and d.trip_id = 'd9111111-1111-4111-8111-111111111111'),
          '2|1|13:30|2026-12-11',
          'os fatos contam só os ativos, vivos e sem marca: 2 de antes e 1 da mala');
select is(pg_temp.eve_count('d1111111-1111-4111-8111-111111111111', '2026-12-10 21:00+00'), 0::bigint,
          'fuso: 21:00 UTC são 18:00 em São Paulo, ainda não');
select is(pg_temp.eve_count('d1111111-1111-4111-8111-111111111111', '2026-12-11 22:00+00'), 0::bigint,
          'no dia da viagem, nada');
insert into public.notification_prefs (id, user_id, trip_id, kinds, updated_at)
values (extensions.uuid_generate_v5('d2222222-2222-4222-8222-222222222222', 'd9111111-1111-4111-8111-111111111111'),
        'd2222222-2222-4222-8222-222222222222', 'd9111111-1111-4111-8111-111111111111', '{"eve_checklist": false}', now());
select is(pg_temp.eve_count('d2222222-2222-4222-8222-222222222222', '2026-12-10 22:00+00'), 0::bigint, 'nada com o tipo desligado');
select is(pg_temp.eve_count('d1111111-1111-4111-8111-111111111111', '2026-12-10 22:00+00'), 1::bigint, 'e a dona continua recebendo');
select pg_temp.login('d1111111-1111-4111-8111-111111111111');
select lives_ok($$update public.trips set deleted_at = now(), updated_at = now() where id = 'd9111111-1111-4111-8111-111111111111'$$,
  'a dona exclui a viagem');
select pg_temp.logout();
select is(pg_temp.eve_count('d1111111-1111-4111-8111-111111111111', '2026-12-10 22:00+00'), 0::bigint, 'nada com a viagem apagada');

select * from finish();
rollback;
