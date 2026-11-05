-- 0005_notificacoes: assinaturas push, preferências por pessoa e viagem, dedupe do servidor,
-- o que vence (due) e a reserva atômica (claim), e o cron que chama a Edge Function. Fase 4.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Irmão do enable_trip_sync para as tabelas da pessoa (escopo user): RLS "só as minhas", trigger
-- de sync, índice do pull e registro na whitelist. Sem broadcast: a preferência editada em outro
-- aparelho da mesma pessoa chega no próximo pull do usuário. A fase 9 reaproveita (conquistas, XP).
create procedure private.enable_user_sync(p_table text, p_rank int, p_immutable text[] default '{user_id}')
language plpgsql set search_path = '' as $$
begin
  execute format('alter table public.%I enable row level security', p_table);
  execute format('create policy "só as minhas: ver" on public.%I for select to authenticated using (user_id = (select auth.uid()))', p_table);
  execute format('create policy "só as minhas: criar" on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', p_table);
  execute format('create policy "só as minhas: editar" on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', p_table);
  execute format('create trigger b_sync before insert or update on public.%I for each row execute function private.sync_guard(%s)',
                 p_table, (select string_agg(quote_literal(c), ', ') from unnest(p_immutable) c));
  execute format('create index on public.%I (user_id, synced_at)', p_table);
  insert into private.sync_tables (name, scope, mode, rank) values (p_table, 'user', 'lww', p_rank);
end $$;
revoke all on procedure private.enable_user_sync(text, int, text[]) from public;

-- Assinatura Web Push: uma por navegador instalado. É do aparelho, não sincroniza: escrita direta
-- pelo PostgREST. `origin` é a origem do app que assinou (produção, preview da Vercel, localhost):
-- o `navigate` do aviso, que o Declarative Web Push exige absoluto, volta sempre para ela.
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles on delete cascade,
  endpoint     text not null unique check (endpoint like 'https://%'),
  p256dh       text not null,
  auth         text not null,
  platform     text not null check (platform in ('ios', 'android', 'desktop')),
  origin       text not null check (origin ~ '^https?://[^/]+$'),
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failed_at    timestamptz
);
alter table public.push_subscriptions enable row level security;
create policy "assinaturas: só as minhas" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create index on public.push_subscriptions (user_id) where failed_at is null;

-- Preferências por pessoa e viagem: a primeira tabela do outbox com escopo user.
create table public.notification_prefs (
  id           uuid primary key,                                        -- v5(user_id, trip_id)
  user_id      uuid not null references public.profiles on delete cascade,
  trip_id      uuid not null references public.trips on delete cascade,
  enabled      boolean not null default true,
  lead_minutes smallint not null default 15 check (lead_minutes between 5 and 120),
  kinds        jsonb not null default '{"departure_soon": true, "departure_now": true, "closes_soon": true, "morning_briefing": true,
                                        "eve_checklist": true, "cancel_deadline": true, "team_arrived": false, "retro_ready": true}'
               check (jsonb_typeof(kinds) = 'object'),
  morning_time time not null default '07:00',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  unique (user_id, trip_id),
  check (id = extensions.uuid_generate_v5(user_id, trip_id::text))
);
call private.enable_user_sync('notification_prefs', 25, '{user_id,trip_id}');
-- só de viagem em que a pessoa está; trip_id é imutável, então basta conferir no insert
create policy "avisos: só de viagem minha" on public.notification_prefs as restrictive
  for insert to authenticated with check (private.is_trip_member(trip_id));

-- Dedupe do servidor: uma linha por pessoa, tipo, referência e minuto. Sem policy: invisível ao
-- client. `data` congela os fatos na reserva, para a retentativa escrever o mesmo texto;
-- `attempts` e `claimed_at` fazem um crash da função não engolir o minuto.
create table public.notifications_sent (
  id           uuid primary key,                                        -- v5(user_id, kind:ref:scheduled_at ISO UTC)
  user_id      uuid not null references public.profiles on delete cascade,
  kind         text not null check (kind in ('departure_soon', 'departure_now', 'closes_soon', 'morning_briefing',
                                             'eve_checklist', 'cancel_deadline', 'team_arrived', 'retro_ready')),
  ref          text not null,
  scheduled_at timestamptz not null,
  trip_id      uuid references public.trips on delete cascade,
  stop_id      uuid,
  data         jsonb not null default '{}',
  status       text not null default 'queued' check (status in ('queued', 'sent', 'failed', 'no_subscription')),
  attempts     smallint not null default 0,
  claimed_at   timestamptz,
  sent_at      timestamptz,
  error        text,
  created_at   timestamptz not null default now(),
  unique (user_id, kind, ref, scheduled_at)
);
alter table public.notifications_sent enable row level security;
create index on public.notifications_sent (claimed_at) where status = 'queued';
create index on public.notifications_sent (scheduled_at desc);

