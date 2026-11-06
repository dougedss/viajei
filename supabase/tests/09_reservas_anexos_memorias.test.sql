begin;
select plan(60);

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
create function pg_temp.due_count(p_user uuid, p_now timestamptz) returns bigint language sql as $$
  select count(*) from public.due_notifications(p_now) d where d.user_id = p_user and d.kind = 'cancel_deadline'
$$;

-- s1 dona da viagem A; s2 e s4 membros aceitos; s3 intruso (dono da viagem B)
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'c1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 's1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 's2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 's3@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 's4@teste.local', 'x', now(), '{}', '{"name":"Bia"}', now(), now(), '', '', '', '');

insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('c9111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'RS — concurso em Montenegro', '2026-12-11', '2026-12-14', now()),
       ('c9222222-2222-4222-8222-222222222222', 'c3333333-3333-4333-8333-333333333333', 'Viagem do intruso', '2026-12-11', '2026-12-14', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values
 (extensions.uuid_generate_v5('c9111111-1111-4111-8111-111111111111', 'invite:s2@teste.local'), 'c9111111-1111-4111-8111-111111111111',
  'c2222222-2222-4222-8222-222222222222', 's2@teste.local', 'member', 'accepted', 'c1111111-1111-4111-8111-111111111111', now()),
 (extensions.uuid_generate_v5('c9111111-1111-4111-8111-111111111111', 'invite:s4@teste.local'), 'c9111111-1111-4111-8111-111111111111',
  'c4444444-4444-4444-8444-444444444444', 's4@teste.local', 'member', 'accepted', 'c1111111-1111-4111-8111-111111111111', now());
insert into public.trip_days (id, trip_id, date, updated_at)
values (extensions.uuid_generate_v5('c9111111-1111-4111-8111-111111111111', '2026-12-11'), 'c9111111-1111-4111-8111-111111111111', '2026-12-11', now()),
       (extensions.uuid_generate_v5('c9111111-1111-4111-8111-111111111111', '2026-12-13'), 'c9111111-1111-4111-8111-111111111111', '2026-12-13', now()),
       (extensions.uuid_generate_v5('c9222222-2222-4222-8222-222222222222', '2026-12-11'), 'c9222222-2222-4222-8222-222222222222', '2026-12-11', now());
insert into public.stops (id, trip_id, trip_day_id, position, kind, name, time, updated_at)
values ('ca111111-1111-4111-8111-111111111111', 'c9111111-1111-4111-8111-111111111111',
        extensions.uuid_generate_v5('c9111111-1111-4111-8111-111111111111', '2026-12-13'), 'a0', 'hotel', 'Vila Suzana Parque Hotel', '14:00', now()),
       ('cb111111-1111-4111-8111-111111111111', 'c9222222-2222-4222-8222-222222222222',
        extensions.uuid_generate_v5('c9222222-2222-4222-8222-222222222222', '2026-12-11'), 'a0', 'hotel', 'Hotel do intruso', '14:00', now());

-- ---------------------------------------------------------------- whitelist
select is((select string_agg(name || ':' || rank, ',' order by name) from private.sync_tables
            where name in ('reservations', 'stop_memories', 'attachments')),
          'attachments:60,reservations:50,stop_memories:50', 'as três tabelas entram na whitelist com os ranks do prompt');

-- ---------------------------------------------------------------- reservations
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select lives_ok($$insert into public.reservations (id, trip_id, stop_id, type, name, start_at, end_at, confirmation_code,
                                                   cancel_until, phone, created_by, updated_at)
  values ('cd111111-1111-4111-8111-111111111111', 'c9111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111',
          'hotel', 'Vila Suzana Parque Hotel', '2026-12-13 14:00-03', '2026-12-14 12:00-03', '4821-339',
          '2026-12-08', '+5554999990000', 'c2222222-2222-4222-8222-222222222222', now())$$,
  'membro cadastra uma reserva ligada a uma parada');
select throws_ok($$insert into public.reservations (id, trip_id, type, name, created_by, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'hotel', 'Outro', 'c1111111-1111-4111-8111-111111111111', now())$$,
  '42501', null, 'created_by de outra pessoa é recusado');
select throws_ok($$insert into public.reservations (id, trip_id, stop_id, type, name, created_by, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'cb111111-1111-4111-8111-111111111111', 'hotel', 'x',
          'c2222222-2222-4222-8222-222222222222', now())$$,
  '23503', null, 'FK composta recusa parada de outra viagem');
select throws_ok($$insert into public.reservations (id, trip_id, trip_day_id, type, name, created_by, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', extensions.uuid_generate_v5('c9222222-2222-4222-8222-222222222222', '2026-12-11'),
          'hotel', 'x', 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23503', null, 'FK composta recusa dia de outra viagem');
select throws_ok($$insert into public.reservations (id, trip_id, stop_id, trip_day_id, type, name, created_by, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111',
          extensions.uuid_generate_v5('c9111111-1111-4111-8111-111111111111', '2026-12-13'), 'hotel', 'x',
          'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'parada e dia ao mesmo tempo caem no check');
select throws_ok($$insert into public.reservations (id, trip_id, type, name, phone, created_by, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'hotel', 'x', '(51) 99752-7596', 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'telefone fora de E.164 cai no check');
select throws_ok($$insert into public.reservations (id, trip_id, type, name, start_at, end_at, created_by, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'hotel', 'x', '2026-12-14 12:00-03', '2026-12-13 14:00-03',
          'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'end_at antes de start_at cai no check');
select throws_ok($$insert into public.reservations (id, trip_id, type, name, end_at, created_by, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'hotel', 'x', '2026-12-13 14:00-03', 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'end_at sem start_at cai no check');
select throws_ok($$insert into public.reservations (id, trip_id, type, name, created_by, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'flight', 'x', 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'tipo fora da lista cai no check');

select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select is((select name from public.reservations where id = 'cd111111-1111-4111-8111-111111111111'), 'Vila Suzana Parque Hotel', 'a dona vê a reserva do membro');
select lives_ok($$update public.reservations set confirmation_code = '4821-340', updated_at = now()
                   where id = 'cd111111-1111-4111-8111-111111111111'$$, 'qualquer membro edita a reserva do time');
select throws_ok($$update public.reservations set created_by = 'c1111111-1111-4111-8111-111111111111', updated_at = now()
                   where id = 'cd111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'created_by é imutável');
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.reservations where trip_id = 'c9111111-1111-4111-8111-111111111111'), 0::bigint, 'intruso não vê a reserva');

-- ---------------------------------------------------------------- stop_memories
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select lives_ok($$insert into public.stop_memories (id, trip_id, stop_id, user_id, rating, memo, updated_at)
  values (extensions.uuid_generate_v5('ca111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222'),
          'c9111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222',
          4, 'Café da manhã com vista', now())$$,
  'a pessoa grava a própria memória com id v5(stop_id, user_id)');
select throws_ok($$insert into public.stop_memories (id, trip_id, stop_id, user_id, rating, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111',
          'c4444444-4444-4444-8444-444444444444', 5, now())$$,
  '42501', null, 'memória com user_id de outra pessoa é recusada');
select lives_ok($$update public.stop_memories set rating = 5, updated_at = now()
                   where id = extensions.uuid_generate_v5('ca111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222')$$,
  'a pessoa edita a própria nota');
select throws_ok($$update public.stop_memories set rating = 6, updated_at = now()
                   where id = extensions.uuid_generate_v5('ca111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222')$$,
  '23514', null, 'nota fora de 1 a 5 cai no check');
select throws_ok($$update public.stop_memories set memo = repeat('a', 501), updated_at = now()
                   where id = extensions.uuid_generate_v5('ca111111-1111-4111-8111-111111111111', 'c2222222-2222-4222-8222-222222222222')$$,
  '23514', null, 'memória acima de 500 caracteres cai no check');

select pg_temp.login('c4444444-4444-4444-8444-444444444444');
select throws_ok($$insert into public.stop_memories (id, trip_id, stop_id, user_id, rating, updated_at)
  values (gen_random_uuid(), 'c9111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111',
          'c4444444-4444-4444-8444-444444444444', 3, now())$$,
  '23514', null, 'id fora de v5(stop_id, user_id) cai no check');
select is((select rating || '|' || memo from public.stop_memories
            where stop_id = 'ca111111-1111-4111-8111-111111111111' and user_id = 'c2222222-2222-4222-8222-222222222222'),
          '5|Café da manhã com vista', 'o time lê a memória de quem escreveu');
select throws_ok($$update public.stop_memories set memo = 'outra coisa', updated_at = now()
                   where user_id = 'c2222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'ninguém mais escreve na memória de outra pessoa');
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.stop_memories where trip_id = 'c9111111-1111-4111-8111-111111111111'), 0::bigint, 'intruso não vê as memórias');

-- ---------------------------------------------------------------- attachments
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select lives_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('ce111111-1111-4111-8111-111111111111', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'document', 'c9111111-1111-4111-8111-111111111111/ce111111-1111-4111-8111-111111111111.pdf', 'voucher.pdf',
          'application/pdf', 182000, 'c2222222-2222-4222-8222-222222222222', now())$$,
  'membro anexa um PDF à reserva');
select lives_ok($$insert into public.attachments (id, trip_id, stop_id, kind, storage_path, filename, mime, size_bytes, width, height,
                                                  placeholder, created_by, updated_at)
  values ('ce222222-2222-4222-8222-222222222222', 'c9111111-1111-4111-8111-111111111111', 'ca111111-1111-4111-8111-111111111111',
          'photo', 'c9111111-1111-4111-8111-111111111111/ce222222-2222-4222-8222-222222222222.jpg', 'IMG_0001.jpg',
          'image/jpeg', 401000, 1600, 1200, 'HBkSHYSIeHiPiHh8eJd4eTN0EEQG', 'c2222222-2222-4222-8222-222222222222', now())$$,
  'e uma foto de memória, com medidas e placeholder');
select throws_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'document', 'c9111111-1111-4111-8111-111111111111/ce333333-3333-4333-8333-333333333333.pdf', 'x.pdf',
          'application/pdf', 1000, 'c1111111-1111-4111-8111-111111111111', now())$$,
  '42501', null, 'anexo com created_by de outra pessoa é recusado');
select throws_ok($$insert into public.attachments (id, trip_id, reservation_id, stop_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'ca111111-1111-4111-8111-111111111111', 'document', 'c9111111-1111-4111-8111-111111111111/ce333333-3333-4333-8333-333333333333.pdf',
          'x.pdf', 'application/pdf', 1000, 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'reserva e parada ao mesmo tempo caem no num_nonnulls');
select throws_ok($$insert into public.attachments (id, trip_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'document',
          'c9111111-1111-4111-8111-111111111111/ce333333-3333-4333-8333-333333333333.pdf',
          'x.pdf', 'application/pdf', 1000, 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'nem reserva nem parada também cai');
select throws_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'document', 'c9222222-2222-4222-8222-222222222222/ce333333-3333-4333-8333-333333333333.pdf',
          'x.pdf', 'application/pdf', 1000, 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'caminho fora de {trip_id}/{id}.{ext} cai no check');
select throws_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'document', 'c9111111-1111-4111-8111-111111111111/ce333333-3333-4333-8333-333333333333.jpg',
          'x.pdf', 'application/pdf', 1000, 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'extensão que não bate com o mime cai no check');
select throws_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, width, height, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'photo', 'c9111111-1111-4111-8111-111111111111/ce333333-3333-4333-8333-333333333333.jpg',
          'x.jpg', 'image/jpeg', 1000, 10, 10, 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'foto presa a uma reserva cai no check (foto é de memória)');
select throws_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, width, height, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'document', 'c9111111-1111-4111-8111-111111111111/ce333333-3333-4333-8333-333333333333.pdf',
          'x.pdf', 'application/pdf', 1000, 10, 10, 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'PDF com medidas cai no check');
select throws_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, width, height, placeholder, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'document', 'c9111111-1111-4111-8111-111111111111/ce333333-3333-4333-8333-333333333333.jpg',
          'print.jpg', 'image/jpeg', 1000, 10, 10, 'HBkSHYSIeHiPiHh8eJd4eTN0EEQG', 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'documento com placeholder cai no check');
select throws_ok($$insert into public.attachments (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, created_by, updated_at)
  values ('ce333333-3333-4333-8333-333333333333', 'c9111111-1111-4111-8111-111111111111', 'cd111111-1111-4111-8111-111111111111',
          'document', 'c9111111-1111-4111-8111-111111111111/ce333333-3333-4333-8333-333333333333.pdf',
          'x.pdf', 'application/pdf', 10485761, 'c2222222-2222-4222-8222-222222222222', now())$$,
  '23514', null, 'acima de 10 MB cai no check');
select throws_ok($$update public.attachments set storage_path = 'c9111111-1111-4111-8111-111111111111/outro.pdf', updated_at = now()
                   where id = 'ce111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'storage_path é imutável');
select throws_ok($$update public.attachments set size_bytes = 1, updated_at = now()
                   where id = 'ce111111-1111-4111-8111-111111111111'$$,
  '42501', null, 'e o tamanho também: o arquivo não muda');

select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select is((select count(*) from public.attachments where trip_id = 'c9111111-1111-4111-8111-111111111111'), 2::bigint, 'a dona vê os anexos');
update public.attachments set deleted_at = now(), updated_at = now() where id = 'ce222222-2222-4222-8222-222222222222';
select is((select deleted_at from public.attachments where id = 'ce222222-2222-4222-8222-222222222222'), null,
          'a foto de memória de outra pessoa não se tira (a linha não é alcançada)');
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.attachments where trip_id = 'c9111111-1111-4111-8111-111111111111'), 0::bigint, 'intruso não vê os anexos');

-- ---------------------------------------------------------------- Storage
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select lives_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('attachments', 'c9111111-1111-4111-8111-111111111111/ce111111-1111-4111-8111-111111111111.pdf', 'c2222222-2222-4222-8222-222222222222'),
         ('attachments', 'c9111111-1111-4111-8111-111111111111/ce222222-2222-4222-8222-222222222222.jpg', 'c2222222-2222-4222-8222-222222222222')$$,
  'membro envia na pasta da viagem');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('attachments', 'c9111111-1111-4111-8111-111111111111/foto.jpg', 'c2222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'nome fora do formato {viagem}/{anexo}.{ext} é recusado');
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select throws_ok($$insert into storage.objects (bucket_id, name, owner_id)
  values ('attachments', 'c9111111-1111-4111-8111-111111111111/ce999999-9999-4999-8999-999999999999.jpg', 'c3333333-3333-4333-8333-333333333333')$$,
  '42501', null, 'intruso não envia na pasta da viagem');
select is((select count(*) from storage.objects where bucket_id = 'attachments' and name like 'c9111111-1111-4111-8111-111111111111/%'),
          0::bigint, 'nem lê o que há nela');
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select is((select count(*) from storage.objects where bucket_id = 'attachments' and name like 'c9111111-1111-4111-8111-111111111111/%'),
          2::bigint, 'a dona lê os objetos da viagem');
update storage.objects set metadata = '{"mexido": true}' where bucket_id = 'attachments' and name like 'c9111111-1111-4111-8111-111111111111/%';
select is((select count(*) from storage.objects where bucket_id = 'attachments' and metadata ? 'mexido'), 0::bigint,
          'ninguém atualiza um objeto: o arquivo é imutável');

-- apagar: a API do Storage liga storage.allow_delete_query na própria sessão; aqui, o mesmo
select set_config('storage.allow_delete_query', 'true', true);
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
delete from storage.objects where bucket_id = 'attachments' and name = 'c9111111-1111-4111-8111-111111111111/ce222222-2222-4222-8222-222222222222.jpg';
select is((select count(*) from storage.objects where name = 'c9111111-1111-4111-8111-111111111111/ce222222-2222-4222-8222-222222222222.jpg'),
          1::bigint, 'nem quem enviou apaga o objeto enquanto a linha está viva');
update public.attachments set deleted_at = now(), updated_at = now() where id = 'ce222222-2222-4222-8222-222222222222';
select pg_temp.login('c4444444-4444-4444-8444-444444444444');
delete from storage.objects where bucket_id = 'attachments' and name = 'c9111111-1111-4111-8111-111111111111/ce222222-2222-4222-8222-222222222222.jpg';
select is((select count(*) from storage.objects where name = 'c9111111-1111-4111-8111-111111111111/ce222222-2222-4222-8222-222222222222.jpg'),
          1::bigint, 'depois da lápide, um membro que não enviou não apaga');
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
delete from storage.objects where bucket_id = 'attachments' and name = 'c9111111-1111-4111-8111-111111111111/ce222222-2222-4222-8222-222222222222.jpg';
select is((select count(*) from storage.objects where name = 'c9111111-1111-4111-8111-111111111111/ce222222-2222-4222-8222-222222222222.jpg'),
          0::bigint, 'quem enviou apaga depois da lápide');
select pg_temp.login('c4444444-4444-4444-8444-444444444444');
select lives_ok($$update public.attachments set deleted_at = now(), updated_at = now() where id = 'ce111111-1111-4111-8111-111111111111'$$,
  'qualquer membro tira um documento da reserva (a reserva é do time)');
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
delete from storage.objects where bucket_id = 'attachments' and name = 'c9111111-1111-4111-8111-111111111111/ce111111-1111-4111-8111-111111111111.pdf';
select is((select count(*) from storage.objects where name = 'c9111111-1111-4111-8111-111111111111/ce111111-1111-4111-8111-111111111111.pdf'),
          0::bigint, 'a dona da viagem apaga o objeto de outra pessoa depois da lápide');

-- ---------------------------------------------------------------- sync_pull
select is((select jsonb_array_length(v -> 'reservations') || '|' || jsonb_array_length(v -> 'stop_memories') || '|' || jsonb_array_length(v -> 'attachments')
             from public.sync_pull('c9111111-1111-4111-8111-111111111111', '-infinity') v),
          '1|1|2', 'sync_pull devolve reservas, memórias e anexos (lápides inclusive)');
select pg_temp.logout();

-- ---------------------------------------------------------------- cancel_deadline (véspera do cancel_until, 10:00 de São Paulo)
select is(pg_temp.due_count('c1111111-1111-4111-8111-111111111111', '2026-12-07 10:00-03'), 1::bigint,
          'cancel_deadline vence na véspera às 10:00 para a dona');
select is(pg_temp.due_count('c2222222-2222-4222-8222-222222222222', '2026-12-07 10:00-03'), 1::bigint, 'e para os membros');
select is(pg_temp.due_count('c3333333-3333-4333-8333-333333333333', '2026-12-07 10:00-03'), 0::bigint, 'não para quem não é da viagem');
select is((select d.ref || '|' || (d.data ->> 'reservation_name') || '|' || (d.data ->> 'cancel_until') || '|' || (d.data ->> 'trip_name')
             from public.due_notifications('2026-12-07 10:00-03') d
            where d.user_id = 'c1111111-1111-4111-8111-111111111111' and d.kind = 'cancel_deadline'),
          'cd111111-1111-4111-8111-111111111111|Vila Suzana Parque Hotel|2026-12-08|RS — concurso em Montenegro',
          'os fatos vão em data: nome da reserva, data limite e viagem');
select is(pg_temp.due_count('c1111111-1111-4111-8111-111111111111', '2026-12-07 09:59-03'), 0::bigint, 'às 09:59 ainda não');
select is(pg_temp.due_count('c1111111-1111-4111-8111-111111111111', '2026-12-07 10:00+00'), 0::bigint,
          'fuso: 10:00 UTC são 07:00 em São Paulo, ainda não');
select is(pg_temp.due_count('c1111111-1111-4111-8111-111111111111', '2026-12-07 13:00+00'), 1::bigint,
          'fuso: 13:00 UTC são as 10:00 de São Paulo');
insert into public.notification_prefs (id, user_id, trip_id, kinds, updated_at)
values (extensions.uuid_generate_v5('c2222222-2222-4222-8222-222222222222', 'c9111111-1111-4111-8111-111111111111'),
        'c2222222-2222-4222-8222-222222222222', 'c9111111-1111-4111-8111-111111111111', '{"cancel_deadline": false}', now());
select is(pg_temp.due_count('c2222222-2222-4222-8222-222222222222', '2026-12-07 10:00-03'), 0::bigint, 'nada com o tipo desligado');
update public.reservations set deleted_at = now(), updated_at = now() where id = 'cd111111-1111-4111-8111-111111111111';
select is(pg_temp.due_count('c1111111-1111-4111-8111-111111111111', '2026-12-07 10:00-03'), 0::bigint, 'nada com a reserva apagada');

select * from finish();
rollback;
