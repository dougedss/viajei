-- 0016_sem_digitar: reservas e gastos sem digitar (fase 18). Só acrescenta: nenhuma coluna sai,
-- nenhuma linha se perde, nenhum `check` novo recusa linha que existe (o pgTAP 18 prova com linhas
-- como as de hoje).
--  1. `notifications_sent.kind` ganha `reservation_received` ("Chegou a reserva do …"), e o padrão de
--     `notification_prefs.kinds` nasce com ele ligado (as linhas de hoje: `coalesce(…, true)`, como os
--     outros tipos no `due_notifications`).
--  2. `ai_imports.kind` ganha `confirmation` (a leitura de uma confirmação de reserva: colada, anexada,
--     compartilhada ou encaminhada por e-mail) e `receipt` (a foto da nota de um gasto). `input_chars`
--     passa a aceitar 0 (uma leitura só de imagem não tem texto) e nasce `input_bytes`, os bytes dos
--     anexos lidos. O registro continua só registro (D128): nunca o texto, a imagem nem a resposta.
--  3. `attachments.expense_id`: a foto da nota é anexo do gasto (FK composta para `expenses`, que ganha
--     o `unique (id, trip_id)` que as outras já tinham). O anexo liga a exatamente um de reserva, parada
--     ou gasto; a nota é `document` (comprimida como o print de reserva), então o `check` da foto de
--     memória não muda. `expense_id` entra nas imutáveis do `b_sync`.
--  4. `public.inbox_addresses`: o código do endereço de e-mail de cada pessoa (`r-` e seis letras e
--     dígitos sem 0/o/1/l/i; `<código>@reservas.…`), gerado no banco, uma vez, ao nascer o perfil, e
--     preenchido para os perfis de hoje. É ele que diz de quem é um e-mail encaminhado; o remetente,
--     que qualquer um forja, é a segunda tranca (conferido na função). Só a própria pessoa lê (RLS), e
--     a linha chega ao aparelho pelo `sync_pull_user` (escopo `user`), nunca ao time: por isso não é
--     uma coluna de `profiles`, que o pull da viagem leva inteiro aos outros membros.
--  5. `public.received_reservations`: a reserva recebida por e-mail, por pessoa (`enable_user_sync`,
--     como `notification_prefs`), com os campos e os `check` de `reservations`, os anexos dela em
--     `files` (na pasta `inbox/{pessoa}/` do bucket), o `source_id` do e-mail (unique: um webhook
--     repetido não cria duas) e o estado (`received` → `placed` ou `dismissed`). Quando as datas acham
--     uma viagem só, a função já grava a reserva na viagem e a recebida nasce `placed`.
--  6. O Storage: a pasta `inbox/{pessoa}/` do mesmo bucket. A dona lê; ninguém envia pelo client (a
--     função de recebimento envia com a chave do servidor); a dona apaga, só sem linha viva (a mesma
--     regra da D77, por `private.inbox_file_is_live`). O expurgo (abaixo) não trata como órfão o
--     arquivo listado numa recebida viva.
--  7. As RPCs `security definer` da função de recebimento, executáveis só pelo `service_role` (o molde
--     do `claim_due_notifications`): `inbox_lookup` (de quem é o código, o e-mail confirmado, e se o
--     e-mail já entrou), `inbox_trip_for` (a viagem viva da pessoa cujas datas contêm a reserva, só
--     quando é uma só) e `receive_reservation` (grava a reserva e os anexos na viagem, quando há, e
--     sempre a linha recebida). A função nunca escreve nas tabelas da viagem por fora delas.
--  8. `due_notifications` recriado (o corpo da 0011) com o ramo `reservation_received`: a recebida dos
--     últimos 10 min ainda não avisada. Com viagem, respeita as preferências dela; sem viagem não há
--     preferência que a desligue (a pessoa pediu o aviso ao encaminhar o e-mail).
--  9. `private.purge` recriado (o corpo da 0012) com uma linha a mais no passo 4: o objeto de `inbox/`
--     listado numa recebida viva não é órfão.

-- ------------------------------------------------------------------ 1. o tipo de aviso novo
alter table public.notifications_sent
  drop constraint notifications_sent_kind_check,
  add constraint notifications_sent_kind_check
    check (kind in ('departure_soon', 'departure_now', 'closes_soon', 'morning_briefing',
                    'eve_checklist', 'cancel_deadline', 'team_arrived', 'retro_ready',
                    'reservation_received'));
