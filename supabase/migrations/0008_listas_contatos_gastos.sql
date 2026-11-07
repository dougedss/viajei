-- 0008_listas_contatos_gastos: as três listas (antes, mala, missões), contatos, gastos e o aviso de
-- véspera completo. Fase 8.
-- Parte da DDL base do Passo 0 (bloco 0006 de lá). As diferenças, cada uma com o porquê, estão nos
-- comentários de cada tabela e em docs/decisoes.md.

-- Itens das três listas. Diferenças da base:
--  - `status` ganha `dismissed`: a sugestão por regra (missão por tipo de parada, item de mala pela
--    geografia) é calculada no client e só vira linha com a ação da pessoa, com id determinístico.
--    "Dispensar" grava a linha viva com `dismissed`, e não com deleted_at: a lápide volta pelo pull e
--    apaga a linha do aparelho, e a sugestão reapareceria. `suggested` fica para a IA da fase 10.
--  - `created_by` com policy restritiva de insert (o padrão da D76): o XP de quem criou é derivável dos
--    dados. Ele é preservado por trigger (`a_keep_creator`), e não recusado pelo sync_guard: a linha de
--    id determinístico (a sugestão respondida) pode ser escrita por duas pessoas, e a segunda escrita
--    não pode virar erro; quem criou primeiro fica.
--  - só missão se liga a parada; missão vale de 10 a 30 pontos e o resto vale 0; `done_by` e `done_at`
--    andam juntos (quem e quando).
--  - a FK da parada usa `on delete set null (stop_id)`: o expurgo de uma parada nunca leva a missão de
--    alguém em cascata (a missão de sistema sai pelo client ao excluir a parada).
create table public.checklist_items (
  id         uuid primary key,          -- sugestão: v5(stop_id, 'quest:' || regra) ou v5(trip_id, 'pack:' || regra)
  trip_id    uuid not null references public.trips on delete cascade,
  kind       text not null check (kind in ('before', 'pack', 'quest')),
  text       text not null check (char_length(text) between 1 and 200),
  position   text collate "C" not null,
  points     smallint not null default 0,
  stop_id    uuid,
  source     text not null default 'user' check (source in ('user', 'system', 'ai')),
  status     text not null default 'active' check (status in ('suggested', 'active', 'dismissed')),
  done_by    uuid references public.profiles,
  done_at    timestamptz,
  created_by uuid not null references public.profiles,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  foreign key (stop_id, trip_id) references public.stops (id, trip_id) on delete set null (stop_id),
  check (kind = 'quest' or (points = 0 and stop_id is null)),
  check (kind <> 'quest' or points between 10 and 30),
  check ((done_by is null) = (done_at is null))
);
call private.enable_trip_sync('checklist_items', 50, '{trip_id,kind,source}');
create policy "item: quem cria é quem envia" on public.checklist_items as restrictive
  for insert to authenticated with check (created_by = (select auth.uid()));

