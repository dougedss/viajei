-- 0017_cartoes_postais: os cartões-postais (fase 23). Só acrescenta: nenhuma coluna sai, nenhuma linha
-- se perde, nenhum `check` novo recusa linha que existe (o pgTAP 19 prova com linhas como as de hoje).
--  1. `stops.osm_type` / `stops.osm_id`: o objeto do OpenStreetMap da parada. A conversa da fase 24
--     escolhe lugares reais pelo mapa (o `Place` da `find-places` traz `osm`), mas o objeto se perdia na
--     montagem da viagem (conferido: `stopOf` em `intake/assemble.ts` não o levava, e `stops` não tinha
--     coluna). Nulos nas paradas de hoje; o par anda junto. O sync é genérico (`jsonb_populate_record`):
--     o app de antes não manda as colunas e elas ficam nulas.
--  2. `ai_imports.kind` ganha `landmark`: cada chamada de IA de um cartão-postal (escolher o que
--     modelar, escrever a receita, conferir a peça) é uma linha de registro, em nome de quem pediu (D128).
--  3. `public.landmarks`: o catálogo, um só para todo mundo. A chave na fonte pública (`wikidata:Q…`, ou
--     `osm:w…` quando o lugar não tem item; `lab:…` só para o laboratório), o nome, o que foi modelado (o
--     objeto do OSM da peça, quando é outro que o lugar: o parque é o lugar, a estufa é a peça), a receita
--     (jsonb, até 32 KB; o schema dela mora no app e na função e é conferido lá), a versão (sobe a cada
--     receita nova que o app deve baixar), o estado, as gerações (no máximo três na vida do lugar), a
--     rodada da conferência, as fontes (título, autor, licença e URL de cada foto de referência; o item do
--     Wikidata; a planta usada) e o motivo ao tirar do ar. Todo mundo autenticado lê só a publicada, e só
--     as colunas que o app usa (as fontes não vão à tela); só o servidor escreve.
--  4. `public.landmark_places`: a chave de um lugar no app (`osm:w607776738`, `geo:<nome>@lat,lng` ou
--     `city:<UF>:<nome>`) apontando para a peça, ou para "sem referência" (`none`, com o código: o hotel e
--     o restaurante sem foto pública ficam com a miniatura do tipo para sempre). Dois lugares que são o
--     mesmo item do Wikidata dividem a peça. Só o servidor.
--  5. `public.landmark_jobs`: a fila do trabalhador `build-landmark`. Um job de construção por lugar na
--     vida do app; os de refazer apontam para o pedido. No máximo três tentativas; o código do erro. **No
--     máximo 12 lugares novos por viagem** (decisão do Douglas de 15/11): a RPC respeita, e um gatilho
--     recusa o 13º. Só o servidor.
--  6. `public.landmark_remakes`: refazer, uma vez por lugar: quem pediu, a viagem, as duas opções novas e
--     a escolhida (0 é a atual). Só o servidor; a pessoa vê o dela pela RPC.
--  7. As RPCs. Para quem está logado (`security definer`, estreitas): `landmark_sync` (o que a viagem tem
--     publicado, o que espera conferência, e enfileira o que falta, dentro do teto), `landmark_remake` e
--     `landmark_choose`. Só para o `service_role` (o trabalhador e a função da conferência):
--     `landmark_claim`, `landmark_identified`, `landmark_store`, `landmark_fail`, `landmark_check_target`,
--     `landmark_verdict` e `landmark_retire` (tirar do ar: um `select` do Douglas no SQL do painel). Para
--     o executor do laboratório: `lab_seed_landmark`, que publica uma peça só num lugar do laboratório.
--  8. O job do `pg_cron`: a cada minuto, só quando há fila, um POST no `build-landmark` com a chave
--     secreta do Vault (o molde da `send-notifications`, D37).

-- ------------------------------------------------------------------ 1. o objeto do OSM na parada
alter table public.stops
  add column osm_type text check (osm_type in ('node', 'way', 'relation')),
  add column osm_id   bigint check (osm_id > 0),
  add constraint stops_osm_pair check ((osm_type is null) = (osm_id is null));

-- ------------------------------------------------------------------ 2. ai_imports
alter table public.ai_imports
  drop constraint ai_imports_kind_check,
  add constraint ai_imports_kind_check
    check (kind in ('import', 'plan', 'today', 'confirmation', 'receipt', 'landmark'));