alter table public.notification_prefs
  alter column kinds set default '{"departure_soon": true, "departure_now": true, "closes_soon": true, "morning_briefing": true,
                                  "eve_checklist": true, "cancel_deadline": true, "team_arrived": false, "retro_ready": true,
                                  "reservation_received": true}';

-- ------------------------------------------------------------------ 2. ai_imports
alter table public.ai_imports
  drop constraint ai_imports_kind_check,
  add constraint ai_imports_kind_check
    check (kind in ('import', 'plan', 'today', 'confirmation', 'receipt'));
alter table public.ai_imports
  drop constraint ai_imports_input_chars_check,
  add constraint ai_imports_input_chars_check check (input_chars between 0 and 30000);
alter table public.ai_imports
  add column input_bytes integer not null default 0 check (input_bytes between 0 and 20971520);
grant insert (input_bytes) on public.ai_imports to authenticated;

-- ------------------------------------------------------------------ 3. attachments.expense_id
alter table public.expenses add constraint expenses_id_trip_id_key unique (id, trip_id);
alter table public.attachments
  add column expense_id uuid,
  add constraint attachments_expense_id_trip_id_fkey
    foreign key (expense_id, trip_id) references public.expenses (id, trip_id) on delete cascade;
-- o `check` "exatamente um vínculo" da 0007 não tem nome próprio (é `attachments_check`, pela ordem em
-- que foi escrito): sai pela definição, para não depender do nome, e volta nomeado, na mesma
-- transação da migration
do $do$
declare v_name text;
begin
  select c.conname into v_name
    from pg_constraint c
   where c.conrelid = 'public.attachments'::regclass and c.contype = 'c'
     and pg_get_constraintdef(c.oid) like '%num_nonnulls(reservation_id, stop_id)%';
  if v_name is null then
    raise exception 'o check de um vínculo só da 0007 não foi encontrado';
  end if;
  execute format('alter table public.attachments drop constraint %I', v_name);
end $do$;
alter table public.attachments
  add constraint attachments_one_link_check
    check (num_nonnulls(reservation_id, stop_id, expense_id) = 1);
drop trigger b_sync on public.attachments;
create trigger b_sync before insert or update on public.attachments
  for each row execute function private.sync_guard(
    'trip_id', 'kind', 'storage_path', 'created_by', 'reservation_id', 'stop_id', 'expense_id',
    'mime', 'size_bytes', 'width', 'height', 'placeholder');
create index on public.attachments (expense_id) where expense_id is not null;

-- ------------------------------------------------------------------ 4. inbox_addresses
-- Seis símbolos de um alfabeto de 31 (sem 0/o, 1/l/i, que se confundem ao ler ou ditar): uns 887
-- milhões de códigos. Amostragem por rejeição (os bytes de 248 em diante saem), para nenhum símbolo
-- ser mais provável que os outros; a unicidade é conferida aqui e garantida pelo `unique` da tabela.
create function private.new_inbox_code() returns text
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_alphabet constant text := '23456789abcdefghjkmnpqrstuvwxyz';
  v_bytes bytea;
  v_code  text;
  v_i     integer;
  v_b     integer;
begin
  loop
    v_code := 'r-';
    while char_length(v_code) < 8 loop
      v_bytes := extensions.gen_random_bytes(16);
      for v_i in 0..15 loop
        exit when char_length(v_code) >= 8;
        v_b := get_byte(v_bytes, v_i);
        continue when v_b >= 248;
        v_code := v_code || substr(v_alphabet, 1 + (v_b % 31), 1);
      end loop;
    end loop;
    exit when not exists (select 1 from public.inbox_addresses a where a.code = v_code);
  end loop;
  return v_code;
end $$;
revoke all on function private.new_inbox_code() from public;

-- `id` é o id da pessoa (a chave do Dexie e do sync são `id`; o escopo `user` filtra por `user_id`).
create table public.inbox_addresses (
  id             uuid primary key references public.profiles on delete cascade,
  user_id        uuid not null references public.profiles on delete cascade,
  code           text not null unique check (code ~ '^r-[23456789abcdefghjkmnpqrstuvwxyz]{6}$'),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null,
  field_versions jsonb not null default '{}',
  synced_at      timestamptz not null,
  check (user_id = id)
);
alter table public.inbox_addresses enable row level security;
create policy "endereço: só o meu" on public.inbox_addresses for select to authenticated
  using (user_id = (select auth.uid()));
