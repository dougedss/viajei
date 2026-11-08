-- 0012_expurgo: o expurgo (fase 12), a última migration do plano.
--  1. Viagens excluídas há 30 dias saem do banco inteiras, pela cascata das FKs. Ficam, sem a viagem
--     (`on delete set null`), o XP e as conquistas de cada pessoa (D112) e o registro das importações.
--  2. Lápides de viagens vivas saem com 90 dias, sem nunca levar outra linha em cascata, e deixam um
--     horizonte por viagem (e por pessoa, na participação). O pull de um aparelho cujo cursor é
--     anterior ao horizonte responde `resync`, com o retrato inteiro: o aparelho tira o que não veio
--     e não está pendente.
--  3. Os registros do servidor saem com 90 dias.
--  4. Os arquivos do Storage saem pela API do Storage, na Edge Function `purge`: aqui eles só são
--     listados (apagar a linha de storage.objects por SQL deixaria o arquivo).
--  5. O pg_cron chama a função às 4h de São Paulo, com a chave secreta do Vault.
-- Os cortes são parâmetros (a função os calcula de `_shared/purge.ts`), e o `dry_run` devolve as
-- mesmas contagens sem apagar nada.

-- ------------------------------------------------------- índices das FKs que o expurgo percorre
-- Apagar uma parada, um dia, uma reserva ou uma viagem confere as linhas que apontam para ela pela FK
-- (a cascata, o set null e o "nada depende dela" do expurgo). Sem índice, cada linha apagada varre a
-- tabela-filha inteira (os advisors do projeto apontavam essas FKs). As FKs para `profiles` ficam
-- sem índice: o app não apaga perfil.
create index on public.stops (trip_day_id, trip_id);
create index on public.trip_tracks (trip_day_id, trip_id);
create index on public.reservations (stop_id, trip_id);
create index on public.reservations (trip_day_id, trip_id);
create index on public.stop_memories (stop_id, trip_id);
create index on public.attachments (stop_id, trip_id);
create index on public.attachments (reservation_id, trip_id);
create index on public.checklist_items (stop_id, trip_id);
create index on public.expenses (stop_id, trip_id);
create index on public.expenses (reservation_id, trip_id);
create index on public.notification_prefs (trip_id);
create index on public.notifications_sent (trip_id);
create index on public.ai_imports (trip_id);

-- ---------------------------------------------------------------------------------- o horizonte
-- Até onde o expurgo já apagou lápides: um cursor anterior a isso talvez não tenha visto alguma
-- delas. Por viagem (o pull da viagem) e por pessoa (o pull do usuário: as participações).
create table private.trip_horizons (
  trip_id uuid primary key references public.trips on delete cascade,
  horizon timestamptz not null
);
create table private.user_horizons (
  user_id uuid primary key references public.profiles on delete cascade,
  horizon timestamptz not null
);
revoke all on private.trip_horizons, private.user_horizons from public, anon, authenticated;

