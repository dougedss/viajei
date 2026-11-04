-- 0003_sync: whitelist das tabelas da fase 1, procedimento que liga uma tabela-filha ao sync,
-- as RPCs sync_push / sync_pull / sync_pull_user e a autorização do Realtime. Fase 2.

insert into private.sync_tables (name, scope, mode, rank)
values ('trips', 'trip', 'lww', 10), ('trip_members', 'trip', 'lww', 20);

-- O dono vê a própria viagem desde o insert. Com ON CONFLICT (o upsert do sync_push) ou RETURNING, o
-- Postgres aplica a policy de SELECT à linha nova, e "membro" só passa a valer depois do trigger que
-- cria a participação do dono. A policy passa a dizer o que é verdade: dono ou membro (D12).
drop policy "viagem: membros veem" on public.trips;
create policy "viagem: dono e membros veem" on public.trips
  for select to authenticated using (owner_id = (select auth.uid()) or private.is_trip_member(id));

-- Padrão de toda tabela-filha da viagem (fases 3 em diante): RLS de membro, triggers de sync e de
-- broadcast, índice do pull e registro na whitelist. Um só lugar, para nenhuma tabela nascer diferente.
create procedure private.enable_trip_sync(p_table text, p_rank int, p_immutable text[] default '{trip_id}')
language plpgsql set search_path = '' as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('create policy "membros veem" on public.%I for select to authenticated using (private.is_trip_member(trip_id))', p_table);
  execute format('create policy "membros criam" on public.%I for insert to authenticated with check (private.is_trip_member(trip_id))', p_table);
  execute format('create policy "membros editam" on public.%I for update to authenticated using (private.is_trip_member(trip_id)) with check (private.is_trip_member(trip_id))', p_table);
  -- sem policy de delete: exclusão é deleted_at
  execute format('create trigger b_sync before insert or update on public.%I for each row execute function private.sync_guard(%s)',
                 p_table, (select string_agg(quote_literal(c), ', ') from unnest(p_immutable) c));
  execute format('create trigger d_broadcast after insert or update on public.%I for each row execute function private.broadcast_trip_change(''trip_id'')', p_table);
  execute format('create index on public.%I (trip_id, synced_at)', p_table);
  insert into private.sync_tables (name, scope, mode, rank) values (p_table, 'trip', 'lww', p_rank);
end $$;
revoke all on procedure private.enable_trip_sync(text, int, text[]) from public;

-- PUSH. Lote de até 200 operações, cada uma num savepoint próprio: um erro não derruba as outras.
-- Roda como o usuário (security invoker): a RLS e os grants de coluna valem como numa escrita direta.
-- Operação: { seq, table, id, op: 'upsert' | 'patch', values, versions: {coluna: ISO}, updated_at }
-- Resposta: { seq, status: 'applied' | 'ignored' | 'stale' | 'error', superseded: [coluna], code?, message? }
create function public.sync_push(p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_op jsonb; v_t private.sync_tables; v_rel regclass; v_vals jsonb; v_cols text; v_n integer;
  v_ver jsonb; v_status text; v_lost jsonb; v_code text; v_msg text; v_out jsonb := '[]';
begin
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'lote inválido' using errcode = '22023';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_status := null; v_lost := '[]'; v_code := null; v_msg := null;
    begin                                                          -- savepoint por operação
      select * into v_t from private.sync_tables where name = v_op ->> 'table';   -- whitelist
      if not found then
        raise exception 'a tabela % não sincroniza', coalesce(v_op ->> 'table', '?') using errcode = '42501';
      end if;
      v_rel  := format('public.%I', v_t.name)::regclass;
      v_vals := coalesce(v_op -> 'values', '{}'::jsonb) || jsonb_build_object(
                  'id', v_op -> 'id', 'updated_at', v_op -> 'updated_at',
                  'field_versions', coalesce(v_op -> 'versions', '{}'::jsonb));       -- C4

      if v_op ->> 'op' = 'upsert' or v_t.mode = 'append' then
        select string_agg(format('%I', a.attname), ', ') into v_cols
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname not in ('synced_at', 'created_at') and v_vals ? a.attname;
        execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) on conflict (id) do nothing',
                       v_t.name, v_cols, v_cols, v_t.name) using v_vals;
        get diagnostics v_n = row_count;
        if v_n = 1 then v_status := 'applied';
        elsif v_t.mode = 'append' then v_status := 'ignored';     -- somente-anexar: colisão é idempotência
        end if;
      end if;

      if v_status is null then                                     -- patch, ou upsert de linha que já existe
        -- só colunas em que o usuário tem privilégio de update (C3): num reconvite, por exemplo,
        -- invited_email, role e status ficam de fora e sobra o patch de deleted_at, que é o certo
        select string_agg(format('%I', a.attname), ', ') into v_cols
          from pg_attribute a
         where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped
           and a.attname not in ('id', 'synced_at', 'created_at') and v_vals ? a.attname
           and has_column_privilege(v_rel, a.attname, 'UPDATE');
        if v_cols is null then
          raise exception 'sem privilégio nas colunas enviadas' using errcode = '42501';
        end if;
        execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where id = $2 returning field_versions',
                       v_t.name, v_cols, v_cols, v_t.name) into v_ver using v_vals, (v_op ->> 'id')::uuid;
        get diagnostics v_n = row_count;
        if v_n = 1 then
          v_status := 'applied';
          select coalesce(jsonb_agg(k), '[]') into v_lost          -- colunas em que outra edição venceu
            from jsonb_object_keys(coalesce(v_op -> 'versions', '{}'::jsonb)) k
           where (v_ver ->> k)::timestamptz > (v_op -> 'versions' ->> k)::timestamptz;
        else
          execute format('select count(*) from public.%I where id = $1', v_t.name) into v_n using (v_op ->> 'id')::uuid;
          if v_n = 1 then
            v_status := 'stale';                                   -- o servidor já tem versão mais nova em tudo
          else
            v_status := 'error'; v_code := 'P0002';                -- C5: invisível = inexistente ou sem acesso
            v_msg := 'linha inexistente ou sem acesso';
          end if;
        end if;
      end if;
    exception when others then
      v_status := 'error'; v_code := sqlstate; v_msg := sqlerrm; v_lost := '[]';
    end;
    v_out := v_out || jsonb_strip_nulls(jsonb_build_object(
      'seq', v_op -> 'seq', 'status', v_status, 'superseded', v_lost, 'code', v_code, 'message', v_msg));
  end loop;
  return v_out;
