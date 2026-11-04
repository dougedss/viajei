-- 0002_perfis_viagens_membros: perfis, viagens, membros, funções de permissão, convites. Fase 1.

create table public.profiles (
  id    uuid primary key references auth.users on delete cascade,
  name  text not null check (char_length(name) between 1 and 60),
  color text not null check (color in ('sunset','sky','leaf','grape','guava','lavender','teal','amber')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null
);

create table public.trips (
  id              uuid primary key,
  owner_id        uuid not null references public.profiles,
  name            text not null check (char_length(name) between 1 and 80),
  start_date      date not null,
  end_date        date not null,
  origin          text,
  budget          numeric(10,2) check (budget >= 0),
  notes           text,
  car_model       text not null default 'hatch' check (car_model in ('hatch','sedan','suv','pickup','kombi')),
  car_color       text not null default 'sunset' check (car_color in ('sunset','sky','leaf','grape','sand','mist','night','gold')),
  car_accessories text[] not null default '{}',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  check (end_date between start_date and start_date + 60)
);

create table public.trip_members (
  id            uuid primary key,                       -- v5(trip_id, 'owner') ou v5(trip_id, 'invite:' || email)
  trip_id       uuid not null references public.trips on delete cascade,
  user_id       uuid references public.profiles on delete cascade,
  invited_email text check (invited_email = lower(btrim(invited_email))),
  role          text not null check (role in ('owner','member')),
  status        text not null default 'pending' check (status in ('pending','accepted')),
  invited_by    uuid references public.profiles,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  deleted_at     timestamptz,
  unique (trip_id, user_id),
  unique (trip_id, invited_email),
  check (role = 'owner' or invited_email is not null),
  check (id = extensions.uuid_generate_v5(trip_id,
           case role when 'owner' then 'owner' else 'invite:' || invited_email end))
);
create index on public.trip_members (invited_email) where user_id is null;
create index on public.trip_members (trip_id, synced_at);
create index on public.trip_members (user_id, synced_at);

-- Permissão. Security definer evita a recursão trips ⇄ trip_members nas policies; em private não vira RPC.
create function private.is_trip_member(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members m
                  where m.trip_id = p_trip and m.user_id = (select auth.uid())
                    and m.status = 'accepted' and m.deleted_at is null);
$$;
create function private.is_trip_owner(p_trip uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members m
                  where m.trip_id = p_trip and m.user_id = (select auth.uid())
                    and m.role = 'owner' and m.status = 'accepted' and m.deleted_at is null);
$$;
create function private.shares_trip_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.trip_members a
                   join public.trip_members b on b.trip_id = a.trip_id
                  where a.user_id = (select auth.uid()) and a.status = 'accepted' and a.deleted_at is null
                    and b.user_id = p_user and b.status = 'accepted' and b.deleted_at is null);
$$;
revoke all on function private.is_trip_member(uuid), private.is_trip_owner(uuid),
                       private.shares_trip_with(uuid) from public;
grant execute on function private.is_trip_member(uuid), private.is_trip_owner(uuid),
                          private.shares_trip_with(uuid) to authenticated, service_role;

-- perfil nasce com o usuário: nome dos metadados do cadastro ou a parte local do e-mail; cor sorteada
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, name, color, updated_at)
  values (new.id,
          left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)), 60),
          (array['sunset','sky','leaf','grape','guava','lavender','teal','amber'])[1 + floor(random() * 8)::int],
          now());
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- dono vira membro aceito por trigger: um só lugar para checar permissão
create function private.add_trip_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.trip_members (id, trip_id, user_id, role, status, invited_by, updated_at)
  values (extensions.uuid_generate_v5(new.id, 'owner'), new.id, new.owner_id,
          'owner', 'accepted', new.owner_id, new.updated_at);
  return null;
end $$;

-- exclusão (deleted_at) só pelo dono; membro edita o resto
create function private.guard_trip_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.deleted_at is distinct from old.deleted_at and not private.is_trip_owner(old.id) then
    raise exception 'só o dono exclui a viagem' using errcode = '42501';
  end if;
  return new;
end $$;

-- triggers disparam em ordem alfabética: a_ guarda, b_ sync, c_ dono, d_ broadcast
create trigger a_guard_delete before update on public.trips
  for each row execute function private.guard_trip_delete();
create trigger b_sync before insert or update on public.trips
  for each row execute function private.sync_guard('owner_id');
create trigger c_owner after insert on public.trips
  for each row execute function private.add_trip_owner();