-- ------------------------------------------------------------------ 3. o catálogo
create table public.landmarks (
  id             uuid primary key default gen_random_uuid(),
  key            text not null unique
                 check (key ~ '^(wikidata:Q[0-9]{1,12}|osm:[nwr][0-9]{1,15}|lab:[a-z0-9-]{1,40})$'),
  name           text not null check (char_length(name) between 1 and 120),
  wikidata       text check (wikidata ~ '^Q[0-9]{1,12}$'),
  modeled        jsonb not null default '{}'
                 check (jsonb_typeof(modeled) = 'object' and octet_length(modeled::text) <= 2000),
  recipe         jsonb check (recipe is null or (jsonb_typeof(recipe) = 'object' and octet_length(recipe::text) <= 32768)),
  version        integer not null default 0 check (version >= 0),
  status         text not null default 'pending'
                 check (status in ('pending', 'generated', 'published', 'rejected', 'retired')),
  generations    smallint not null default 0 check (generations between 0 and 3),
  check_round    smallint not null default 0 check (check_round between 0 and 1),
  sources        jsonb not null default '{}'
                 check (jsonb_typeof(sources) = 'object' and octet_length(sources::text) <= 16000),
  retired_reason text check (retired_reason is null or char_length(retired_reason) between 1 and 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  published_at   timestamptz,
  constraint landmarks_retired check ((status = 'retired') = (retired_reason is not null)),
  constraint landmarks_has_recipe check (status not in ('generated', 'published') or recipe is not null)
);
alter table public.landmarks enable row level security;
-- o Supabase dá tudo a `authenticated` em tabela nova: sem o revoke, os grants de coluna não restringiriam
revoke all on public.landmarks from anon, authenticated;
grant select (id, key, name, recipe, version, status, published_at) on public.landmarks to authenticated;
create policy "todos leem a publicada" on public.landmarks
  for select to authenticated using (status = 'published');

-- ------------------------------------------------------------------ 4. os lugares do app
create table public.landmark_places (
  place_key   text primary key
              check (place_key ~ '^(osm:[nwr][0-9]{1,15}|geo:[a-z0-9-]{1,80}@-?[0-9]{1,3}\.[0-9]{3},-?[0-9]{1,3}\.[0-9]{3}|city:[A-Z]{2}:[a-z0-9-]{1,80})$'),
  kind        text not null check (kind in ('stop', 'city')),
  landmark_id uuid references public.landmarks,
  status      text not null default 'pending' check (status in ('pending', 'linked', 'none')),
  code        text check (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint landmark_places_link check ((status = 'linked') = (landmark_id is not null))
);
create index on public.landmark_places (landmark_id);
alter table public.landmark_places enable row level security;
revoke all on public.landmark_places from anon, authenticated;

-- ------------------------------------------------------------------ 6. refazer (antes da fila, que aponta para ele)
create table public.landmark_remakes (
  id           uuid primary key default gen_random_uuid(),
  -- uma vez por lugar, na vida do app
  landmark_id  uuid not null unique references public.landmarks on delete cascade,
  trip_id      uuid references public.trips on delete set null,
  requested_by uuid references public.profiles on delete set null,
  status       text not null default 'generating' check (status in ('generating', 'choosing', 'chosen', 'failed')),
  -- as duas opções novas, na ordem das variantes (null enquanto a variante não chegou)
  options      jsonb not null default '[null, null]'
               check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 2
                      and octet_length(options::text) <= 70000),
  chosen       smallint check (chosen between 0 and 2),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  constraint landmark_remakes_chosen check ((status = 'chosen') = (chosen is not null and decided_at is not null))
);
alter table public.landmark_remakes enable row level security;
revoke all on public.landmark_remakes from anon, authenticated;

-- ------------------------------------------------------------------ 5. a fila
create table public.landmark_jobs (
  id           uuid primary key default gen_random_uuid(),
  place_key    text not null references public.landmark_places on delete cascade,
  trip_id      uuid references public.trips on delete set null,
  requested_by uuid references public.profiles on delete set null,
  kind         text not null check (kind in ('build', 'remake')),
  remake_id    uuid references public.landmark_remakes on delete cascade,
  variant      smallint check (variant between 1 and 2),
  -- o que o app disse do lugar: o nome, a coordenada, o tipo da parada, o objeto do OSM, a UF da cidade
  input        jsonb not null check (jsonb_typeof(input) = 'object' and octet_length(input::text) <= 4000),
  status       text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts     smallint not null default 0 check (attempts between 0 and 3),
  code         text check (code ~ '^[a-z][a-z0-9_]{0,39}$'),
  run_after    timestamptz not null default now(),
  started_at   timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint landmark_jobs_remake check ((kind = 'remake') = (remake_id is not null and variant is not null))
);
-- um job de construção por lugar na vida do app; um por variante de cada refazer
create unique index landmark_jobs_one_build on public.landmark_jobs (place_key) where kind = 'build';
create unique index landmark_jobs_one_variant on public.landmark_jobs (remake_id, variant) where kind = 'remake';
create index landmark_jobs_queue on public.landmark_jobs (run_after) where status = 'queued';
create index on public.landmark_jobs (trip_id) where kind = 'build';
alter table public.landmark_jobs enable row level security;
revoke all on public.landmark_jobs from anon, authenticated;

-- o teto da viagem, também no banco: o 13º lugar novo de uma viagem não entra
create function private.landmark_trip_cap() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.kind = 'build' and new.trip_id is not null and (
       select count(*) from public.landmark_jobs j where j.trip_id = new.trip_id and j.kind = 'build') >= 12 then
    raise exception 'landmark_trip_cap' using errcode = '54000';
  end if;
  return new;
end $$;
revoke all on function private.landmark_trip_cap() from public;
create trigger a_trip_cap before insert on public.landmark_jobs
  for each row execute function private.landmark_trip_cap();

-- ------------------------------------------------------------------ 7. as RPCs de quem está logado
-- Um lugar do app que a RPC aceita: a chave, o tipo e o que o trabalhador precisa para identificá-lo.
create function private.landmark_input(p jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'name', left(btrim(p ->> 'name'), 120),
    'lat', case when jsonb_typeof(p -> 'lat') = 'number' then
             case when (p ->> 'lat')::numeric between -90 and 90 then round((p ->> 'lat')::numeric, 6) end end,
    'lng', case when jsonb_typeof(p -> 'lng') = 'number' then
             case when (p ->> 'lng')::numeric between -180 and 180 then round((p ->> 'lng')::numeric, 6) end end,
    'stop_kind', case when p ->> 'stop_kind' ~ '^[a-z]{2,12}$' then p ->> 'stop_kind' end,
    'osm_type', case when p ->> 'osm_type' in ('node', 'way', 'relation') then p ->> 'osm_type' end,
    'osm_id', case when p ->> 'osm_id' ~ '^[1-9][0-9]{0,14}$' then (p ->> 'osm_id')::bigint end,
    'uf', case when p ->> 'uf' ~ '^[A-Z]{2}$' then p ->> 'uf' end,
    'measure', case when p ->> 'measure' = 'true' then true end,
    'variant', case when p ->> 'variant' = '2' then 2 end));
