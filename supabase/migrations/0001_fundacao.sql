-- 0001_fundacao: extensões, schema private, registro das tabelas sincronizadas e os triggers
-- compartilhados (sync_guard, broadcast, stamp_synced). Fase 1.

create extension if not exists "uuid-ossp" with schema extensions;   -- uuid_generate_v5
create schema if not exists private;                                 -- fora dos "exposed schemas" do PostgREST
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- nada é exposto a anon: as tabelas e funções criadas daqui em diante nascem sem privilégio para ele
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on functions from anon, public;

-- cast seguro: caminho de Storage ou tópico de Realtime malformado vira null (nega acesso) em vez de erro
create function private.uuid_or_null(p text) returns uuid
language plpgsql immutable set search_path = '' as $$
begin
  return p::uuid;
exception when invalid_text_representation then
  return null;
end $$;
revoke all on function private.uuid_or_null(text) from public;
grant execute on function private.uuid_or_null(text) to authenticated, service_role;

-- registro das tabelas sincronizadas: whitelist do push, roteiro do pull, ordem topológica (pais antes de filhos)
create table private.sync_tables (
  name  text primary key,
  scope text not null check (scope in ('trip', 'user')),
  mode  text not null check (mode in ('lww', 'append')),
  rank  smallint not null
);
grant select on private.sync_tables to authenticated;

-- Colunas imutáveis, versão por coluna (last-writer-wins por coluna) e synced_at.
-- Argumentos do trigger: nomes das colunas imutáveis além de id e created_at.
create function private.sync_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_cap timestamptz := clock_timestamp() + interval '2 minutes';   -- relógio adiantado do client não vence o futuro
  v_new jsonb := to_jsonb(new);
  v_old jsonb;
  v_in  jsonb;
  v_ver jsonb;
  v_col text;
  v_ts  timestamptz;
  v_won boolean := false;
begin
  if tg_op = 'INSERT' then
    new.updated_at     := least(coalesce(new.updated_at, v_now), v_cap);
    new.field_versions := jsonb_build_object('*', new.updated_at) || coalesce(
      (select jsonb_object_agg(key, least((value #>> '{}')::timestamptz, v_cap))
         from jsonb_each(coalesce(new.field_versions, '{}'::jsonb))), '{}'::jsonb);
    new.synced_at := v_now;
    return new;
  end if;

  v_old := to_jsonb(old);
  foreach v_col in array array['id', 'created_at'] || tg_argv loop
    if v_new -> v_col is distinct from v_old -> v_col then
      raise exception 'a coluna % não pode mudar', v_col using errcode = '42501';
    end if;
  end loop;

  -- versões declaradas por esta escrita; escrita sem versões (RPC do servidor) usa a hora do servidor
  v_in  := coalesce(case when new.field_versions is distinct from old.field_versions
                         then new.field_versions else '{}'::jsonb end, '{}'::jsonb);
  v_ver := coalesce(old.field_versions, '{}'::jsonb);

  for v_col in select jsonb_object_keys(v_new) loop
    continue when v_col in ('id', 'created_at', 'updated_at', 'synced_at', 'field_versions');
    continue when (v_new -> v_col) is not distinct from (v_old -> v_col) and not (v_in ? v_col);
    v_ts := least(coalesce((v_in ->> v_col)::timestamptz, v_now), v_cap);
    if v_ts >= coalesce((v_ver ->> v_col)::timestamptz, (v_ver ->> '*')::timestamptz, '-infinity') then
      v_ver := v_ver || jsonb_build_object(v_col, v_ts);
      v_won := true;
    else
      v_new := jsonb_set(v_new, array[v_col], v_old -> v_col);   -- o servidor já tem versão mais nova
    end if;
  end loop;

  if not v_won then return null; end if;                          -- nada novo: escrita antiga (stale)
  new := jsonb_populate_record(new, v_new);
  new.field_versions := v_ver;
  new.updated_at := greatest(old.updated_at,
    (select max((value #>> '{}')::timestamptz) from jsonb_each(v_ver)));
  new.synced_at := v_now;
  return new;
end $$;

-- Aviso Realtime: só {} no tópico trip:<id>; um por viagem por transação. Argumento: coluna com o id da viagem.
create function private.broadcast_trip_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
  v_sent text := coalesce(current_setting('viajei.notified', true), '');
begin
  if v_trip is not null and position(v_trip::text in v_sent) = 0 then
    perform realtime.send('{}'::jsonb, 'change', 'trip:' || v_trip, true);
    perform set_config('viajei.notified', v_sent || v_trip || ',', true);
  end if;
  return null;
end $$;

-- tabelas somente-anexar (achievements, xp_events): só o carimbo de sincronização
create function private.stamp_synced() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.synced_at := clock_timestamp();
  return new;
end $$;
