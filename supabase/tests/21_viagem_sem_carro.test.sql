-- A 0019 (fase 25): as colunas car_* saíram de trips e a cópia de uma vez (0014) saiu junto; as
-- viagens de hoje continuam válidas; e um app antigo em cache que ainda mande car_model numa viagem
-- tem a chave ignorada pelo sync_push (a interseção com as colunas da tabela), sem erro.
begin;
select plan(8);

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
-- uma operação só, devolvendo status|code
create function pg_temp.push1(p jsonb) returns text language sql as $$
  select r ->> 'status' || '|' || coalesce(r ->> 'code', '')
    from jsonb_array_elements(public.sync_push(jsonb_build_array(p))) r;
$$;

select hasnt_column('public', 'trips', 'car_model', 'trips não tem mais car_model');
select hasnt_column('public', 'trips', 'car_color', 'trips não tem mais car_color');
select hasnt_column('public', 'trips', 'car_accessories', 'trips não tem mais car_accessories');
select hasnt_function('private', 'copy_trip_cars', 'a cópia de uma vez (0014) saiu junto');
select has_column('public', 'profiles', 'car_model', 'o carro continua no perfil');

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new)
values ('00000000-0000-0000-0000-000000000000', 'ab111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'v1@teste.local', 'x', now(), '{}', '{"name":"Dona"}', now(), now(), '', '', '', '');

-- um app antigo em cache: o upsert de uma viagem nova ainda leva car_model e car_color
select pg_temp.login('ab111111-1111-4111-8111-111111111111');
select is(pg_temp.push1('{"seq":1,"table":"trips","id":"eb111111-1111-4111-8111-111111111111","op":"upsert","values":{"owner_id":"ab111111-1111-4111-8111-111111111111","name":"Serra","start_date":"2026-12-11","end_date":"2026-12-14","origin":"Papanduva/SC","car_model":"suv","car_color":"sky","car_accessories":[]},"versions":{"name":"2026-11-21T10:00:00Z"},"updated_at":"2026-11-21T10:00:00Z"}'),
          'applied|', 'o upsert de um app antigo, com as colunas do carro, é aplicado: as chaves são ignoradas');
select is((select name || '|' || origin from public.trips where id = 'eb111111-1111-4111-8111-111111111111'),
          'Serra|Papanduva/SC', 'e a viagem nasce com o resto');
-- e o patch só do carro: nenhuma coluna a mudar, então volta stale, sem erro (no aparelho, stale sai da
-- fila como applied, seção 5.2 do prompt mestre: o app antigo não fica com a operação presa)
select is(pg_temp.push1('{"seq":2,"table":"trips","id":"eb111111-1111-4111-8111-111111111111","op":"patch","values":{"car_color":"grape"},"versions":{"car_color":"2026-11-21T10:05:00Z"},"updated_at":"2026-11-21T10:05:00Z"}'),
          'stale|', 'o patch de um app antigo só no carro da viagem volta stale, sem erro');
select pg_temp.logout();

select * from finish();
rollback;