-- Contatos da viagem. Diferenças da base: o tipo ganha `restaurant`, que a importação já tinha
-- (`CONTACT_TYPES`); limite nas observações. A emergência pública (192, 193, 190, 191) não é linha do
-- banco: é constante no client, para funcionar sem sinal e sem cadastro.
create table public.contacts (
  id      uuid primary key,
  trip_id uuid not null references public.trips on delete cascade,
  name    text not null check (char_length(name) between 1 and 120),
  phone   text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  type    text not null check (type in ('hotel', 'attraction', 'restaurant', 'emergency', 'other')),
  notes   text check (char_length(notes) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz
);
call private.enable_trip_sync('contacts', 30);

-- Gastos. Diferenças da base:
--  - `reservation_id` (FK composta, opcional): a hospedagem já paga vira gasto por "Lançar como gasto",
--    com id v5(reservation_id, 'expense'), conferido por `check`. Dois aparelhos nunca contam a mesma
--    reserva duas vezes, e um gasto não passa a ser o de outra reserva (o id não bateria). Tirar o
--    vínculo (null) é permitido: é o que a FK faz no expurgo da reserva.
--  - rank 55, e não 50: a reserva (rank 50) tem de chegar antes do gasto dela no mesmo lote.
--  - `created_by` com policy restritiva de insert e preservado por trigger, como nos itens: o XP
--    `expense_logged` vai para quem lançou, e o gasto da reserva (id determinístico) pode ser lançado
--    por duas pessoas sem a segunda virar erro.
--  - "quem pagou é do time" é um trigger, e não a policy restritiva da base: a policy valeria em todo
--    update, e o gasto de quem saiu da viagem não poderia mais ser editado nem excluído. O trigger
--    confere no insert e quando `paid_by` muda (o padrão da D23).
--  - as FKs de parada e de reserva usam `on delete set null (coluna)`: o expurgo nunca apaga dinheiro.
create table public.expenses (
  id             uuid primary key,      -- gasto de reserva: v5(reservation_id, 'expense')
  trip_id        uuid not null references public.trips on delete cascade,
  stop_id        uuid,
  reservation_id uuid,
  amount         numeric(10, 2) not null check (amount > 0),
  category       text not null check (category in ('lodging', 'fuel', 'food', 'attractions', 'other')),
  date           date not null,
  paid_by        uuid not null references public.profiles,
  notes          text check (char_length(notes) <= 500),
  created_by     uuid not null references public.profiles,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  foreign key (stop_id, trip_id)        references public.stops (id, trip_id) on delete set null (stop_id),
  foreign key (reservation_id, trip_id) references public.reservations (id, trip_id) on delete set null (reservation_id),
  check (reservation_id is null or id = extensions.uuid_generate_v5(reservation_id, 'expense'))
);
-- reservation_id fica fora das imutáveis do sync_guard: a FK precisa poder anulá-la no expurgo; trocar
-- por outra reserva já é recusado pelo check do id.
call private.enable_trip_sync('expenses', 55);
create policy "gasto: quem lança é quem envia" on public.expenses as restrictive
  for insert to authenticated with check (created_by = (select auth.uid()));

-- Quem criou fica: num update, `created_by` volta ao valor antigo em silêncio. Recusar (como o
-- sync_guard faz com as imutáveis) transformaria em erro a segunda escrita de uma linha de id
-- determinístico, que é justamente o caso que o id determinístico existe para resolver.
create function private.keep_created_by() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.created_by := old.created_by;
  return new;
end $$;
revoke all on function private.keep_created_by() from public;
create trigger a_keep_creator before update on public.checklist_items
  for each row execute function private.keep_created_by();
create trigger a_keep_creator before update on public.expenses
  for each row execute function private.keep_created_by();

-- Quem pagou é membro aceito da viagem, conferido quando o gasto nasce ou quando `paid_by` muda.
-- Security definer para não depender da RLS de trip_members; dispara antes do b_sync (ordem alfabética).
create function private.expense_paid_by_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.paid_by is distinct from old.paid_by then
    if not exists (select 1 from public.trip_members m
                    where m.trip_id = new.trip_id and m.user_id = new.paid_by
                      and m.status = 'accepted' and m.deleted_at is null) then
      raise exception 'quem pagou não é do time' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.expense_paid_by_guard() from public;
create trigger a_paid_by before insert or update on public.expenses
  for each row execute function private.expense_paid_by_guard();

-- O aviso de véspera completo: o ramo eve_checklist passa a contar os itens de "antes" e de "mala" que
-- faltam (ativos, vivos, sem done_at), e só calcula para as viagens que começam amanhã (o between, como
-- no cancel_deadline). Mesma assinatura da 0005: o claim_due_notifications e os grants continuam
-- valendo; os outros ramos são os da 0007, sem mudança. Os fatos vão em `data` (D38).
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
