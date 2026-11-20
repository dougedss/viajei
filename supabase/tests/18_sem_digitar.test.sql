-- A 0016 (fase 18): o tipo de aviso novo, as finalidades novas em ai_imports, a nota como anexo do
-- gasto, o código do endereço de cada pessoa, a reserva recebida por e-mail, as RPCs da função de
-- recebimento, a pasta inbox/ do Storage, o ramo do aviso e o expurgo. E o que já existia continua
-- valendo: as linhas de hoje entram como entravam.
begin;
select plan(75);

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
create function pg_temp.due_count(p_user uuid, p_now timestamptz) returns bigint language sql as $$
  select count(*) from public.due_notifications(p_now) d where d.user_id = p_user and d.kind = 'reservation_received'
$$;

-- g1 dona das viagens A e C (confirmada); g2 membro de A (confirmada); g3 dono de B, e-mail não confirmado
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'a8111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'G1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a8222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'g2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a8333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'g3@teste.local', 'x', null, '{}', '{"name":"Sem confirmar"}', now(), now(), '', '', '', '');

insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('e8111111-1111-4111-8111-111111111111', 'a8111111-1111-4111-8111-111111111111', 'Serra', '2026-12-11', '2026-12-14', now()),
       ('e8222222-2222-4222-8222-222222222222', 'a8333333-3333-4333-8333-333333333333', 'Viagem do outro', '2026-12-11', '2026-12-14', now()),
       ('e8333333-3333-4333-8333-333333333333', 'a8111111-1111-4111-8111-111111111111', 'Serra de novo', '2026-12-12', '2026-12-13', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('e8111111-1111-4111-8111-111111111111', 'invite:g2@teste.local'), 'e8111111-1111-4111-8111-111111111111',
        'a8222222-2222-4222-8222-222222222222', 'g2@teste.local', 'member', 'accepted', 'a8111111-1111-4111-8111-111111111111', now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('e8111111-1111-4111-8111-111111111111', '2026-12-12'), 'e8111111-1111-4111-8111-111111111111', '2026-12-12', now());
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, updated_at)
values ('e8500000-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111',
        extensions.uuid_generate_v5('e8111111-1111-4111-8111-111111111111', '2026-12-12'), 'a0', 'fuel', 'Posto da serra', now());

-- ---------------------------------------------------------------- 1. o tipo de aviso novo
select lives_ok($$insert into public.notifications_sent (id, user_id, kind, ref, scheduled_at)
  values (gen_random_uuid(), 'a8111111-1111-4111-8111-111111111111', 'reservation_received', 'x', now())$$,
  'notifications_sent aceita reservation_received');
select throws_ok($$insert into public.notifications_sent (id, user_id, kind, ref, scheduled_at)
  values (gen_random_uuid(), 'a8111111-1111-4111-8111-111111111111', 'chat', 'x', now())$$,
  '23514', null, 'e continua recusando um tipo fora da lista');
delete from public.notifications_sent where kind = 'reservation_received';
insert into public.notification_prefs (id, user_id, trip_id, updated_at)
values (extensions.uuid_generate_v5('a8111111-1111-4111-8111-111111111111', 'e8111111-1111-4111-8111-111111111111'),
        'a8111111-1111-4111-8111-111111111111', 'e8111111-1111-4111-8111-111111111111', now());
select is((select kinds ->> 'reservation_received' from public.notification_prefs
            where user_id = 'a8111111-1111-4111-8111-111111111111'), 'true',
          'as preferências novas nascem com o aviso da reserva recebida ligado');

-- ---------------------------------------------------------------- 2. ai_imports
select pg_temp.login('a8111111-1111-4111-8111-111111111111');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind, input_bytes)
  values ('e8111111-1111-4111-8111-111111111111', 0, 'claude-sonnet-5-5', 'confirmation', 48213)$$,
  'a leitura de uma confirmação só em imagem: zero caracteres e os bytes do anexo');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind)
  values ('e8111111-1111-4111-8111-111111111111', 120, 'claude-sonnet-5-5', 'receipt')$$,
  'a leitura de uma nota');