-- sem policy de insert nem de update: o código nasce no banco e não muda
create trigger b_sync before insert or update on public.inbox_addresses
  for each row execute function private.sync_guard('user_id', 'code');
create index on public.inbox_addresses (user_id, synced_at);
insert into private.sync_tables (name, scope, mode, rank) values ('inbox_addresses', 'user', 'lww', 26);

create function private.born_inbox_address() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.inbox_addresses (id, user_id, code, updated_at)
  values (new.id, new.id, private.new_inbox_code(), now())
  on conflict (id) do nothing;
  return null;
end $$;
revoke all on function private.born_inbox_address() from public;
create trigger e_inbox after insert on public.profiles
  for each row execute function private.born_inbox_address();

-- os perfis de hoje
insert into public.inbox_addresses (id, user_id, code, updated_at)
select p.id, p.id, private.new_inbox_code(), now() from public.profiles p
    on conflict (id) do nothing;

-- ------------------------------------------------------------------ 5. received_reservations
-- `files`: os anexos na pasta `inbox/{pessoa}/`, cada um {id, storage_path, filename, mime, size_bytes,
-- width, height}; vazio quando a reserva já foi para a viagem (os anexos viraram linhas de
-- `attachments`). `source_id`: o id do e-mail no provedor; o unique faz um webhook repetido não criar
-- duas. O estado muda pela outbox ("Pôr nesta viagem", "Dispensar"); o resto é imutável.
create table public.received_reservations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles on delete cascade,
  source                text not null default 'email' check (source in ('email')),
  source_id             text unique check (char_length(source_id) between 1 and 120),
  status                text not null default 'received' check (status in ('received', 'placed', 'dismissed')),
  type                  text not null check (type in ('hotel', 'ticket', 'restaurant', 'other')),
  name                  text not null check (char_length(name) between 1 and 120),
  start_at              timestamptz,
  end_at                timestamptz,
  confirmation_code     text check (char_length(confirmation_code) <= 80),
  amount                numeric(10, 2) check (amount >= 0),
  cancel_policy         text check (char_length(cancel_policy) <= 500),
  cancel_until          date,
  phone                 text check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  address               text check (char_length(address) <= 300),
  booked_via            text check (char_length(booked_via) <= 80),
  notes                 text check (char_length(notes) <= 2000),
  files                 jsonb not null default '[]'
                        check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 10),
  placed_trip_id        uuid references public.trips on delete set null,
  placed_reservation_id uuid,
  ai_import_id          uuid references public.ai_imports on delete set null,
  received_at           timestamptz not null default now(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null,
  field_versions        jsonb not null default '{}',
  synced_at             timestamptz not null,
  check (end_at is null or (start_at is not null and end_at >= start_at)),
  check ((status = 'placed') = (placed_reservation_id is not null))
);
call private.enable_user_sync('received_reservations', 27,
  '{user_id,source,source_id,files,received_at,ai_import_id}');
-- colocada numa viagem: só numa viagem em que a pessoa está
create policy "recebida: só em viagem minha" on public.received_reservations as restrictive
  for all to authenticated using (true)
  with check (placed_trip_id is null or private.is_trip_member(placed_trip_id));
-- o ramo do aviso lê as recebidas dos últimos minutos
create index on public.received_reservations (received_at desc);

-- ------------------------------------------------------------------ 6. a pasta inbox/ do Storage
-- Há uma recebida viva listando o objeto? Security definer, como `attachment_is_live` (D77).
create function private.inbox_file_is_live(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.received_reservations r, jsonb_array_elements(r.files) f
                  where r.status = 'received' and f ->> 'storage_path' = p_path)
$$;
revoke all on function private.inbox_file_is_live(text) from public;
grant execute on function private.inbox_file_is_live(text) to authenticated, service_role;

-- `inbox/{pessoa}/{anexo}.{ext}`: o segundo segmento é a dona. As policies da viagem (0007) não
-- alcançam a pasta (o primeiro segmento não é uma viagem), e a de envio exige a pasta de uma viagem:
-- ninguém envia aqui pelo client.
create policy "caixa de entrada: a dona lê" on storage.objects for select to authenticated
  using (bucket_id = 'attachments'
         and (storage.foldername(name))[1] = 'inbox'
         and private.uuid_or_null((storage.foldername(name))[2]) = (select auth.uid()));