create function private.trip_horizon(p_trip uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce((select h.horizon from private.trip_horizons h where h.trip_id = p_trip),
                  '-infinity'::timestamptz);
$$;
create function private.user_horizon(p_user uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select coalesce((select h.horizon from private.user_horizons h where h.user_id = p_user),
                  '-infinity'::timestamptz);
$$;
revoke all on function private.trip_horizon(uuid), private.user_horizon(uuid) from public;
grant execute on function private.trip_horizon(uuid), private.user_horizon(uuid)
  to authenticated, service_role;

-- ------------------------------------------------------------------------ o pull com o resync
-- Os dois pulls da 0003, com uma mudança: cursor anterior ao horizonte vira `-infinity`, e a resposta
-- leva `resync: true`. Na mesma resposta vai o retrato inteiro (as lápides que ainda existem
-- inclusive): o aparelho tira as linhas que não vieram e não estão pendentes numa transação só, sem
-- segunda ida à rede e sem a tela ver a viagem vazia. Um aparelho novo (cursor no começo) recebe o
-- mesmo retrato que já receberia; não há laço.
create or replace function public.sync_pull(p_trip_id uuid, p_since timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_out jsonb := jsonb_build_object('server_time', now());
  v_since timestamptz := p_since;
  v_t text;
  v_rows jsonb;
begin
  if not private.is_trip_member(p_trip_id) then
    return v_out || jsonb_build_object('revoked', true);
  end if;
  if p_since < private.trip_horizon(p_trip_id) then
    v_since := '-infinity';
    v_out := v_out || jsonb_build_object('resync', true);
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
      into v_rows using p_trip_id, v_since;
    v_out := v_out || jsonb_build_object(v_t, v_rows);
  end loop;
  -- perfis do time: os que mudaram e os de quem entrou desde o cursor
  select coalesce(jsonb_agg(to_jsonb(p) - 'field_versions'), '[]') into v_rows
    from public.profiles p
    join public.trip_members m on m.user_id = p.id and m.trip_id = p_trip_id
   where m.status = 'accepted' and m.deleted_at is null and (p.synced_at > v_since or m.synced_at > v_since);
  return v_out || jsonb_build_object('profiles', v_rows);
end $$;

create or replace function public.sync_pull_user(p_since timestamptz) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_out jsonb := jsonb_build_object('server_time', now());
  v_since timestamptz := p_since;
  v_t text;
  v_rows jsonb;
begin
  if p_since < private.user_horizon((select auth.uid())) then
    v_since := '-infinity';
    v_out := v_out || jsonb_build_object('resync', true);
  end if;
  select coalesce(jsonb_agg(to_jsonb(m) - 'field_versions'), '[]') into v_rows
    from public.trip_members m where m.user_id = (select auth.uid()) and m.synced_at > v_since;
  v_out := v_out || jsonb_build_object('memberships', v_rows);
  for v_t in select name from private.sync_tables where scope = 'user' order by rank, name loop
    execute format('select coalesce(jsonb_agg(to_jsonb(x) - ''field_versions''), ''[]'') from public.%I x where x.user_id = $1 and x.synced_at > $2', v_t)
      into v_rows using auth.uid(), v_since;
    v_out := v_out || jsonb_build_object(v_t, v_rows);
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------------- o sync_push sem o cast implícito
-- O `supabase db lint` (plpgsql_check) apontava um aviso só no projeto: o `'[]'` de texto atribuído a
-- jsonb. O corpo é o da 0003, igual, com os três casts escritos; a CI passa a reprovar aviso do lint.
create or replace function public.sync_push(p_ops jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_op jsonb; v_t private.sync_tables; v_rel regclass; v_vals jsonb; v_cols text; v_n integer;
  v_ver jsonb; v_status text; v_lost jsonb; v_code text; v_msg text; v_out jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) > 200 then
    raise exception 'lote inválido' using errcode = '22023';
  end if;

  for v_op in select value from jsonb_array_elements(p_ops) loop
    v_status := null; v_lost := '[]'::jsonb; v_code := null; v_msg := null;
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
      v_status := 'error'; v_code := sqlstate; v_msg := sqlerrm; v_lost := '[]'::jsonb;
    end;
    v_out := v_out || jsonb_strip_nulls(jsonb_build_object(
      'seq', v_op -> 'seq', 'status', v_status, 'superseded', v_lost, 'code', v_code, 'message', v_msg));
  end loop;
  return v_out;
end $$;

-- ---------------------------------------------------- a importação solta a viagem expurgada
-- O `a_close` (0010) recusa qualquer mudança numa importação encerrada, "nem o dono do banco", e numa
-- aberta só aceita o encerramento. Mas o `on delete set null` da viagem é um update: expurgar uma
-- viagem que teve importação falharia inteiro. A mudança aceita em qualquer estado é essa: a viagem
-- vira nula e nada mais muda (o cron da 0010 fecha as abertas em 10 minutos, mas o expurgo não
-- depende dele). O client não chega aqui: o grant de update da 0010 não inclui trip_id.
create or replace function private.ai_imports_close() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.trip_id is not null and new.trip_id is null
     and (to_jsonb(new) - 'trip_id') = (to_jsonb(old) - 'trip_id') then
    return new;
  end if;
  if old.status <> 'started' then
    raise exception 'esta importação já foi encerrada' using errcode = '42501';
  end if;
  if new.status = 'started' then
    raise exception 'o registro só muda para encerrar a importação' using errcode = '22023';
  end if;
  new.finished_at := now();
  return new;
end $$;

-- --------------------------------------------------------------------------------- o expurgo
-- A tabela de trabalho da passada: as lápides que se qualificam, tabela a tabela, antes de apagar (o
-- dry_run conta por ela). Vazia entre as passadas. Não é tabela temporária porque o `db lint`
-- (plpgsql_check) não enxerga tabela criada em tempo de execução.
create unlogged table private.purge_set (
  tbl       text not null,
  id        uuid not null,
  trip_id   uuid not null,
  user_id   uuid,
  synced_at timestamptz not null,
  primary key (tbl, id)
);
revoke all on private.purge_set from public, anon, authenticated;

-- Uma passada só, na ordem: as viagens, as lápides, os registros e a lista do Storage. Com
-- `p_dry_run`, conta tudo exatamente como apagaria e não apaga nada. Security definer: lê e apaga em
-- tabelas de todo mundo e em storage.objects; só a `public.purge` (service_role) e a
-- `lab_purge_preview` (executor do laboratório, sempre dry_run) a chamam.
create function private.purge(
  p_dry_run           boolean,
  p_trips_before      timestamptz,
  p_tombstones_before timestamptz,
  p_logs_before       timestamptz,
  p_orphans_before    timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_trips       uuid[];
  v_trip_count  bigint;
  v_trip_newest timestamptz;
  v_rows        jsonb := '{}'::jsonb;
  v_kept        jsonb := '{}'::jsonb;
  v_tombs       jsonb := '{}'::jsonb;
  v_logs        jsonb := '{}'::jsonb;
  v_held        bigint := 0;
  v_fk          record;
  v_t           record;
  v_l           record;
  v_holds       text;
  v_n           bigint;
  v_k           bigint;
  v_newest      timestamptz;
  v_trip_paths  text[];
  v_orphans     text[];
  v_orph_count  bigint;
  v_orph_newest timestamptz;
  v_h_trips     bigint;
  v_h_users     bigint;
begin
  if p_dry_run is null
     or num_nulls(p_trips_before, p_tombstones_before, p_logs_before, p_orphans_before) > 0 then
    raise exception 'o expurgo precisa do dry_run e dos quatro cortes' using errcode = '22023';
  end if;
  if greatest(p_trips_before, p_tombstones_before, p_logs_before, p_orphans_before) > now() then
    raise exception 'corte no futuro' using errcode = '22023';
  end if;
  -- uma passada por vez (o cron e uma chamada à mão nunca se cruzam na tabela de trabalho)
  perform pg_advisory_xact_lock(hashtext('viajei:purge'));

  -- 1. As viagens: excluídas (deleted_at) e assim no servidor (synced_at) há mais tempo que o corte.
  --    Uma exclusão feita sem sinal que só chegou ontem conta de ontem.
  select coalesce(array_agg(t.id), '{}'), count(*), max(greatest(t.deleted_at, t.synced_at))
    into v_trips, v_trip_count, v_trip_newest
    from public.trips t
   where t.deleted_at < p_trips_before and t.synced_at < p_trips_before;

  -- o que sai junto (cascata) e o que fica sem a viagem (set null), FK a FK, contado pelo catálogo;
  -- a tabela pelo regclass, com o esquema (o horizonte, em private, também aponta para a viagem)
  for v_fk in
    select r.relname, c.conrelid::regclass as rel, a.attname, c.confdeltype
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.trips'::regclass and cardinality(c.conkey) = 1
     order by r.relname
  loop
    execute format('select count(*) from %s where %I = any($1)', v_fk.rel, v_fk.attname)
      into v_n using v_trips;
    if v_fk.confdeltype = 'c' then
      v_rows := v_rows || jsonb_build_object(v_fk.relname, v_n);
    elsif v_fk.confdeltype = 'n' then
      v_kept := v_kept || jsonb_build_object(v_fk.relname, v_n);
    end if;
  end loop;

  select coalesce(array_agg(o.name order by o.name), '{}') into v_trip_paths
    from storage.objects o
   where o.bucket_id = 'attachments'
     and private.uuid_or_null(split_part(o.name, '/', 1)) = any(v_trips);

  -- 2. As lápides das viagens vivas, por `synced_at`: há quanto tempo o servidor as mostra a todos.
  --    Filhos antes dos pais (rank decrescente). Uma lápide só se qualifica quando nenhuma linha
  --    aponta para ela por FK em cascata, a não ser outra lápide que também sai nesta passada: o
  --    expurgo nunca leva uma linha em cascata (uma reserva numa parada apagada segura a parada).
  --    As FKs `set null` (missões e gastos da parada ou da reserva) soltam o vínculo, como a D93
  --    previu, e o `sync_guard` carimba a linha, que chega aos aparelhos no próximo pull.
  -- `where true`: pela API, o PostgREST roda com o safeupdate, que recusa delete sem where
  delete from private.purge_set where true;

  for v_t in
    select s.name, format('public.%I', s.name)::regclass as rel
      from private.sync_tables s
     where s.scope = 'trip' and s.name <> 'trips'
     order by s.rank desc, s.name
  loop
    select string_agg(format(
             'not exists (select 1 from %s y where (%s) = (%s) and not exists (select 1 from private.purge_set p where p.tbl = %L and p.id = y.id))',
             c.conrelid::regclass,
             (select string_agg(format('y.%I', a.attname), ', ' order by k.n)
                from unnest(c.conkey) with ordinality k(att, n)
                join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att),
             (select string_agg(format('x.%I', a.attname), ', ' order by k.n)
                from unnest(c.confkey) with ordinality k(att, n)
                join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.att),
             r.relname),
           ' and ')
      into v_holds
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
     where c.contype = 'f' and c.confrelid = v_t.rel and c.confdeltype = 'c';

    execute format(
      'insert into private.purge_set (tbl, id, trip_id, user_id, synced_at)
       select %L, x.id, x.trip_id, %s, x.synced_at
         from public.%I x
        where x.deleted_at is not null and x.synced_at < $1 and x.trip_id <> all($2) and %s',
      v_t.name,
      case when v_t.name = 'trip_members' then 'x.user_id' else 'null::uuid' end,
      v_t.name,
      coalesce(v_holds, 'true'))
      using p_tombstones_before, v_trips;

    execute format(
      'select count(*) from public.%I x where x.deleted_at is not null and x.synced_at < $1 and x.trip_id <> all($2)',
      v_t.name)
      into v_n using p_tombstones_before, v_trips;
    select count(*), max(p.synced_at) into v_k, v_newest from private.purge_set p where p.tbl = v_t.name;
    v_held := v_held + v_n - v_k;
    if v_k > 0 then
      v_tombs := v_tombs || jsonb_build_object(v_t.name, jsonb_build_object('count', v_k, 'newest', v_newest));
    end if;
  end loop;

  select count(distinct p.trip_id), count(distinct p.user_id) into v_h_trips, v_h_users
    from private.purge_set p;

  -- 3. Os registros do servidor: avisos enviados (pelo horário do aviso: o dedupe do `team_arrived`
  --    só olha paradas de hoje, e uma viagem tem no máximo 61 dias), chamadas de função (o limite
  --    olha 24 h), importações encerradas, execuções do laboratório (os cenários vão junto), a caixa
  --    do receptor de mentira e as assinaturas de push mortas.
  for v_l in
    select * from (values
      ('notifications_sent', 'scheduled_at', 'true'),
      ('edge_calls',         'created_at',   'true'),
      ('ai_imports',         'created_at',   'status <> ''started'''),
      ('lab_runs',           'started_at',   'true'),
      ('lab_inbox',          'received_at',  'true'),
      ('push_subscriptions', 'failed_at',    'failed_at is not null')
    ) as l(tbl, col, cond)
  loop
    execute format('select count(*), max(%I) from public.%I where %I < $1 and %s',
                   v_l.col, v_l.tbl, v_l.col, v_l.cond)
      into v_n, v_newest using p_logs_before;
    v_logs := v_logs || jsonb_build_object(v_l.tbl, jsonb_build_object('count', v_n, 'newest', v_newest));
    if not p_dry_run and v_n > 0 then
      execute format('delete from public.%I where %I < $1 and %s', v_l.tbl, v_l.col, v_l.cond)
        using p_logs_before;
    end if;
  end loop;

  -- 4. O Storage: além das pastas das viagens expurgadas, o objeto sem linha viva há mais que o
  --    corte (D79): sem linha nenhuma e com o objeto mais velho que o corte (o arquivo sobe antes da
  --    linha, D78), ou com a linha em lápide há mais que o corte (um "Desfazer" nunca fica sem arquivo).
  select count(*), max(o.created_at), coalesce(array_agg(o.name order by o.name), '{}')
    into v_orph_count, v_orph_newest, v_orphans
    from storage.objects o
   where o.bucket_id = 'attachments'
     and o.created_at < p_orphans_before
     and not coalesce(private.uuid_or_null(split_part(o.name, '/', 1)) = any(v_trips), false)
     and not exists (select 1 from public.attachments a
                      where a.storage_path = o.name
                        and (a.deleted_at is null or a.synced_at >= p_orphans_before));

  if not p_dry_run then
    -- as lápides, filhos antes dos pais, e o horizonte de cada viagem e de cada pessoa
    for v_t in
      select s.name from private.sync_tables s
       where s.scope = 'trip' and s.name <> 'trips'
       order by s.rank desc, s.name
    loop
      execute format('delete from public.%I x using private.purge_set p where p.tbl = %L and p.id = x.id',
                     v_t.name, v_t.name);
    end loop;
    insert into private.trip_horizons as h (trip_id, horizon)
    select distinct p.trip_id, p_tombstones_before from private.purge_set p
        on conflict (trip_id) do update set horizon = greatest(h.horizon, excluded.horizon);
    insert into private.user_horizons as h (user_id, horizon)
    select distinct p.user_id, p_tombstones_before from private.purge_set p where p.user_id is not null
        on conflict (user_id) do update set horizon = greatest(h.horizon, excluded.horizon);
    -- as viagens, por último: a cascata leva o resto, e o set null solta XP, conquistas e importações
    delete from public.trips t where t.id = any(v_trips);
  end if;

  delete from private.purge_set where true;
  return jsonb_build_object(
    'dry_run', p_dry_run,
    'trips', jsonb_build_object('count', v_trip_count, 'newest', v_trip_newest),
    'trip_rows', v_rows,
    'trip_kept', v_kept,
    'tombstones', v_tombs,
    'held', v_held,
    'horizons', jsonb_build_object('trips', v_h_trips, 'users', v_h_users),
    'logs', v_logs,
    'storage', jsonb_build_object(
      'trip_objects', cardinality(v_trip_paths),
      'orphans', jsonb_build_object('count', v_orph_count, 'newest', v_orph_newest),
      'paths', to_jsonb(v_trip_paths || v_orphans)));
end $$;
revoke all on function private.purge(boolean, timestamptz, timestamptz, timestamptz, timestamptz) from public;

-- A Edge Function chama por RPC com a chave secreta: o PostgREST só expõe `public`, e o execute é só do
-- service_role (o Supabase dá execute a `authenticated` em função nova; o revoke tira).
create function public.purge(
  p_dry_run boolean, p_trips_before timestamptz, p_tombstones_before timestamptz,
  p_logs_before timestamptz, p_orphans_before timestamptz
) returns jsonb
language sql security definer set search_path = '' as $$
  select private.purge(p_dry_run, p_trips_before, p_tombstones_before, p_logs_before, p_orphans_before);
$$;
revoke all on function public.purge(boolean, timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.purge(boolean, timestamptz, timestamptz, timestamptz, timestamptz)
  to service_role;

-- O laboratório confere o expurgo todo dia sem a chave secreta (D52): o dry_run, só as contagens,
-- para o executor do laboratório (como a lab_reset_progress: lab_access e e-mail .invalid).
create function public.lab_purge_preview(
  p_trips_before timestamptz, p_tombstones_before timestamptz,
  p_logs_before timestamptz, p_orphans_before timestamptz
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v jsonb;
begin
  if private.lab_role() is distinct from 'runner'
     or not exists (select 1 from auth.users u
                     where u.id = (select auth.uid()) and lower(u.email) like '%.invalid') then
    raise exception 'só o executor do laboratório' using errcode = '42501';
  end if;
  v := private.purge(true, p_trips_before, p_tombstones_before, p_logs_before, p_orphans_before);
  return jsonb_set(v, '{storage}', (v -> 'storage') - 'paths');
end $$;
revoke execute on function public.lab_purge_preview(timestamptz, timestamptz, timestamptz, timestamptz)
  from public, anon;
grant execute on function public.lab_purge_preview(timestamptz, timestamptz, timestamptz, timestamptz)
  to authenticated;

-- O aparelho atrasado no laboratório, sem mexer no horizonte de nenhuma viagem de verdade: o executor
-- marca o horizonte (agora) numa viagem dele, e o cursor velho forjado no navegador recebe o resync.
create function public.lab_mark_horizon(p_trip_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if private.lab_role() is distinct from 'runner'
     or not exists (select 1 from auth.users u
                     where u.id = (select auth.uid()) and lower(u.email) like '%.invalid')
     or not exists (select 1 from public.trips t
                     where t.id = p_trip_id and t.owner_id = (select auth.uid())) then
    raise exception 'só numa viagem do executor do laboratório' using errcode = '42501';
  end if;
  insert into private.trip_horizons as h (trip_id, horizon) values (p_trip_id, now())
      on conflict (trip_id) do update set horizon = greatest(h.horizon, excluded.horizon);
end $$;
revoke execute on function public.lab_mark_horizon(uuid) from public, anon;
grant execute on function public.lab_mark_horizon(uuid) to authenticated;

-- ----------------------------------------------------------------------------------- o job
-- Todo dia às 4h de São Paulo (7h UTC; o Brasil não tem horário de verão desde 2019), como a
-- send-notifications: URL e chave secreta do Vault, pelo pg_net. A função apaga de verdade só com
-- `dry_run: false` no corpo.
select cron.schedule('viajei-purge', '0 7 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'viajei_project_url') || '/functions/v1/purge',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'viajei_secret_key')),
    body := jsonb_build_object('dry_run', false),
    timeout_milliseconds := 60000);
$job$);
