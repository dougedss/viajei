-- 0009_progressao: XP e conquistas (somente-anexar), o resumo público da progressão no perfil, o
-- aviso "retrospectiva pronta" e a limpeza de progressão do laboratório. Fase 9.
-- Parte da DDL base do Passo 0 (bloco 0007 de lá). As diferenças, cada uma com o porquê, estão nos
-- comentários e em docs/decisoes.md (D112 a D114).
--
-- Somente-anexar: cada aparelho deriva dos dados o que a própria pessoa ganhou e grava pela outbox,
-- com id determinístico. Duas abas, dois aparelhos ou o mesmo fato derivado de novo caem na mesma
-- linha, e o sync_push devolve `ignored` (mode = 'append'). Nada se edita nem se apaga: desmarcar não
-- tira XP, e remarcar não dá de novo.

-- Conquistas. Diferenças da base:
--  - `unlocked_at` é a hora do fato (o done_at da parada, a hora do envio), não a da derivação, e é
--    limitada a agora + 2 min, o mesmo teto do sync_guard: um relógio adiantado não grava o futuro.
--  - insert só de viagem em que a pessoa está (ou sem viagem), pela policy.
--  - índice (trip_id, synced_at) para o pull da viagem (C6) e aviso no Realtime da viagem.
create table public.achievements (
  id          uuid primary key,                                  -- v5(user_id, 'achievement:' || key)
  user_id     uuid not null references public.profiles on delete cascade,
  trip_id     uuid references public.trips on delete set null,    -- o expurgo não apaga a conquista
  key         text not null check (key in ('first_stop', 'early_bird', 'on_time_3', 'nature_3', 'winery_2',
                'offline_hero', 'ready_to_go', 'on_budget', 'photographer', 'chronicler', 'trip_done',
                'team', 'planner', 'coast', 'downhill')),
  unlocked_at timestamptz not null,
  created_at  timestamptz not null default now(),
  synced_at   timestamptz not null,
  unique (user_id, key),
  check (id = extensions.uuid_generate_v5(user_id, 'achievement:' || key))
);

-- Eventos de XP. Diferenças da base:
--  - os pontos amarrados ao tipo, espelhando `XP_POINTS` em _shared/constants.ts (a base aceitava de
--    1 a 200 em qualquer tipo). Não é antifraude, não há ranking: é o banco e a regra dizendo o mesmo.
--  - o formato do ref_id conferido: id de linha nos tipos por linha; `<viagem>:before|pack` na lista
--    completa e o próprio id da viagem na viagem concluída, amarrados ao trip_id (com o trip_id nulo
--    depois do expurgo, o check passa).
--  - insert exige trip_id e viagem de que a pessoa é membro, pela policy.
--  - índice (trip_id, synced_at) para o pull da viagem (C6) e aviso no Realtime da viagem.
create table public.xp_events (
  id         uuid primary key,                                   -- v5(user_id, kind || ':' || ref_id)
  user_id    uuid not null references public.profiles on delete cascade,
  trip_id    uuid references public.trips on delete set null,     -- o expurgo não apaga o XP de ninguém
  kind       text not null check (kind in ('stop_done', 'departure_on_time', 'memory_rating', 'memory_photo',
               'checklist_item', 'checklist_complete', 'quest_done', 'expense_logged', 'reservation_added',
               'trip_completed')),
  ref_id     text not null,
  points     smallint not null,
  created_at timestamptz not null default now(),
  synced_at  timestamptz not null,
  unique (user_id, kind, ref_id),
  check (id = extensions.uuid_generate_v5(user_id, kind || ':' || ref_id)),
  check (case kind
           when 'stop_done'          then points = 10
           when 'departure_on_time'  then points = 15
           when 'memory_rating'      then points = 5
           when 'memory_photo'       then points = 10
           when 'checklist_item'     then points = 2
           when 'checklist_complete' then points = 20
           when 'quest_done'         then points between 10 and 30
           when 'expense_logged'     then points = 2
           when 'reservation_added'  then points = 5
           when 'trip_completed'     then points = 100
         end),
  check (case kind
           when 'checklist_complete' then ref_id in (trip_id::text || ':before', trip_id::text || ':pack')
           when 'trip_completed'     then ref_id = trip_id::text
           else ref_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         end)
);

