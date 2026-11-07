-- 0011_clima (fase 11): o briefing da manhã com o clima. O plano não previa migration nesta fase; esta
-- só recria duas funções, com a mesma assinatura (os grants e o claim_due_notifications continuam
-- valendo). Nenhuma tabela nova: o clima no aparelho é cache (store `weather` do Dexie) e nunca
-- sincroniza; no servidor ele mora em notifications_sent.data, escrito pela send-notifications.

-- -------------------------------------------------------------------------- due_notifications
-- O corpo inteiro da 0009, sem mudança nos outros ramos. No morning_briefing:
--  - `last_point`: a última parada do dia com coordenada (onde o dia termina). A send-notifications
--    usa a mesma regra do app: o fim só conta a 50 km ou mais do começo (Papanduva, no planalto, e
--    Montenegro, no vale, têm tempos diferentes num mesmo dezembro);
--  - `first_point` passa a ignorar parada pulada, como os lugares do app. Era só o gancho que a 0009
--    deixou para esta fase: ninguém o lia.
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
                              -- os lugares do clima (fase 11): onde o dia começa e onde termina, a primeira
                              -- e a última parada viva, não pulada, com coordenada; a regra dos 50 km e o
                              -- arredondamento são os do app (_shared/weather.ts), na send-notifications
                              'first_point', (select jsonb_build_object('lat', s.lat, 'lng', s.lng) from today_stops s
                                               where s.trip_day_id = d.id and s.lat is not null and not s.skipped
                                               order by s.position collate "C" limit 1),
                              'last_point', (select jsonb_build_object('lat', s.lat, 'lng', s.lng) from today_stops s
                                              where s.trip_day_id = d.id and s.lat is not null and not s.skipped
                                              order by s.position collate "C" desc limit 1))
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


-- ---------------------------------------------------------------------------- lab_diagnostics
-- O laboratório confere o briefing pelo que a função gravou: com clima, o texto pelo formato; sem
-- clima, o motivo. `notifications_sent` é invisível ao client, então o fato sai por aqui, como o
-- resto do diagnóstico: só o `data.weather`, só das linhas dos usuários do laboratório.
create or replace function public.lab_diagnostics(p_since timestamptz) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.lab_role() is null then
    raise exception 'só para o laboratório' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'cron', coalesce((
      select jsonb_agg(jsonb_build_object('start', r.start_time, 'status', r.status,
                                          'message', left(r.return_message, 200)) order by r.start_time desc)
        from (select d.start_time, d.status, d.return_message
                from cron.job_run_details d join cron.job j on j.jobid = d.jobid
               where j.jobname = 'viajei-send-notifications' and d.start_time >= p_since
               order by d.start_time desc limit 15) r), '[]'::jsonb),
    'http', coalesce((
      select jsonb_agg(jsonb_build_object('at', h.created, 'status', h.status_code, 'timed_out', h.timed_out,
                                          'error', left(h.error_msg, 200), 'body', left(h.content, 300))
                       order by h.created desc)
        from (select x.created, x.status_code, x.timed_out, x.error_msg, x.content
                from net._http_response x where x.created >= p_since
               order by x.created desc limit 15) h), '[]'::jsonb),
    'sent', coalesce((
      select jsonb_agg(jsonb_build_object('kind', n.kind, 'ref', n.ref, 'status', n.status, 'attempts', n.attempts,
                                          'error', n.error, 'scheduled_at', n.scheduled_at, 'sent_at', n.sent_at,
                                          'weather', n.data -> 'weather')
                       order by n.scheduled_at)
        from public.notifications_sent n join private.lab_access a on a.user_id = n.user_id
       where n.created_at >= p_since), '[]'::jsonb));
end $$;
