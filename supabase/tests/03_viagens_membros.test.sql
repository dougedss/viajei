begin;
select plan(12);

create function pg_temp.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'c1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'c1@teste.local', 'x', now(), '{}', '{"name":"Dono"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'c2@teste.local', 'x', now(), '{}', '{"name":"Membro"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'c3@teste.local', 'x', now(), '{}', '{"name":"Intruso"}', now(), now(), '', '', '', '');

-- o dono cria a viagem como usuário (RLS vale) e vira membro aceito pelo trigger
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('d1111111-1111-4111-8111-111111111111', 'c1111111-1111-4111-8111-111111111111', 'Viagem', '2026-12-11', '2026-12-14', now());
select is((select role || '|' || status from public.trip_members where trip_id = 'd1111111-1111-4111-8111-111111111111' and user_id = 'c1111111-1111-4111-8111-111111111111'),
          'owner|accepted', 'o dono entra em trip_members aceito, por trigger');
select is((select count(*) from public.trips), 1::bigint, 'o dono vê a viagem');

select throws_ok($$insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
  values ('d2222222-2222-4222-8222-222222222222', 'c2222222-2222-4222-8222-222222222222', 'Alheia', '2026-12-11', '2026-12-14', now())$$,
  '42501', null, 'não cria viagem em nome de outra pessoa');

-- o dono convida o membro (id determinístico obrigatório)
select throws_ok($$insert into public.trip_members (id, trip_id, invited_email, role, status, invited_by, updated_at)
  values (gen_random_uuid(), 'd1111111-1111-4111-8111-111111111111', 'c2@teste.local', 'member', 'pending', 'c1111111-1111-4111-8111-111111111111', now())$$,
  '23514', null, 'o id do convite tem de ser v5(trip_id, invite:email)');
insert into public.trip_members (id, trip_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('d1111111-1111-4111-8111-111111111111', 'invite:c2@teste.local'), 'd1111111-1111-4111-8111-111111111111',
        'c2@teste.local', 'member', 'pending', 'c1111111-1111-4111-8111-111111111111', now());

-- o dono não muda status nem user_id na mão: só as RPCs
select throws_ok($$update public.trip_members set status = 'accepted', updated_at = now() where invited_email = 'c2@teste.local'$$,
  '42501', null, 'o dono não aceita o convite pelo outro');

-- membro pendente não vê a viagem
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select is((select count(*) from public.trips), 0::bigint, 'convidado pendente ainda não vê a viagem');

-- aceita pelas RPCs e passa a ver
reset role;
update public.trip_members set user_id = 'c2222222-2222-4222-8222-222222222222' where invited_email = 'c2@teste.local';
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select lives_ok($$select public.accept_invite(extensions.uuid_generate_v5('d1111111-1111-4111-8111-111111111111', 'invite:c2@teste.local'))$$, 'aceita o próprio convite');
select is((select count(*) from public.trips), 1::bigint, 'membro aceito vê a viagem');

-- membro edita a viagem, mas não exclui nem convida
update public.trips set notes = 'editada pelo membro', updated_at = now() where id = 'd1111111-1111-4111-8111-111111111111';
select is((select notes from public.trips where id = 'd1111111-1111-4111-8111-111111111111'), 'editada pelo membro', 'membro edita a viagem');
select throws_ok($$update public.trips set deleted_at = now(), updated_at = now() where id = 'd1111111-1111-4111-8111-111111111111'$$,
  '42501', 'só o dono exclui a viagem', 'membro não exclui');
select throws_ok($$insert into public.trip_members (id, trip_id, invited_email, role, status, invited_by, updated_at)
  values (extensions.uuid_generate_v5('d1111111-1111-4111-8111-111111111111', 'invite:c3@teste.local'), 'd1111111-1111-4111-8111-111111111111',
          'c3@teste.local', 'member', 'pending', 'c2222222-2222-4222-8222-222222222222', now())$$,
  '42501', null, 'membro não convida');

-- intruso não vê nada
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.trips) + (select count(*) from public.trip_members), 0::bigint, 'intruso não vê viagem nem membros');

select * from finish();
rollback;