-- unlocked_at nunca no futuro do servidor (com a folga de 2 min do sync_guard)
create function private.clamp_unlocked() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.unlocked_at := least(new.unlocked_at, clock_timestamp() + interval '2 minutes');
  return new;
end $$;

-- O resumo público da progressão no perfil: o total de XP e as chaves das conquistas, recalculados da
-- fonte a cada insert (nunca somados: o resumo não se desvia do que está nas tabelas). É a fonte do
-- nível do time: o perfil de cada membro já viaja para o time pelo sync_pull e funciona sem sinal,
-- enquanto o pull da viagem só traz o XP com o trip_id dela (D113).
alter table public.profiles
  add column xp_total integer not null default 0 check (xp_total >= 0),
  add column achievement_keys text[] not null default '{}';
-- o client continua editando só nome e cor (grant de coluna da 0002): o resumo é do servidor

create function private.refresh_progress() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles p
     set xp_total = (select coalesce(sum(x.points), 0) from public.xp_events x where x.user_id = new.user_id),
         achievement_keys = (select coalesce(array_agg(a.key order by a.key), '{}')
                                from public.achievements a where a.user_id = new.user_id)
   where p.id = new.user_id;
  return null;
end $$;
revoke all on function private.refresh_progress() from public;

-- para as duas tabelas: carimbo do sync, resumo no perfil, aviso no Realtime da viagem
create trigger a_clamp before insert on public.achievements
  for each row execute function private.clamp_unlocked();
create trigger b_sync before insert on public.achievements
  for each row execute function private.stamp_synced();
create trigger b_sync before insert on public.xp_events
  for each row execute function private.stamp_synced();
create trigger c_progress after insert on public.achievements
  for each row execute function private.refresh_progress();
create trigger c_progress after insert on public.xp_events
  for each row execute function private.refresh_progress();
-- O Realtime (D114): as tabelas de escopo `user` não avisavam ninguém. Com o aviso na viagem da linha,
-- o time vê na hora o que o outro ganhou (o acessório liberado na garagem, o nível do cabeçalho).
create trigger d_broadcast after insert on public.achievements
  for each row execute function private.broadcast_trip_change('trip_id');
create trigger d_broadcast after insert on public.xp_events
  for each row execute function private.broadcast_trip_change('trip_id');

-- RLS: cada um grava só o seu, e só de viagem em que está; o time lê (shares_trip_with). Sem update
-- nem delete: somente-anexar.
alter table public.achievements enable row level security;
alter table public.xp_events    enable row level security;
revoke update, delete, truncate on public.achievements, public.xp_events from authenticated;
create policy "conquistas: minhas e do time" on public.achievements for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_trip_with(user_id));
create policy "conquistas: as minhas, de viagem minha" on public.achievements for insert to authenticated
  with check (user_id = (select auth.uid()) and (trip_id is null or private.is_trip_member(trip_id)));
create policy "xp: meu e do time" on public.xp_events for select to authenticated
  using (user_id = (select auth.uid()) or private.shares_trip_with(user_id));
create policy "xp: o meu, de viagem minha" on public.xp_events for insert to authenticated
  with check (user_id = (select auth.uid()) and trip_id is not null and private.is_trip_member(trip_id));

create index on public.achievements (user_id, synced_at);
create index on public.achievements (trip_id, synced_at);     -- C6: o pull da viagem
create index on public.xp_events (user_id, synced_at);
create index on public.xp_events (trip_id, synced_at);        -- C6: o pull da viagem
insert into private.sync_tables (name, scope, mode, rank)
values ('achievements', 'user', 'append', 90), ('xp_events', 'user', 'append', 90);

-- O laboratório começa do zero todo dia (conquista não se apaga, e o cenário de progressão precisa do
-- primeiro desbloqueio). Apaga a progressão de quem chama, e só de usuário de laboratório: executor
-- em lab_access E e-mail no domínio reservado `.invalid` (RFC 2606). Nenhuma conta real passa nas duas
-- condições: a conta real que está em lab_access é `viewer`, e nenhum e-mail real termina em .invalid.
create function public.lab_reset_progress() returns integer
language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := (select auth.uid()); v_n integer;
begin
  if private.lab_role() is distinct from 'runner'
     or not exists (select 1 from auth.users u where u.id = v_uid and lower(u.email) like '%.invalid') then
    raise exception 'só usuário de laboratório' using errcode = '42501';
  end if;
  delete from public.xp_events where user_id = v_uid;
  get diagnostics v_n = row_count;
  delete from public.achievements where user_id = v_uid;
  update public.profiles set xp_total = 0, achievement_keys = '{}' where id = v_uid;
  return v_n;