create policy "caixa de entrada: a dona apaga, sem linha viva" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments'
         and (storage.foldername(name))[1] = 'inbox'
         and private.uuid_or_null((storage.foldername(name))[2]) = (select auth.uid())
         and not private.inbox_file_is_live(name));

-- ------------------------------------------------------------------ 7. as RPCs da função de recebimento
-- De quem é o código (só pessoa com e-mail confirmado: o remetente é conferido contra ele), e se este
-- e-mail já entrou (o webhook pode repetir).
create function public.inbox_lookup(p_code text, p_source_id text)
returns table (user_id uuid, email text, seen boolean)
language sql stable security definer set search_path = '' as $$
  select a.user_id, lower(u.email),
         exists (select 1 from public.received_reservations r where r.source_id = p_source_id)
    from public.inbox_addresses a
    join auth.users u on u.id = a.user_id and u.email_confirmed_at is not null
   where a.code = lower(btrim(p_code));
$$;

-- A viagem viva em que a pessoa está, cujas datas (em São Paulo) contêm o início da reserva, e o fim
-- até o dia seguinte ao último (o check-out do último dia). Só quando é uma só; senão, null.
create function public.inbox_trip_for(p_user uuid, p_start timestamptz, p_end timestamptz)
returns uuid
language sql stable security definer set search_path = '' as $$
  with d as (select (p_start at time zone 'America/Sao_Paulo')::date as s,
                    (coalesce(p_end, p_start) at time zone 'America/Sao_Paulo')::date as e),
  hits as (
    select t.id
      from public.trips t
      join public.trip_members m on m.trip_id = t.id, d
     where p_start is not null
       and t.deleted_at is null
       and m.user_id = p_user and m.status = 'accepted' and m.deleted_at is null
       and d.s between t.start_date and t.end_date
       and d.e between t.start_date and t.end_date + 1)
  select case when (select count(*) from hits) = 1 then (select h.id from hits h) end;
$$;

-- Grava o que a leitura tirou do e-mail. Com viagem: a reserva (criada pela pessoa, como se ela a
-- tivesse digitado) e os anexos, cujos objetos a função já pôs em `{viagem}/{anexo}.{ext}`; sempre a
-- linha recebida (`placed` com a viagem, `received` sem ela, com os anexos em `files`). Um e-mail já
-- gravado (`source_id`) devolve a linha de antes, sem repetir. Os `check` das tabelas conferem os
-- campos; nada aqui é texto livre em log.
create function public.receive_reservation(
  p_user uuid, p_trip uuid, p_reservation jsonb, p_files jsonb, p_source_id text, p_ai_import_id uuid
) returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_received    uuid;
  v_reservation uuid;
  v_now         timestamptz := now();
  v_f           jsonb;