select is((select input_bytes from public.ai_imports where kind = 'receipt'), 0, 'sem anexo, input_bytes nasce 0');
select throws_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind, input_bytes)
  values (null, 10, 'claude-sonnet-5-5', 'receipt', -1)$$, '23514', null, 'bytes negativos são recusados');
select throws_ok($$insert into public.ai_imports (trip_id, input_chars, model, kind)
  values (null, 10, 'claude-sonnet-5-5', 'ocr')$$, '23514', null, 'finalidade fora da lista é recusada');
select lives_ok($$insert into public.ai_imports (trip_id, input_chars, model)
  values ('e8111111-1111-4111-8111-111111111111', 2617, 'claude-sonnet-5-5')$$,
  'a importação de sempre continua como era');
select pg_temp.logout();

-- ---------------------------------------------------------------- 3. a nota como anexo do gasto
select ok(exists (select 1 from pg_constraint where conname = 'expenses_id_trip_id_key'),
          'expenses ganhou o unique (id, trip_id) que a FK composta pede');
select pg_temp.login('a8222222-2222-4222-8222-222222222222');
insert into public.expenses (id, trip_id, stop_id, amount, category, date, paid_by, created_by, updated_at)
values ('e8600000-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'e8500000-0000-4000-8000-000000000001',
        187.4, 'fuel', '2026-12-12', 'a8222222-2222-4222-8222-222222222222', 'a8222222-2222-4222-8222-222222222222', now());
