begin;
select plan(7);

create function pg_temp.login(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'a1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'a1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'a2@teste.local', 'x', now(), '{}', '{"name":"Companheira"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'a3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'a3@teste.local', 'x', now(), '{}', '{}', now(), now(), '', '', '', '');

select is((select name from public.profiles where id = 'a1111111-1111-4111-8111-111111111111'), 'Dona', 'perfil nasce com o nome dos metadados');
select is((select name from public.profiles where id = 'a3333333-3333-4333-8333-333333333333'), 'a3', 'sem nome, usa a parte local do e-mail');

-- viagem da a1 com a a2 aceita
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('b1111111-1111-4111-8111-111111111111', 'a1111111-1111-4111-8111-111111111111', 'Viagem', '2026-12-11', '2026-12-14', now());
insert into public.trip_members (id, trip_id, user_id, invited_email, role, status, invited_by, updated_at)
values (extensions.uuid_generate_v5('b1111111-1111-4111-8111-111111111111', 'invite:a2@teste.local'), 'b1111111-1111-4111-8111-111111111111',
        'a2222222-2222-4222-8222-222222222222', 'a2@teste.local', 'member', 'accepted', 'a1111111-1111-4111-8111-111111111111', now());

select pg_temp.login('a1111111-1111-4111-8111-111111111111');
select results_eq($$select id from public.profiles order by id$$,
                  $$values ('a1111111-1111-4111-8111-111111111111'::uuid), ('a2222222-2222-4222-8222-222222222222'::uuid)$$,
                  'vê o próprio perfil e o de quem viaja junto, não o do intruso');

update public.profiles set name = 'Dona Nova', color = 'teal', updated_at = now() where id = 'a1111111-1111-4111-8111-111111111111';
select is((select name || '|' || color from public.profiles where id = 'a1111111-1111-4111-8111-111111111111'), 'Dona Nova|teal', 'edita o próprio nome e cor');

update public.profiles set name = 'Hackeada', updated_at = now() where id = 'a2222222-2222-4222-8222-222222222222';
select is((select name from public.profiles where id = 'a2222222-2222-4222-8222-222222222222'), 'Companheira', 'não edita o perfil de outra pessoa');

select throws_ok($$update public.profiles set created_at = now() where id = 'a1111111-1111-4111-8111-111111111111'$$,
                 '42501', null, 'só name, color, updated_at e field_versions têm grant de update');

select pg_temp.login('a3333333-3333-4333-8333-333333333333');
select is((select count(*) from public.profiles), 1::bigint, 'o intruso só vê o próprio perfil');

select * from finish();
rollback;