$$;
revoke all on function private.landmark_input(jsonb) from public;

-- O que a viagem tem no catálogo, por lugar, e a fila do que falta. Quem é membro da viagem chama
-- quando o roteiro fica pronto (paradas com coordenada, rota calculada) e há internet. Devolve, por
-- chave: `published` (a receita, a versão), `check` (a receita gerada para o aparelho desenhar e mandar
-- conferir: só a quem é membro da viagem que pediu), `pending`, `none` (sem referência: a miniatura do
-- tipo) ou `capped` (passou dos 12 lugares novos da viagem). O refazer da peça vem junto, para a dona da
-- viagem.
create function public.landmark_sync(p_trip uuid, p_places jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := (select auth.uid());
  v_owner   boolean;
  v_used    integer;
  v_new     integer := 0;
  v_items   jsonb := '[]'::jsonb;
  v_place   jsonb;
  v_key     text;
  v_kind    text;
  v_input   jsonb;
  v_lp      public.landmark_places%rowtype;
  v_lm      public.landmarks%rowtype;
  v_rm      public.landmark_remakes%rowtype;
  v_state   text;
  v_item    jsonb;
  v_seen    text[] := '{}'::text[];
  v_lab     boolean := private.lab_role() is not distinct from 'runner';
begin
  if v_uid is null or not private.is_trip_member(p_trip) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if jsonb_typeof(p_places) is distinct from 'array' or jsonb_array_length(p_places) > 60 then
    raise exception 'bad_places' using errcode = '22023';
  end if;
  v_owner := exists (select 1 from public.trips t where t.id = p_trip and t.owner_id = v_uid and t.deleted_at is null);
  select count(*) into v_used from public.landmark_jobs j where j.trip_id = p_trip and j.kind = 'build';

  for v_place in select value from jsonb_array_elements(p_places) loop
    v_key := v_place ->> 'key';
    v_kind := v_place ->> 'kind';
    if v_key is null or v_key = any (v_seen) or v_kind not in ('stop', 'city')
       or v_key !~ '^(osm:[nwr][0-9]{1,15}|geo:[a-z0-9-]{1,80}@-?[0-9]{1,3}\.[0-9]{3},-?[0-9]{1,3}\.[0-9]{3}|city:[A-Z]{2}:[a-z0-9-]{1,80})$' then
      continue;
    end if;
    v_seen := v_seen || v_key;
    v_input := private.landmark_input(v_place);
    if v_input ->> 'name' is null or char_length(v_input ->> 'name') = 0 then
      continue;
    end if;

    select * into v_lp from public.landmark_places lp where lp.place_key = v_key;
    if not found then
      -- o laboratório lê o catálogo, mas não enfileira lugar de verdade (cada um custaria uma geração
      -- e ficaria preso a uma conta de teste); só a medição, que pede com `measure`
      if v_lab and v_input ->> 'measure' is null then
        v_items := v_items || jsonb_build_object('key', v_key, 'state', 'none');
        continue;
      end if;
      if v_used + v_new >= 12 then
        v_items := v_items || jsonb_build_object('key', v_key, 'state', 'capped');
        continue;
      end if;
      insert into public.landmark_places (place_key, kind) values (v_key, v_kind);
      insert into public.landmark_jobs (place_key, trip_id, requested_by, kind, input)
      values (v_key, p_trip, v_uid, 'build', v_input);
      v_new := v_new + 1;
      v_items := v_items || jsonb_build_object('key', v_key, 'state', 'pending');
      continue;
    end if;

    if v_lp.status = 'none' then
      v_items := v_items || jsonb_build_object('key', v_key, 'state', 'none');
      continue;
    elsif v_lp.status = 'pending' then
      v_items := v_items || jsonb_build_object('key', v_key, 'state', 'pending');
      continue;
    end if;

    select * into v_lm from public.landmarks l where l.id = v_lp.landmark_id;
    v_state := case v_lm.status
      when 'published' then 'published'
      when 'pending' then 'pending'
      when 'generated' then
        case when exists (select 1 from public.landmark_places lp2
                            join public.landmark_jobs j on j.place_key = lp2.place_key and j.kind = 'build'
                           where lp2.landmark_id = v_lm.id and j.trip_id is not null
                             and private.is_trip_member(j.trip_id))
             then 'check' else 'pending' end
      else 'none' end;
    v_item := jsonb_build_object('key', v_key, 'state', v_state);
    if v_state in ('published', 'check') then
      v_item := v_item || jsonb_build_object('landmark_id', v_lm.id, 'name', v_lm.name,
                                             'version', v_lm.version, 'recipe', v_lm.recipe);
    end if;
    if v_state = 'published' then
      select * into v_rm from public.landmark_remakes r where r.landmark_id = v_lm.id;
      if found then
        if v_rm.requested_by = v_uid then
          v_item := v_item || jsonb_build_object('remake', jsonb_build_object(
            'id', v_rm.id, 'status', v_rm.status,
            'options', case when v_rm.status = 'choosing' then v_rm.options else '[null, null]'::jsonb end));
        end if;
      elsif v_owner and v_lm.generations <= 1 then
        v_item := v_item || jsonb_build_object('can_remake', true);
      end if;
    end if;
    v_items := v_items || v_item;
  end loop;

  return jsonb_build_object('items', v_items, 'new', v_new, 'used', v_used + v_new, 'cap', 12);
end $$;
revoke execute on function public.landmark_sync(uuid, jsonb) from public, anon;
grant execute on function public.landmark_sync(uuid, jsonb) to authenticated;

-- Refazer: a dona da viagem pede, uma vez por lugar, com a peça publicada e espaço para mais duas
-- gerações. Nascem o pedido e dois jobs (as variantes 1 e 2).
create function public.landmark_remake(p_trip uuid, p_landmark uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_lm    public.landmarks%rowtype;
  v_place text;
  v_id    uuid;
begin
  if v_uid is null or not exists (select 1 from public.trips t
                                   where t.id = p_trip and t.owner_id = v_uid and t.deleted_at is null) then
    raise exception 'not_owner' using errcode = '42501';
  end if;
  select * into v_lm from public.landmarks l where l.id = p_landmark for update;
  if not found or v_lm.status <> 'published' then
    raise exception 'not_published' using errcode = '22023';
  end if;
  if v_lm.generations > 1 then
    raise exception 'no_generations' using errcode = '54000';
  end if;
  if exists (select 1 from public.landmark_remakes r where r.landmark_id = p_landmark) then
    raise exception 'already_remade' using errcode = '23505';
  end if;
  select lp.place_key into v_place from public.landmark_places lp
   where lp.landmark_id = p_landmark order by lp.created_at limit 1;
  insert into public.landmark_remakes (landmark_id, trip_id, requested_by)
  values (p_landmark, p_trip, v_uid) returning id into v_id;
  insert into public.landmark_jobs (place_key, trip_id, requested_by, kind, remake_id, variant, input)
  select v_place, p_trip, v_uid, 'remake', v_id, v.n, jsonb_build_object('variant', v.n)
    from (values (1), (2)) v (n);
  return v_id;
end $$;
revoke execute on function public.landmark_remake(uuid, uuid) from public, anon;
grant execute on function public.landmark_remake(uuid, uuid) to authenticated;

-- A escolha, obrigatória e de quem pediu: 0 fica a atual; 1 ou 2 viram a peça do catálogo para todos
-- (versão nova). As opções que sobram ficam no pedido, como rejeitadas.
create function public.landmark_choose(p_remake uuid, p_choice integer) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_rm  public.landmark_remakes%rowtype;
  v_rec jsonb;
begin
  select * into v_rm from public.landmark_remakes r where r.id = p_remake for update;
  if not found or v_uid is null or v_rm.requested_by is distinct from v_uid then
    raise exception 'not_requester' using errcode = '42501';
  end if;
  if v_rm.status <> 'choosing' then
    raise exception 'not_choosing' using errcode = '22023';
  end if;
  if p_choice is null or p_choice not between 0 and 2 then
    raise exception 'bad_choice' using errcode = '22023';
  end if;
  if p_choice > 0 then
    v_rec := v_rm.options -> (p_choice - 1);
    if v_rec is null or jsonb_typeof(v_rec) <> 'object' then
      raise exception 'bad_choice' using errcode = '22023';
    end if;
    update public.landmarks
       set recipe = v_rec, version = version + 1, published_at = now(), updated_at = now()
     where id = v_rm.landmark_id and status = 'published';
  end if;
  update public.landmark_remakes set status = 'chosen', chosen = p_choice, decided_at = now()
   where id = p_remake;
  return jsonb_build_object('landmark_id', v_rm.landmark_id, 'chosen', p_choice,
    'version', (select l.version from public.landmarks l where l.id = v_rm.landmark_id));
end $$;
revoke execute on function public.landmark_choose(uuid, integer) from public, anon;
grant execute on function public.landmark_choose(uuid, integer) to authenticated;

-- ------------------------------------------------------------------ 7. as RPCs do servidor
-- O próximo job, um por vez: com um job rodando há menos de 3 min, nada (as chamadas ao Wikimedia e ao
-- Nominatim são em série, e a função tem 150 s de relógio). Um job preso há mais que isso volta à fila.
create function public.landmark_claim(p_now timestamptz default now()) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.landmark_jobs%rowtype;
  v_lm  public.landmarks%rowtype;
  v_out jsonb;
begin
  for v_job in select * from public.landmark_jobs j
                where j.status = 'running' and j.started_at < p_now - interval '3 minutes' loop
    perform public.landmark_fail(v_job.id, 'timeout', true);
  end loop;
  if exists (select 1 from public.landmark_jobs where status = 'running') then
    return null;
  end if;
  select * into v_job from public.landmark_jobs j
   where j.status = 'queued' and j.run_after <= p_now and j.attempts < 3
   order by j.run_after, j.created_at
   limit 1 for update skip locked;
  if not found then
    return null;
  end if;
  update public.landmark_jobs set status = 'running', attempts = attempts + 1, started_at = p_now,
         updated_at = p_now
   where id = v_job.id;
  v_out := jsonb_build_object('id', v_job.id, 'kind', v_job.kind, 'place_key', v_job.place_key,
    'place_kind', (select lp.kind from public.landmark_places lp where lp.place_key = v_job.place_key),
    'trip_id', v_job.trip_id, 'requested_by', v_job.requested_by, 'variant', v_job.variant,
    'attempt', v_job.attempts + 1, 'input', v_job.input,
    'lab', exists (select 1 from private.lab_access la where la.user_id = v_job.requested_by and la.role = 'runner'));
  if v_job.kind = 'remake' then
    select l.* into v_lm from public.landmark_remakes r join public.landmarks l on l.id = r.landmark_id
     where r.id = v_job.remake_id;
    v_out := v_out || jsonb_build_object('landmark', jsonb_build_object(
      'id', v_lm.id, 'key', v_lm.key, 'name', v_lm.name, 'wikidata', v_lm.wikidata,
      'modeled', v_lm.modeled, 'recipe', v_lm.recipe, 'sources', v_lm.sources));
  end if;
  return v_out;
end $$;

-- O lugar identificado na fonte pública. Se a chave já está no catálogo (outro lugar do app que é o
-- mesmo item do Wikidata), o lugar só aponta para ela e o job termina sem IA; senão nasce a peça
-- pendente, com o nome, o item e o que vai ser modelado.
create function public.landmark_identified(p_job uuid, p_key text, p_name text, p_wikidata text,
                                           p_modeled jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.landmark_jobs%rowtype;
  v_lm  public.landmarks%rowtype;
begin
  select * into v_job from public.landmark_jobs j where j.id = p_job and j.status = 'running' for update;
  if not found or v_job.kind <> 'build' then
    raise exception 'bad_job' using errcode = '22023';
  end if;
  select * into v_lm from public.landmarks l where l.key = p_key for update;
  if found then
    update public.landmark_places set landmark_id = v_lm.id, status = 'linked', code = null, updated_at = now()
     where place_key = v_job.place_key;
    if v_lm.status in ('published', 'generated') then
      update public.landmark_jobs set status = 'done', code = 'linked', updated_at = now() where id = p_job;
      return jsonb_build_object('landmark_id', v_lm.id, 'linked', true);
    end if;
    return jsonb_build_object('landmark_id', v_lm.id, 'linked', false);
  end if;
  insert into public.landmarks (key, name, wikidata, modeled)
  values (p_key, left(btrim(p_name), 120), p_wikidata, coalesce(p_modeled, '{}'))
  returning * into v_lm;
  update public.landmark_places set landmark_id = v_lm.id, status = 'linked', code = null, updated_at = now()
   where place_key = v_job.place_key;
  return jsonb_build_object('landmark_id', v_lm.id, 'linked', false);
end $$;

-- A receita escrita. Construção: a peça vira `generated` (o aparelho de quem pediu desenha e manda
-- conferir), com as fontes; refazer: a variante entra nas opções, e com as duas o pedido espera a
-- escolha. Cada receita conta uma geração; a quarta não entra.
create function public.landmark_store(p_job uuid, p_recipe jsonb, p_modeled jsonb, p_sources jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.landmark_jobs%rowtype;
  v_lm  uuid;
  v_rm  public.landmark_remakes%rowtype;
begin
  select * into v_job from public.landmark_jobs j where j.id = p_job and j.status = 'running' for update;
  if not found then
    raise exception 'bad_job' using errcode = '22023';
  end if;
  if v_job.kind = 'build' then
    select lp.landmark_id into v_lm from public.landmark_places lp where lp.place_key = v_job.place_key;
    update public.landmarks
       set recipe = p_recipe, status = 'generated', check_round = 0, generations = generations + 1,
           version = version + 1, modeled = coalesce(p_modeled, modeled), sources = coalesce(p_sources, sources),
           updated_at = now()
     where id = v_lm and status in ('pending', 'generated');
    if not found then
      raise exception 'bad_landmark' using errcode = '22023';
    end if;
  else
    select * into v_rm from public.landmark_remakes r where r.id = v_job.remake_id for update;
    update public.landmarks set generations = generations + 1, updated_at = now() where id = v_rm.landmark_id;
    update public.landmark_remakes
       set options = jsonb_set(options, array[(v_job.variant - 1)::text], p_recipe)
     where id = v_rm.id
     returning * into v_rm;
    if jsonb_typeof(v_rm.options -> 0) = 'object' and jsonb_typeof(v_rm.options -> 1) = 'object' then
      update public.landmark_remakes set status = 'choosing' where id = v_rm.id;
    end if;
    v_lm := v_rm.landmark_id;
  end if;
  update public.landmark_jobs set status = 'done', code = null, updated_at = now() where id = p_job;
  return jsonb_build_object('landmark_id', v_lm);
end $$;

-- Um job que não deu: de novo daqui a pouco (até três tentativas), ou o fim com o código. Sem
-- referência (`no_wikidata`, `no_photos`, `no_free_license`, `no_subject`), o lugar fica com a
-- miniatura do tipo para sempre; a IA que falhou três vezes deixa a peça rejeitada.
create function public.landmark_fail(p_job uuid, p_code text, p_retry boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_job public.landmark_jobs%rowtype;
begin
  select * into v_job from public.landmark_jobs j where j.id = p_job and j.status = 'running' for update;
  if not found then
    return;
  end if;
  if p_retry and v_job.attempts < 3 then
    update public.landmark_jobs
       set status = 'queued', code = p_code, run_after = now() + v_job.attempts * interval '2 minutes',
           updated_at = now()
     where id = p_job;
    return;
  end if;
  update public.landmark_jobs set status = 'failed', code = p_code, updated_at = now() where id = p_job;
  if v_job.kind = 'build' then
    update public.landmarks l set status = 'rejected', updated_at = now()
      from public.landmark_places lp
     where lp.place_key = v_job.place_key and l.id = lp.landmark_id and l.status = 'pending';
    update public.landmark_places
       set status = case when landmark_id is null then 'none' else status end,
           code = p_code, updated_at = now()
     where place_key = v_job.place_key;
  else
    update public.landmark_remakes set status = 'failed' where id = v_job.remake_id and status = 'generating';
  end if;
end $$;

-- O que a conferência precisa: a peça gerada que espera a conferência, a rodada e as fontes; só se
-- quem pede é membro de uma viagem que pediu o lugar (a função passa o id da pessoa do JWT).
create function public.landmark_check_target(p_landmark uuid, p_user uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', l.id, 'key', l.key, 'name', l.name, 'version', l.version,
                            'round', l.check_round, 'recipe', l.recipe, 'sources', l.sources,
                            'modeled', l.modeled, 'trip_id', j.trip_id)
    from public.landmarks l
    join public.landmark_places lp on lp.landmark_id = l.id
    join public.landmark_jobs j on j.place_key = lp.place_key and j.kind = 'build' and j.trip_id is not null
    join public.trip_members m on m.trip_id = j.trip_id and m.user_id = p_user
                              and m.status = 'accepted' and m.deleted_at is null
   where l.id = p_landmark and l.status = 'generated'
   limit 1;
$$;

-- O veredito da conferência sobre a versão que o aparelho desenhou: `ok` publica para todos;
-- `adjust` troca a receita pela corrigida e pede mais uma conferência (uma rodada só: na segunda,
-- `adjust` conta como rejeitada); `rejected` rejeita (a miniatura do tipo fica).
create function public.landmark_verdict(p_landmark uuid, p_version integer, p_verdict text, p_recipe jsonb)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_lm public.landmarks%rowtype;
begin
  select * into v_lm from public.landmarks l where l.id = p_landmark for update;
  if not found or v_lm.status <> 'generated' or v_lm.version <> p_version then
    return 'stale';
  end if;
  if p_verdict = 'ok' then
    update public.landmarks set status = 'published', published_at = now(), updated_at = now()
     where id = p_landmark;
    return 'published';
  elsif p_verdict = 'adjust' and v_lm.check_round = 0 and jsonb_typeof(p_recipe) = 'object' then
    update public.landmarks set recipe = p_recipe, check_round = 1, version = version + 1, updated_at = now()
     where id = p_landmark;
    return 'adjusted';
  end if;
  update public.landmarks set status = 'rejected', updated_at = now() where id = p_landmark;
  return 'rejected';
end $$;

-- Tirar do ar (o limite legal registrado na fase 23): só o servidor, com o motivo. O app volta à
-- miniatura do tipo na próxima leitura do catálogo.
create function public.landmark_retire(p_landmark uuid, p_reason text) returns void
language sql security definer set search_path = '' as $$
  update public.landmarks set status = 'retired', retired_reason = left(btrim(p_reason), 500), updated_at = now()
   where id = p_landmark;
$$;

revoke execute on function public.landmark_claim(timestamptz), public.landmark_identified(uuid, text, text, text, jsonb),
  public.landmark_store(uuid, jsonb, jsonb, jsonb), public.landmark_fail(uuid, text, boolean),
  public.landmark_check_target(uuid, uuid), public.landmark_verdict(uuid, integer, text, jsonb),
  public.landmark_retire(uuid, text)
  from public, anon, authenticated;
grant execute on function public.landmark_claim(timestamptz), public.landmark_identified(uuid, text, text, text, jsonb),
  public.landmark_store(uuid, jsonb, jsonb, jsonb), public.landmark_fail(uuid, text, boolean),
  public.landmark_check_target(uuid, uuid), public.landmark_verdict(uuid, integer, text, jsonb),
  public.landmark_retire(uuid, text)
  to service_role;

-- O laboratório semeia a peça escrita à mão (a estufa) num lugar dele, publicada, sem IA e sem fila:
-- só o executor, só uma chave `geo:` com "laboratorio" no nome (nunca um lugar de verdade).
create function public.lab_seed_landmark(p_place_key text, p_name text, p_recipe jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := 'lab:' || left(md5(p_place_key), 12);
  v_id  uuid;
begin
  if private.lab_role() is distinct from 'runner' then
    raise exception 'not_lab' using errcode = '42501';
  end if;
  if p_place_key !~ '^geo:[a-z0-9-]*laboratorio[a-z0-9-]*@-?[0-9]{1,3}\.[0-9]{3},-?[0-9]{1,3}\.[0-9]{3}$'
     or jsonb_typeof(p_recipe) is distinct from 'object' then
    raise exception 'not_lab_place' using errcode = '22023';
  end if;
  insert into public.landmarks (key, name, recipe, version, status, generations, published_at, sources)
  values (v_key, left(btrim(p_name), 120), p_recipe, 1, 'published', 1, now(), '{"lab": true}')
  on conflict (key) do update
     set recipe = excluded.recipe, name = excluded.name,
         version = public.landmarks.version + case when public.landmarks.recipe = excluded.recipe then 0 else 1 end,
         status = 'published', retired_reason = null, updated_at = now()
  returning id into v_id;
  insert into public.landmark_places (place_key, kind, landmark_id, status)
  values (p_place_key, 'stop', v_id, 'linked')
  on conflict (place_key) do update set landmark_id = excluded.landmark_id, status = 'linked', code = null,
                                        updated_at = now();
  return v_id;
end $$;
revoke execute on function public.lab_seed_landmark(text, text, jsonb) from public, anon;
grant execute on function public.lab_seed_landmark(text, text, jsonb) to authenticated;

-- ------------------------------------------------------------------ 8. o trabalhador, pelo pg_cron
create function private.has_landmark_jobs(p_now timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.landmark_jobs j
                  where j.status = 'queued' and j.run_after <= p_now and j.attempts < 3)
     and not exists (select 1 from public.landmark_jobs j
                      where j.status = 'running' and j.started_at >= p_now - interval '3 minutes');
$$;
revoke all on function private.has_landmark_jobs(timestamptz) from public;

-- A cada minuto, só com fila: o trabalhador responde na hora e trabalha em segundo plano
-- (`EdgeRuntime.waitUntil`), um job por vez. URL e chave no Vault, como a `send-notifications`.
select cron.schedule('viajei-build-landmark', '* * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'viajei_project_url') || '/functions/v1/build-landmark',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'viajei_secret_key')),
    body := jsonb_build_object('now', now()),
    timeout_milliseconds := 10000)
  where private.has_landmark_jobs(now());
$job$);