begin
  if p_user is null or not exists (select 1 from public.profiles p where p.id = p_user) then
    raise exception 'pessoa desconhecida' using errcode = '42501';
  end if;
  if jsonb_typeof(p_reservation) is distinct from 'object'
     or jsonb_typeof(p_files) is distinct from 'array' or jsonb_array_length(p_files) > 10 then
    raise exception 'reserva ou anexos fora do formato' using errcode = '22023';
  end if;
  if p_source_id is not null then
    select r.id into v_received from public.received_reservations r where r.source_id = p_source_id;
    if v_received is not null then
      return jsonb_build_object('received_id', v_received, 'duplicate', true);
    end if;
  end if;
  if p_trip is not null then
    if not exists (select 1 from public.trip_members m
                     join public.trips t on t.id = m.trip_id and t.deleted_at is null
                    where m.trip_id = p_trip and m.user_id = p_user
                      and m.status = 'accepted' and m.deleted_at is null) then
      raise exception 'a pessoa não está nesta viagem' using errcode = '42501';
    end if;
    v_reservation := gen_random_uuid();
    insert into public.reservations
      (id, trip_id, type, name, start_at, end_at, confirmation_code, amount, cancel_policy,
       cancel_until, phone, address, booked_via, notes, created_by, updated_at)
    values
      (v_reservation, p_trip, p_reservation ->> 'type', p_reservation ->> 'name',
       (p_reservation ->> 'start_at')::timestamptz, (p_reservation ->> 'end_at')::timestamptz,
       p_reservation ->> 'confirmation_code', (p_reservation ->> 'amount')::numeric,
       p_reservation ->> 'cancel_policy', (p_reservation ->> 'cancel_until')::date,
       p_reservation ->> 'phone', p_reservation ->> 'address', p_reservation ->> 'booked_via',
       p_reservation ->> 'notes', p_user, v_now);
    for v_f in select value from jsonb_array_elements(p_files) loop
      insert into public.attachments
        (id, trip_id, reservation_id, kind, storage_path, filename, mime, size_bytes, width, height,
         created_by, updated_at)
      values
        ((v_f ->> 'id')::uuid, p_trip, v_reservation, 'document', v_f ->> 'storage_path',
         v_f ->> 'filename', v_f ->> 'mime', (v_f ->> 'size_bytes')::integer,
         (v_f ->> 'width')::integer, (v_f ->> 'height')::integer, p_user, v_now);
    end loop;
  end if;
  insert into public.received_reservations
    (user_id, source_id, status, type, name, start_at, end_at, confirmation_code, amount,
     cancel_policy, cancel_until, phone, address, booked_via, notes, files,
     placed_trip_id, placed_reservation_id, ai_import_id, updated_at)
  values
    (p_user, p_source_id, case when p_trip is null then 'received' else 'placed' end,
     p_reservation ->> 'type', p_reservation ->> 'name',
     (p_reservation ->> 'start_at')::timestamptz, (p_reservation ->> 'end_at')::timestamptz,
     p_reservation ->> 'confirmation_code', (p_reservation ->> 'amount')::numeric,
     p_reservation ->> 'cancel_policy', (p_reservation ->> 'cancel_until')::date,
     p_reservation ->> 'phone', p_reservation ->> 'address', p_reservation ->> 'booked_via',
     p_reservation ->> 'notes', case when p_trip is null then p_files else '[]'::jsonb end,
     p_trip, v_reservation, p_ai_import_id, v_now)
  returning id into v_received;
  return jsonb_build_object('received_id', v_received, 'reservation_id', v_reservation,
                            'trip_id', p_trip, 'duplicate', false);
end $$;

-- em public porque a Edge Function chama por RPC com a chave do servidor e o PostgREST só expõe
-- public; o revoke/grant deixa só o service_role, então nenhuma vira RPC do client
revoke execute on function public.inbox_lookup(text, text), public.inbox_trip_for(uuid, timestamptz, timestamptz),
  public.receive_reservation(uuid, uuid, jsonb, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.inbox_lookup(text, text), public.inbox_trip_for(uuid, timestamptz, timestamptz),
  public.receive_reservation(uuid, uuid, jsonb, jsonb, text, uuid)
  to service_role;

-- ------------------------------------------------------------------ 8. due_notifications
-- O corpo inteiro da 0011, sem mudança nos outros ramos, mais o ramo `reservation_received`. Mesma
-- assinatura: o `claim_due_notifications`, o `has_due_notifications` e os grants continuam valendo.
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
    union all
    -- reservation_received (fase 18): a reserva que chegou por e-mail nos últimos minutos. ref = a
    -- recebida; com viagem (a leitura achou uma só pelas datas) o trip_id é dela e a preferência da
    -- viagem vale; sem viagem não há preferência que a desligue (a pessoa pediu ao encaminhar). Os
    -- fatos vão em data (D38); o toque abre a reserva na viagem ou a lista de Reservas recebidas.
    select r.user_id, 'reservation_received', r.id::text, date_trunc('minute', r.received_at),
           r.placed_trip_id, null, null,
           jsonb_build_object('reservation_name', r.name, 'reservation_type', r.type,
                              'trip_name', t.name, 'reservation_id', r.placed_reservation_id,
                              'received_status', r.status)
      from public.received_reservations r
      left join public.trips t on t.id = r.placed_trip_id
      left join members mb on mb.trip_id = r.placed_trip_id and mb.user_id = r.user_id
     where r.status in ('received', 'placed')
       and (r.placed_trip_id is null
            or (mb.enabled and coalesce((mb.kinds ->> 'reservation_received')::boolean, true)))
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

-- ------------------------------------------------------------------ 9. purge
-- O corpo inteiro da 0012, com uma linha a mais no passo 4 (o Storage): o objeto de `inbox/` listado
-- numa reserva recebida ainda viva não é órfão. O resto não muda; os grants da 0012 continuam valendo.
create or replace function private.purge(
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
     and not private.inbox_file_is_live(o.name)
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
