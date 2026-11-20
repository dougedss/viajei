-- 0018_fila_resiliente: a fila dos cartões-postais não condena um lugar por uma falha passageira
-- (fase 23, D268). Só acrescenta e corrige funções; nenhuma coluna sai, nenhuma linha se perde.
--
-- O que a produção mostrou em 20/11/2026: o Nominatim público recusa o ambiente das Edge Functions
-- (403), e sete lugares reais caíram três vezes em `source_failed`; pela 0017, o lugar virava `none`
-- ("sem referência", a miniatura do tipo para sempre), o que só vale para quem de fato não tem
-- referência (`no_wikidata`, `no_photos`, `no_free_license`, `no_subject`, `no_place`).
--  1. `landmark_fail`: com as tentativas esgotadas por uma causa passageira (`source_failed`,
--     `timeout`, `ai_failed`, `ai_invalid`), o job fica `failed` mas o lugar continua `pending`, com o
--     código.
--  2. `landmark_sync`: um lugar `pending` cujo job de construção está `failed` por causa passageira há
--     mais de uma hora volta à fila (tentativas zeradas), quando alguém pede o catálogo de novo.
--  3. O reparo: os lugares que já viraram `none` por causa passageira voltam a `pending`, e os jobs
--     deles voltam à fila.
-- A migration que tira `trips.car_*` (D199, a nota da fase 16) passa a ser a 0019.

-- ------------------------------------------------------------------ 1. a falha
create or replace function public.landmark_fail(p_job uuid, p_code text, p_retry boolean) returns void
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
    -- sem referência (não há o que tentar de novo): a peça pendente é rejeitada e o lugar fica sem peça;
    -- por causa passageira (as tentativas esgotadas), o lugar continua pendente, com o código
    if not p_retry then
      update public.landmarks l set status = 'rejected', updated_at = now()
        from public.landmark_places lp
       where lp.place_key = v_job.place_key and l.id = lp.landmark_id and l.status = 'pending';
      update public.landmark_places
         set status = case when landmark_id is null then 'none' else status end,
             code = p_code, updated_at = now()
       where place_key = v_job.place_key;
    else
      update public.landmark_places set code = p_code, updated_at = now() where place_key = v_job.place_key;
    end if;
  else
    update public.landmark_remakes set status = 'failed' where id = v_job.remake_id and status = 'generating';
  end if;
end $$;

-- ------------------------------------------------------------------ 2. a volta à fila
-- O job de construção de um lugar pendente que falhou por causa passageira há mais de uma hora volta
-- à fila. Chamada pela `landmark_sync` para cada lugar pendente que ela encontra.
create function private.landmark_requeue(p_place_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  update public.landmark_jobs
     set status = 'queued', attempts = 0, run_after = now(), code = null, updated_at = now()
   where place_key = p_place_key and kind = 'build' and status = 'failed'
     and code in ('source_failed', 'timeout', 'ai_failed', 'ai_invalid')
     and updated_at < now() - interval '1 hour';
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;
revoke all on function private.landmark_requeue(text) from public;

create or replace function public.landmark_sync(p_trip uuid, p_places jsonb) returns jsonb
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
      -- a falha passageira de mais de uma hora atrás volta à fila (0018)
      perform private.landmark_requeue(v_key);
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
    if v_state = 'pending' then
      perform private.landmark_requeue(v_key);
    end if;
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

-- ------------------------------------------------------------------ 3. o reparo
update public.landmark_places
   set status = 'pending', updated_at = now()
 where status = 'none' and landmark_id is null
   and code in ('source_failed', 'timeout', 'ai_failed', 'ai_invalid');
update public.landmark_jobs
   set status = 'queued', attempts = 0, run_after = now(), code = null, updated_at = now()
 where kind = 'build' and status = 'failed'
   and code in ('source_failed', 'timeout', 'ai_failed', 'ai_invalid');