create trigger d_broadcast after insert or update on public.trips
  for each row execute function private.broadcast_trip_change('id');
create trigger b_sync before insert or update on public.trip_members
  for each row execute function private.sync_guard('trip_id', 'invited_email', 'role');
create trigger d_broadcast after insert or update on public.trip_members
  for each row execute function private.broadcast_trip_change('trip_id');
create trigger b_sync before insert or update on public.profiles
  for each row execute function private.sync_guard();

-- RLS
alter table public.profiles     enable row level security;
alter table public.trips        enable row level security;
alter table public.trip_members enable row level security;

create policy "perfil: o próprio e o de quem viaja junto" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or private.shares_trip_with(id));
create policy "perfil: editar o próprio" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated;
grant  update (name, color, updated_at, field_versions) on public.profiles to authenticated;

create policy "viagem: membros veem" on public.trips
  for select to authenticated using (private.is_trip_member(id));
create policy "viagem: criar como dono" on public.trips
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "viagem: membros editam" on public.trips
  for update to authenticated using (private.is_trip_member(id)) with check (private.is_trip_member(id));
-- sem delete: exclusão é deleted_at (só o dono, pelo trigger); expurgo é job do servidor

create policy "membros: os da viagem e o próprio convite" on public.trip_members
  for select to authenticated using (private.is_trip_member(trip_id) or user_id = (select auth.uid()));
create policy "membros: dono convida" on public.trip_members
  for insert to authenticated with check (
    private.is_trip_owner(trip_id) and role = 'member' and status = 'pending'
    and user_id is null and invited_by = (select auth.uid()));
create policy "membros: dono remove" on public.trip_members
  for update to authenticated
  using (private.is_trip_owner(trip_id) and role = 'member')
  with check (private.is_trip_owner(trip_id) and role = 'member');
-- o dono só altera deleted_at; user_id e status mudam apenas pelas RPCs abaixo
revoke update on public.trip_members from authenticated;
grant  update (deleted_at, updated_at, field_versions) on public.trip_members to authenticated;

-- Convites. Só e-mail confirmado reivindica (auth.users.email_confirmed_at), nunca o e-mail do JWT.
create function public.claim_invites() returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_n     integer;
begin
  select lower(u.email) into v_email from auth.users u
   where u.id = v_uid and u.email_confirmed_at is not null;
  if v_email is null then return 0; end if;                -- e-mail não confirmado não reivindica nada
  -- convite para viagem em que a pessoa já é membro é redundante: aposenta em vez de colidir no unique
  update public.trip_members m set deleted_at = now()
   where m.invited_email = v_email and m.user_id is null and m.status = 'pending' and m.deleted_at is null
     and exists (select 1 from public.trip_members x
                  where x.trip_id = m.trip_id and x.user_id = v_uid and x.deleted_at is null);
  update public.trip_members m set user_id = v_uid
   where m.invited_email = v_email and m.user_id is null and m.status = 'pending' and m.deleted_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

create function public.accept_invite(p_member_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_trip uuid;
begin
  update public.trip_members m set status = 'accepted'
   where m.id = p_member_id and m.user_id = (select auth.uid())
     and m.status = 'pending' and m.deleted_at is null
  returning m.trip_id into v_trip;
  if v_trip is null then raise exception 'convite não encontrado' using errcode = 'P0002'; end if;
  return v_trip;
end $$;

create function public.decline_invite(p_member_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.trip_members m set deleted_at = now()
   where m.id = p_member_id and m.user_id = (select auth.uid())
     and m.status = 'pending' and m.deleted_at is null;
  if not found then raise exception 'convite não encontrado' using errcode = 'P0002'; end if;
end $$;

create function public.my_pending_invites()
returns table (member_id uuid, trip_id uuid, trip_name text, start_date date, end_date date, invited_by_name text)
language sql stable security definer set search_path = '' as $$
  select m.id, t.id, t.name, t.start_date, t.end_date, p.name
    from public.trip_members m
    join public.trips t on t.id = m.trip_id and t.deleted_at is null
    left join public.profiles p on p.id = m.invited_by
   where m.user_id = (select auth.uid()) and m.status = 'pending' and m.deleted_at is null
   order by t.start_date;
$$;

revoke execute on function public.claim_invites(), public.accept_invite(uuid),
  public.decline_invite(uuid), public.my_pending_invites() from public, anon;
grant execute on function public.claim_invites(), public.accept_invite(uuid),
  public.decline_invite(uuid), public.my_pending_invites() to authenticated;
