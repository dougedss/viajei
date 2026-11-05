begin;
select plan(16);

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

-- l1 executor, l2 quem vê o painel, l3 usuário comum
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values
 ('00000000-0000-0000-0000-000000000000', 'c1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'l1@teste.invalid', 'x', now(), '{}', '{"name":"Executor"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c2222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'l2@teste.invalid', 'x', now(), '{}', '{"name":"Painel"}', now(), now(), '', '', '', ''),
 ('00000000-0000-0000-0000-000000000000', 'c3333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', 'l3@teste.invalid', 'x', now(), '{}', '{"name":"Comum"}', now(), now(), '', '', '', '');

select is(public.lab_grant('L1@teste.invalid', 'runner'), 'c1111111-1111-4111-8111-111111111111'::uuid,
          'lab_grant acha o usuário pelo e-mail, sem diferenciar maiúsculas');
select lives_ok($$select public.lab_grant('l2@teste.invalid', 'viewer')$$, 'e dá o papel de quem vê o painel');
select throws_ok($$select public.lab_grant('ninguem@teste.invalid', 'viewer')$$, 'P0002', null,
                 'e-mail sem usuário é recusado');

-- caixa de entrada: gravada pelo receptor (postgres/service_role), lida só pela dona
insert into public.lab_inbox (user_id, inbox, status_code, vapid_ok, size_bytes)
values ('c1111111-1111-4111-8111-111111111111', gen_random_uuid(), 201, true, 600),
       ('c3333333-3333-4333-8333-333333333333', gen_random_uuid(), 201, true, 600);

-- ---------------------------------------------------------------- executor
select pg_temp.login('c1111111-1111-4111-8111-111111111111');
select is(public.my_lab_role(), 'runner', 'my_lab_role diz que l1 é executor');
select is((select count(*) from public.lab_inbox), 1::bigint, 'a caixa de entrada mostra só a própria');
select throws_ok($$insert into public.lab_inbox (user_id, inbox, status_code, vapid_ok, size_bytes)
  values ('c1111111-1111-4111-8111-111111111111', gen_random_uuid(), 201, true, 1)$$,
  '42501', null, 'ninguém do client escreve na caixa de entrada');
insert into public.lab_runs (id, target, source, status, started_at, finished_at)
values ('a9999999-9999-4999-8999-999999999999', 'local', 'local', 'pass', now(), now());
insert into public.lab_checks (run_id, scenario, status, detail)
values ('a9999999-9999-4999-8999-999999999999', 'entrega', 'pass', 'ok');
select is((select count(*) from public.lab_checks), 1::bigint, 'o executor grava a execução e os cenários');
select throws_ok($$insert into public.lab_runs (id, target, source, status, started_at, finished_at, runner_id)
  values (gen_random_uuid(), 'local', 'local', 'pass', now(), now(), 'c2222222-2222-4222-8222-222222222222')$$,
  '42501', null, 'mas não em nome de outra pessoa');
select lives_ok($$select public.lab_diagnostics(now() - interval '1 hour')$$, 'e lê o diagnóstico');
select ok(public.lab_diagnostics(now() - interval '1 hour') ?& array['cron', 'http', 'sent'],
          'diagnóstico com cron, http e sent');

-- ---------------------------------------------------------------- quem vê o painel
select pg_temp.login('c2222222-2222-4222-8222-222222222222');
select is((select count(*) from public.lab_runs), 1::bigint, 'quem vê o painel lê as execuções');
select throws_ok($$insert into public.lab_runs (id, target, source, status, started_at, finished_at)
  values (gen_random_uuid(), 'local', 'local', 'pass', now(), now())$$,
  '42501', null, 'mas não grava');

-- ---------------------------------------------------------------- usuário comum
select pg_temp.login('c3333333-3333-4333-8333-333333333333');
select is(public.my_lab_role(), null, 'usuário comum não é do laboratório');
select is((select count(*) from public.lab_runs) + (select count(*) from public.lab_checks), 0::bigint,
          'e não vê nada do laboratório');
select throws_ok($$select public.lab_diagnostics(now())$$, '42501', null, 'nem o diagnóstico');
select throws_ok($$select public.lab_grant('l3@teste.invalid', 'runner')$$, '42501', null,
                 'e não se dá acesso sozinho');
select pg_temp.logout();

select * from finish();
rollback;