-- O que vence agora. Devolve fatos (`data`), não texto: o texto nasce em _shared/notifications.ts.
-- Janela (t1 - 10 min, t1]: um minuto perdido pelo cron ainda sai, o dedupe impede repetir, e acima
-- de 10 min o aviso é velho. A conta do "sair às" é a do dayState (D29): `at` é a última concluída
-- por position, `next` a primeira sem done_at e sem skipped; leave_at só com at.departed_at nulo;
-- sem at, só se next é nó de saída (origin, transit), e aí "sair às" é o horário do próprio nó.
create function public.due_notifications(p_now timestamptz default now())
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

-- Reserva atômica: insere o que venceu (conflito = outra execução já reservou), recupera reservas
-- velhas sem sent_at (crash da função) até a terceira tentativa, e devolve só o que esta chamada
-- reservou, com as assinaturas vivas da pessoa. Duas execuções sobrepostas do cron nunca enviam duas vezes.
create function public.claim_due_notifications(p_now timestamptz default now())
returns table (id uuid, user_id uuid, kind text, ref text, scheduled_at timestamptz, trip_id uuid, stop_id uuid,
               attempts smallint, data jsonb, subscriptions jsonb)
language sql volatile security definer set search_path = '' as $$
  with fresh as (
    insert into public.notifications_sent (id, user_id, kind, ref, scheduled_at, trip_id, stop_id, data, attempts, claimed_at)
    select extensions.uuid_generate_v5(d.user_id, d.kind || ':' || d.ref || ':' ||
                                       to_char(d.scheduled_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
           d.user_id, d.kind, d.ref, d.scheduled_at, d.trip_id, d.stop_id, d.data, 1, p_now
      from public.due_notifications(p_now) d
    on conflict (user_id, kind, ref, scheduled_at) do nothing
    returning *),
  retried as (
    update public.notifications_sent n set attempts = n.attempts + 1, claimed_at = p_now
     where n.status = 'queued' and n.sent_at is null and n.attempts < 3
       and n.claimed_at < p_now - interval '2 minutes'
    returning *),
  claimed as (select * from fresh union all select * from retried)
  select c.id, c.user_id, c.kind, c.ref, c.scheduled_at, c.trip_id, c.stop_id, c.attempts, c.data,
         coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth,
                                                       'platform', s.platform, 'origin', s.origin))
                     from public.push_subscriptions s
                    where s.user_id = c.user_id and s.failed_at is null), '[]'::jsonb)
    from claimed c;
$$;
-- security definer em public porque a Edge Function chama por RPC com a chave secreta e o PostgREST
-- só expõe public; o revoke/grant deixa só service_role, então não vira RPC do client.
revoke execute on function public.due_notifications(timestamptz), public.claim_due_notifications(timestamptz)
  from public, anon, authenticated;
grant execute on function public.due_notifications(timestamptz), public.claim_due_notifications(timestamptz)
  to service_role;

-- O cron só chama a função quando há trabalho: zero chamadas em dias sem viagem.
create function private.has_due_notifications(p_now timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.due_notifications(p_now))
      or exists (select 1 from public.notifications_sent n
                  where n.status = 'queued' and n.attempts < 3 and n.claimed_at < p_now - interval '2 minutes');
$$;
revoke all on function private.has_due_notifications(timestamptz) from public;

-- A cada minuto, se houver algo vencido: POST na Edge Function com a chave secreta no cabeçalho
-- apikey. URL e chave vivem no Vault, criadas uma vez por ambiente (vault.create_secret), nunca
-- na migration. Localmente, `pnpm db:vault-local` as grava a cada reset.
select cron.schedule('viajei-send-notifications', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'viajei_project_url') || '/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'viajei_secret_key')),
    body := jsonb_build_object('now', now()),
    timeout_milliseconds := 30000)
  where private.has_due_notifications(now());
$job$);
