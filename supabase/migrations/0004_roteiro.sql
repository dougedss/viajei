-- 0004_roteiro: dias, paradas, trilha, compartilhamento de posição e limite das Edge Functions. Fase 3.

-- Dias derivados das datas: id = v5(trip_id, 'YYYY-MM-DD'). O to_char não depende do DateStyle da
-- sessão (C1), então o v5 do client e o do banco batem sempre.
create table public.trip_days (
  id      uuid primary key,
  trip_id uuid not null references public.trips on delete cascade,
  date    date not null,
  title   text check (char_length(title) <= 80),
  notes   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  unique (trip_id, date),
  unique (id, trip_id),                                    -- alvo das FKs compostas
  check (id = extensions.uuid_generate_v5(trip_id, to_char(date, 'YYYY-MM-DD')))
);
call private.enable_trip_sync('trip_days', 30, '{trip_id,date}');

-- Paradas. A FK composta (trip_day_id, trip_id) existe porque a checagem de FK ignora a RLS: sem ela,
-- um membro da viagem A apontaria uma parada para um dia da viagem B só sabendo o id.
create table public.stops (
  id          uuid primary key,
  trip_id     uuid not null references public.trips on delete cascade,
  trip_day_id uuid not null,
  position    text collate "C" not null,                   -- índice fracionário
  kind        text not null check (kind in ('origin','transit','nature','winery','hotel','food','event','city','other')),
  name        text not null check (char_length(name) between 1 and 120),
  time        time,
  closes_at   time,
  address     text,
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  travel_minutes_to_next smallint check (travel_minutes_to_next between 0 and 1440),
  notes       text,
  url         text,
  departed_at timestamptz,
  done_at     timestamptz,
  done_by     uuid references public.profiles,
  skipped     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  unique (id, trip_id),
  foreign key (trip_day_id, trip_id) references public.trip_days (id, trip_id) on delete cascade,
  check ((lat is null) = (lng is null))
);
create index on public.stops (trip_day_id, position);      -- ordem do dia; due_notifications usa na fase 4
call private.enable_trip_sync('stops', 40);                -- trip_day_id fica mutável: mover parada de dia

-- Trilha gravada: uma linha por dia e pessoa. Pronta para a fase 4; esta fase não grava.
create table public.trip_tracks (
  id          uuid primary key,                            -- v5(trip_day_id, user_id)
  trip_id     uuid not null references public.trips on delete cascade,
  trip_day_id uuid not null,
  user_id     uuid not null references public.profiles on delete cascade,
  points      jsonb not null default '[]',                 -- [[lng, lat, epoch_s], …] simplificado
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  unique (trip_day_id, user_id),
  foreign key (trip_day_id, trip_id) references public.trip_days (id, trip_id) on delete cascade,
  check (id = extensions.uuid_generate_v5(trip_day_id, user_id::text))
);
call private.enable_trip_sync('trip_tracks', 50, '{trip_id,trip_day_id,user_id}');

-- Compartilhar posição (C10): coluna de quem viaja; só a própria pessoa a muda.
alter table public.trip_members add column share_position boolean not null default true;
grant update (share_position) on public.trip_members to authenticated;
create policy "membros: a própria linha" on public.trip_members
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Policy é por linha e grant é por coluna; o cruzamento "esta coluna, só nesta linha" é do trigger.
create function private.guard_member_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.share_position is distinct from old.share_position
     and old.user_id is distinct from (select auth.uid()) then
    raise exception 'só a própria pessoa muda o compartilhamento de posição' using errcode = '42501';
  end if;
  -- a policy nova abre a própria linha; sair da viagem não existe ainda: membro aceito só sai pelo dono.
  -- Convite pendente (recusar, aposentar, cancelar) continua como era.
  if new.deleted_at is distinct from old.deleted_at and old.status = 'accepted'
     and not (old.role = 'member' and private.is_trip_owner(old.trip_id)) then
    raise exception 'só o dono remove membros' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger a_guard before update on public.trip_members
  for each row execute function private.guard_member_update();

-- A trilha é só da própria pessoa para escrever; para ler, a dos outros só com share_position ligado.
create policy "trilha: a própria e as compartilhadas" on public.trip_tracks as restrictive
  for all to authenticated
  using (user_id = (select auth.uid()) or exists (
           select 1 from public.trip_members m
            where m.trip_id = trip_tracks.trip_id and m.user_id = trip_tracks.user_id
              and m.status = 'accepted' and m.deleted_at is null and m.share_position))
  with check (user_id = (select auth.uid()));

-- Limite diário genérico das Edge Functions: route-day agora, import-itinerary depois. Não sincroniza.
create table public.edge_calls (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles on delete cascade,
  fn         text not null check (fn ~ '^[a-z][a-z0-9-]{1,39}$'),
  created_at timestamptz not null default now()
);
create index on public.edge_calls (user_id, fn, created_at);
alter table public.edge_calls enable row level security;
create policy "chamadas: só as minhas" on public.edge_calls
  for select to authenticated using (user_id = (select auth.uid()));
create policy "chamadas: registrar a minha" on public.edge_calls
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Conta e registra numa chamada só, como o usuário (RLS vale). Janela móvel de 24 h: sem corrida à
-- meia-noite e sem fuso. Acima do limite não registra.
create function public.edge_call(p_fn text, p_limit integer) returns integer
language plpgsql security invoker set search_path = '' as $$
declare v_n integer;
begin
  select count(*) into v_n from public.edge_calls
   where user_id = (select auth.uid()) and fn = p_fn and created_at > now() - interval '24 hours';
  if v_n >= p_limit then
    raise exception 'limite de % chamadas por dia atingido', p_limit using errcode = '54000';
  end if;
  insert into public.edge_calls (user_id, fn) values ((select auth.uid()), p_fn);
  return v_n + 1;
end $$;
revoke execute on function public.edge_call(text, integer) from public, anon;
grant execute on function public.edge_call(text, integer) to authenticated;