end $$;
revoke execute on function public.lab_reset_progress() from public, anon;
grant execute on function public.lab_reset_progress() to authenticated;

-- O aviso "retrospectiva pronta": a 0009 recria o due_notifications inteiro (create or replace, a mesma
-- assinatura da 0005: o claim_due_notifications e os grants continuam valendo). Os outros ramos são os
-- da 0008, sem mudança; o novo é o retro_ready, no fim. Os fatos vão em `data` (D38) e o texto mora em
-- _shared/notifications.ts, por isso a send-notifications é republicada.
create or replace function public.due_notifications(p_now timestamptz default now())
returns table (user_id uuid, kind text, ref text, scheduled_at timestamptz,
               trip_id uuid, trip_day_id uuid, stop_id uuid, data jsonb)
language sql stable security definer set search_path = '' as $$
  with win as (
    select date_trunc('minute', p_now) as t1,
           date_trunc('minute', p_now) - interval '10 minutes' as t0,
           (p_now at time zone 'America/Sao_Paulo')::date as today),
  members as (                                   -- membros aceitos, com as preferências ou os padrões
    select m.trip_id, m.user_id, t.name as trip_name, t.start_date, t.end_date,
           coalesce(p.enabled, true) as enabled, coalesce(p.lead_minutes, 15) as lead,
           coalesce(p.kinds, '{}'::jsonb) as kinds, coalesce(p.morning_time, '07:00'::time) as morning
      from public.trip_members m
      join public.trips t on t.id = m.trip_id and t.deleted_at is null
      left join public.notification_prefs p on p.user_id = m.user_id and p.trip_id = m.trip_id
     where m.status = 'accepted' and m.deleted_at is null and m.user_id is not null),
  days as (                                      -- os dias das viagens que têm dia hoje, com índice e total
    select d.id, d.trip_id, d.date,
           row_number() over (partition by d.trip_id order by d.date) as day_index,
           count(*) over (partition by d.trip_id) as day_count
      from public.trip_days d, win
     where d.deleted_at is null
       and d.trip_id in (select x.trip_id from public.trip_days x where x.date = win.today and x.deleted_at is null)),
  today_stops as (
    select s.*, d.date
      from public.stops s join days d on d.id = s.trip_day_id, win
     where s.deleted_at is null and d.date = win.today),
  state as (                                     -- at e next por dia, como linhas de public.stops
    select d.*,
           (select s from public.stops s
             where s.trip_day_id = d.id and s.deleted_at is null and s.done_at is not null
             order by s.position collate "C" desc limit 1) as at,
           (select s from public.stops s
             where s.trip_day_id = d.id and s.deleted_at is null and s.done_at is null and not s.skipped
             order by s.position collate "C" limit 1) as next
      from days d, win
     where d.date = win.today),
  leaving as (                                   -- "sair às" de cada dia; null quando não há aviso de saída
    select st.trip_id, st.id as trip_day_id, (st.next).id as stop_id, (st.next).name as next_name,
           (st.next).kind as next_kind, (st.next).time as next_time,
           (st.at).name as from_name, (st.at).travel_minutes_to_next as travel,
           case
             when (st.at).id is not null and (st.at).departed_at is null and (st.next).time is not null
                  and (st.at).travel_minutes_to_next is not null
               then ((st.date + (st.next).time) at time zone 'America/Sao_Paulo')
                    - make_interval(mins => (st.at).travel_minutes_to_next)
             when (st.at).id is null and (st.next).kind in ('origin', 'transit') and (st.next).time is not null
               then (st.date + (st.next).time) at time zone 'America/Sao_Paulo'
           end as leave_at
      from state st
     where (st.next).id is not null),           -- "is not null" numa linha composta exigiria todos os campos
  due as (
    -- departure_soon (leave_at - lead) e departure_now (leave_at), num ramo só
    select mb.user_id, k.kind as kind, l.stop_id::text as ref,
           l.leave_at - make_interval(mins => case k.kind when 'departure_soon' then mb.lead else 0 end) as scheduled_at,
           l.trip_id, l.trip_day_id, l.stop_id,
           jsonb_build_object('trip_name', mb.trip_name, 'stop_name', l.next_name, 'stop_kind', l.next_kind,
                              'stop_time', to_char(l.next_time, 'HH24:MI'), 'from_name', l.from_name,
                              'travel_minutes', l.travel, 'lead_minutes', mb.lead,
                              'leave_time', to_char(l.leave_at at time zone 'America/Sao_Paulo', 'HH24:MI')) as data
      from leaving l
      join members mb on mb.trip_id = l.trip_id
      cross join (values ('departure_soon'), ('departure_now')) as k(kind)
     where l.leave_at is not null and mb.enabled and coalesce((mb.kinds ->> k.kind)::boolean, true)
    union all
    -- closes_soon: 60 min antes de fechar, parada de hoje ainda sem done_at
    select mb.user_id, 'closes_soon', s.id::text,
           ((s.date + s.closes_at) at time zone 'America/Sao_Paulo') - interval '60 minutes',
           s.trip_id, s.trip_day_id, s.id,
           jsonb_build_object('trip_name', mb.trip_name, 'stop_name', s.name,
                              'closes_time', to_char(s.closes_at, 'HH24:MI'), 'is_next', (st.next).id = s.id)
      from today_stops s
      join state st on st.id = s.trip_day_id
      join members mb on mb.trip_id = s.trip_id
     where s.closes_at is not null and s.done_at is null and not s.skipped
       and mb.enabled and coalesce((mb.kinds ->> 'closes_soon')::boolean, true)
    union all
    -- morning_briefing: date + morning_time da pessoa
    select mb.user_id, 'morning_briefing', d.id::text,
           (d.date + mb.morning) at time zone 'America/Sao_Paulo',
           d.trip_id, d.id, null,
           jsonb_build_object('trip_name', mb.trip_name, 'date', d.date, 'day_index', d.day_index, 'day_count', d.day_count,
                              'stops_count', (select count(*) from today_stops s where s.trip_day_id = d.id and not s.skipped),
                              'first_time', (select to_char(min(s.time), 'HH24:MI') from today_stops s where s.trip_day_id = d.id),
                              'first_kind', (select s.kind from today_stops s where s.trip_day_id = d.id and s.time is not null
                                              order by s.time, s.position collate "C" limit 1),
                              -- gancho do clima (fase 11): a primeira parada com coordenada
                              'first_point', (select jsonb_build_object('lat', s.lat, 'lng', s.lng) from today_stops s
                                               where s.trip_day_id = d.id and s.lat is not null
                                               order by s.position collate "C" limit 1))
      from days d
      join members mb on mb.trip_id = d.trip_id, win
     where d.date = win.today and mb.enabled and coalesce((mb.kinds ->> 'morning_briefing')::boolean, true)
    union all
    -- eve_checklist: véspera do start_date, 19:00 de São Paulo, com o que falta nas duas listas (itens
    -- ativos e vivos sem done_at). O between deixa as contagens só para as viagens que começam amanhã;
    -- a conta exata é o filtro final de scheduled_at.
    select mb.user_id, 'eve_checklist', mb.trip_id::text,
           ((mb.start_date - 1) + time '19:00') at time zone 'America/Sao_Paulo',
           mb.trip_id, null, null,
           jsonb_build_object('trip_name', mb.trip_name, 'start_date', mb.start_date,
                              'first_time', (select to_char(min(s.time), 'HH24:MI')
                                               from public.stops s join public.trip_days d on d.id = s.trip_day_id
                                              where d.trip_id = mb.trip_id and d.date = mb.start_date
                                                and s.deleted_at is null and d.deleted_at is null and not s.skipped),
                              'first_kind', (select s.kind
                                               from public.stops s join public.trip_days d on d.id = s.trip_day_id
                                              where d.trip_id = mb.trip_id and d.date = mb.start_date
                                                and s.deleted_at is null and d.deleted_at is null and not s.skipped and s.time is not null
                                              order by s.time, s.position collate "C" limit 1),
                              'before_left', (select count(*) from public.checklist_items c
                                               where c.trip_id = mb.trip_id and c.kind = 'before' and c.status = 'active'
                                                 and c.deleted_at is null and c.done_at is null),
                              'pack_left', (select count(*) from public.checklist_items c
                                             where c.trip_id = mb.trip_id and c.kind = 'pack' and c.status = 'active'
                                               and c.deleted_at is null and c.done_at is null))
      from members mb, win
     where mb.start_date between (win.t0 at time zone 'America/Sao_Paulo')::date + 1
                             and (win.t1 at time zone 'America/Sao_Paulo')::date + 1
       and mb.enabled and coalesce((mb.kinds ->> 'eve_checklist')::boolean, true)
    union all
    -- cancel_deadline: véspera do cancel_until, 10:00 de São Paulo; reserva viva de viagem viva
    -- (members já exclui viagem apagada). O between usa o índice parcial; a conta exata é o filtro
    -- final de scheduled_at.
    select mb.user_id, 'cancel_deadline', r.id::text,
           ((r.cancel_until - 1) + time '10:00') at time zone 'America/Sao_Paulo',
           r.trip_id, null, null,
           jsonb_build_object('trip_name', mb.trip_name, 'reservation_name', r.name,
                              'reservation_type', r.type, 'cancel_until', r.cancel_until)
      from public.reservations r
      join members mb on mb.trip_id = r.trip_id, win
     where r.deleted_at is null and r.cancel_until is not null
       and r.cancel_until between (win.t0 at time zone 'America/Sao_Paulo')::date + 1
                              and (win.t1 at time zone 'America/Sao_Paulo')::date + 1
       and mb.enabled and coalesce((mb.kinds ->> 'cancel_deadline')::boolean, true)
    union all
    -- team_arrived: a hora em que o servidor soube (synced_at), nunca para quem marcou; padrão desligado
    select mb.user_id, 'team_arrived', s.id::text, date_trunc('minute', s.synced_at),
           s.trip_id, s.trip_day_id, s.id,
           jsonb_build_object('trip_name', mb.trip_name, 'stop_name', s.name, 'stop_kind', s.kind,
                              'done_time', to_char(s.done_at at time zone 'America/Sao_Paulo', 'HH24:MI'),
                              'actor_name', (select p.name from public.profiles p where p.id = s.done_by))
      from today_stops s
      join members mb on mb.trip_id = s.trip_id and mb.user_id is distinct from s.done_by
     where s.done_at is not null and s.done_by is not null
       and mb.enabled and coalesce((mb.kinds ->> 'team_arrived')::boolean, false)
    union all
    -- retro_ready: o dia seguinte ao fim, 9h de São Paulo, só para a viagem que aconteceu (pelo menos
    -- uma parada concluída: viagem que não aconteceu não ganha filme). O between deixa só as viagens
    -- que terminaram ontem (no dia da janela); a conta exata é o filtro final de scheduled_at.
    select mb.user_id, 'retro_ready', mb.trip_id::text,
           ((mb.end_date + 1) + time '09:00') at time zone 'America/Sao_Paulo',
           mb.trip_id, null, null,
           jsonb_build_object('trip_name', mb.trip_name,
                              'days', mb.end_date - mb.start_date + 1,
                              'stops_done', (select count(*) from public.stops s
                                               join public.trip_days d on d.id = s.trip_day_id
                                              where s.trip_id = mb.trip_id and s.deleted_at is null
                                                and d.deleted_at is null and s.done_at is not null))
      from members mb, win
     where mb.end_date + 1 between (win.t0 at time zone 'America/Sao_Paulo')::date
                               and (win.t1 at time zone 'America/Sao_Paulo')::date
       and mb.enabled and coalesce((mb.kinds ->> 'retro_ready')::boolean, true)
       and exists (select 1 from public.stops s
                     join public.trip_days d on d.id = s.trip_day_id
                    where s.trip_id = mb.trip_id and s.deleted_at is null
                      and d.deleted_at is null and s.done_at is not null)
  )
  select d.user_id, d.kind, d.ref, d.scheduled_at, d.trip_id, d.trip_day_id, d.stop_id, d.data
    from due d, win
   where d.scheduled_at > win.t0 and d.scheduled_at <= win.t1
     -- team_arrived: um aviso por parada e destinatário, em qualquer minuto (synced_at muda em
     -- qualquer edição da parada; desfazer e marcar de novo também não repete)
     and not exists (select 1 from public.notifications_sent x
                      where x.user_id = d.user_id and x.kind = d.kind and x.ref = d.ref
                        and (x.scheduled_at = d.scheduled_at or d.kind = 'team_arrived'));
$$;