insert into public.reservations (id, trip_id, type, name, created_by, updated_at)
values ('e8700000-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'hotel', 'Pousada', 'a8222222-2222-4222-8222-222222222222', now());
select lives_ok($$insert into public.attachments (id, trip_id, expense_id, kind, storage_path, filename, mime, size_bytes, width, height, created_by, updated_at)
  values ('e8800000-0000-4000-8000-000000000001', 'e8111111-1111-4111-8111-111111111111', 'e8600000-0000-4000-8000-000000000001',
          'document', 'e8111111-1111-4111-8111-111111111111/e8800000-0000-4000-8000-000000000001.jpg', 'nota.jpg', 'image/jpeg', 90000, 1200, 2000,
          'a8222222-2222-4222-8222-222222222222', now())$$,
  'a foto da nota é anexo do gasto, como documento');
select throws_ok($$insert into public.attachments (id, trip_id, expense_id, kind, storage_path, filename, mime, size_bytes, width, height, created_by, updated_at)
  values ('e8800000-0000-4000-8000-000000000002', 'e8111111-1111-4111-8111-111111111111', 'e8600000-0000-4000-8000-000000000001',
          'photo', 'e8111111-1111-4111-8111-111111111111/e8800000-0000-4000-8000-000000000002.jpg', 'nota.jpg', 'image/jpeg', 90000, 1200, 2000,
          'a8222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'uma foto (de memória) não se liga a um gasto');
select throws_ok($$insert into public.attachments (id, trip_id, expense_id, reservation_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('e8800000-0000-4000-8000-000000000003', 'e8111111-1111-4111-8111-111111111111', 'e8600000-0000-4000-8000-000000000001',
          'e8700000-0000-4000-8000-000000000001', 'document', 'e8111111-1111-4111-8111-111111111111/e8800000-0000-4000-8000-000000000003.pdf',
          'x.pdf', 'application/pdf', 1000, 'a8222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'o anexo liga a exatamente um: gasto e reserva juntos são recusados');
select throws_ok($$insert into public.attachments (id, trip_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('e8800000-0000-4000-8000-000000000004', 'e8111111-1111-4111-8111-111111111111', 'document',
          'e8111111-1111-4111-8111-111111111111/e8800000-0000-4000-8000-000000000004.pdf', 'x.pdf', 'application/pdf', 1000,
          'a8222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'e sem vínculo nenhum também');
select throws_ok($$update public.attachments set expense_id = null, updated_at = now() where id = 'e8800000-0000-4000-8000-000000000001'$$,
  '42501', null, 'expense_id é imutável');
-- as linhas de hoje continuam entrando como entravam
select lives_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('e8800000-0000-4000-8000-000000000005', 'e8111111-1111-4111-8111-111111111111', 'e8700000-0000-4000-8000-000000000001',
          'document', 'e8111111-1111-4111-8111-111111111111/e8800000-0000-4000-8000-000000000005.pdf', 'voucher.pdf', 'application/pdf', 1000,
          'a8222222-2222-4222-8222-222222222222', now())$$,
  'o PDF da reserva, como na 0007');
select lives_ok($$insert into public.attachments (id, trip_id, stop_id, kind, storage_path, filename, mime, size_bytes, width, height, placeholder, created_by, updated_at)
  values ('e8800000-0000-4000-8000-000000000006', 'e8111111-1111-4111-8111-111111111111', 'e8500000-0000-4000-8000-000000000001',
          'photo', 'e8111111-1111-4111-8111-111111111111/e8800000-0000-4000-8000-000000000006.jpg', 'foto.jpg', 'image/jpeg', 90000, 1600, 1200, 'abc',
          'a8222222-2222-4222-8222-222222222222', now())$$,
  'a foto de memória da parada, como na 0007');
select is((select x ->> 'expense_id'
             from public.sync_pull('e8111111-1111-4111-8111-111111111111', '2000-01-01') v,
                  jsonb_array_elements(v -> 'attachments') x
            where x ->> 'id' = 'e8800000-0000-4000-8000-000000000001'),
          'e8600000-0000-4000-8000-000000000001', 'o pull da viagem leva o expense_id do anexo');
select pg_temp.logout();

-- ---------------------------------------------------------------- 4. o código do endereço
select is((select count(*) from public.profiles p where not exists (select 1 from public.inbox_addresses a where a.id = p.id)), 0::bigint,
          'todo perfil de hoje ganhou um endereço');
select is((select count(*) from public.inbox_addresses a where a.code !~ '^r-[23456789abcdefghjkmnpqrstuvwxyz]{6}$'), 0::bigint,
          'todo código tem a forma r- e seis símbolos sem 0/o/1/l/i');
select is((select count(distinct code) from public.inbox_addresses), (select count(*) from public.inbox_addresses),
          'nenhum código repete');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'a8444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'g4@teste.local', 'x', now(), '{}', '{"name":"Nova"}', now(), now(), '', '', '', '');
select ok((select a.code ~ '^r-[23456789abcdefghjkmnpqrstuvwxyz]{6}$' and a.user_id = a.id from public.inbox_addresses a
            where a.id = 'a8444444-4444-4444-8444-444444444444'),
          'quem cria a conta nasce com o endereço, pelo trigger do perfil');
select pg_temp.login('a8111111-1111-4111-8111-111111111111');
select is((select count(*) from public.inbox_addresses), 1::bigint, 'a pessoa vê só o próprio endereço');
select is((select user_id from public.inbox_addresses), 'a8111111-1111-4111-8111-111111111111'::uuid, 'e é o dela');
-- sem policy de update, a RLS não acha linha para mudar: o update passa em silêncio e nada muda
update public.inbox_addresses set code = 'r-aaaaaa', updated_at = now() where user_id = 'a8111111-1111-4111-8111-111111111111';
select isnt((select code from public.inbox_addresses where user_id = 'a8111111-1111-4111-8111-111111111111'), 'r-aaaaaa',
            'ninguém escolhe o próprio código');
select throws_ok($$insert into public.inbox_addresses (id, user_id, code, updated_at)
  values ('a8111111-1111-4111-8111-111111111111', 'a8111111-1111-4111-8111-111111111111', 'r-bbbbbb', now())$$,
  '42501', null, 'nem cria outro');
select is((select v -> 'inbox_addresses' -> 0 ->> 'user_id' from public.sync_pull_user('2000-01-01') v),
          'a8111111-1111-4111-8111-111111111111', 'o pull do usuário traz o endereço da pessoa ao aparelho');
select ok((select (v -> 'inbox_addresses' -> 0 ->> 'code') ~ '^r-' from public.sync_pull_user('2000-01-01') v),
          'com o código');
select ok((select not (v ? 'inbox_addresses') and not (v -> 'profiles' -> 0 ? 'code')
             from public.sync_pull('e8111111-1111-4111-8111-111111111111', '2000-01-01') v),
          'o pull da viagem não leva o endereço de ninguém ao time');
select pg_temp.logout();

-- ---------------------------------------------------------------- 5 e 7. a reserva recebida e as RPCs
-- as RPCs são só do servidor
select pg_temp.login('a8111111-1111-4111-8111-111111111111');
select throws_ok($$select * from public.inbox_lookup('r-aaaaaa', null)$$, '42501', null, 'authenticated não executa inbox_lookup');
select throws_ok($$select public.inbox_trip_for('a8111111-1111-4111-8111-111111111111', now(), null)$$, '42501', null, 'nem inbox_trip_for');
select throws_ok($$select public.receive_reservation('a8111111-1111-4111-8111-111111111111', null, '{}', '[]', null, null)$$,
  '42501', null, 'nem receive_reservation');
select pg_temp.logout();

-- inbox_lookup: pelo código, só e-mail confirmado, sem distinguir maiúsculas; e se o e-mail já entrou
select is((select l.user_id || '|' || l.email || '|' || l.seen
             from public.inbox_lookup((select upper(code) || ' ' from public.inbox_addresses where id = 'a8111111-1111-4111-8111-111111111111'), 'email-1') l),
          'a8111111-1111-4111-8111-111111111111|g1@teste.local|false',
          'inbox_lookup acha a dona do código (em qualquer caixa, com espaços), com o e-mail em minúsculas');
select is((select count(*) from public.inbox_lookup('r-zzzzzz', null)), 0::bigint, 'um código que não existe não acha ninguém');
select is((select count(*) from public.inbox_lookup((select code from public.inbox_addresses where id = 'a8333333-3333-4333-8333-333333333333'), null)), 0::bigint,
          'e-mail não confirmado não recebe reserva (o remetente não teria com que ser conferido)');

-- inbox_trip_for: uma viagem só pelas datas
select is(public.inbox_trip_for('a8222222-2222-4222-8222-222222222222', '2026-12-12 14:00-03', '2026-12-13 12:00-03'),
          'e8111111-1111-4111-8111-111111111111'::uuid, 'o membro com uma viagem nas datas: a viagem');
select is(public.inbox_trip_for('a8222222-2222-4222-8222-222222222222', '2026-12-14 14:00-03', '2026-12-15 12:00-03'),
          'e8111111-1111-4111-8111-111111111111'::uuid, 'o check-out no dia seguinte ao fim ainda é a viagem');
select is(public.inbox_trip_for('a8111111-1111-4111-8111-111111111111', '2026-12-12 14:00-03', '2026-12-13 12:00-03'), null,
          'a dona com duas viagens nas datas: nenhuma (a pessoa escolhe)');
select is(public.inbox_trip_for('a8111111-1111-4111-8111-111111111111', '2026-12-11 14:00-03', null), 'e8111111-1111-4111-8111-111111111111'::uuid,
          'no dia 11 só uma das duas cobre: ela');
select is(public.inbox_trip_for('a8222222-2222-4222-8222-222222222222', '2027-01-05 14:00-03', null), null, 'fora das datas: nenhuma');
select is(public.inbox_trip_for('a8222222-2222-4222-8222-222222222222', null, null), null, 'sem data: nenhuma');
select is(public.inbox_trip_for('a8222222-2222-4222-8222-222222222222', '2026-12-12 14:00-03', null), 'e8111111-1111-4111-8111-111111111111'::uuid,
          'só o início basta');

-- receive_reservation sem viagem: a recebida com os anexos na caixa de entrada
create temp table rr as
select public.receive_reservation(
  'a8111111-1111-4111-8111-111111111111', null,
  '{"type":"hotel","name":"Vila Suzana Parque Hotel","start_at":"2026-12-13T14:00:00-03:00","end_at":"2026-12-14T12:00:00-03:00",
    "confirmation_code":"4821-339","amount":"463.00","cancel_policy":null,"cancel_until":"2026-12-08","phone":"+5554999990000",
    "address":null,"booked_via":"Booking","notes":null}'::jsonb,
  '[{"id":"e8900000-0000-4000-8000-000000000001","storage_path":"inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000001.pdf",
     "filename":"voucher.pdf","mime":"application/pdf","size_bytes":1000,"width":null,"height":null}]'::jsonb,
  'email-1', null) as r;
select is((select r ->> 'duplicate' from rr), 'false', 'a primeira vez grava');
select is((select status || '|' || name || '|' || confirmation_code || '|' || amount::text || '|' || jsonb_array_length(files)::text
             from public.received_reservations where id = (select (r ->> 'received_id')::uuid from rr)),
          'received|Vila Suzana Parque Hotel|4821-339|463.00|1', 'a recebida nasce received, com os campos da reserva e o anexo');
select is((select r ->> 'duplicate' from public.receive_reservation('a8111111-1111-4111-8111-111111111111', null,
            '{"type":"hotel","name":"Outra"}'::jsonb, '[]'::jsonb, 'email-1', null) r), 'true',
          'o mesmo e-mail de novo (o webhook repetiu) não grava outra');
select is((select count(*) from public.received_reservations), 1::bigint, 'uma recebida só');
select is((select l.seen from public.inbox_lookup((select code from public.inbox_addresses where id = 'a8111111-1111-4111-8111-111111111111'), 'email-1') l),
          true, 'inbox_lookup diz que esse e-mail já entrou');
select throws_ok($$select public.receive_reservation('a8111111-1111-4111-8111-111111111111', null,
  '{"type":"hotel","name":""}'::jsonb, '[]'::jsonb, 'email-x', null)$$, '23514', null,
  'os check da reserva valem (um nome vazio é recusado)');
select throws_ok($$select public.receive_reservation('a8111111-1111-4111-8111-111111111111', null,
  '{"type":"hotel","name":"Pousada"}'::jsonb, '{}'::jsonb, 'email-y', null)$$, '22023', null,
  'anexos fora do formato são recusados');
select throws_ok($$select public.receive_reservation('00000000-0000-4000-8000-000000000000', null,
  '{"type":"hotel","name":"Pousada"}'::jsonb, '[]'::jsonb, 'email-z', null)$$, '42501', null,
  'pessoa desconhecida não recebe nada');

-- receive_reservation com viagem: a reserva e o anexo nascem na viagem, pela pessoa
create temp table rr2 as
select public.receive_reservation(
  'a8222222-2222-4222-8222-222222222222', 'e8111111-1111-4111-8111-111111111111',
  '{"type":"ticket","name":"Parque","start_at":"2026-12-12T10:00:00-03:00","amount":"120"}'::jsonb,
  '[{"id":"e8900000-0000-4000-8000-000000000002","storage_path":"e8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000002.jpg",
     "filename":"print.jpg","mime":"image/jpeg","size_bytes":5000,"width":1170,"height":2532}]'::jsonb,
  'email-2', null) as r;
select is((select type || '|' || name || '|' || created_by::text || '|' || amount::text from public.reservations
            where id = (select (r ->> 'reservation_id')::uuid from rr2)),
          'ticket|Parque|a8222222-2222-4222-8222-222222222222|120.00', 'a reserva nasce na viagem, criada pela pessoa');
select is((select kind || '|' || reservation_id::text || '|' || created_by::text from public.attachments where id = 'e8900000-0000-4000-8000-000000000002'),
          'document|' || (select r ->> 'reservation_id' from rr2) || '|a8222222-2222-4222-8222-222222222222',
          'o anexo nasce como documento da reserva, pela pessoa');
select is((select status || '|' || placed_trip_id::text || '|' || jsonb_array_length(files)::text from public.received_reservations
            where id = (select (r ->> 'received_id')::uuid from rr2)),
          'placed|e8111111-1111-4111-8111-111111111111|0', 'a recebida nasce placed, apontando para a viagem, sem anexos na caixa');
select throws_ok($$select public.receive_reservation('a8222222-2222-4222-8222-222222222222', 'e8222222-2222-4222-8222-222222222222',
  '{"type":"hotel","name":"Pousada"}'::jsonb, '[]'::jsonb, 'email-w', null)$$, '42501', null,
  'numa viagem em que a pessoa não está, nunca');

-- o que a pessoa vê e muda
select pg_temp.login('a8111111-1111-4111-8111-111111111111');
select is((select count(*) from public.received_reservations), 1::bigint, 'a pessoa vê só as próprias recebidas');
select is((select jsonb_array_length(public.sync_pull_user('2000-01-01') -> 'received_reservations')), 1,
          'o pull do usuário as leva ao aparelho');
select is(pg_temp.push1(jsonb_build_object('seq', 1, 'table', 'received_reservations', 'id', (select r ->> 'received_id' from rr), 'op', 'patch',
                                           'values', '{"status":"dismissed"}'::jsonb, 'versions', '{"status":"2030-01-01T00:00:00Z"}'::jsonb,
                                           'updated_at', '2030-01-01T00:00:00Z')),
          'applied||[]', '"Dispensar" é um patch pela outbox');
select is((select status from public.received_reservations where id = (select (r ->> 'received_id')::uuid from rr)), 'dismissed', 'e muda o estado');
select throws_ok($$update public.received_reservations set files = '[]', updated_at = now()$$, '42501', null, 'os anexos recebidos são imutáveis');
select is(pg_temp.push1(jsonb_build_object('seq', 2, 'table', 'received_reservations', 'id', (select r ->> 'received_id' from rr), 'op', 'patch',
                                           'values', '{"placed_trip_id":"e8222222-2222-4222-8222-222222222222"}'::jsonb,
                                           'versions', '{"placed_trip_id":"2030-01-01T00:00:01Z"}'::jsonb, 'updated_at', '2030-01-01T00:00:01Z')),
          'error|42501|[]', 'colocar numa viagem em que a pessoa não está é recusado');
select pg_temp.logout();
select pg_temp.login('a8222222-2222-4222-8222-222222222222');
select is((select count(*) from public.received_reservations where user_id = 'a8111111-1111-4111-8111-111111111111'), 0::bigint,
          'ninguém vê a recebida de outra pessoa, nem quem viaja junto');
select pg_temp.logout();

-- ---------------------------------------------------------------- 8. o aviso
-- a recebida de g1 (dismissed) não avisa; uma nova recebida avisa no minuto, para a dona
create temp table rr3 as
select public.receive_reservation(
  'a8111111-1111-4111-8111-111111111111', null,
  '{"type":"restaurant","name":"Cantina"}'::jsonb,
  '[{"id":"e8900000-0000-4000-8000-000000000003","storage_path":"inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000003.pdf",
     "filename":"mesa.pdf","mime":"application/pdf","size_bytes":1000,"width":null,"height":null}]'::jsonb,
  'email-3', null) as r;
select is(pg_temp.due_count('a8111111-1111-4111-8111-111111111111', clock_timestamp() + interval '1 minute'), 1::bigint,
          'reservation_received vence no minuto em que chegou, para a dona (a dispensada não conta)');
select is((select d.ref || '|' || (d.data ->> 'reservation_name') || '|' || (d.data ->> 'received_status') || '|' || coalesce(d.trip_id::text, '-')
             from public.due_notifications(clock_timestamp() + interval '1 minute') d
            where d.user_id = 'a8111111-1111-4111-8111-111111111111' and d.kind = 'reservation_received'),
          (select r ->> 'received_id' from rr3) || '|Cantina|received|-', 'os fatos vão em data; sem viagem, sem trip_id');
select is(pg_temp.due_count('a8333333-3333-4333-8333-333333333333', clock_timestamp() + interval '1 minute'), 0::bigint, 'não para outra pessoa');
-- a de g2, colocada na viagem: respeita a preferência da viagem
select is((select (d.data ->> 'trip_name') || '|' || (d.data ->> 'reservation_id')
             from public.due_notifications(clock_timestamp() + interval '1 minute') d
            where d.user_id = 'a8222222-2222-4222-8222-222222222222' and d.kind = 'reservation_received'),
          'Serra|' || (select r ->> 'reservation_id' from rr2), 'a colocada na viagem leva o nome da viagem e a reserva');
insert into public.notification_prefs (id, user_id, trip_id, kinds, updated_at)
values (extensions.uuid_generate_v5('a8222222-2222-4222-8222-222222222222', 'e8111111-1111-4111-8111-111111111111'),
        'a8222222-2222-4222-8222-222222222222', 'e8111111-1111-4111-8111-111111111111', '{"reservation_received": false}', now());
select is(pg_temp.due_count('a8222222-2222-4222-8222-222222222222', clock_timestamp() + interval '1 minute'), 0::bigint,
          'com o tipo desligado na viagem, nada');
select is(pg_temp.due_count('a8111111-1111-4111-8111-111111111111', clock_timestamp() + interval '15 minutes'), 0::bigint,
          'passados 10 min, o aviso é velho e não sai');
select is((select count(*) from public.claim_due_notifications(clock_timestamp() + interval '1 minute') c where c.kind = 'reservation_received'), 1::bigint,
          'o claim reserva o aviso (o cron de cada minuto faz o resto)');

-- ---------------------------------------------------------------- 6. a pasta inbox/ do Storage
insert into storage.objects (bucket_id, name, owner_id) values
 ('attachments', 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000003.pdf', null),
 ('attachments', 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000001.pdf', null);
select pg_temp.login('a8111111-1111-4111-8111-111111111111');
select is((select count(*) from storage.objects where name like 'inbox/%'), 2::bigint, 'a dona lê a própria caixa de entrada');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('attachments', 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000009.pdf', 'a8111111-1111-4111-8111-111111111111')$$,
  '42501', null, 'ninguém envia para a caixa de entrada pelo client');
select set_config('storage.allow_delete_query', 'true', true);
delete from storage.objects where name = 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000003.pdf';
select is((select count(*) from storage.objects where name = 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000003.pdf'), 1::bigint,
          'o anexo de uma recebida viva não sai');
delete from storage.objects where name = 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000001.pdf';
select is((select count(*) from storage.objects where name = 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000001.pdf'), 0::bigint,
          'o da recebida dispensada sai');
select pg_temp.logout();
select pg_temp.login('a8222222-2222-4222-8222-222222222222');
select is((select count(*) from storage.objects where name like 'inbox/%'), 0::bigint, 'ninguém vê a caixa de entrada de outra pessoa');
select pg_temp.logout();

-- ---------------------------------------------------------------- 9. o expurgo
update storage.objects set created_at = now() - interval '20 days' where name like 'inbox/%';
select ok(not ((select r -> 'storage' -> 'paths' from public.purge(true, now() - interval '30 days', now() - interval '90 days',
                                                                   now() - interval '90 days', now() - interval '7 days') r)
               ? 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000003.pdf'),
          'o anexo de uma recebida viva, mesmo velho, não é órfão para o expurgo');
update public.received_reservations set status = 'dismissed', updated_at = now() where id = (select (r ->> 'received_id')::uuid from rr3);
select ok(((select r -> 'storage' -> 'paths' from public.purge(true, now() - interval '30 days', now() - interval '90 days',
                                                               now() - interval '90 days', now() - interval '7 days') r)
           ? 'inbox/a8111111-1111-4111-8111-111111111111/e8900000-0000-4000-8000-000000000003.pdf'),
          'dispensada, o anexo vira órfão e sai pelo expurgo');

select * from finish();
rollback;
