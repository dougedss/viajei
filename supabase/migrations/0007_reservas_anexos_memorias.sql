-- 0007_reservas_anexos_memorias: reservas, memórias por pessoa, anexos (fotos e documentos), o bucket
-- privado do Storage com as policies, e o aviso de prazo de cancelamento. Fase 7.
-- Parte da DDL base do Passo 0 (bloco 0005 de lá), com a correção C8 e as diferenças de D76.

-- Reservas. Ligada a uma parada ou a um dia, ou a nada (uma parada já diz o dia; as duas juntas
-- poderiam divergir quando a parada muda de dia). `created_by` existe para o XP `reservation_added`
-- da fase 9 ("quem cadastrou") ser derivável dos dados.
create table public.reservations (
  id                uuid primary key,
  trip_id           uuid not null references public.trips on delete cascade,
  stop_id           uuid,
  trip_day_id       uuid,
  type              text not null check (type in ('hotel', 'ticket', 'restaurant', 'other')),
  name              text not null check (char_length(name) between 1 and 120),
  start_at          timestamptz,
  end_at            timestamptz,
  confirmation_code text check (char_length(confirmation_code) <= 80),
  amount            numeric(10, 2) check (amount >= 0),
  cancel_policy     text check (char_length(cancel_policy) <= 500),
  cancel_until      date,
  phone             text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  address           text check (char_length(address) <= 300),
  booked_via        text check (char_length(booked_via) <= 80),
  notes             text check (char_length(notes) <= 2000),
  created_by        uuid not null references public.profiles,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  unique (id, trip_id),                                    -- alvo da FK composta dos anexos
  foreign key (stop_id, trip_id)     references public.stops (id, trip_id) on delete cascade,
  foreign key (trip_day_id, trip_id) references public.trip_days (id, trip_id) on delete cascade,
  check (num_nonnulls(stop_id, trip_day_id) <= 1),
  check (end_at is null or (start_at is not null and end_at >= start_at))
);
call private.enable_trip_sync('reservations', 50, '{trip_id,created_by}');
create policy "reserva: quem cadastra é quem envia" on public.reservations as restrictive
  for insert to authenticated with check (created_by = (select auth.uid()));
-- o ramo cancel_deadline do due_notifications lê só as reservas vivas com prazo
create index on public.reservations (cancel_until) where deleted_at is null and cancel_until is not null;

-- Memória por pessoa e parada: id = v5(stop_id, user_id), para dois aparelhos sem sinal escreverem a
-- mesma linha. O time lê; só a própria pessoa escreve (o padrão da D23).
create table public.stop_memories (
  id      uuid primary key,                                -- v5(stop_id, user_id)
  trip_id uuid not null references public.trips on delete cascade,
  stop_id uuid not null,
  user_id uuid not null references public.profiles on delete cascade,
  rating  smallint check (rating between 1 and 5),
  memo    text check (char_length(memo) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  unique (stop_id, user_id),
  foreign key (stop_id, trip_id) references public.stops (id, trip_id) on delete cascade,
  check (id = extensions.uuid_generate_v5(stop_id, user_id::text))
);
call private.enable_trip_sync('stop_memories', 50, '{trip_id,stop_id,user_id}');
create policy "só a própria memória" on public.stop_memories as restrictive
  for all to authenticated using (true) with check (user_id = (select auth.uid()));

-- Anexos. Foto é de memória (stop_id, de quem tirou); documento é de reserva (print ou PDF). O
-- arquivo é imutável, então o que o descreve também é: medidas, tamanho, tipo e o placeholder
-- (thumbhash em base64, o borrão que aparece antes do arquivo chegar). A linha só nasce no servidor
-- depois do arquivo: a fila de envio do client sobe o objeto e só então grava pela outbox.
create table public.attachments (
  id             uuid primary key,
  trip_id        uuid not null references public.trips on delete cascade,
  reservation_id uuid,
  stop_id        uuid,
  kind           text not null check (kind in ('photo', 'document')),
  storage_path   text not null unique,
  filename       text not null check (char_length(filename) between 1 and 200),
  mime           text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes     integer not null check (size_bytes between 1 and 10485760),
  width          integer check (width between 1 and 10000),
  height         integer check (height between 1 and 10000),
  placeholder    text check (char_length(placeholder) <= 64),
  created_by     uuid not null references public.profiles,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  foreign key (reservation_id, trip_id) references public.reservations (id, trip_id) on delete cascade,
  foreign key (stop_id, trip_id)        references public.stops (id, trip_id) on delete cascade,
  check (num_nonnulls(reservation_id, stop_id) = 1),
  check ((kind = 'photo') = (stop_id is not null)),
  check (storage_path = trip_id::text || '/' || id::text || '.' ||
         case mime when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
                   when 'image/webp' then 'webp' else 'pdf' end),
  check ((width is null) = (height is null)),
  check ((mime = 'application/pdf') = (width is null)),
  check (kind = 'photo' or placeholder is null)
);
call private.enable_trip_sync('attachments', 60,
  '{trip_id,kind,storage_path,created_by,reservation_id,stop_id,mime,size_bytes,width,height,placeholder}');
create policy "anexo é de quem enviou" on public.attachments as restrictive
  for insert to authenticated with check (created_by = (select auth.uid()));
-- a foto é da memória de quem tirou; o documento é da reserva, que é do time
create policy "foto de memória: só quem tirou mexe" on public.attachments as restrictive
  for update to authenticated using (stop_id is null or created_by = (select auth.uid()));

-- Storage: bucket privado, 10 MB, sem image/heic (C8: o Blob em cache de um HEIC não abre no
-- Android nem no Chrome; o client sempre converte a foto para JPEG).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

-- Há linha viva apontando para o objeto? Security definer porque a policy do Storage roda como o
-- usuário e não deve depender da RLS de attachments para responder.
create function private.attachment_is_live(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.attachments a where a.storage_path = p_path and a.deleted_at is null)
$$;
revoke all on function private.attachment_is_live(text) from public;
grant execute on function private.attachment_is_live(text) to authenticated, service_role;

-- O primeiro segmento do caminho é a viagem; membros leem e enviam ali, no formato {viagem}/{anexo}.{ext}.
create policy "anexos: membros leem" on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and private.is_trip_member(private.uuid_or_null((storage.foldername(name))[1])));
create policy "anexos: membros enviam" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments'
              and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$'
              and private.is_trip_member(private.uuid_or_null((storage.foldername(name))[1])));
-- Apagar é imediato e sem volta; tirar a linha não. Por isso só quem enviou ou o dono da viagem, e
-- só depois da lápide: o servidor nunca fica com linha viva sem arquivo.
create policy "anexos: quem enviou ou o dono apagam, sem linha viva" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and (owner_id = (select auth.uid())::text
              or private.is_trip_owner(private.uuid_or_null((storage.foldername(name))[1])))
         and not private.attachment_is_live(name));
-- sem policy de update: o arquivo é imutável (o cache de Blob do client é por attachment_id)

-- O aviso de prazo de cancelamento entra no due_notifications: véspera do cancel_until, 10:00 de São
-- Paulo, só reserva viva de viagem viva, respeitando a preferência. Mesma assinatura da 0005 (o
-- claim_due_notifications e os grants continuam valendo); os fatos vão em `data` (D38).
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
    -- eve_checklist (versão básica até a fase 8): véspera do start_date, 19:00
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
                                              order by s.time, s.position collate "C" limit 1))
      from members mb
     where mb.enabled and coalesce((mb.kinds ->> 'eve_checklist')::boolean, true)
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
