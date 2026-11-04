begin;
select plan(9);

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

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'e1111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'e1@teste.local', 'x', now(), '{}', '{"name":"E1"}', now(), now(), '', '', '', '');

select pg_temp.login('e1111111-1111-4111-8111-111111111111');

-- insert: o trigger carimba synced_at e a versão '*' igual ao updated_at
insert into public.trips (id, owner_id, name, start_date, end_date, updated_at)
values ('f1111111-1111-4111-8111-111111111111', 'e1111111-1111-4111-8111-111111111111', 'Teste', '2026-12-11', '2026-12-14', '2026-11-01T10:00:00-03:00');
select is((select field_versions ->> '*' from public.trips where id = 'f1111111-1111-4111-8111-111111111111')::timestamptz,
          '2026-11-01T10:00:00-03:00'::timestamptz, 'insert grava a versão * com o updated_at do client');
select isnt((select synced_at from public.trips where id = 'f1111111-1111-4111-8111-111111111111'), null, 'insert carimba synced_at');

-- escrita antiga numa coluna é descartada (a linha nem muda)
update public.trips set notes = 'velha', field_versions = '{"notes":"2026-10-01T10:00:00-03:00"}'
 where id = 'f1111111-1111-4111-8111-111111111111';
select is((select notes from public.trips where id = 'f1111111-1111-4111-8111-111111111111'), null, 'versão mais antiga que a da linha não vence');

-- escrita nova vence e registra a versão da coluna
update public.trips set notes = 'nova', field_versions = '{"notes":"2026-11-02T10:00:00-03:00"}'
 where id = 'f1111111-1111-4111-8111-111111111111';
select is((select notes from public.trips where id = 'f1111111-1111-4111-8111-111111111111'), 'nova', 'versão mais nova vence');
select is((select (field_versions ->> 'notes')::timestamptz from public.trips where id = 'f1111111-1111-4111-8111-111111111111'),
          '2026-11-02T10:00:00-03:00'::timestamptz, 'a versão da coluna fica registrada');

-- conflito por coluna: um patch antigo em notes e novo em origin, na mesma escrita, mantém notes e aplica origin
update public.trips set notes = 'antiga de novo', origin = 'Papanduva',
       field_versions = '{"notes":"2026-10-15T10:00:00-03:00","origin":"2026-11-03T10:00:00-03:00"}'
 where id = 'f1111111-1111-4111-8111-111111111111';
select is((select notes || '|' || origin from public.trips where id = 'f1111111-1111-4111-8111-111111111111'),
          'nova|Papanduva', 'o patch de outra coluna sobrevive e a coluna superada é mantida');

-- relógio adiantado: a versão é limitada a agora + 2 min
update public.trips set budget = 10, field_versions = '{"budget":"2099-01-01T00:00:00Z"}'
 where id = 'f1111111-1111-4111-8111-111111111111';
select ok((select (field_versions ->> 'budget')::timestamptz < now() + interval '3 minutes'
             from public.trips where id = 'f1111111-1111-4111-8111-111111111111'), 'versão do futuro é limitada');

-- coluna imutável
select throws_ok($$update public.trips set owner_id = 'e1111111-1111-4111-8111-111111111112' where id = 'f1111111-1111-4111-8111-111111111111'$$,
                 '42501', 'a coluna owner_id não pode mudar', 'owner_id é imutável');

-- escrita sem versões (RPC do servidor) usa a hora do servidor e vence
update public.trips set name = 'Renomeada' where id = 'f1111111-1111-4111-8111-111111111111';
select is((select name from public.trips where id = 'f1111111-1111-4111-8111-111111111111'), 'Renomeada', 'escrita sem versões usa a hora do servidor');

select * from finish();
rollback;
