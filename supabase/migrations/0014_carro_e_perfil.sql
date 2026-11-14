-- 0014_carro_e_perfil: o carro passa a ser da pessoa, não da viagem (fase 16, decisão 3 do Douglas
-- em 08/11), e o perfil guarda os padrões dos avisos das viagens novas.
--  1. `profiles` ganha o carro (`car_model`, `car_color`, `car_accessories`, com os mesmos `check` de
--     `trips`, mais o acabamento da tinta `car_finish` e o estilo de roda `car_wheels`) e os padrões dos
--     avisos (`notify_lead_minutes`, `notify_morning_time`), com que a linha de `notification_prefs`
--     de uma viagem nova nasce no aparelho.
--  2. O grant de update de coluna passa a incluir essas colunas, só na linha da própria pessoa (a
--     policy "perfil: editar o próprio" da 0002). O resumo da progressão continua só do servidor.
--  3. O perfil entra no sync com um escopo novo, `self` (a linha da própria pessoa): o `sync_push`
--     aceita o patch do carro pela outbox, offline, e o `sync_pull_user` traz o próprio perfil. Os
--     perfis do time já chegam pelo pull da viagem, com todas as colunas (D113): o carro de cada um
--     chega ao comboio sem sinal.
--  4. A cópia: cada perfil recebe o carro da viagem mais recente de que a pessoa é dona.
--  5. Um aviso no Realtime das viagens da pessoa quando o carro, o nome ou a cor mudam: o time vê o
--     carro novo sem esperar o próximo ciclo.
-- As colunas `car_*` de `trips` ficam: um PWA antigo em cache ainda pode gravá-las, e uma migration
-- depois as tira. Nada aqui apaga ou muda o que já existe além da cópia.

-- ------------------------------------------------------------------------- 1. as colunas
alter table public.profiles
  add column car_model text not null default 'hatch'
    check (car_model in ('hatch', 'sedan', 'suv', 'pickup', 'kombi')),
  add column car_color text not null default 'sunset'
    check (car_color in ('sunset', 'sky', 'leaf', 'grape', 'sand', 'mist', 'night', 'gold')),
  add column car_accessories text[] not null default '{}',
  add column car_finish text not null default 'solid'
    check (car_finish in ('solid', 'metallic', 'pearl', 'matte')),
  add column car_wheels text not null default 'classic'
    check (car_wheels in ('classic', 'five', 'wire', 'steel')),
  add column notify_lead_minutes smallint not null default 15
    check (notify_lead_minutes between 5 and 120),
  add column notify_morning_time time not null default '07:00';

-- ------------------------------------------------------------------------- 2. o grant
revoke update on public.profiles from authenticated;
grant update (name, color, updated_at, field_versions,
              car_model, car_color, car_accessories, car_finish, car_wheels,
              notify_lead_minutes, notify_morning_time)
  on public.profiles to authenticated;

-- ------------------------------------------------------------------------- 3. o sync
-- `self`: a linha é a própria pessoa (a chave é o id, não um user_id nem um trip_id). O pull da
-- viagem e o expurgo só percorrem o escopo `trip`; o pull do usuário, o `user` e, agora, o perfil.
alter table private.sync_tables
  drop constraint sync_tables_scope_check,
  add constraint sync_tables_scope_check check (scope in ('trip', 'user', 'self'));
-- rank 5: o perfil é pai de tudo (as viagens, rank 10, apontam para ele)
insert into private.sync_tables (name, scope, mode, rank) values ('profiles', 'self', 'lww', 5);

-- O pull do usuário da 0012, igual, com o próprio perfil na resposta (`profiles`, como no pull da
-- viagem): o carro escolhido num aparelho chega ao outro da mesma pessoa, mesmo sem viagem nenhuma.
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
  select coalesce(jsonb_agg(to_jsonb(p) - 'field_versions'), '[]') into v_rows
    from public.profiles p where p.id = (select auth.uid()) and p.synced_at > v_since;
  return v_out || jsonb_build_object('profiles', v_rows);
end $$;

-- ------------------------------------------------------------------------- 4. a cópia
-- O carro da viagem mais recente de que a pessoa é dona (por `start_date`, depois `updated_at`; a
-- viagem excluída não conta), num update normal: o `sync_guard` carimba a versão das colunas que
-- mudaram e o `synced_at`, e o perfil chega aos aparelhos do time no próximo pull. O acabamento não
-- existia: a Névoa e o Dourado eram metálicos pela cor (D73) e continuam metálicos; as outras cores,
-- lisas. A roda é a de sempre. Quem não é dono de viagem nenhuma fica com o padrão (hatch Pôr do
-- sol). Uma função, para o pgTAP conferir a regra em dados de teste; a migration a chama uma vez.
create function private.copy_trip_cars() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update public.profiles p
     set car_model = t.car_model,
         car_color = t.car_color,
         car_accessories = t.car_accessories,
         car_finish = case when t.car_color in ('mist', 'gold') then 'metallic' else 'solid' end,
         car_wheels = 'classic'
    from (select distinct on (x.owner_id) x.owner_id, x.car_model, x.car_color, x.car_accessories
            from public.trips x
           where x.deleted_at is null
           order by x.owner_id, x.start_date desc, x.updated_at desc) t
   where t.owner_id = p.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function private.copy_trip_cars() from public;

select private.copy_trip_cars();

-- ------------------------------------------------------------------------- 5. o aviso
-- Como o `broadcast_trip_change` (0001), um aviso por viagem por transação, em cada viagem em que a
-- pessoa está aceita. Só quando o que o time vê do perfil mudou de fato (o `sync_guard` devolve a
-- coluna antiga quando a escrita é velha): o resumo da progressão já avisa pelo XP e pelas
-- conquistas (D114). Criado depois da cópia: ela chega aos aparelhos pelo pull de sempre.
create function private.broadcast_profile_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_trip uuid;
  v_sent text;
begin
  for v_trip in
    select m.trip_id from public.trip_members m
     where m.user_id = new.id and m.status = 'accepted' and m.deleted_at is null
  loop
    v_sent := coalesce(current_setting('viajei.notified', true), '');
    if position(v_trip::text in v_sent) = 0 then
      perform realtime.send('{}'::jsonb, 'change', 'trip:' || v_trip, true);
      perform set_config('viajei.notified', v_sent || v_trip || ',', true);
    end if;
  end loop;
  return null;
end $$;
revoke all on function private.broadcast_profile_change() from public;

create trigger d_broadcast after update on public.profiles
  for each row
  when ((old.name, old.color, old.car_model, old.car_color, old.car_accessories, old.car_finish, old.car_wheels)
        is distinct from
        (new.name, new.color, new.car_model, new.car_color, new.car_accessories, new.car_finish, new.car_wheels))
  execute function private.broadcast_profile_change();
