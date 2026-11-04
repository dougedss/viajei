-- Usuários locais para desenvolvimento e testes (senha de todos: viajei123).
--   dono       dono@viajei.local        dona da viagem do seed
--   convidado  convidado@viajei.local   tem um convite pendente para a viagem do dono
--   intruso    intruso@viajei.local     não participa de nada (testa o que não pode ver)
-- A viagem completa (dias, paradas, reservas) entra na fase 3 pelo botão "carregar viagem de exemplo".

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
   raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
   confirmation_token, recovery_token, email_change, email_change_token_new)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated',
   'dono@viajei.local', extensions.crypt('viajei123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Douglas"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated',
   'convidado@viajei.local', extensions.crypt('viajei123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Ana"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated',
   'intruso@viajei.local', extensions.crypt('viajei123', extensions.gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{"name":"Intruso"}', now(), now(), '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
  from auth.users u
 where u.email in ('dono@viajei.local', 'convidado@viajei.local', 'intruso@viajei.local');

-- a viagem real do seed, ainda sem dias e paradas (fase 3)
insert into public.trips (id, owner_id, name, start_date, end_date, origin, budget, updated_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111',
        'RS — concurso em Montenegro', '2026-12-11', '2026-12-14', 'Papanduva/SC', 3000, now());

-- convite pendente para a convidada (id determinístico: v5(trip_id, 'invite:' || email))
insert into public.trip_members (id, trip_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'invite:convidado@viajei.local'),
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'convidado@viajei.local', 'member', 'pending',
        '11111111-1111-4111-8111-111111111111', now());
