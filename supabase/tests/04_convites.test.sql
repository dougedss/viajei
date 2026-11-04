begin;
select plan(10);

create function pg_temp.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

-- g1 dono; g2 convidada com e-mail confirmado; g3 convidado SEM e-mail confirmado; g4 já é membro
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'f1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'g1@teste.local', 'x', now(), '{}', '{"name":"Dono"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'g2@teste.local', 'x', now(), '{}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'g3@teste.local', 'x', null, '{}', '{"name":"Semconfirmar"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'f4444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', 'g4@teste.local', 'x', now(), '{}', '{"name":"Jamembro"}', now(), now(), '', '', '', '');

insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('e1111111-1111-4111-8111-111111111111', 'f1111111-1111-4111-8111-111111111111', 'Viagem', '2026-12-11', '2026-12-14', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values
 (extensions.uuid_generate_v5('e1111111-1111-4111-8111-111111111111', 'invite:g2@teste.local'), 'e1111111-1111-4111-8111-111111111111', null, 'g2@teste.local', 'member', 'pending', 'f1111111-1111-4111-8111-111111111111', now()),
 (extensions.uuid_generate_v5('e1111111-1111-4111-8111-111111111111', 'invite:g3@teste.local'), 'e1111111-1111-4111-8111-111111111111', null, 'g3@teste.local', 'member', 'pending', 'f1111111-1111-4111-8111-111111111111', now()),
 (extensions.uuid_generate_v5('e1111111-1111-4111-8111-111111111111', 'invite:g4@teste.local'), 'e1111111-1111-4111-8111-111111111111', null, 'g4@teste.local', 'member', 'pending', 'f1111111-1111-4111-8111-111111111111', now()),
 (extensions.uuid_generate_v5('e1111111-1111-4111-8111-111111111111', 'invite:g4-antigo@teste.local'), 'e1111111-1111-4111-8111-111111111111', 'f4444444-4444-4444-8444-444444444444', 'g4-antigo@teste.local', 'member', 'accepted', 'f1111111-1111-4111-8111-111111111111', now());

-- e-mail não confirmado: nada a reivindicar
select pg_temp.login('f3333333-3333-4333-8333-333333333333');
select is(public.claim_invites(), 0, 'e-mail não confirmado não reivindica convite');
select is((select count(*) from public.my_pending_invites()), 0::bigint, 'e sem convite não vê nada pendente');

-- quem já é membro: o convite redundante é aposentado, sem erro
select pg_temp.login('f4444444-4444-4444-8444-444444444444');
select lives_ok($$select public.claim_invites()$$, 'claim não colide quando a pessoa já é membro');
reset role;
select isnt((select deleted_at from public.trip_members where invited_email = 'g4@teste.local'), null, 'o convite redundante fica aposentado');

-- e-mail confirmado reivindica e vê o convite
select pg_temp.login('f2222222-2222-4222-8222-222222222222');
select is(public.claim_invites(), 1, 'e-mail confirmado reivindica 1 convite');
select results_eq($$select trip_name, invited_by_name from public.my_pending_invites()$$,
                  $$values ('Viagem'::text, 'Dono'::text)$$, 'my_pending_invites lista com o nome de quem convidou');

-- só quem recebeu aceita
select pg_temp.login('f1111111-1111-4111-8111-111111111111');
select throws_ok($$select public.accept_invite(extensions.uuid_generate_v5('e1111111-1111-4111-8111-111111111111', 'invite:g2@teste.local'))$$,
  'P0002', 'convite não encontrado', 'o dono não aceita o convite da convidada');

select pg_temp.login('f2222222-2222-4222-8222-222222222222');
select is(public.accept_invite(extensions.uuid_generate_v5('e1111111-1111-4111-8111-111111111111', 'invite:g2@teste.local')),
          'e1111111-1111-4111-8111-111111111111'::uuid, 'accept_invite devolve o id da viagem');
select is((select count(*) from public.trips), 1::bigint, 'depois de aceitar, vê a viagem');

-- recusar um convite já aceito não é possível
select throws_ok($$select public.decline_invite(extensions.uuid_generate_v5('e1111111-1111-4111-8111-111111111111', 'invite:g2@teste.local'))$$,
  'P0002', 'convite não encontrado', 'convite aceito não se recusa');

select * from finish();
rollback;