end $$;

-- PULL de uma viagem: tudo o que mudou desde o cursor, tabela a tabela, na ordem de rank (pais antes
-- de filhos). Lápides (deleted_at) vêm junto. Quem não é mais membro recebe `revoked`.
-- Tabelas de escopo `user` que carregam trip_id (conquistas e XP, fase 9) também entram aqui (C6):
-- a retrospectiva e a tela de membros precisam dos dados do time, e a policy já deixa ler.
create function public.sync_pull(p_trip_id uuid, p_since timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_out jsonb := jsonb_build_object('server_time', now()); v_t text; v_rows jsonb;
begin
  if not private.is_trip_member(p_trip_id) then
    return v_out || jsonb_build_object('revoked', true);
  end if;
  for v_t in
    select s.name from private.sync_tables s
     where s.scope = 'trip'
        or exists (select 1 from pg_attribute a
                    where a.attrelid = format('public.%I', s.name)::regclass
                      and a.attname = 'trip_id' and a.attnum > 0 and not a.attisdropped)
     order by s.rank, s.name
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''field_versions''), ''[]'') from public.%I x where x.%I = $1 and x.synced_at > $2',
                   v_t, case when v_t = 'trips' then 'id' else 'trip_id' end)
      into v_rows using p_trip_id, p_since;
    v_out := v_out || jsonb_build_object(v_t, v_rows);
  end loop;
  -- perfis do time: os que mudaram e os de quem entrou desde o cursor
  select coalesce(jsonb_agg(to_jsonb(p) - 'field_versions'), '[]') into v_rows
    from public.profiles p
    join public.trip_members m on m.user_id = p.id and m.trip_id = p_trip_id
   where m.status = 'accepted' and m.deleted_at is null and (p.synced_at > p_since or m.synced_at > p_since);
  return v_out || jsonb_build_object('profiles', v_rows);
end $$;

-- PULL do usuário: as próprias participações (é assim que um aparelho novo descobre o que puxar)
-- e as tabelas de escopo `user` (preferências de aviso, conquistas, XP; fases 4 e 9).
create function public.sync_pull_user(p_since timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare v_out jsonb := jsonb_build_object('server_time', now()); v_t text; v_rows jsonb;
begin
  select coalesce(jsonb_agg(to_jsonb(m) - 'field_versions'), '[]') into v_rows
    from public.trip_members m where m.user_id = (select auth.uid()) and m.synced_at > p_since;
  v_out := v_out || jsonb_build_object('memberships', v_rows);
  for v_t in select name from private.sync_tables where scope = 'user' order by rank, name loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''field_versions''), ''[]'') from public.%I x where x.user_id = $1 and x.synced_at > $2', v_t)
      into v_rows using auth.uid(), p_since;
    v_out := v_out || jsonb_build_object(v_t, v_rows);
  end loop;
  return v_out;
end $$;

revoke execute on function public.sync_push(jsonb), public.sync_pull(uuid, timestamptz),
  public.sync_pull_user(timestamptz) from public, anon;
grant execute on function public.sync_push(jsonb), public.sync_pull(uuid, timestamptz),
  public.sync_pull_user(timestamptz) to authenticated;

-- Realtime: só membros ouvem o tópico trip:<id>; ninguém publica pelo client (sem policy de insert).
create policy "realtime: membros ouvem a viagem" on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast'
         and (select realtime.topic()) like 'trip:%'
         and private.is_trip_member(private.uuid_or_null(substr((select realtime.topic()), 6))));
